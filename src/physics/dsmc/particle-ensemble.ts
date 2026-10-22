/**
 * DSMC Particle Ensemble
 * ======================
 *
 * Contiguous Structure-of-Arrays (SoA) particle storage backed by Float64Array
 * buffers for high-performance, deterministic Monte Carlo particle simulation.
 *
 * Storage Architecture
 * ────────────────────
 * Particle states are maintained in 6 flat, parallel typed arrays:
 *  - Positions: x, y, z  [meters, m]
 *  - Velocities: vx, vy, vz  [meters per second, m/s]
 *
 * Design Principles
 * ─────────────────
 * 1. Zero Garbage-Collection Pressure: Once allocated, array buffers are reused in place.
 *    No per-particle object allocation occurs during simulation stepping.
 * 2. Independence: Zero dependencies on React, browser DOM, or UI rendering libraries.
 * 3. Validation: Rejects invalid, non-integer, non-finite, zero, or excessively large counts.
 * 4. Geometry Agnostic: Does not couple to any specific chamber geometry (e.g., cylinder, box).
 *    Accepts generalized 3D bounds for position seeding.
 * 5. Explicit Statistical Weighting: Does NOT assign an invented statistical weight without
 *    explicit configuration. If metadata is supplied, the statistical weighting factor F_N
 *    is clearly documented as physical atoms per simulator particle (not molecular atomicity).
 *
 * @module
 */

import { R } from '../constants';
import type { PRNG } from './prng';

/** Minimum permitted particle count in an ensemble. */
export const MIN_PARTICLE_COUNT = 1;

/** Maximum permitted particle count to safeguard against unreasonable memory allocation. */
export const MAX_PARTICLE_COUNT = 1_000_000;

/**
 * Spatial bounding box for uniform particle position initialization.
 * Coordinates are in SI units [meters, m].
 */
export interface SpatialBounds3D {
  readonly xMin: number;
  readonly xMax: number;
  readonly yMin: number;
  readonly yMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

/**
 * Optional metadata associated with the particle ensemble.
 */
export interface EnsembleMetadata {
  /**
   * Statistical weighting factor F_N [dimensionless real atoms per simulator particle].
   * Represents the ratio of physical real atoms to computational simulator particles (N_real / N_s).
   * Note: This is NOT the atomicity (number of bonded atoms in a molecule); it is the macroscopic
   * representation scale. If omitted, no statistical weight is assumed.
   */
  readonly statisticalWeight?: number;

  /** Optional label or descriptive tag for the ensemble. */
  readonly label?: string;
}

/**
 * Reusable container for reading a single particle's state without object allocation.
 */
export interface ParticleStateRecord {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

/**
 * Validates that an input particle count is a positive finite integer within acceptable bounds.
 */
function validateParticleCount(count: unknown): number {
  if (typeof count !== 'number' || !Number.isFinite(count) || !Number.isInteger(count)) {
    throw new TypeError(
      `Particle count must be a finite integer. Received: ${String(count)} (${typeof count})`,
    );
  }
  if (count < MIN_PARTICLE_COUNT) {
    throw new RangeError(
      `Particle count must be at least ${MIN_PARTICLE_COUNT}. Received: ${count}`,
    );
  }
  if (count > MAX_PARTICLE_COUNT) {
    throw new RangeError(
      `Particle count exceeds maximum allowed limit of ${MAX_PARTICLE_COUNT.toLocaleString()}. Received: ${count}`,
    );
  }
  return count;
}

/**
 * Validates 3D spatial initialization bounds.
 */
function validateBounds(bounds: SpatialBounds3D): void {
  const fields: (keyof SpatialBounds3D)[] = ['xMin', 'xMax', 'yMin', 'yMax', 'zMin', 'zMax'];
  for (const f of fields) {
    if (!Number.isFinite(bounds[f])) {
      throw new RangeError(`Spatial bound '${f}' must be a finite number. Received: ${bounds[f]}`);
    }
  }
  if (bounds.xMin >= bounds.xMax) {
    throw new RangeError(`xMin (${bounds.xMin}) must be strictly less than xMax (${bounds.xMax}).`);
  }
  if (bounds.yMin >= bounds.yMax) {
    throw new RangeError(`yMin (${bounds.yMin}) must be strictly less than yMax (${bounds.yMax}).`);
  }
  if (bounds.zMin >= bounds.zMax) {
    throw new RangeError(`zMin (${bounds.zMin}) must be strictly less than zMax (${bounds.zMax}).`);
  }
}

/**
 * A contiguous Structure-of-Arrays ensemble of simulator particles.
 */
export class ParticleEnsemble {
  /** The validated particle count (read-only). */
  readonly count: number;

  /** Particle position x-coordinates [meters, m]. */
  readonly x: Float64Array;

  /** Particle position y-coordinates [meters, m]. */
  readonly y: Float64Array;

  /** Particle position z-coordinates [meters, m]. */
  readonly z: Float64Array;

  /** Particle velocity x-components [meters per second, m/s]. */
  readonly vx: Float64Array;

  /** Particle velocity y-components [meters per second, m/s]. */
  readonly vy: Float64Array;

  /** Particle velocity z-components [meters per second, m/s]. */
  readonly vz: Float64Array;

  /** Metadata including optional statistical weighting factor F_N. */
  readonly metadata: EnsembleMetadata;

  /**
   * Constructs a new ParticleEnsemble and allocates zero-initialized typed arrays.
   *
   * @param count    The number of particles to allocate (1 to 1,000,000).
   * @param metadata Optional metadata specifying statistical weight F_N or label.
   */
  constructor(count: number, metadata?: EnsembleMetadata) {
    const validatedCount = validateParticleCount(count);
    this.count = validatedCount;

    // Allocate independent contiguous 64-bit float buffers
    this.x = new Float64Array(validatedCount);
    this.y = new Float64Array(validatedCount);
    this.z = new Float64Array(validatedCount);
    this.vx = new Float64Array(validatedCount);
    this.vy = new Float64Array(validatedCount);
    this.vz = new Float64Array(validatedCount);

    if (metadata?.statisticalWeight !== undefined) {
      if (
        !Number.isFinite(metadata.statisticalWeight) ||
        metadata.statisticalWeight <= 0
      ) {
        throw new RangeError(
          `Statistical weight F_N must be a positive finite number. Received: ${metadata.statisticalWeight}`,
        );
      }
    }

    this.metadata = metadata ? { ...metadata } : {};
  }

  /**
   * Sets the 6-component state of an individual particle by index.
   *
   * @param index Particle array index (0 to count - 1).
   * @param x     Position x-coordinate [m].
   * @param y     Position y-coordinate [m].
   * @param z     Position z-coordinate [m].
   * @param vx    Velocity x-component [m/s].
   * @param vy    Velocity y-component [m/s].
   * @param vz    Velocity z-component [m/s].
   */
  setParticle(
    index: number,
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
  ): void {
    if (index < 0 || index >= this.count || !Number.isInteger(index)) {
      throw new RangeError(
        `Particle index ${index} out of bounds for ensemble with count ${this.count}.`,
      );
    }
    this.x[index] = x;
    this.y[index] = y;
    this.z[index] = z;
    this.vx[index] = vx;
    this.vy[index] = vy;
    this.vz[index] = vz;
  }

  /**
   * Reads a particle's 6-component state at the specified index.
   *
   * @param index Particle array index (0 to count - 1).
   * @param out   Optional existing record to populate (avoids heap allocation).
   * @returns The populated particle record.
   */
  getParticle(index: number, out?: ParticleStateRecord): ParticleStateRecord {
    if (index < 0 || index >= this.count || !Number.isInteger(index)) {
      throw new RangeError(
        `Particle index ${index} out of bounds for ensemble with count ${this.count}.`,
      );
    }
    const record = out ?? { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    record.x = this.x[index];
    record.y = this.y[index];
    record.z = this.z[index];
    record.vx = this.vx[index];
    record.vy = this.vy[index];
    record.vz = this.vz[index];
    return record;
  }

  /**
   * Deterministically initializes particle positions uniformly within a specified 3D bounding box.
   *
   * @param bounds Spatial bounding box [meters].
   * @param prng   Deterministic pseudo-random number generator.
   */
  initializeUniformPositions(bounds: SpatialBounds3D, prng: PRNG): void {
    validateBounds(bounds);
    const dx = bounds.xMax - bounds.xMin;
    const dy = bounds.yMax - bounds.yMin;
    const dz = bounds.zMax - bounds.zMin;
    const n = this.count;

    for (let i = 0; i < n; i++) {
      this.x[i] = bounds.xMin + prng.next() * dx;
      this.y[i] = bounds.yMin + prng.next() * dy;
      this.z[i] = bounds.zMin + prng.next() * dz;
    }
  }

  /**
   * Deterministically initializes particle velocities sampled from an isotropic
   * Maxwell-Boltzmann equilibrium distribution at a given temperature and molar mass.
   *
   * Each Cartesian velocity component follows an independent normal distribution:
   *   v_k ~ N(0, σ²), where σ = √(R·T / M) = √(k_B·T / m₀)  [m/s]
   *
   * @param temperature Absolute temperature [Kelvin, K]. Must be positive.
   * @param molarMass   Molar mass of the gas [kg/mol]. Must be positive.
   * @param prng        Deterministic pseudo-random number generator.
   */
  initializeMaxwellianVelocities(
    temperature: number,
    molarMass: number,
    prng: PRNG,
  ): void {
    if (!Number.isFinite(temperature) || temperature <= 0) {
      throw new RangeError(
        `Temperature must be a positive finite number [K]. Received: ${temperature}`,
      );
    }
    if (!Number.isFinite(molarMass) || molarMass <= 0) {
      throw new RangeError(
        `Molar mass must be a positive finite number [kg/mol]. Received: ${molarMass}`,
      );
    }

    // 1D velocity component standard deviation: σ = √(R·T / M)
    const sigma = Math.sqrt((R * temperature) / molarMass);
    const n = this.count;

    for (let i = 0; i < n; i++) {
      this.vx[i] = prng.nextGaussian(0, sigma);
      this.vy[i] = prng.nextGaussian(0, sigma);
      this.vz[i] = prng.nextGaussian(0, sigma);
    }
  }

  /**
   * Resets all particle positions and velocities to zero.
   */
  reset(): void {
    this.x.fill(0);
    this.y.fill(0);
    this.z.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
    this.vz.fill(0);
  }
}
