/**
 * DSMC Stage 1 Tests: PRNG and Particle Ensemble
 * ===============================================
 *
 * Automated verification for:
 *  1. Seedable PRNG (Mulberry32) determinism, uniformity, and Gaussian statistics.
 *  2. ParticleEnsemble SoA allocation, validation, bounds checking, and determinism.
 */

import { describe, it, expect } from 'vitest';
import {
  Mulberry32PRNG,
  createPRNG,
  ParticleEnsemble,
  MIN_PARTICLE_COUNT,
  MAX_PARTICLE_COUNT,
  advanceParticles,
  reflect1DFixed,
  validateChamberGeometry,
} from '../physics/dsmc';
import type { ChamberGeometry3D } from '../physics/dsmc';
import { HELIUM, AVOGADRO } from '../physics/constants';

// ─── 1. Seedable PRNG Tests ──────────────────────────────────────────────── //

describe('DSMC PRNG: Mulberry32PRNG', () => {
  it('produces identical uniform sequences with identical seeds', () => {
    const prng1 = new Mulberry32PRNG(42);
    const prng2 = new Mulberry32PRNG(42);

    const seq1 = Array.from({ length: 100 }, () => prng1.next());
    const seq2 = Array.from({ length: 100 }, () => prng2.next());

    expect(seq1).toEqual(seq2);
  });

  it('produces different sequences with different seeds', () => {
    const seeds = [1, 2, 42, 1337, 999999];
    const firstSamples = seeds.map((s) => new Mulberry32PRNG(s).next());

    // Ensure all first samples are unique
    const unique = new Set(firstSamples);
    expect(unique.size).toBe(seeds.length);
  });

  it('generates uniform samples strictly within [0, 1)', () => {
    const prng = new Mulberry32PRNG(12345);
    const n = 20000;

    for (let i = 0; i < n; i++) {
      const val = prng.next();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it('generates finite Gaussian samples', () => {
    const prng = new Mulberry32PRNG(777);
    for (let i = 0; i < 1000; i++) {
      const g = prng.nextGaussian(0, 1);
      expect(Number.isFinite(g)).toBe(true);
    }
  });

  it('produces Gaussian samples with expected mean and variance within statistical tolerance', () => {
    const prng = new Mulberry32PRNG(20261021);
    const n = 50000;
    const mean = 0;
    const stdDev = 1;

    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < n; i++) {
      const val = prng.nextGaussian(mean, stdDev);
      sum += val;
      sumSq += val * val;
    }

    const sampleMean = sum / n;
    const sampleVariance = (sumSq - n * sampleMean * sampleMean) / (n - 1);

    // Standard error of the mean for N = 50,000: SE = 1 / sqrt(50,000) ≈ 0.00447
    // Tolerance of 4.5 * SE ≈ 0.02
    expect(sampleMean).toBeCloseTo(0, 1);
    expect(Math.abs(sampleMean)).toBeLessThan(0.02);

    // Standard deviation of sample variance for N = 50,000: sqrt(2/50,000) ≈ 0.00632
    // Tolerance of 5 * SD ≈ 0.03
    expect(sampleVariance).toBeCloseTo(1, 1);
    expect(Math.abs(sampleVariance - 1.0)).toBeLessThan(0.03);
  });

  it('respects custom Gaussian mean and standard deviation', () => {
    const prng = new Mulberry32PRNG(888);
    const n = 30000;
    const targetMean = 100;
    const targetStdDev = 15;

    let sum = 0;
    let sumSq = 0;

    for (let i = 0; i < n; i++) {
      const val = prng.nextGaussian(targetMean, targetStdDev);
      sum += val;
      sumSq += val * val;
    }

    const sampleMean = sum / n;
    const sampleVariance = (sumSq - n * sampleMean * sampleMean) / (n - 1);
    const sampleStdDev = Math.sqrt(sampleVariance);

    expect(Math.abs(sampleMean - targetMean)).toBeLessThan(0.5);
    expect(Math.abs(sampleStdDev - targetStdDev)).toBeLessThan(0.5);
  });

  it('returns mean exactly when stdDev is 0', () => {
    const prng = new Mulberry32PRNG(123);
    expect(prng.nextGaussian(42, 0)).toBe(42);
    expect(prng.nextGaussian(-5.5, 0)).toBe(-5.5);
  });

  it('resets state deterministically and clears cached Gaussian variate', () => {
    const prng = new Mulberry32PRNG(555);

    // Draw some uniform and Gaussian numbers
    const initialRun: number[] = [];
    initialRun.push(prng.next());
    initialRun.push(prng.nextGaussian(0, 1));
    initialRun.push(prng.nextGaussian(0, 1)); // consumes cached Gaussian
    initialRun.push(prng.nextGaussian(0, 1)); // leaves second variate cached
    expect(prng.hasCachedGaussian).toBe(true);
    initialRun.push(prng.next());

    // Reset without argument (re-uses seed 555)
    prng.reset();
    expect(prng.hasCachedGaussian).toBe(false);

    const rerun: number[] = [];
    rerun.push(prng.next());
    rerun.push(prng.nextGaussian(0, 1));
    rerun.push(prng.nextGaussian(0, 1));
    rerun.push(prng.nextGaussian(0, 1));
    rerun.push(prng.next());

    expect(rerun).toEqual(initialRun);

    // Reset with new seed
    prng.reset(999);
    expect(prng.seed).toBe(999);
    expect(prng.next()).not.toBe(initialRun[0]);
  });

  it('rejects invalid or unsupported seeds', () => {
    expect(() => new Mulberry32PRNG(NaN)).toThrow(TypeError);
    expect(() => new Mulberry32PRNG(Infinity)).toThrow(TypeError);
    expect(() => new Mulberry32PRNG(-Infinity)).toThrow(TypeError);
    expect(() => new Mulberry32PRNG(3.14159)).toThrow(TypeError);
    expect(() => new Mulberry32PRNG('42' as unknown as number)).toThrow(TypeError);
    expect(() => new Mulberry32PRNG(null as unknown as number)).toThrow(TypeError);
    expect(() => new Mulberry32PRNG(undefined as unknown as number)).toThrow(TypeError);

    const validPrng = createPRNG(1);
    expect(() => validPrng.reset(NaN)).toThrow(TypeError);
    expect(() => validPrng.reset(1.5)).toThrow(TypeError);
  });

  it('rejects invalid Gaussian arguments', () => {
    const prng = new Mulberry32PRNG(1);
    expect(() => prng.nextGaussian(NaN, 1)).toThrow(RangeError);
    expect(() => prng.nextGaussian(0, NaN)).toThrow(RangeError);
    expect(() => prng.nextGaussian(0, -1)).toThrow(RangeError);
    expect(() => prng.nextGaussian(0, Infinity)).toThrow(RangeError);
  });
});

// ─── 2. Particle Ensemble Tests ──────────────────────────────────────────── //

describe('DSMC ParticleEnsemble', () => {
  it('allocates correctly sized Float64Array buffers', () => {
    const count = 500;
    const ensemble = new ParticleEnsemble(count);

    expect(ensemble.count).toBe(count);
    expect(ensemble.x).toBeInstanceOf(Float64Array);
    expect(ensemble.y).toBeInstanceOf(Float64Array);
    expect(ensemble.z).toBeInstanceOf(Float64Array);
    expect(ensemble.vx).toBeInstanceOf(Float64Array);
    expect(ensemble.vy).toBeInstanceOf(Float64Array);
    expect(ensemble.vz).toBeInstanceOf(Float64Array);

    expect(ensemble.x.length).toBe(count);
    expect(ensemble.y.length).toBe(count);
    expect(ensemble.z.length).toBe(count);
    expect(ensemble.vx.length).toBe(count);
    expect(ensemble.vy.length).toBe(count);
    expect(ensemble.vz.length).toBe(count);
  });

  it('initializes typed array buffers with zero', () => {
    const ensemble = new ParticleEnsemble(10);
    for (let i = 0; i < 10; i++) {
      expect(ensemble.x[i]).toBe(0);
      expect(ensemble.y[i]).toBe(0);
      expect(ensemble.z[i]).toBe(0);
      expect(ensemble.vx[i]).toBe(0);
      expect(ensemble.vy[i]).toBe(0);
      expect(ensemble.vz[i]).toBe(0);
    }
  });

  it('rejects zero, negative, non-integer, non-finite, and excessively large counts', () => {
    // Zero
    expect(() => new ParticleEnsemble(0)).toThrow(RangeError);
    // Negative
    expect(() => new ParticleEnsemble(-10)).toThrow(RangeError);
    // Non-integer
    expect(() => new ParticleEnsemble(10.5)).toThrow(TypeError);
    // Non-finite
    expect(() => new ParticleEnsemble(NaN)).toThrow(TypeError);
    expect(() => new ParticleEnsemble(Infinity)).toThrow(TypeError);
    expect(() => new ParticleEnsemble(-Infinity)).toThrow(TypeError);
    // Type mismatches
    expect(() => new ParticleEnsemble('100' as unknown as number)).toThrow(TypeError);
    expect(() => new ParticleEnsemble(null as unknown as number)).toThrow(TypeError);
    // Excessively large counts
    expect(() => new ParticleEnsemble(MAX_PARTICLE_COUNT + 1)).toThrow(RangeError);
  });

  it('allows minimum and reasonable maximum particle counts', () => {
    expect(() => new ParticleEnsemble(MIN_PARTICLE_COUNT)).not.toThrow();
    expect(() => new ParticleEnsemble(10000)).not.toThrow();
  });

  it('stores and retrieves particle values at the expected array index', () => {
    const ensemble = new ParticleEnsemble(100);

    ensemble.setParticle(0, 0.01, 0.02, 0.03, 100, 200, 300);
    ensemble.setParticle(49, -0.05, 0.12, 0.25, -450, 120, -50);
    ensemble.setParticle(99, 0.1, 0.2, 0.3, 1000, -1000, 500);

    // Verify raw array storage
    expect(ensemble.x[0]).toBe(0.01);
    expect(ensemble.y[0]).toBe(0.02);
    expect(ensemble.z[0]).toBe(0.03);
    expect(ensemble.vx[0]).toBe(100);
    expect(ensemble.vy[0]).toBe(200);
    expect(ensemble.vz[0]).toBe(300);

    // Verify getter
    const p49 = ensemble.getParticle(49);
    expect(p49).toEqual({
      x: -0.05,
      y: 0.12,
      z: 0.25,
      vx: -450,
      vy: 120,
      vz: -50,
    });

    // Verify getter with reusable out record (no allocation)
    const out = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
    const ref = ensemble.getParticle(99, out);
    expect(ref).toBe(out);
    expect(out.x).toBe(0.1);
    expect(out.vz).toBe(500);
  });

  it('throws on out-of-bounds particle index access', () => {
    const ensemble = new ParticleEnsemble(50);
    expect(() => ensemble.setParticle(-1, 0, 0, 0, 0, 0, 0)).toThrow(RangeError);
    expect(() => ensemble.setParticle(50, 0, 0, 0, 0, 0, 0)).toThrow(RangeError);
    expect(() => ensemble.setParticle(1.5, 0, 0, 0, 0, 0, 0)).toThrow(RangeError);

    expect(() => ensemble.getParticle(-1)).toThrow(RangeError);
    expect(() => ensemble.getParticle(50)).toThrow(RangeError);
  });

  it('does not share mutable buffers between separate ensembles', () => {
    const ensembleA = new ParticleEnsemble(10);
    const ensembleB = new ParticleEnsemble(10);

    ensembleA.setParticle(0, 1, 2, 3, 4, 5, 6);

    expect(ensembleB.x[0]).toBe(0);
    expect(ensembleB.vx[0]).toBe(0);

    expect(ensembleA.x.buffer).not.toBe(ensembleB.x.buffer);
  });

  it('initializes positions uniformly within specified bounds', () => {
    const ensemble = new ParticleEnsemble(1000);
    const prng = new Mulberry32PRNG(42);

    const bounds = {
      xMin: -0.1,
      xMax: 0.1,
      yMin: -0.1,
      yMax: 0.1,
      zMin: 0.0,
      zMax: 0.5,
    };

    ensemble.initializeUniformPositions(bounds, prng);

    for (let i = 0; i < ensemble.count; i++) {
      expect(ensemble.x[i]).toBeGreaterThanOrEqual(bounds.xMin);
      expect(ensemble.x[i]).toBeLessThanOrEqual(bounds.xMax);
      expect(ensemble.y[i]).toBeGreaterThanOrEqual(bounds.yMin);
      expect(ensemble.y[i]).toBeLessThanOrEqual(bounds.yMax);
      expect(ensemble.z[i]).toBeGreaterThanOrEqual(bounds.zMin);
      expect(ensemble.z[i]).toBeLessThanOrEqual(bounds.zMax);
      expect(Number.isFinite(ensemble.x[i])).toBe(true);
      expect(Number.isFinite(ensemble.y[i])).toBe(true);
      expect(Number.isFinite(ensemble.z[i])).toBe(true);
    }
  });

  it('rejects invalid position initialization bounds', () => {
    const ensemble = new ParticleEnsemble(10);
    const prng = new Mulberry32PRNG(1);

    // xMin >= xMax
    expect(() =>
      ensemble.initializeUniformPositions(
        { xMin: 1, xMax: 1, yMin: 0, yMax: 1, zMin: 0, zMax: 1 },
        prng,
      ),
    ).toThrow(RangeError);

    // Non-finite bound
    expect(() =>
      ensemble.initializeUniformPositions(
        { xMin: NaN, xMax: 1, yMin: 0, yMax: 1, zMin: 0, zMax: 1 },
        prng,
      ),
    ).toThrow(RangeError);
  });

  it('initializes velocities from a Maxwell-Boltzmann distribution at target temperature', () => {
    const ensemble = new ParticleEnsemble(50000);
    const prng = new Mulberry32PRNG(101);

    const temperature = 300; // 300 K
    const molarMass = HELIUM.molarMass; // 4.002602e-3 kg/mol

    ensemble.initializeMaxwellianVelocities(temperature, molarMass, prng);

    // Theoretical 1D velocity variance: σ² = RT / M
    const expectedSigmaSq = (8.314462618 * temperature) / molarMass;
    const expectedSigma = Math.sqrt(expectedSigmaSq);

    let sumVx = 0;
    let sumVy = 0;
    let sumVz = 0;
    let sumVxSq = 0;
    let sumVySq = 0;
    let sumVzSq = 0;
    const n = ensemble.count;

    for (let i = 0; i < n; i++) {
      expect(Number.isFinite(ensemble.vx[i])).toBe(true);
      expect(Number.isFinite(ensemble.vy[i])).toBe(true);
      expect(Number.isFinite(ensemble.vz[i])).toBe(true);

      sumVx += ensemble.vx[i];
      sumVy += ensemble.vy[i];
      sumVz += ensemble.vz[i];

      sumVxSq += ensemble.vx[i] * ensemble.vx[i];
      sumVySq += ensemble.vy[i] * ensemble.vy[i];
      sumVzSq += ensemble.vz[i] * ensemble.vz[i];
    }

    const meanVx = sumVx / n;
    const meanVy = sumVy / n;
    const meanVz = sumVz / n;

    const varVx = (sumVxSq - n * meanVx * meanVx) / (n - 1);
    const varVy = (sumVySq - n * meanVy * meanVy) / (n - 1);
    const varVz = (sumVzSq - n * meanVz * meanVz) / (n - 1);

    // Component means should be close to 0 (relative to sigma ≈ 789 m/s)
    expect(Math.abs(meanVx) / expectedSigma).toBeLessThan(0.02);
    expect(Math.abs(meanVy) / expectedSigma).toBeLessThan(0.02);
    expect(Math.abs(meanVz) / expectedSigma).toBeLessThan(0.02);

    // Component variances should be within 3% of RT/M
    expect(Math.abs(varVx - expectedSigmaSq) / expectedSigmaSq).toBeLessThan(0.03);
    expect(Math.abs(varVy - expectedSigmaSq) / expectedSigmaSq).toBeLessThan(0.03);
    expect(Math.abs(varVz - expectedSigmaSq) / expectedSigmaSq).toBeLessThan(0.03);
  });

  it('rejects non-positive temperature and molar mass for velocity initialization', () => {
    const ensemble = new ParticleEnsemble(10);
    const prng = new Mulberry32PRNG(1);

    expect(() => ensemble.initializeMaxwellianVelocities(0, 0.004, prng)).toThrow(RangeError);
    expect(() => ensemble.initializeMaxwellianVelocities(-300, 0.004, prng)).toThrow(RangeError);
    expect(() => ensemble.initializeMaxwellianVelocities(300, 0, prng)).toThrow(RangeError);
    expect(() => ensemble.initializeMaxwellianVelocities(300, -0.004, prng)).toThrow(RangeError);
    expect(() => ensemble.initializeMaxwellianVelocities(NaN, 0.004, prng)).toThrow(RangeError);
  });

  it('is completely deterministic when initialized with the same seed and parameters', () => {
    const ensembleA = new ParticleEnsemble(500);
    const ensembleB = new ParticleEnsemble(500);

    const prngA = new Mulberry32PRNG(4242);
    const prngB = new Mulberry32PRNG(4242);

    const bounds = { xMin: -0.1, xMax: 0.1, yMin: -0.1, yMax: 0.1, zMin: 0, zMax: 0.5 };
    const temp = 298.15;
    const mass = HELIUM.molarMass;

    ensembleA.initializeUniformPositions(bounds, prngA);
    ensembleA.initializeMaxwellianVelocities(temp, mass, prngA);

    ensembleB.initializeUniformPositions(bounds, prngB);
    ensembleB.initializeMaxwellianVelocities(temp, mass, prngB);

    for (let i = 0; i < 500; i++) {
      expect(ensembleA.x[i]).toBe(ensembleB.x[i]);
      expect(ensembleA.y[i]).toBe(ensembleB.y[i]);
      expect(ensembleA.z[i]).toBe(ensembleB.z[i]);
      expect(ensembleA.vx[i]).toBe(ensembleB.vx[i]);
      expect(ensembleA.vy[i]).toBe(ensembleB.vy[i]);
      expect(ensembleA.vz[i]).toBe(ensembleB.vz[i]);
    }
  });

  it('resets all coordinates and velocities to zero via reset()', () => {
    const ensemble = new ParticleEnsemble(50);
    const prng = new Mulberry32PRNG(99);
    ensemble.initializeUniformPositions(
      { xMin: 0, xMax: 1, yMin: 0, yMax: 1, zMin: 0, zMax: 1 },
      prng,
    );
    ensemble.initializeMaxwellianVelocities(300, 0.004, prng);

    expect(ensemble.x[0]).not.toBe(0);

    ensemble.reset();

    for (let i = 0; i < 50; i++) {
      expect(ensemble.x[i]).toBe(0);
      expect(ensemble.y[i]).toBe(0);
      expect(ensemble.z[i]).toBe(0);
      expect(ensemble.vx[i]).toBe(0);
      expect(ensemble.vy[i]).toBe(0);
      expect(ensemble.vz[i]).toBe(0);
    }
  });

  it('handles metadata and statistical weighting without inventing defaults', () => {
    // No metadata specified -> empty object, no statistical weight assumed
    const defaultEnsemble = new ParticleEnsemble(10);
    expect(defaultEnsemble.metadata.statisticalWeight).toBeUndefined();

    // Explicit valid statistical weight
    const weighted = new ParticleEnsemble(10, {
      statisticalWeight: 1e20,
      label: '1 mol He reference',
    });
    expect(weighted.metadata.statisticalWeight).toBe(1e20);
    expect(weighted.metadata.label).toBe('1 mol He reference');

    // Reject non-positive or non-finite statistical weights
    expect(() => new ParticleEnsemble(10, { statisticalWeight: 0 })).toThrow(RangeError);
    expect(() => new ParticleEnsemble(10, { statisticalWeight: -1e20 })).toThrow(RangeError);
    expect(() => new ParticleEnsemble(10, { statisticalWeight: NaN })).toThrow(RangeError);
  });
});

// ─── 3. Particle Motion and Chamber Boundary Tests ───────────────────────── //

describe('DSMC Stage 2: Particle Motion and Boundary Interactions', () => {
  const defaultChamber: ChamberGeometry3D = {
    xMin: -0.1,
    xMax: 0.1,
    yMin: -0.1,
    yMax: 0.1,
    zMin: 0.0,
    piston: {
      position: 0.5,
      velocity: 0,
    },
  };

  it('reflect1DFixed correctly computes position, velocity, and bounce counts', () => {
    // 1. Free flight without collision
    const [x1, v1, b1] = reflect1DFixed(0.02, 0.5, 0.01, 0, 0.1);
    expect(x1).toBeCloseTo(0.025, 8);
    expect(v1).toBe(0.5);
    expect(b1).toBe(0);

    // 2. Single bounce off right wall (xMax = 0.1)
    // Starts at 0.08, v = 5, dt = 0.01 -> raw = 0.13. Bounce at 0.1, reflects to 0.07 with v = -5
    const [x2, v2, b2] = reflect1DFixed(0.08, 5, 0.01, 0, 0.1);
    expect(x2).toBeCloseTo(0.07, 8);
    expect(v2).toBe(-5);
    expect(b2).toBe(1);

    // 3. Single bounce off left wall (xMin = 0)
    // Starts at 0.02, v = -5, dt = 0.01 -> raw = -0.03. Bounce at 0, reflects to 0.03 with v = +5
    const [x3, v3, b3] = reflect1DFixed(0.02, -5, 0.01, 0, 0.1);
    expect(x3).toBeCloseTo(0.03, 8);
    expect(v3).toBe(5);
    expect(b3).toBe(1);

    // 4. Multiple bounces across domain in single step (odd bounces: velocity reversed)
    // Domain width = 0.1. Starts at 0.02, v = 35, dt = 0.01 -> raw = 0.37.
    // 0.37 / 0.1 = 3 domain crossings (bounces) -> lands at 0.03 with v = -35
    const [x4, v4, b4] = reflect1DFixed(0.02, 35, 0.01, 0, 0.1);
    expect(x4).toBeCloseTo(0.03, 8);
    expect(v4).toBe(-35);
    expect(b4).toBe(3);

    // 5. Multiple bounces across domain (even bounces: velocity original)
    // Starts at 0.02, v = 40, dt = 0.01 -> raw = 0.42.
    // 0.42 / 0.1 = 4 domain crossings (bounces) -> lands at 0.02 with v = +40
    const [x5, v5, b5] = reflect1DFixed(0.02, 40, 0.01, 0, 0.1);
    expect(x5).toBeCloseTo(0.02, 8);
    expect(v5).toBe(40);
    expect(b5).toBe(4);

    // 6. Particle on boundary moving outward immediately reflects inward
    const [x6, v6, b6] = reflect1DFixed(0.1, 10, 0, 0, 0.1);
    expect(x6).toBe(0.1);
    expect(v6).toBe(-10);
    expect(b6).toBe(1);

    const [x7, v7, b7] = reflect1DFixed(0, -10, 0, 0, 0.1);
    expect(x7).toBe(0);
    expect(v7).toBe(10);
    expect(b7).toBe(1);
  });

  it('performs free flight advection without wall collisions when particles are unconstrained', () => {
    const ensemble = new ParticleEnsemble(3);
    ensemble.setParticle(0, 0.0, 0.0, 0.25, 10, 20, 30);
    ensemble.setParticle(1, -0.05, 0.05, 0.1, -10, -10, 10);
    ensemble.setParticle(2, 0.02, -0.02, 0.4, 5, -5, -15);

    const dt = 0.001; // 1 ms
    const result = advanceParticles(ensemble, defaultChamber, dt);

    expect(result.fixedWallCollisions).toBe(0);
    expect(result.pistonCollisions).toBe(0);
    expect(result.pistonWorkTransferred).toBe(0);

    // Particle 0
    expect(ensemble.x[0]).toBeCloseTo(0.0 + 10 * dt, 8);
    expect(ensemble.y[0]).toBeCloseTo(0.0 + 20 * dt, 8);
    expect(ensemble.z[0]).toBeCloseTo(0.25 + 30 * dt, 8);
    expect(ensemble.vx[0]).toBe(10);
    expect(ensemble.vy[0]).toBe(20);
    expect(ensemble.vz[0]).toBe(30);

    // Particle 1
    expect(ensemble.x[1]).toBeCloseTo(-0.05 - 10 * dt, 8);
    expect(ensemble.y[1]).toBeCloseTo(0.05 - 10 * dt, 8);
    expect(ensemble.z[1]).toBeCloseTo(0.1 + 10 * dt, 8);

    // Particle 2
    expect(ensemble.x[2]).toBeCloseTo(0.02 + 5 * dt, 8);
    expect(ensemble.y[2]).toBeCloseTo(-0.02 - 5 * dt, 8);
    expect(ensemble.z[2]).toBeCloseTo(0.4 - 15 * dt, 8);
  });

  it('reflects correctly off each of the 6 fixed boundaries', () => {
    const ensemble = new ParticleEnsemble(6);
    // 0: Left xMin (-0.1)
    ensemble.setParticle(0, -0.09, 0, 0.25, -50, 0, 0);
    // 1: Right xMax (0.1)
    ensemble.setParticle(1, 0.09, 0, 0.25, 50, 0, 0);
    // 2: Lower yMin (-0.1)
    ensemble.setParticle(2, 0, -0.09, 0.25, 0, -50, 0);
    // 3: Upper yMax (0.1)
    ensemble.setParticle(3, 0, 0.09, 0.25, 0, 50, 0);
    // 4: Floor zMin (0.0)
    ensemble.setParticle(4, 0, 0, 0.02, 0, 0, -50);
    // 5: Fixed piston at z = 0.5
    ensemble.setParticle(5, 0, 0, 0.48, 0, 0, 50);

    const dt = 0.001; // dt = 1 ms -> displacement = 0.05 m
    const result = advanceParticles(ensemble, defaultChamber, dt);

    expect(result.fixedWallCollisions).toBe(6);
    expect(result.pistonCollisions).toBe(0);

    // 0: Hit xMin (-0.1), reflected right -> vx > 0
    expect(ensemble.vx[0]).toBe(50);
    expect(ensemble.x[0]).toBeGreaterThanOrEqual(defaultChamber.xMin);

    // 1: Hit xMax (0.1), reflected left -> vx < 0
    expect(ensemble.vx[1]).toBe(-50);
    expect(ensemble.x[1]).toBeLessThanOrEqual(defaultChamber.xMax);

    // 2: Hit yMin (-0.1), reflected up -> vy > 0
    expect(ensemble.vy[2]).toBe(50);
    expect(ensemble.y[2]).toBeGreaterThanOrEqual(defaultChamber.yMin);

    // 3: Hit yMax (0.1), reflected down -> vy < 0
    expect(ensemble.vy[3]).toBe(-50);
    expect(ensemble.y[3]).toBeLessThanOrEqual(defaultChamber.yMax);

    // 4: Hit zMin (0.0), reflected up -> vz > 0
    expect(ensemble.vz[4]).toBe(50);
    expect(ensemble.z[4]).toBeGreaterThanOrEqual(defaultChamber.zMin);

    // 5: Hit stationary piston (0.5), reflected down -> vz < 0
    expect(ensemble.vz[5]).toBe(-50);
    expect(ensemble.z[5]).toBeLessThanOrEqual(defaultChamber.piston.position);
  });

  it('reflects particles positioned exactly on boundaries and moving outward', () => {
    const ensemble = new ParticleEnsemble(4);
    // On xMax moving outward
    ensemble.setParticle(0, 0.1, 0, 0.25, 20, 0, 0);
    // On xMin moving outward
    ensemble.setParticle(1, -0.1, 0, 0.25, -20, 0, 0);
    // On zMin moving outward
    ensemble.setParticle(2, 0, 0, 0.0, 0, 0, -20);
    // On piston moving outward
    ensemble.setParticle(3, 0, 0, 0.5, 0, 0, 20);

    advanceParticles(ensemble, defaultChamber, 0.001);

    expect(ensemble.vx[0]).toBe(-20);
    expect(ensemble.x[0]).toBeLessThanOrEqual(0.1);

    expect(ensemble.vx[1]).toBe(20);
    expect(ensemble.x[1]).toBeGreaterThanOrEqual(-0.1);

    expect(ensemble.vz[2]).toBe(20);
    expect(ensemble.z[2]).toBeGreaterThanOrEqual(0.0);

    expect(ensemble.vz[3]).toBe(-20);
    expect(ensemble.z[3]).toBeLessThanOrEqual(0.5);
  });

  it('accurately resolves multiple reflections in a single timestep and conserves energy', () => {
    const ensemble = new ParticleEnsemble(1);
    // Chamber width in x is 0.2 m.
    // Velocity vx = 1000 m/s for dt = 0.01 s -> total travel = 10 m = 50 chamber traversals!
    ensemble.setParticle(0, 0.0, 0.0, 0.25, 1000, 500, -800);

    const initialSpeedSq = 1000 * 1000 + 500 * 500 + 800 * 800;

    const res = advanceParticles(ensemble, defaultChamber, 0.01);

    // Must record multiple collisions
    expect(res.fixedWallCollisions).toBeGreaterThan(10);

    // Must remain strictly inside chamber
    expect(ensemble.x[0]).toBeGreaterThanOrEqual(defaultChamber.xMin);
    expect(ensemble.x[0]).toBeLessThanOrEqual(defaultChamber.xMax);
    expect(ensemble.y[0]).toBeGreaterThanOrEqual(defaultChamber.yMin);
    expect(ensemble.y[0]).toBeLessThanOrEqual(defaultChamber.yMax);
    expect(ensemble.z[0]).toBeGreaterThanOrEqual(defaultChamber.zMin);
    expect(ensemble.z[0]).toBeLessThanOrEqual(defaultChamber.piston.position);

    // Specular reflection off fixed walls must conserve individual particle speed exactly
    const finalSpeedSq =
      ensemble.vx[0] * ensemble.vx[0] +
      ensemble.vy[0] * ensemble.vy[0] +
      ensemble.vz[0] * ensemble.vz[0];
    expect(finalSpeedSq).toBeCloseTo(initialSpeedSq, 8);
  });

  it('handles moving piston compression (vp < 0) accelerating particles and doing work on gas', () => {
    const ensemble = new ParticleEnsemble(1, { statisticalWeight: 1e20 });
    // Particle at z = 0.4 moving upward at vz = 20 m/s
    ensemble.setParticle(0, 0, 0, 0.4, 0, 0, 20);

    const compressingChamber: ChamberGeometry3D = {
      ...defaultChamber,
      piston: {
        position: 0.5,
        velocity: -10, // Compressing at 10 m/s downward
      },
    };

    const dt = 0.01; // 10 ms
    // Relative velocity: vz - vp = 20 - (-10) = 30 m/s
    // Time to collision: (0.5 - 0.4) / 30 = 1/300 s ≈ 0.00333 s
    // Reflected velocity: v_z* = 2*vp - vz = 2*(-10) - 20 = -40 m/s (speed increases!)

    const res = advanceParticles(ensemble, compressingChamber, dt);

    expect(res.pistonCollisions).toBe(1);
    expect(ensemble.vz[0]).toBeCloseTo(-40, 6);

    // Particle gained kinetic energy: 1/2 m0 (40² - 20²) = 1/2 m0 (1200) > 0
    const m0 = HELIUM.molarMass / AVOGADRO;
    const expectedAtomicDeltaEk = 0.5 * m0 * (40 * 40 - 20 * 20);
    const expectedWork = expectedAtomicDeltaEk * 1e20;

    expect(res.pistonWorkTransferred).toBeGreaterThan(0);
    expect(res.pistonWorkTransferred).toBeCloseTo(expectedWork, 12);

    // Final position must be inside the compressed chamber: zPistonFinal = 0.5 - 0.1 = 0.40
    const finalPistonZ = 0.5 + -10 * dt;
    expect(ensemble.z[0]).toBeLessThanOrEqual(finalPistonZ);
    expect(ensemble.z[0]).toBeGreaterThanOrEqual(compressingChamber.zMin);
  });

  it('handles moving piston expansion (vp > 0) decelerating particles and extracting work', () => {
    const ensemble = new ParticleEnsemble(1, { statisticalWeight: 1e20 });
    // Particle at z = 0.4 moving upward at vz = 20 m/s
    ensemble.setParticle(0, 0, 0, 0.4, 0, 0, 20);

    const expandingChamber: ChamberGeometry3D = {
      ...defaultChamber,
      piston: {
        position: 0.5,
        velocity: 10, // Expanding at 10 m/s upward
      },
    };

    const dt = 0.01;
    // Relative velocity: vz - vp = 20 - 10 = 10 m/s
    // Time to collision: (0.5 - 0.4) / 10 = 0.01 s
    // Reflected velocity: v_z* = 2*vp - vz = 2*(10) - 20 = 0 m/s (speed drops!)

    const res = advanceParticles(ensemble, expandingChamber, dt);

    expect(res.pistonCollisions).toBe(1);
    expect(ensemble.vz[0]).toBeCloseTo(0, 6);

    // Particle lost kinetic energy: work is negative (gas does work on piston)
    expect(res.pistonWorkTransferred).toBeLessThan(0);

    const finalPistonZ = 0.5 + 10 * dt;
    expect(ensemble.z[0]).toBeLessThanOrEqual(finalPistonZ);
  });

  it('handles zero timestep without modifying ensemble or counting collisions', () => {
    const ensemble = new ParticleEnsemble(2);
    ensemble.setParticle(0, 0.05, -0.05, 0.2, 100, -200, 300);
    ensemble.setParticle(1, -0.08, 0.08, 0.4, -400, 500, -600);

    const res = advanceParticles(ensemble, defaultChamber, 0);

    expect(res.fixedWallCollisions).toBe(0);
    expect(res.pistonCollisions).toBe(0);
    expect(res.pistonWorkTransferred).toBe(0);

    expect(ensemble.x[0]).toBe(0.05);
    expect(ensemble.vx[0]).toBe(100);
    expect(ensemble.x[1]).toBe(-0.08);
    expect(ensemble.vx[1]).toBe(-400);
  });

  it('rejects invalid inputs: negative dt, non-finite bounds, invalid piston, or out-of-bounds particles', () => {
    const ensemble = new ParticleEnsemble(2);
    ensemble.setParticle(0, 0, 0, 0.2, 10, 10, 10);
    ensemble.setParticle(1, 0, 0, 0.2, 10, 10, 10);

    // Validate geometry helper directly
    expect(() => validateChamberGeometry(defaultChamber, 0.01)).not.toThrow();
    expect(() => validateChamberGeometry({ ...defaultChamber, xMin: 0.2, xMax: 0.1 }, 0.01)).toThrow(RangeError);

    // Negative dt
    expect(() => advanceParticles(ensemble, defaultChamber, -0.01)).toThrow(RangeError);
    // Non-finite dt
    expect(() => advanceParticles(ensemble, defaultChamber, NaN)).toThrow(TypeError);
    expect(() => advanceParticles(ensemble, defaultChamber, Infinity)).toThrow(TypeError);

    // Invalid chamber coordinates
    expect(() =>
      advanceParticles(
        ensemble,
        { ...defaultChamber, xMin: 0.2, xMax: 0.1 },
        0.01,
      ),
    ).toThrow(RangeError);
    expect(() =>
      advanceParticles(
        ensemble,
        { ...defaultChamber, piston: { position: -0.1, velocity: 0 } },
        0.01,
      ),
    ).toThrow(RangeError);

    // Compressing piston through floor
    expect(() =>
      advanceParticles(
        ensemble,
        { ...defaultChamber, piston: { position: 0.1, velocity: -100 } },
        0.01, // 0.1 + (-100)*0.01 = -0.9 <= 0
      ),
    ).toThrow(RangeError);

    // Particle out of bounds
    const badEnsemble = new ParticleEnsemble(1);
    badEnsemble.setParticle(0, 0.5, 0, 0.2, 0, 0, 0); // x = 0.5 > xMax (0.1)
    expect(() => advanceParticles(badEnsemble, defaultChamber, 0.01)).toThrow(RangeError);
  });

  it('guarantees deterministic results for identical initial conditions and timesteps', () => {
    const prng1 = new Mulberry32PRNG(42);
    const prng2 = new Mulberry32PRNG(42);

    const ensemble1 = new ParticleEnsemble(200);
    const ensemble2 = new ParticleEnsemble(200);

    const bounds = { xMin: -0.08, xMax: 0.08, yMin: -0.08, yMax: 0.08, zMin: 0.05, zMax: 0.45 };
    ensemble1.initializeUniformPositions(bounds, prng1);
    ensemble1.initializeMaxwellianVelocities(300, HELIUM.molarMass, prng1);

    ensemble2.initializeUniformPositions(bounds, prng2);
    ensemble2.initializeMaxwellianVelocities(300, HELIUM.molarMass, prng2);

    const dynamicChamber: ChamberGeometry3D = {
      ...defaultChamber,
      piston: { position: 0.5, velocity: -5 },
    };

    // Step both through 10 iterations
    for (let step = 0; step < 10; step++) {
      advanceParticles(ensemble1, dynamicChamber, 0.002);
      advanceParticles(ensemble2, dynamicChamber, 0.002);
    }

    for (let i = 0; i < 200; i++) {
      expect(ensemble1.x[i]).toBe(ensemble2.x[i]);
      expect(ensemble1.y[i]).toBe(ensemble2.y[i]);
      expect(ensemble1.z[i]).toBe(ensemble2.z[i]);
      expect(ensemble1.vx[i]).toBe(ensemble2.vx[i]);
      expect(ensemble1.vy[i]).toBe(ensemble2.vy[i]);
      expect(ensemble1.vz[i]).toBe(ensemble2.vz[i]);
    }
  });

  it('preserves finite positions and containment across an ensemble over multiple dynamic steps', () => {
    const prng = new Mulberry32PRNG(12345);
    const ensemble = new ParticleEnsemble(500);
    const bounds = { xMin: -0.09, xMax: 0.09, yMin: -0.09, yMax: 0.09, zMin: 0.02, zMax: 0.4 };
    ensemble.initializeUniformPositions(bounds, prng);
    ensemble.initializeMaxwellianVelocities(350, HELIUM.molarMass, prng);

    let curPistonZ = 0.5;
    const vp = 2.0; // expanding at 2 m/s
    const dt = 0.005; // 5 ms per step

    for (let step = 0; step < 20; step++) {
      const chamber: ChamberGeometry3D = {
        ...defaultChamber,
        piston: { position: curPistonZ, velocity: vp },
      };
      advanceParticles(ensemble, chamber, dt);
      curPistonZ += vp * dt;
    }

    for (let i = 0; i < 500; i++) {
      expect(Number.isFinite(ensemble.x[i])).toBe(true);
      expect(Number.isFinite(ensemble.y[i])).toBe(true);
      expect(Number.isFinite(ensemble.z[i])).toBe(true);
      expect(Number.isFinite(ensemble.vx[i])).toBe(true);
      expect(Number.isFinite(ensemble.vy[i])).toBe(true);
      expect(Number.isFinite(ensemble.vz[i])).toBe(true);

      expect(ensemble.x[i]).toBeGreaterThanOrEqual(defaultChamber.xMin);
      expect(ensemble.x[i]).toBeLessThanOrEqual(defaultChamber.xMax);
      expect(ensemble.y[i]).toBeGreaterThanOrEqual(defaultChamber.yMin);
      expect(ensemble.y[i]).toBeLessThanOrEqual(defaultChamber.yMax);
      expect(ensemble.z[i]).toBeGreaterThanOrEqual(defaultChamber.zMin);
      expect(ensemble.z[i]).toBeLessThanOrEqual(curPistonZ + 1e-12);
    }
  });
});
