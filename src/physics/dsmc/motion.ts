/**
 * DSMC Particle Advection & Boundary Motion Module
 * ================================================
 *
 * Implements deterministic 3D particle ballistic motion, specular fixed-wall
 * reflections, and moving-piston boundary interactions.
 *
 * Coordinate Conventions & Boundary Assumptions
 * ─────────────────────────────────────────────
 * 1. Coordinates: Right-handed Cartesian system (x, y, z) in SI units [meters, m].
 * 2. Fixed Boundaries:
 *    - x-axis: Fixed specular walls at xMin and xMax (xMax > xMin).
 *    - y-axis: Fixed specular walls at yMin and yMax (yMax > yMin).
 *    - z-axis floor: Fixed specular bottom base at zMin.
 * 3. Moving Boundary (Piston Head):
 *    - Located at the UPPER z-boundary: z_piston = chamber.piston.position > zMin.
 *    - Piston velocity v_piston is directed along the z-axis:
 *        * v_piston > 0: Piston moves upward (chamber expansion, dV/dt > 0).
 *        * v_piston < 0: Piston moves downward (chamber compression, dV/dt < 0).
 *        * v_piston = 0: Stationary piston head.
 * 4. Piston Reflection Rule:
 *    - In the piston reference frame, relative normal speed reverses:
 *        v_z,rel* = -v_z,rel  where v_z,rel = v_z - v_piston
 *    - In the laboratory frame:
 *        v_z* = 2·v_piston - v_z
 *    - Compression (v_piston < 0): Particles gain kinetic energy (work done on gas).
 *    - Expansion (v_piston > 0): Particles lose kinetic energy (work done by gas).
 * 5. Multi-Reflection Handling:
 *    - For fixed walls (x, y, and stationary z), multiple reflections are resolved
 *      analytically in O(1) time via periodic domain folding.
 *    - For a moving piston (v_piston ≠ 0), an exact event-driven ray-marching loop
 *      resolves collisions in chronological sequence, accounting for floor and
 *      piston bounces within the timestep.
 *
 * @module
 */

import { HELIUM, AVOGADRO } from '../constants';
import type { ParticleEnsemble } from './particle-ensemble';

/** Single Helium-4 atomic mass: m₀ = M / Nₐ [kg] */
const M0 = HELIUM.molarMass / AVOGADRO;

/**
 * Piston boundary configuration defining position and velocity along the z-axis.
 */
export interface PistonBoundary {
  /**
   * Current position of the piston head along the z-axis [m].
   * Must be strictly greater than chamber.zMin.
   */
  readonly position: number;

  /**
   * Velocity of the piston head along the z-axis [m/s].
   * Positive = expanding (+z direction).
   * Negative = compressing (-z direction).
   * Zero = stationary.
   */
  readonly velocity: number;
}

/**
 * 3D chamber geometry definition.
 */
export interface ChamberGeometry3D {
  /** Lower x-boundary [m]. */
  readonly xMin: number;
  /** Upper x-boundary [m]. */
  readonly xMax: number;
  /** Lower y-boundary [m]. */
  readonly yMin: number;
  /** Upper y-boundary [m]. */
  readonly yMax: number;
  /** Lower z-boundary (fixed floor) [m]. */
  readonly zMin: number;
  /** Movable piston head defining the upper z-boundary. */
  readonly piston: PistonBoundary;
}

/**
 * Diagnostic results of a particle advection step.
 */
export interface MotionStepResult {
  /** Total number of fixed wall reflections (x, y, and base zMin) across all particles. */
  fixedWallCollisions: number;
  /** Total number of moving piston reflections across all particles. */
  pistonCollisions: number;
  /**
   * Total kinetic energy transferred to the gas by the piston [J].
   * Accounts for statisticalWeight F_N if defined in ensemble metadata;
   * otherwise represents raw ensemble kinetic energy change.
   */
  pistonWorkTransferred: number;
}

/**
 * Validates chamber geometry parameters and piston motion.
 */
export function validateChamberGeometry(
  chamber: ChamberGeometry3D,
  dt: number = 0,
): void {
  const { xMin, xMax, yMin, yMax, zMin, piston } = chamber;

  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax) ||
    !Number.isFinite(zMin)
  ) {
    throw new RangeError('All chamber boundary coordinates must be finite numbers.');
  }

  if (xMin >= xMax) {
    throw new RangeError(`xMin (${xMin}) must be strictly less than xMax (${xMax}).`);
  }
  if (yMin >= yMax) {
    throw new RangeError(`yMin (${yMin}) must be strictly less than yMax (${yMax}).`);
  }

  if (!piston || typeof piston !== 'object') {
    throw new TypeError('Chamber must specify a valid piston configuration object.');
  }

  if (!Number.isFinite(piston.position) || !Number.isFinite(piston.velocity)) {
    throw new RangeError('Piston position and velocity must be finite numbers.');
  }

  if (piston.position <= zMin) {
    throw new RangeError(
      `Piston position (${piston.position}) must be strictly greater than floor zMin (${zMin}).`,
    );
  }

  // Ensure compressing piston does not penetrate through the floor during timestep dt
  if (dt > 0 && piston.velocity < 0) {
    const finalPistonZ = piston.position + piston.velocity * dt;
    if (finalPistonZ <= zMin) {
      throw new RangeError(
        `Piston would compress past floor zMin during timestep: z_final = ${finalPistonZ} <= zMin = ${zMin}.`,
      );
    }
  }
}

/**
 * Reflects a 1D position and velocity off two parallel fixed specular walls at a and b (b > a).
 * Handles an arbitrary number of wall crossings analytically in O(1) time without looping.
 *
 * @param x0 Initial position [m].
 * @param v0 Velocity [m/s].
 * @param dt Timestep [s].
 * @param a  Lower wall position [m].
 * @param b  Upper wall position [m].
 * @returns [newPosition, newVelocity, bounceCount]
 */
export function reflect1DFixed(
  x0: number,
  v0: number,
  dt: number,
  a: number,
  b: number,
): [number, number, number] {
  if (dt === 0 || v0 === 0) {
    // If sitting exactly on a wall moving outward, reflect velocity immediately
    if (x0 <= a && v0 < 0) return [a, -v0, 1];
    if (x0 >= b && v0 > 0) return [b, -v0, 1];
    return [x0, v0, 0];
  }

  const L = b - a;
  const rawX = x0 + v0 * dt;
  const u = rawX - a;

  // Number of domain-width crossings (handles negative u correctly via floor)
  const m = Math.floor(u / L);
  const r = u - m * L; // Remainder in [0, L)
  const bounceCount = Math.abs(m);

  let xNew: number;
  let vNew: number;

  if (bounceCount % 2 === 1) {
    // Odd number of reflections: velocity reversed
    xNew = b - r;
    vNew = -v0;
  } else {
    // Even number of reflections: velocity retains original direction
    xNew = a + r;
    vNew = v0;
  }

  // Clamp against floating-point epsilon roundoff
  if (xNew <= a) {
    xNew = a;
    if (vNew < 0) vNew = -vNew;
  } else if (xNew >= b) {
    xNew = b;
    if (vNew > 0) vNew = -vNew;
  }

  return [xNew, vNew, bounceCount];
}

/**
 * Maximum collision iterations permitted for a single particle during one moving-boundary timestep.
 * Prevents non-terminating loops under pathological inputs.
 */
const MAX_MOVING_BOUNCES = 10_000;

/**
 * Advances all particles in the ensemble through a discrete timestep dt,
 * applying specular reflections off fixed walls and moving piston interactions.
 *
 * Performs zero heap allocations during the particle iteration loop.
 *
 * @param ensemble ParticleEnsemble containing contiguous Float64Array coordinates and velocities.
 * @param chamber  Chamber geometry specifying fixed walls and moving piston.
 * @param dt       Timestep [s]. Must be finite and non-negative.
 * @returns Diagnostic metrics detailing collision counts and work transferred.
 */
export function advanceParticles(
  ensemble: ParticleEnsemble,
  chamber: ChamberGeometry3D,
  dt: number,
): MotionStepResult {
  // 1. Validate timestep
  if (typeof dt !== 'number' || !Number.isFinite(dt)) {
    throw new TypeError(`Timestep dt must be a finite number. Received: ${dt}`);
  }
  if (dt < 0) {
    throw new RangeError(`Timestep dt must be non-negative. Received: ${dt}`);
  }

  // 2. Validate chamber geometry
  validateChamberGeometry(chamber, dt);

  // If timestep is 0, no motion occurs
  if (dt === 0) {
    return {
      fixedWallCollisions: 0,
      pistonCollisions: 0,
      pistonWorkTransferred: 0,
    };
  }

  const { xMin, xMax, yMin, yMax, zMin, piston } = chamber;
  const zPiston0 = piston.position;
  const vPiston = piston.velocity;
  const isPistonStationary = vPiston === 0;

  const n = ensemble.count;
  const x = ensemble.x;
  const y = ensemble.y;
  const z = ensemble.z;
  const vx = ensemble.vx;
  const vy = ensemble.vy;
  const vz = ensemble.vz;

  let totalFixedCollisions = 0;
  let totalPistonCollisions = 0;
  let totalDeltaEk = 0;

  // 3. Hot loop over all particles — pure stack primitives, zero per-particle allocations
  for (let i = 0; i < n; i++) {
    const px = x[i];
    const py = y[i];
    const pz = z[i];
    const pvx = vx[i];
    const pvy = vy[i];
    const pvz = vz[i];

    // Validate particle state integrity
    if (
      !Number.isFinite(px) ||
      !Number.isFinite(py) ||
      !Number.isFinite(pz) ||
      !Number.isFinite(pvx) ||
      !Number.isFinite(pvy) ||
      !Number.isFinite(pvz)
    ) {
      throw new RangeError(
        `Non-finite particle state detected at index ${i}: pos=(${px}, ${py}, ${pz}), vel=(${pvx}, ${pvy}, ${pvz})`,
      );
    }

    // Ensure particle starts within chamber boundaries
    if (
      px < xMin ||
      px > xMax ||
      py < yMin ||
      py > yMax ||
      pz < zMin ||
      pz > zPiston0
    ) {
      throw new RangeError(
        `Particle at index ${i} is outside chamber bounds at start of step: pos=(${px}, ${py}, ${pz}). ` +
          `Bounds: x=[${xMin}, ${xMax}], y=[${yMin}, ${yMax}], z=[${zMin}, ${zPiston0}]`,
      );
    }

    // ── Update x-coordinate (Fixed specular walls) ──
    const [newX, newVx, xBounces] = reflect1DFixed(px, pvx, dt, xMin, xMax);
    x[i] = newX;
    vx[i] = newVx;
    totalFixedCollisions += xBounces;

    // ── Update y-coordinate (Fixed specular walls) ──
    const [newY, newVy, yBounces] = reflect1DFixed(py, pvy, dt, yMin, yMax);
    y[i] = newY;
    vy[i] = newVy;
    totalFixedCollisions += yBounces;

    // ── Update z-coordinate ──
    if (isPistonStationary) {
      // Fast analytical O(1) path when piston velocity is 0
      const [newZ, newVz, zBounces] = reflect1DFixed(pz, pvz, dt, zMin, zPiston0);
      z[i] = newZ;
      vz[i] = newVz;
      // Fixed base and fixed piston are both counted as fixed wall reflections
      totalFixedCollisions += zBounces;
    } else {
      // Event-driven ray-marching loop for moving piston boundary
      let curZ = pz;
      let curVz = pvz;
      let curTau = 0; // time elapsed within current step [0, dt]
      let tRem = dt;
      let iter = 0;

      while (tRem > 1e-15 && iter < MAX_MOVING_BOUNCES) {
        iter++;
        const zPistonNow = zPiston0 + vPiston * curTau;

        // 1. Time to hit fixed floor (zMin)
        let tFloor = Infinity;
        if (curVz < 0) {
          if (curZ <= zMin) {
            tFloor = 0;
          } else {
            tFloor = (curZ - zMin) / (-curVz);
          }
        }

        // 2. Time to hit moving piston (zPistonNow + vPiston * t)
        let tPiston = Infinity;
        const relV = curVz - vPiston; // velocity towards piston
        if (relV > 0) {
          if (curZ >= zPistonNow) {
            tPiston = 0;
          } else {
            tPiston = (zPistonNow - curZ) / relV;
          }
        }

        const tMin = Math.min(tFloor, tPiston);

        if (tMin >= tRem) {
          // No collision during remaining time
          curZ += curVz * tRem;
          curTau += tRem;
          tRem = 0;
          break;
        }

        // Collision event occurs at tMin
        if (tFloor <= tPiston) {
          // Floor collision (fixed boundary)
          curZ = zMin;
          curTau += tFloor;
          tRem -= tFloor;
          curVz = -curVz; // reflect velocity upward
          totalFixedCollisions++;
        } else {
          // Moving piston collision
          const zHit = zPiston0 + vPiston * (curTau + tPiston);
          curZ = zHit;
          curTau += tPiston;
          tRem -= tPiston;

          // Relative reflection: v_z* = 2·v_piston - v_z
          const vPre = curVz;
          const vPost = 2 * vPiston - vPre;
          curVz = vPost;

          // Accumulate microscopic kinetic energy change: ΔE_k = 1/2 m₀ (v_post² - v_pre²)
          totalDeltaEk += 0.5 * M0 * (vPost * vPost - vPre * vPre);
          totalPistonCollisions++;
        }
      }

      // Clamp against residual floating-point spill at final step time
      const finalPistonZ = zPiston0 + vPiston * dt;
      if (curZ <= zMin) {
        curZ = zMin;
        if (curVz < 0) curVz = -curVz;
      } else if (curZ >= finalPistonZ) {
        curZ = finalPistonZ;
        if (curVz > vPiston) curVz = 2 * vPiston - curVz;
      }

      z[i] = curZ;
      vz[i] = curVz;
    }
  }

  // Scale kinetic energy change by statistical weight if configured
  const statisticalWeight = ensemble.metadata.statisticalWeight ?? 1;
  const pistonWorkTransferred = totalDeltaEk * statisticalWeight;

  return {
    fixedWallCollisions: totalFixedCollisions,
    pistonCollisions: totalPistonCollisions,
    pistonWorkTransferred,
  };
}
