/**
 * Deterministic Pseudo-Random Number Generator (PRNG)
 * ====================================================
 *
 * Provides seedable, reproducible uniform and Gaussian random variates
 * for the Direct Simulation Monte Carlo (DSMC) particle simulation engine.
 *
 * Algorithm
 * ─────────
 * Based on the Mulberry32 generator (Tommy Ettinger / public domain),
 * a 32-bit generator with a Weyl sequence step constant (0x6D2B79F5) that
 * guarantees a period of 2³² ≈ 4.29 × 10⁹ states before repetition.
 *
 * Gaussian Variates
 * ─────────────────
 * Generated via the polar Box-Muller transform with cached second variate.
 * To preserve strict physical determinism, the cached variate state is fully
 * managed and cleared upon generator reset.
 *
 * Limitations
 * ───────────
 * - Not cryptographically secure.
 * - Single 32-bit state: suitable for statistical sampling up to ~10⁸ draws.
 * - Does not rely on Math.random().
 *
 * @module
 */

export interface PRNG {
  /**
   * Generates a pseudo-random floating-point number in the half-open interval [0, 1).
   */
  next(): number;

  /**
   * Generates a normally distributed pseudo-random number with specified mean and standard deviation.
   *
   * @param mean    Distribution mean μ (default: 0).
   * @param stdDev  Distribution standard deviation σ (default: 1).
   */
  nextGaussian(mean?: number, stdDev?: number): number;

  /**
   * Resets the generator state to its initial seed or to a newly specified seed.
   * Clears any cached Gaussian variate.
   *
   * @param newSeed Optional new integer seed.
   */
  reset(newSeed?: number): void;

  /** The initial seed used to configure this generator instance. */
  readonly seed: number;

  /** Whether a second Box-Muller Gaussian sample is currently cached. */
  readonly hasCachedGaussian: boolean;
}

/**
 * Validates that an input seed is a finite integer.
 */
function validateSeed(seed: unknown): number {
  if (typeof seed !== 'number' || !Number.isFinite(seed) || !Number.isInteger(seed)) {
    throw new TypeError(
      `PRNG seed must be a finite integer. Received: ${String(seed)} (${typeof seed})`,
    );
  }
  // Coerce to 32-bit unsigned integer
  return seed >>> 0;
}

/**
 * Mulberry32-based deterministic pseudo-random number generator.
 */
export class Mulberry32PRNG implements PRNG {
  private _initialSeed: number;
  private _state: number;
  private _hasCachedGaussian: boolean = false;
  private _cachedGaussian: number = 0;

  /**
   * Creates a new Mulberry32 PRNG instance.
   *
   * @param seed Integer seed. Must be a finite integer.
   * @throws TypeError if seed is not a finite integer.
   */
  constructor(seed: number) {
    const validSeed = validateSeed(seed);
    this._initialSeed = validSeed;
    this._state = validSeed;
  }

  /** The seed value used to initialize or reset this generator. */
  get seed(): number {
    return this._initialSeed;
  }

  /** Whether a second Box-Muller Gaussian sample is currently cached. */
  get hasCachedGaussian(): boolean {
    return this._hasCachedGaussian;
  }

  /**
   * Generates a uniform pseudo-random number in [0, 1).
   */
  next(): number {
    let t = (this._state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates a normally distributed number using the Box-Muller transform.
   *
   * @param mean    Mean of the Gaussian distribution (default: 0).
   * @param stdDev  Standard deviation of the Gaussian distribution (default: 1).
   * @throws RangeError if stdDev < 0 or if mean/stdDev are not finite numbers.
   */
  nextGaussian(mean: number = 0, stdDev: number = 1): number {
    if (!Number.isFinite(mean)) {
      throw new RangeError(`Gaussian mean must be a finite number. Received: ${mean}`);
    }
    if (!Number.isFinite(stdDev) || stdDev < 0) {
      throw new RangeError(
        `Gaussian standard deviation must be a non-negative finite number. Received: ${stdDev}`,
      );
    }
    if (stdDev === 0) {
      return mean;
    }

    // Return cached variate if available from prior call
    if (this._hasCachedGaussian) {
      this._hasCachedGaussian = false;
      const sample = this._cachedGaussian;
      this._cachedGaussian = 0;
      return mean + sample * stdDev;
    }

    // Generate two independent standard normal variates via Box-Muller
    // Ensure u1 > 0 to avoid ln(0) = -Infinity
    let u1 = this.next();
    while (u1 <= 0) {
      u1 = this.next();
    }
    const u2 = this.next();

    const radius = Math.sqrt(-2.0 * Math.log(u1));
    const theta = 2.0 * Math.PI * u2;

    const z0 = radius * Math.cos(theta);
    const z1 = radius * Math.sin(theta);

    // Cache the second variate
    this._cachedGaussian = z1;
    this._hasCachedGaussian = true;

    return mean + z0 * stdDev;
  }

  /**
   * Resets the generator state.
   *
   * @param newSeed If provided, resets to this new seed; otherwise resets to original seed.
   */
  reset(newSeed?: number): void {
    if (newSeed !== undefined) {
      this._initialSeed = validateSeed(newSeed);
    }
    this._state = this._initialSeed;
    this._hasCachedGaussian = false;
    this._cachedGaussian = 0;
  }
}

/**
 * Convenience factory for creating a seedable PRNG instance.
 */
export function createPRNG(seed: number): PRNG {
  return new Mulberry32PRNG(seed);
}
