/**
 * DSMC Elastic Binary Collision Physics
 * ======================================
 *
 * Implements deterministic elastic binary collisions between equal-mass
 * monatomic gas particles for the Direct Simulation Monte Carlo (DSMC)
 * engine.
 *
 * Physical Assumptions & Invariants
 * ──────────────────────────────────
 * 1. Equal-mass particles: Both collision partners have identical mass m₀.
 *    (For helium-4: m₀ = M_He / N_A ≈ 6.646 × 10⁻²⁷ kg.)
 * 2. Elastic collision: Total translational kinetic energy is conserved.
 * 3. Total momentum is conserved.
 * 4. Isotropic hard-sphere scattering: The post-collision relative velocity
 *    direction is distributed uniformly over the unit sphere (all scattering
 *    angles are equally probable). This is exact for elastic hard-sphere
 *    collisions with zero impact-parameter dependence.
 *
 * Collision Kinematics (equal-mass, elastic)
 * ──────────────────────────────────────────
 * Let v₁, v₂ be pre-collision velocities. Define:
 *   vCoM = (v₁ + v₂) / 2          — centre-of-mass velocity [m/s]
 *   vRel = v₁ - v₂               — pre-collision relative velocity [m/s]
 *   |vRel| is preserved by elasticity.
 *
 * Post-collision relative velocity direction n̂ is sampled uniformly on S².
 * Post-collision relative velocity:  vRelPost = |vRel| · n̂
 *
 * Post-collision lab-frame velocities:
 *   v₁' = vCoM + 0.5 · vRelPost
 *   v₂' = vCoM - 0.5 · vRelPost
 *
 * These satisfy:
 *   v₁' + v₂' = v₁ + v₂  (momentum conservation)
 *   |v₁'|² + |v₂'|² = |v₁|² + |v₂|²  (kinetic energy conservation)
 *
 * Sphere Sampling Algorithm
 * ─────────────────────────
 * Marsaglia (1972) rejection method — numerically safe, requires no trig:
 *   1. Draw u, v uniformly in (−1, +1).
 *   2. Compute s = u² + v².
 *   3. Reject and redraw if s ≥ 1 (expected ~21.5% rejection rate).
 *   4. Set: nx = 2u√(1−s), ny = 2v√(1−s), nz = 1 − 2s.
 *   (n̂ = (nx, ny, nz) is exactly uniformly distributed on S².)
 *
 * Zero-Relative-Velocity Handling
 * ─────────────────────────────────
 * If |vRel| = 0 (identical velocity vectors), the collision is a no-op:
 * no scattering direction can be defined and velocities are unchanged.
 * This is physically correct: two indistinguishable particles with identical
 * velocities collide but remain in the same kinematic state.
 *
 * @module
 */

import type { ParticleEnsemble } from './particle-ensemble';
import type { PRNG } from './prng';

/**
 * Diagnostic result returned by a single binary elastic collision.
 */
export interface CollisionResult {
  /**
   * Whether the collision was executed (true) or was a no-op due to zero
   * relative velocity (false).
   */
  readonly collided: boolean;

  /**
   * Pre-collision relative speed |v₁ - v₂| [m/s].
   * Useful for Bird NTC probability weighting in Stage 3B.
   */
  readonly relativeSpeed: number;
}

/**
 * Maximum iterations permitted for the Marsaglia sphere-sampling rejection loop.
 * In practice the expected number of trials is π/4 ≈ 1.27; this limit prevents
 * non-termination under degenerate PRNG states.
 */
const MAX_SPHERE_ATTEMPTS = 1_000;

/**
 * Validates that a particle index is a non-negative integer within ensemble bounds.
 */
function validateParticleIndex(index: number, count: number, label: string): void {
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new RangeError(
      `Particle index '${label}' must be an integer in [0, ${count - 1}]. Received: ${index}`,
    );
  }
}

/**
 * Validates that a particle's 6D state is fully finite.
 * Used before and/or after a collision to guard against silent NaN propagation.
 */
function assertFiniteParticleState(
  ensemble: ParticleEnsemble,
  index: number,
  label: string,
): void {
  const vx = ensemble.vx[index];
  const vy = ensemble.vy[index];
  const vz = ensemble.vz[index];
  const x = ensemble.x[index];
  const y = ensemble.y[index];
  const z = ensemble.z[index];

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z) ||
    !Number.isFinite(vx) ||
    !Number.isFinite(vy) ||
    !Number.isFinite(vz)
  ) {
    throw new RangeError(
      `Non-finite particle state at index ${index} (${label}): ` +
        `pos=(${x}, ${y}, ${z}), vel=(${vx}, ${vy}, ${vz})`,
    );
  }
}

/**
 * Samples a unit vector uniformly distributed on the unit sphere S²
 * using Marsaglia's (1972) rejection method.
 *
 * The method makes no trigonometric function calls and is numerically exact.
 *
 * @param prng Seeded pseudo-random number generator.
 * @returns [nx, ny, nz] — a unit vector on S².
 * @throws RangeError if the rejection loop does not converge within MAX_SPHERE_ATTEMPTS.
 */
export function sampleUniformSphere(prng: PRNG): [number, number, number] {
  for (let attempt = 0; attempt < MAX_SPHERE_ATTEMPTS; attempt++) {
    // Map [0,1) to (-1, 1) via u = 2·rand - 1
    const u = 2.0 * prng.next() - 1.0;
    const v = 2.0 * prng.next() - 1.0;
    const s = u * u + v * v;

    if (s < 1.0) {
      // Accepted: map (u, v, s) to point on unit sphere
      const w = 2.0 * Math.sqrt(1.0 - s);
      return [u * w, v * w, 1.0 - 2.0 * s];
    }
    // Rejected: s >= 1.0 — retry
  }

  // Should never reach here under a well-behaved PRNG
  throw new RangeError(
    `Marsaglia sphere sampling failed to converge within ${MAX_SPHERE_ATTEMPTS} attempts. ` +
      'Possible degenerate PRNG state.',
  );
}

/**
 * Performs a single elastic binary collision between particles at indices i and j
 * in the given ensemble.
 *
 * Collision invariants (for equal-mass particles):
 *  - Total momentum p = m·(v₁ + v₂) is exactly conserved.
 *  - Total kinetic energy K = ½m·(|v₁|² + |v₂|²) is conserved to floating-point precision.
 *  - Relative speed |v₁ - v₂| is preserved.
 *  - Scattering direction is sampled uniformly over the unit sphere (isotropic hard-sphere).
 *
 * If |vRel| = 0, the collision is a no-op and velocities are unchanged.
 *
 * No heap allocations are made outside the unavoidable PRNG call and the returned
 * CollisionResult (which is a plain literal, stack-friendly in V8).
 *
 * @param i        Index of collision partner 1 in ensemble.
 * @param j        Index of collision partner 2 in ensemble. Must differ from i.
 * @param ensemble ParticleEnsemble containing SoA Float64Array buffers.
 * @param prng     Seeded PRNG for sampling the post-collision scattering direction.
 * @returns CollisionResult containing collision flag and pre-collision relative speed.
 * @throws RangeError for out-of-bounds indices, non-integer indices, identical indices,
 *                    or non-finite particle state.
 */
export function performElasticCollision(
  i: number,
  j: number,
  ensemble: ParticleEnsemble,
  prng: PRNG,
): CollisionResult {
  const n = ensemble.count;

  // 1. Validate indices
  validateParticleIndex(i, n, 'i');
  validateParticleIndex(j, n, 'j');

  if (i === j) {
    throw new RangeError(
      `Collision partners must be distinct particles. Both indices are: ${i}`,
    );
  }

  // 2. Validate particle states before collision
  assertFiniteParticleState(ensemble, i, 'i');
  assertFiniteParticleState(ensemble, j, 'j');

  // 3. Load velocities from SoA arrays (local scalars — no heap)
  const v1x = ensemble.vx[i];
  const v1y = ensemble.vy[i];
  const v1z = ensemble.vz[i];

  const v2x = ensemble.vx[j];
  const v2y = ensemble.vy[j];
  const v2z = ensemble.vz[j];

  // 4. Compute centre-of-mass velocity (equal masses → simple average)
  const vComX = 0.5 * (v1x + v2x);
  const vComY = 0.5 * (v1y + v2y);
  const vComZ = 0.5 * (v1z + v2z);

  // 5. Compute pre-collision relative velocity: vRel = v₁ - v₂
  const vRelX = v1x - v2x;
  const vRelY = v1y - v2y;
  const vRelZ = v1z - v2z;

  // 6. Compute relative speed (magnitude of vRel)
  const relSpeedSq = vRelX * vRelX + vRelY * vRelY + vRelZ * vRelZ;
  const relSpeed = Math.sqrt(relSpeedSq);

  // 7. No-op for zero relative velocity
  if (relSpeed === 0.0) {
    return { collided: false, relativeSpeed: 0.0 };
  }

  // 8. Sample a uniformly distributed post-collision direction on S²
  const [nx, ny, nz] = sampleUniformSphere(prng);

  // 9. Scale the unit vector to preserve the pre-collision relative speed
  const vRelPostX = relSpeed * nx;
  const vRelPostY = relSpeed * ny;
  const vRelPostZ = relSpeed * nz;

  // 10. Reconstruct post-collision lab-frame velocities:
  //     v₁' = vCoM + ½ vRelPost
  //     v₂' = vCoM - ½ vRelPost
  ensemble.vx[i] = vComX + 0.5 * vRelPostX;
  ensemble.vy[i] = vComY + 0.5 * vRelPostY;
  ensemble.vz[i] = vComZ + 0.5 * vRelPostZ;

  ensemble.vx[j] = vComX - 0.5 * vRelPostX;
  ensemble.vy[j] = vComY - 0.5 * vRelPostY;
  ensemble.vz[j] = vComZ - 0.5 * vRelPostZ;

  return { collided: true, relativeSpeed: relSpeed };
}
