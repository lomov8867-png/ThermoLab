/**
 * DSMC Stage 4 Tests: Statistical Estimators
 * ===========================================
 *
 * Comprehensive tests for:
 *  1. Temperature estimation from peculiar velocities with bulk motion removed.
 *  2. Kinetic energy decomposition: K_total = K_bulk + K_thermal.
 *  3. Kinetic ideal-gas pressure and kinetic stress tensor.
 *  4. Uncertainty models under Maxwellian equilibrium (1/√N_p scaling).
 *  5. Input validation (statistical weight, volume, particle count, non-finite states).
 *  6. Single-particle and undersized ensembles.
 *  7. Determinism and consistency.
 */

import { describe, it, expect } from 'vitest';
import {
  Mulberry32PRNG,
  ParticleEnsemble,
  estimateTemperature,
  estimateKineticEnergy,
  estimatePressure,
  estimateEnsembleState,
  ESTIMATOR_FLAGS,
  M_HE,
} from '../physics/dsmc';
import { HELIUM, BOLTZMANN } from '../physics/constants';

// Helper: build ensemble sampled from Maxwell-Boltzmann at target T
function buildMaxwellianEnsemble(
  count: number,
  T: number,
  seed: number,
  statisticalWeight?: number,
): ParticleEnsemble {
  const prng = new Mulberry32PRNG(seed);
  const metadata = statisticalWeight !== undefined ? { statisticalWeight } : undefined;
  const ens = new ParticleEnsemble(count, metadata);
  const bounds = {
    xMin: -0.05,
    xMax: 0.05,
    yMin: -0.05,
    yMax: 0.05,
    zMin: 0.0,
    zMax: 0.1,
  };
  ens.initializeUniformPositions(bounds, prng);
  ens.initializeMaxwellianVelocities(T, HELIUM.molarMass, prng);
  return ens;
}

describe('DSMC Stage 4: Temperature Estimator', () => {
  it('estimates temperature accurately from a 300 K Maxwellian sample', () => {
    const Np = 2000;
    const targetT = 300.0;
    const FN = 1e20;
    const ens = buildMaxwellianEnsemble(Np, targetT, 101, FN);

    const result = estimateTemperature(ens);

    expect(result.isValid).toBe(true);
    expect(result.units).toBe('K');
    expect(result.simulatorParticleCount).toBe(Np);
    expect(result.flags).toContain(ESTIMATOR_FLAGS.BULK_MOTION_REMOVED);
    expect(result.flags).toContain(ESTIMATOR_FLAGS.EQUILIBRIUM_MAXWELLIAN_UNCERTAINTY);

    // Theoretical standard error: σ_T = T · √(2 / (3(Np - 1))) ≈ 300 · √(2 / 5997) ≈ 5.48 K
    const expectedSE = targetT * Math.sqrt(2.0 / (3.0 * (Np - 1)));
    expect(result.standardError).toBeCloseTo(expectedSE, 1);

    // Estimate should be within 3 standard errors of target temperature
    expect(Math.abs(result.value - targetT)).toBeLessThan(3.0 * expectedSE);
  });

  it('estimates temperature accurately across multiple target temperatures (100 K, 600 K)', () => {
    const Np = 2500;
    const FN = 1e18;

    for (const targetT of [100.0, 600.0]) {
      const ens = buildMaxwellianEnsemble(Np, targetT, Math.floor(targetT), FN);
      const result = estimateTemperature(ens);

      expect(result.isValid).toBe(true);
      const expectedSE = targetT * Math.sqrt(2.0 / (3.0 * (Np - 1)));
      expect(Math.abs(result.value - targetT)).toBeLessThan(3.0 * expectedSE);
    }
  });

  it('does NOT count bulk flow velocity as thermal temperature', () => {
    const Np = 500;
    const targetT = 300.0;
    const FN = 1e20;
    const ens = buildMaxwellianEnsemble(Np, targetT, 202, FN);

    const baseResult = estimateTemperature(ens);
    expect(baseResult.isValid).toBe(true);

    // Superimpose massive bulk flow velocity (2000 m/s in x, -1500 m/s in y, 3000 m/s in z)
    const vBulkX = 2000.0;
    const vBulkY = -1500.0;
    const vBulkZ = 3000.0;
    for (let i = 0; i < Np; i++) {
      ens.vx[i] += vBulkX;
      ens.vy[i] += vBulkY;
      ens.vz[i] += vBulkZ;
    }

    const bulkResult = estimateTemperature(ens);
    expect(bulkResult.isValid).toBe(true);

    // Temperature must remain identical to floating-point precision
    expect(Math.abs(bulkResult.value - baseResult.value) / baseResult.value).toBeLessThan(1e-10);
  });

  it('uses explicitly supplied statistical weight over ensemble metadata', () => {
    const Np = 100;
    const targetT = 300.0;
    // Ensemble metadata has FN = 1e20
    const ens = buildMaxwellianEnsemble(Np, targetT, 303, 1e20);

    // Override with explicit weight FN = 1e15
    const resultOverride = estimateTemperature(ens, 1e15);
    expect(resultOverride.isValid).toBe(true);

    // For N_real >> 1, T is nearly independent of F_N (F_N / (F_N*N_p - 1) ≈ 1/N_p)
    const resultMeta = estimateTemperature(ens);
    expect(Math.abs(resultOverride.value - resultMeta.value) / targetT).toBeLessThan(1e-10);
  });
});

describe('DSMC Stage 4: Kinetic Energy Estimator', () => {
  it('correctly computes and decomposes kinetic energy: K_total = K_bulk + K_thermal', () => {
    const Np = 300;
    const targetT = 300.0;
    const FN = 1e19;
    const ens = buildMaxwellianEnsemble(Np, targetT, 404, FN);

    // Add moderate bulk velocity
    for (let i = 0; i < Np; i++) {
      ens.vx[i] += 500.0;
      ens.vy[i] += -300.0;
      ens.vz[i] += 200.0;
    }

    const result = estimateKineticEnergy(ens);

    expect(result.isValid).toBe(true);
    expect(result.units).toBe('J');
    expect(result.simulatorParticleCount).toBe(Np);
    expect(result.flags).not.toContain(ESTIMATOR_FLAGS.ENERGY_DECOMPOSITION_DISCREPANCY);

    // Both components must be strictly positive
    expect(result.bulkKE).toBeGreaterThan(0);
    expect(result.thermalKE).toBeGreaterThan(0);
    expect(result.value).toBeGreaterThan(result.bulkKE);
    expect(result.value).toBeGreaterThan(result.thermalKE);

    // Decomposition identity: K_total = K_bulk + K_thermal within floating-point tolerance
    const sum = result.bulkKE + result.thermalKE;
    expect(Math.abs(result.value - sum) / result.value).toBeLessThan(1e-12);
  });

  it('reports zero bulk kinetic energy for an ensemble with zero mean velocity', () => {
    // 2 particles with equal and opposite velocities
    const ens = new ParticleEnsemble(2);
    ens.setParticle(0, 0, 0, 0, 500, 0, 0);
    ens.setParticle(1, 0, 0, 0, -500, 0, 0);

    const result = estimateKineticEnergy(ens, 1.0);

    expect(result.isValid).toBe(true);
    expect(result.vCm[0]).toBeCloseTo(0, 10);
    expect(result.vCm[1]).toBeCloseTo(0, 10);
    expect(result.vCm[2]).toBeCloseTo(0, 10);
    expect(result.bulkKE).toBeCloseTo(0, 12);
    expect(result.thermalKE).toBeCloseTo(result.value, 12);
  });

  it('reports zero thermal kinetic energy for uniform translation (zero peculiar motion)', () => {
    // 4 particles all moving with identical velocity vector
    const ens = new ParticleEnsemble(4);
    for (let i = 0; i < 4; i++) {
      ens.setParticle(i, i * 0.01, 0, 0, 100, 200, 300);
    }

    const result = estimateKineticEnergy(ens, 1.0);

    expect(result.isValid).toBe(true);
    expect(result.vCm[0]).toBeCloseTo(100, 10);
    expect(result.vCm[1]).toBeCloseTo(200, 10);
    expect(result.vCm[2]).toBeCloseTo(300, 10);
    expect(result.thermalKE).toBeCloseTo(0, 12);
    expect(result.bulkKE).toBeCloseTo(result.value, 12);
  });

  it('works correctly for a single-particle ensemble (N_p = 1)', () => {
    const ens = new ParticleEnsemble(1);
    ens.setParticle(0, 0, 0, 0, 300, 400, 0); // speed = 500 m/s

    const result = estimateKineticEnergy(ens, 1.0);

    expect(result.isValid).toBe(true);
    expect(result.simulatorParticleCount).toBe(1);
    expect(result.vCm).toEqual([300, 400, 0]);
    // Single particle has no peculiar velocity: K_bulk = K_total, K_thermal = 0
    expect(result.thermalKE).toBe(0);
    const expectedKE = 0.5 * M_HE * (300 * 300 + 400 * 400);
    expect(result.value).toBeCloseTo(expectedKE, 15);
    expect(result.bulkKE).toBeCloseTo(expectedKE, 15);
  });
});

describe('DSMC Stage 4: Pressure Estimator', () => {
  const V_TEST = 0.001; // 0.001 m³ (1 L)

  it('matches ideal gas law P = n_real · k_B · T / V', () => {
    const Np = 1000;
    const targetT = 300.0;
    const FN = 1e20;
    const ens = buildMaxwellianEnsemble(Np, targetT, 505, FN);

    const tempResult = estimateTemperature(ens);
    const pressureResult = estimatePressure(ens, V_TEST);

    expect(pressureResult.isValid).toBe(true);
    expect(pressureResult.units).toBe('Pa');
    expect(pressureResult.simulatorParticleCount).toBe(Np);

    // Expected ideal-gas pressure: (N_p · F_N) · k_B · T_est / V
    const expectedP = (Np * FN * BOLTZMANN * tempResult.value) / V_TEST;
    expect(pressureResult.value).toBeCloseTo(expectedP, 5);

    // Standard error check
    const expectedSE = pressureResult.value * Math.sqrt(2.0 / (3.0 * (Np - 1)));
    expect(pressureResult.standardError).toBeCloseTo(expectedSE, 1);
  });

  it('scales inversely with volume: P(2V) = P(V) / 2', () => {
    const Np = 500;
    const targetT = 300.0;
    const FN = 1e19;
    const ens = buildMaxwellianEnsemble(Np, targetT, 606, FN);

    const p1 = estimatePressure(ens, V_TEST);
    const p2 = estimatePressure(ens, 2 * V_TEST);

    expect(p1.isValid).toBe(true);
    expect(p2.isValid).toBe(true);
    expect(p2.value).toBeCloseTo(p1.value / 2.0, 5);
  });

  it('scales proportionally with particle count N_p', () => {
    // Construct 2 identical sub-ensembles and evaluate pressure
    const FN = 1e18;
    const ens2 = new ParticleEnsemble(2);
    ens2.setParticle(0, 0, 0, 0, 1000, 0, 0);
    ens2.setParticle(1, 0, 0, 0, -1000, 0, 0);

    const ens4 = new ParticleEnsemble(4);
    ens4.setParticle(0, 0, 0, 0, 1000, 0, 0);
    ens4.setParticle(1, 0, 0, 0, -1000, 0, 0);
    ens4.setParticle(2, 0, 0, 0, 0, 1000, 0);
    ens4.setParticle(3, 0, 0, 0, 0, -1000, 0);

    // Temperature of both is identical (each has rms velocity 1000 m/s)
    const t2 = estimateTemperature(ens2, FN);
    const t4 = estimateTemperature(ens4, FN);
    expect(t2.value).toBeCloseTo(t4.value, 4);

    const p2 = estimatePressure(ens2, V_TEST, FN);
    const p4 = estimatePressure(ens4, V_TEST, FN);

    // With twice the particles at same temperature and volume, pressure doubles
    expect(p4.value).toBeCloseTo(2.0 * p2.value, 4);
  });

  it('computes symmetric kinetic stress tensor with scalar mean trace equal to P', () => {
    const Np = 1000;
    const targetT = 300.0;
    const FN = 1e19;
    const ens = buildMaxwellianEnsemble(Np, targetT, 707, FN);

    const result = estimatePressure(ens, V_TEST);
    expect(result.isValid).toBe(true);
    expect(result.tensor).toBeDefined();

    const t = result.tensor!;
    // In isotropic equilibrium, normal components are approximately equal
    expect(t.xx).toBeGreaterThan(0);
    expect(t.yy).toBeGreaterThan(0);
    expect(t.zz).toBeGreaterThan(0);

    // Mean normal stress (1/3 Tr(P)) equals the scalar kinetic pressure
    const meanNormalStress = (t.xx + t.yy + t.zz) / 3.0;
    expect(result.value).toBeCloseTo(meanNormalStress, 5);

    // Off-diagonal shear stresses in equilibrium are much smaller than normal stresses
    expect(Math.abs(t.xy)).toBeLessThan(0.2 * t.xx);
    expect(Math.abs(t.xz)).toBeLessThan(0.2 * t.xx);
    expect(Math.abs(t.yz)).toBeLessThan(0.2 * t.xx);
  });

  it('rejects invalid, zero, or negative volume', () => {
    const ens = buildMaxwellianEnsemble(50, 300, 808, 1e18);

    const rZero = estimatePressure(ens, 0);
    expect(rZero.isValid).toBe(false);
    expect(rZero.flags).toContain(ESTIMATOR_FLAGS.INVALID_VOLUME);

    const rNeg = estimatePressure(ens, -0.01);
    expect(rNeg.isValid).toBe(false);
    expect(rNeg.flags).toContain(ESTIMATOR_FLAGS.INVALID_VOLUME);

    const rNaN = estimatePressure(ens, NaN);
    expect(rNaN.isValid).toBe(false);
    expect(rNaN.flags).toContain(ESTIMATOR_FLAGS.INVALID_VOLUME);
  });
});

describe('DSMC Stage 4: Input Validation and Degenerate Cases', () => {
  it('handles missing or invalid statistical weight gracefully', () => {
    // Ensemble created without metadata
    const ensNoWeight = new ParticleEnsemble(10);
    for (let i = 0; i < 10; i++) {
      ensNoWeight.setParticle(i, 0, 0, 0, 100 * (i + 1), 0, 0);
    }

    const tMissing = estimateTemperature(ensNoWeight);
    expect(tMissing.isValid).toBe(false);
    expect(Number.isNaN(tMissing.value)).toBe(true);
    expect(tMissing.flags).toContain(ESTIMATOR_FLAGS.MISSING_STATISTICAL_WEIGHT);

    const tZero = estimateTemperature(ensNoWeight, 0);
    expect(tZero.isValid).toBe(false);
    expect(tZero.flags).toContain(ESTIMATOR_FLAGS.INVALID_STATISTICAL_WEIGHT);

    const tNeg = estimateTemperature(ensNoWeight, -1e18);
    expect(tNeg.isValid).toBe(false);
    expect(tNeg.flags).toContain(ESTIMATOR_FLAGS.INVALID_STATISTICAL_WEIGHT);

    const tNaN = estimateTemperature(ensNoWeight, NaN);
    expect(tNaN.isValid).toBe(false);
    expect(tNaN.flags).toContain(ESTIMATOR_FLAGS.INVALID_STATISTICAL_WEIGHT);
  });

  it('rejects single-particle ensembles (N_p = 1) for temperature and pressure', () => {
    const ens1 = new ParticleEnsemble(1, { statisticalWeight: 1e20 });
    ens1.setParticle(0, 0, 0, 0, 500, 0, 0);

    const t1 = estimateTemperature(ens1);
    expect(t1.isValid).toBe(false);
    expect(Number.isNaN(t1.value)).toBe(true);
    expect(t1.flags).toContain(ESTIMATOR_FLAGS.INSUFFICIENT_PARTICLES);

    const p1 = estimatePressure(ens1, 0.001);
    expect(p1.isValid).toBe(false);
    expect(Number.isNaN(p1.value)).toBe(true);
    expect(p1.flags).toContain(ESTIMATOR_FLAGS.INSUFFICIENT_PARTICLES);
  });

  it('detects and flags non-finite particle states (NaN or Infinity in velocities)', () => {
    const ens = buildMaxwellianEnsemble(20, 300, 909, 1e18);
    // Corrupt one particle
    ens.vx[5] = NaN;

    const tResult = estimateTemperature(ens);
    expect(tResult.isValid).toBe(false);
    expect(Number.isNaN(tResult.value)).toBe(true);
    expect(tResult.flags).toContain(ESTIMATOR_FLAGS.NON_FINITE_PARTICLE_STATE);

    const keResult = estimateKineticEnergy(ens);
    expect(keResult.isValid).toBe(false);
    expect(Number.isNaN(keResult.value)).toBe(true);
    expect(keResult.flags).toContain(ESTIMATOR_FLAGS.NON_FINITE_PARTICLE_STATE);

    const pResult = estimatePressure(ens, 0.001);
    expect(pResult.isValid).toBe(false);
    expect(Number.isNaN(pResult.value)).toBe(true);
    expect(pResult.flags).toContain(ESTIMATOR_FLAGS.NON_FINITE_PARTICLE_STATE);

    // Corrupt with Infinity
    ens.vx[5] = Infinity;
    expect(estimateTemperature(ens).isValid).toBe(false);
    expect(estimateTemperature(ens).flags).toContain(ESTIMATOR_FLAGS.NON_FINITE_PARTICLE_STATE);
  });
});

describe('DSMC Stage 4: Determinism and Consistency', () => {
  it('yields identical estimates when called repeatedly on the same ensemble', () => {
    const ens = buildMaxwellianEnsemble(100, 300, 12345, 1e20);

    const t1 = estimateTemperature(ens);
    const t2 = estimateTemperature(ens);
    expect(t1.value).toBe(t2.value);
    expect(t1.standardError).toBe(t2.standardError);

    const ke1 = estimateKineticEnergy(ens);
    const ke2 = estimateKineticEnergy(ens);
    expect(ke1.value).toBe(ke2.value);
    expect(ke1.bulkKE).toBe(ke2.bulkKE);
    expect(ke1.thermalKE).toBe(ke2.thermalKE);

    const p1 = estimatePressure(ens, 0.001);
    const p2 = estimatePressure(ens, 0.001);
    expect(p1.value).toBe(p2.value);
    expect(p1.tensor).toEqual(p2.tensor);
  });

  it('estimateEnsembleState agrees identically with individual estimators', () => {
    const ens = buildMaxwellianEnsemble(150, 350, 54321, 1e19);
    const vol = 0.002;

    const state = estimateEnsembleState(ens, vol);
    const tInd = estimateTemperature(ens);
    const keInd = estimateKineticEnergy(ens);
    const pInd = estimatePressure(ens, vol);

    expect(state.temperature.value).toBe(tInd.value);
    expect(state.kineticEnergy.value).toBe(keInd.value);
    expect(state.kineticEnergy.bulkKE).toBe(keInd.bulkKE);
    expect(state.kineticEnergy.thermalKE).toBe(keInd.thermalKE);
    expect(state.pressure.value).toBe(pInd.value);
    expect(state.vCm).toEqual(keInd.vCm);
  });
});

describe('DSMC Stage 4: Statistical Uncertainty Behavior (1/√N_p scaling)', () => {
  it('standard error decreases as 1/√(N_p - 1)', () => {
    const targetT = 300.0;
    const FN = 1e18;

    const ens100 = buildMaxwellianEnsemble(101, targetT, 1, FN);
    const ens400 = buildMaxwellianEnsemble(401, targetT, 2, FN);
    const ens1600 = buildMaxwellianEnsemble(1601, targetT, 3, FN);

    const res100 = estimateTemperature(ens100);
    const res400 = estimateTemperature(ens400);
    const res1600 = estimateTemperature(ens1600);

    const se100 = res100.standardError!;
    const se400 = res400.standardError!;
    const se1600 = res1600.standardError!;

    // Relative standard error σ_T / T = √(2 / (3(Np - 1))) isolates the degrees-of-freedom
    // scaling from random finite-sample temperature fluctuations.
    const relSE100 = se100 / res100.value;
    const relSE400 = se400 / res400.value;
    const relSE1600 = se1600 / res1600.value;

    // Np increases by 4x (100 -> 400) -> relative standard error halves
    // √(100 / 400) = 0.5
    expect(relSE400 / relSE100).toBeCloseTo(0.5, 10);

    // Np increases by 16x (100 -> 1600) -> relative standard error quarters
    // √(100 / 1600) = 0.25
    expect(relSE1600 / relSE100).toBeCloseTo(0.25, 10);
  });

  it('empirical sample variance across independent realizations matches theoretical standard error', () => {
    const targetT = 300.0;
    const Np = 200;
    const FN = 1e18;
    const M = 60; // 60 independent realizations

    const tempEstimates: number[] = [];
    for (let seed = 1; seed <= M; seed++) {
      const ens = buildMaxwellianEnsemble(Np, targetT, seed, FN);
      tempEstimates.push(estimateTemperature(ens).value);
    }

    // Sample mean of estimated temperatures
    const meanT = tempEstimates.reduce((a, b) => a + b, 0) / M;
    expect(Math.abs(meanT - targetT)).toBeLessThan(5.0); // Mean closely tracks 300 K

    // Empirical sample standard deviation of the estimates
    const sampleVar =
      tempEstimates.reduce((acc, t) => acc + (t - meanT) ** 2, 0) / (M - 1);
    const empiricalSD = Math.sqrt(sampleVar);

    // Theoretical standard error for Np = 200 at 300 K:
    // σ_T = 300 · √(2 / (3 · 199)) ≈ 17.38 K
    const theoreticalSE = targetT * Math.sqrt(2.0 / (3.0 * (Np - 1)));

    // Empirical SD should match theoretical SE within finite sample (M=60) tolerance (~20%)
    expect(Math.abs(empiricalSD - theoreticalSE) / theoreticalSE).toBeLessThan(0.25);
  });
});
