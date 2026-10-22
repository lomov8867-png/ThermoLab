/**
 * DSMC Stage 5 Tests: Statistical Entropy & Sackur–Tetrode Reference
 * =================================================================
 *
 * Comprehensive tests covering:
 *  1. Sackur–Tetrode reference calculation across valid equilibrium states.
 *  2. Equilibrium entropy estimator from kinetic temperature vs analytical reference.
 *  3. Isothermal expansion (ΔS = nR ln(V2/V1) > 0).
 *  4. Reversible isothermal compression (ΔS < 0).
 *  5. Reversible adiabatic path (ΔS = 0).
 *  6. Identical states produce zero entropy change.
 *  7. Input validation (volume, temperature, particle count, statistical weight).
 *  8. Small sample and insufficient speed-histogram occupancy handling.
 *  9. Speed histogram binning sensitivity and bulk velocity invariance.
 *  10. Distinction between thermodynamic entropy, equilibrium entropy estimate, and H-functional.
 *  11. Statistical uncertainty scaling (1 / √(N_p - 1)).
 *  12. Independence from the macroscopic engine.
 */

import { describe, it, expect } from 'vitest';
import {
  Mulberry32PRNG,
  ParticleEnsemble,
  calculateSackurTetrodeEntropy,
  estimateEquilibriumEntropyFromTemperature,
  estimateStatisticalEntropy,
  estimateKineticH,
  estimateEntropyChange,
  estimateTemperature,
  ENTROPY_FLAGS,
  V_REF_H,
  M_HE,
} from '../physics/dsmc';
import { HELIUM, BOLTZMANN, AVOGADRO, R } from '../physics/constants';

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

describe('DSMC Stage 5: Sackur–Tetrode Reference Calculation', () => {
  const V_TEST = 0.0244654; // 1 mol at 1 atm, 298.15 K ≈ 24.465 L
  const T_TEST = 298.15;
  const N_TEST = AVOGADRO; // 1 mole

  it('calculates the known standard molar entropy of helium at 298.15 K and 1 atm', () => {
    // NIST standard molar entropy of Helium gas at 298.15 K, 1 bar (100 kPa):
    // S° ≈ 126.15 J/(mol·K). At 1 atm (101.325 kPa), S ≈ 126.04 J/(mol·K).
    const result = calculateSackurTetrodeEntropy(N_TEST, V_TEST, T_TEST);

    expect(result.isValid).toBe(true);
    expect(result.units).toBe('J/K');
    expect(result.method).toBe('sackur-tetrode-reference');
    expect(result.flags).toContain(ENTROPY_FLAGS.SACKUR_TETRODE_REFERENCE);
    expect(result.flags).toContain(ENTROPY_FLAGS.ANALYTICAL_REFERENCE_EXACT);

    // Analytical reference has zero stochastic uncertainty (standardError is undefined)
    expect(result.standardError).toBeUndefined();

    // Molar value should match standard NIST value within 0.1 J/(mol·K)
    expect(result.molarValue).toBeDefined();
    expect(result.molarValue!).toBeCloseTo(126.04, 1);
    expect(result.value).toBeCloseTo(126.04, 1);
  });

  it('scales extensively with particle count: S(2N, 2V, T) = 2 S(N, V, T)', () => {
    const s1 = calculateSackurTetrodeEntropy(N_TEST, V_TEST, T_TEST);
    const s2 = calculateSackurTetrodeEntropy(2 * N_TEST, 2 * V_TEST, T_TEST);

    expect(s1.isValid).toBe(true);
    expect(s2.isValid).toBe(true);
    // Intensive molar entropy must be identical
    expect(s2.molarValue).toBeCloseTo(s1.molarValue!, 10);
    // Extensive entropy must double
    expect(s2.value).toBeCloseTo(2.0 * s1.value, 8);
  });

  it('rejects invalid inputs: zero/negative particle count, volume, or temperature', () => {
    expect(calculateSackurTetrodeEntropy(0, V_TEST, T_TEST).isValid).toBe(false);
    expect(calculateSackurTetrodeEntropy(-1e20, V_TEST, T_TEST).isValid).toBe(false);
    expect(calculateSackurTetrodeEntropy(NaN, V_TEST, T_TEST).isValid).toBe(false);

    expect(calculateSackurTetrodeEntropy(N_TEST, 0, T_TEST).isValid).toBe(false);
    expect(calculateSackurTetrodeEntropy(N_TEST, -0.01, T_TEST).isValid).toBe(false);
    expect(calculateSackurTetrodeEntropy(N_TEST, NaN, T_TEST).isValid).toBe(false);

    expect(calculateSackurTetrodeEntropy(N_TEST, V_TEST, 0).isValid).toBe(false);
    expect(calculateSackurTetrodeEntropy(N_TEST, V_TEST, -100).isValid).toBe(false);
    expect(calculateSackurTetrodeEntropy(N_TEST, V_TEST, NaN).isValid).toBe(false);
  });
});

describe('DSMC Stage 5: Equilibrium Entropy Estimate from Kinetic Temperature', () => {
  const V_TEST = 0.001; // 1 L
  const T_TARGET = 300.0;
  const FN_TEST = 1e20;
  const NP_TEST = 2000;

  it('evaluates Sackur–Tetrode at the ensemble kinetic temperature', () => {
    const ens = buildMaxwellianEnsemble(NP_TEST, T_TARGET, 42, FN_TEST);
    const Nreal = NP_TEST * FN_TEST;

    const statResult = estimateEquilibriumEntropyFromTemperature(ens, V_TEST);
    const tempEst = estimateTemperature(ens, FN_TEST);
    const expectedRefAtTest = calculateSackurTetrodeEntropy(Nreal, V_TEST, tempEst.value);

    expect(statResult.isValid).toBe(true);
    expect(statResult.units).toBe('J/K');
    expect(statResult.method).toBe('equilibrium-temperature-derived');
    expect(statResult.simulatorParticleCount).toBe(NP_TEST);
    expect(statResult.realParticleCount).toBe(Nreal);
    expect(statResult.standardError).toBeDefined();

    // The estimate must equal the analytical Sackur-Tetrode evaluated at T_est by construction
    expect(statResult.value).toBe(expectedRefAtTest.value);

    // Flags must explicitly reflect the assumptions and scope
    expect(statResult.flags).toContain(ENTROPY_FLAGS.EQUILIBRIUM_ENTROPY_FROM_TEMPERATURE);
    expect(statResult.flags).toContain(ENTROPY_FLAGS.PROPAGATED_TEMPERATURE_UNCERTAINTY_ONLY);
    expect(statResult.flags).toContain(ENTROPY_FLAGS.EQUILIBRIUM_MAXWELLIAN_ASSUMPTION);

    // Backward-compatible alias estimateStatisticalEntropy returns identical result
    const aliasResult = estimateStatisticalEntropy(ens, V_TEST);
    expect(aliasResult.value).toBe(statResult.value);
  });

  it('is unaffected by bulk flow velocity (thermal motion only)', () => {
    const ens = buildMaxwellianEnsemble(500, T_TARGET, 123, FN_TEST);
    const sBase = estimateEquilibriumEntropyFromTemperature(ens, V_TEST);

    // Superimpose large bulk velocity (2500 m/s in x, -1500 m/s in y, 1000 m/s in z)
    for (let i = 0; i < ens.count; i++) {
      ens.vx[i] += 2500;
      ens.vy[i] += -1500;
      ens.vz[i] += 1000;
    }

    const sBulk = estimateEquilibriumEntropyFromTemperature(ens, V_TEST);

    expect(sBase.isValid).toBe(true);
    expect(sBulk.isValid).toBe(true);
    // Removing center of mass motion ensures entropy is unchanged to floating point precision
    expect(Math.abs(sBulk.value - sBase.value) / sBase.value).toBeLessThan(1e-10);
  });

  it('scales extensively with statistical weight F_N', () => {
    const ens1 = buildMaxwellianEnsemble(100, T_TARGET, 202, 1e18);
    const s1 = estimateEquilibriumEntropyFromTemperature(ens1, V_TEST, 1e18);
    const s2 = estimateEquilibriumEntropyFromTemperature(ens1, 2 * V_TEST, 2e18);

    expect(s1.isValid).toBe(true);
    expect(s2.isValid).toBe(true);
    // Doubling FN and V at same T doubles extensive entropy
    expect(s2.value).toBeCloseTo(2.0 * s1.value, 8);
  });

  it('rejects invalid or missing statistical weight', () => {
    const ensNoMeta = new ParticleEnsemble(10);
    const rMissing = estimateEquilibriumEntropyFromTemperature(ensNoMeta, V_TEST);
    expect(rMissing.isValid).toBe(false);
    expect(rMissing.flags).toContain(ENTROPY_FLAGS.MISSING_STATISTICAL_WEIGHT);

    const rZero = estimateEquilibriumEntropyFromTemperature(ensNoMeta, V_TEST, 0);
    expect(rZero.isValid).toBe(false);
    expect(rZero.flags).toContain(ENTROPY_FLAGS.INVALID_STATISTICAL_WEIGHT);

    const rNeg = estimateEquilibriumEntropyFromTemperature(ensNoMeta, V_TEST, -1e19);
    expect(rNeg.isValid).toBe(false);
    expect(rNeg.flags).toContain(ENTROPY_FLAGS.INVALID_STATISTICAL_WEIGHT);
  });

  it('rejects single-particle ensembles (Np = 1)', () => {
    const ens1 = new ParticleEnsemble(1, { statisticalWeight: 1e20 });
    ens1.setParticle(0, 0, 0, 0, 500, 0, 0);

    const r1 = estimateEquilibriumEntropyFromTemperature(ens1, V_TEST);
    expect(r1.isValid).toBe(false);
    expect(r1.flags).toContain(ENTROPY_FLAGS.INSUFFICIENT_PARTICLES);
  });
});

describe('DSMC Stage 5: Kinetic H-Function Estimator', () => {
  it('estimates continuous H-function consistent with theoretical 300 K Maxwellian under v_ref = 1 m/s', () => {
    const Np = 3000;
    const targetT = 300.0;
    const ens = buildMaxwellianEnsemble(Np, targetT, 777);

    const hResult = estimateKineticH(ens, 40);

    expect(hResult.isValid).toBe(true);
    expect(hResult.units).toBe('nats relative to (m/s)⁻³');
    expect(hResult.flags).toContain(ENTROPY_FLAGS.KINETIC_H_THEOREM_SPEED_DISTRIBUTION);
    expect(hResult.flags).toContain(ENTROPY_FLAGS.ASSUMES_VELOCITY_ISOTROPY);
    expect(hResult.flags).toContain(ENTROPY_FLAGS.VELOCITY_REFERENCE_SCALE_1_M_PER_S);
    expect(hResult.flags).toContain(ENTROPY_FLAGS.H_UNCERTAINTY_UNSUPPORTED);
    expect(hResult.standardError).toBeUndefined(); // Uncertainty is unsupported for non-parametric H
    expect(hResult.occupiedBins).toBeGreaterThan(15);

    // Theoretical H for 300 K Maxwellian under v_ref = 1 m/s:
    // H = 3/2 ln( (m_He · v_ref²) / (2π k_B T) ) - 3/2 ≈ -24.27 nats
    const theoreticalH =
      1.5 * Math.log((M_HE * V_REF_H * V_REF_H) / (2.0 * Math.PI * BOLTZMANN * targetT)) - 1.5;
    expect(hResult.theoreticalH).toBeCloseTo(theoreticalH, 1);

    // Binned speed H-function should approximate the theoretical Maxwellian H within ~5-8%
    expect(Math.abs(hResult.H - theoreticalH) / Math.abs(theoreticalH)).toBeLessThan(0.08);
  });

  it('is independent of uniform bulk velocity (peculiar speeds only)', () => {
    const Np = 1500;
    const targetT = 300.0;
    const ens = buildMaxwellianEnsemble(Np, targetT, 888);

    const hBase = estimateKineticH(ens, 40);

    // Add large bulk velocity
    for (let i = 0; i < ens.count; i++) {
      ens.vx[i] += 2000;
      ens.vy[i] += -3000;
      ens.vz[i] += 1500;
    }

    const hBulk = estimateKineticH(ens, 40);

    expect(hBase.isValid).toBe(true);
    expect(hBulk.isValid).toBe(true);
    expect(Math.abs(hBulk.H - hBase.H)).toBeLessThan(1e-10);
  });

  it('is independent of statistical weight F_N (intensive velocity shape functional)', () => {
    // Two ensembles with identical particle velocities but different statistical weights
    const Np = 1000;
    const ens1 = buildMaxwellianEnsemble(Np, 300, 333, 1.0);
    const ens2 = buildMaxwellianEnsemble(Np, 300, 333, 1e20);

    const h1 = estimateKineticH(ens1, 40);
    const h2 = estimateKineticH(ens2, 40);

    expect(h1.H).toBe(h2.H);
  });

  it('evaluates sensitivity across different bin counts (20, 40, 80 bins)', () => {
    const Np = 4000;
    const targetT = 300.0;
    const ens = buildMaxwellianEnsemble(Np, targetT, 444);

    const h20 = estimateKineticH(ens, 20);
    const h40 = estimateKineticH(ens, 40);
    const h80 = estimateKineticH(ens, 80);

    expect(h20.isValid).toBe(true);
    expect(h40.isValid).toBe(true);
    expect(h80.isValid).toBe(true);

    // All should be close to theoretical Maxwellian H
    const thH = h40.theoreticalH;
    expect(Math.abs(h20.H - thH) / Math.abs(thH)).toBeLessThan(0.1);
    expect(Math.abs(h40.H - thH) / Math.abs(thH)).toBeLessThan(0.08);
    expect(Math.abs(h80.H - thH) / Math.abs(thH)).toBeLessThan(0.08);
  });

  it('flags insufficient bin occupancy for small particle samples (Np < 20)', () => {
    const ensSmall = new ParticleEnsemble(10);
    for (let i = 0; i < 10; i++) {
      ensSmall.setParticle(i, 0, 0, 0, 100 * (i + 1), 0, 0);
    }

    const result = estimateKineticH(ensSmall, 40);
    expect(result.isValid).toBe(false);
    expect(result.flags).toContain(ENTROPY_FLAGS.INSUFFICIENT_BIN_OCCUPANCY);
  });

  it('flags non-finite particle states', () => {
    const ens = buildMaxwellianEnsemble(50, 300, 999);
    ens.vx[10] = NaN;

    const result = estimateKineticH(ens);
    expect(result.isValid).toBe(false);
    expect(result.flags).toContain(ENTROPY_FLAGS.NON_FINITE_PARTICLE_STATE);
  });
});

describe('DSMC Stage 5: Distinct Quantities & Units Validation', () => {
  it('strictly distinguishes thermodynamic entropy S, equilibrium estimate, and H-functional', () => {
    const Np = 1000;
    const FN = 1e20;
    const Nreal = Np * FN;
    const V = 0.001;
    const T = 300.0;
    const ens = buildMaxwellianEnsemble(Np, T, 555, FN);

    const sRef = calculateSackurTetrodeEntropy(Nreal, V, T);
    const sEst = estimateEquilibriumEntropyFromTemperature(ens, V);
    const hKin = estimateKineticH(ens, 40);

    // 1. Thermodynamic entropy is positive, extensive in J/K (order of 10³ J/K for ~0.16 mol)
    expect(sRef.units).toBe('J/K');
    expect(sRef.value).toBeGreaterThan(0);

    // 2. Equilibrium estimate is in J/K, approximately equal to sRef
    expect(sEst.units).toBe('J/K');
    expect(sEst.value).toBeGreaterThan(0);
    expect(Math.abs(sEst.value - sRef.value) / sRef.value).toBeLessThan(0.02);

    // 3. Kinetic H-functional is negative, intensive, in nats relative to (m/s)⁻³
    expect(hKin.units).toBe('nats relative to (m/s)⁻³');
    expect(hKin.H).toBeLessThan(0); // ~ -24 nats
    expect(Math.abs(hKin.H)).toBeLessThan(50); // Intensive scalar, NOT scaling with N_real!
  });
});

describe('DSMC Stage 5: Entropy Change Estimator (Thermodynamic Paths)', () => {
  const Nreal = AVOGADRO; // 1 mol
  const moles = 1.0;
  const T1 = 300.0;
  const V1 = 0.024;

  it('identical states produce zero entropy change: ΔS(A → A) = 0', () => {
    const stateA = { temperature: T1, volume: V1, Nreal };
    const result = estimateEntropyChange(stateA, stateA);

    expect(result.isValid).toBe(true);
    expect(result.deltaS).toBe(0);
    expect(result.flags).toContain(ENTROPY_FLAGS.IDENTICAL_STATES);
  });

  it('isothermal expansion: ΔS = nR ln(V2/V1) > 0', () => {
    const V2 = 2.0 * V1; // Doubling volume at constant T
    const state1 = { temperature: T1, volume: V1, Nreal };
    const state2 = { temperature: T1, volume: V2, Nreal };

    const result = estimateEntropyChange(state1, state2);

    expect(result.isValid).toBe(true);
    expect(result.flags).toContain(ENTROPY_FLAGS.ISOTHERMAL_PATH);

    // Exact analytical answer: nR ln(2) ≈ 8.314462618 * 0.69314718 ≈ 5.763 J/K
    const expectedDeltaS = moles * R * Math.log(2.0);
    expect(result.deltaS).toBeGreaterThan(0);
    expect(result.deltaS).toBeCloseTo(expectedDeltaS, 8);
  });

  it('reversible isothermal compression: ΔS = nR ln(V2/V1) < 0', () => {
    const V2 = 0.5 * V1; // Halving volume at constant T
    const state1 = { temperature: T1, volume: V1, Nreal };
    const state2 = { temperature: T1, volume: V2, Nreal };

    const result = estimateEntropyChange(state1, state2);

    expect(result.isValid).toBe(true);
    expect(result.flags).toContain(ENTROPY_FLAGS.ISOTHERMAL_PATH);

    // Must be strictly negative: -nR ln(2)
    const expectedDeltaS = moles * R * Math.log(0.5);
    expect(result.deltaS).toBeLessThan(0);
    expect(result.deltaS).toBeCloseTo(expectedDeltaS, 8);
  });

  it('reversible adiabatic path: ΔS = 0 within floating point precision', () => {
    // For monatomic gas (γ = 5/3), adiabatic relation is: T · V^(2/3) = const
    // If V increases by 8x, T must decrease by (1/8)^(2/3) = 1/4 = 0.25x
    const V2 = 8.0 * V1;
    const T2 = T1 * Math.pow(V1 / V2, 2.0 / 3.0); // 300 * 0.25 = 75 K

    const state1 = { temperature: T1, volume: V1, Nreal };
    const state2 = { temperature: T2, volume: V2, Nreal };

    const result = estimateEntropyChange(state1, state2);

    expect(result.isValid).toBe(true);
    expect(result.flags).toContain(ENTROPY_FLAGS.ADIABATIC_PATH);

    // Reversible adiabatic entropy change must be zero
    expect(Math.abs(result.deltaS)).toBeLessThan(1e-12);
  });

  it('propagates standard error across two uncertain states', () => {
    const state1 = { temperature: T1, volume: V1, Nreal, standardError: 0.3 };
    const state2 = { temperature: T1, volume: 2 * V1, Nreal, standardError: 0.4 };

    const result = estimateEntropyChange(state1, state2);

    expect(result.isValid).toBe(true);
    // σ_ΔS = √(0.3² + 0.4²) = 0.5
    expect(result.standardError).toBeCloseTo(0.5, 8);
  });

  it('rejects invalid states with non-positive volume or temperature', () => {
    const valid = { temperature: T1, volume: V1, Nreal };
    const negT = { temperature: -10, volume: V1, Nreal };
    const zeroV = { temperature: T1, volume: 0, Nreal };

    expect(estimateEntropyChange(valid, negT).isValid).toBe(false);
    expect(estimateEntropyChange(zeroV, valid).isValid).toBe(false);
  });
});

describe('DSMC Stage 5: Statistical Uncertainty Scaling (1 / √(Np - 1))', () => {
  it('standard error decreases as 1 / √(Np - 1) with simulator particle count', () => {
    const V = 0.001;
    const FN = 1e18;
    const T = 300.0;

    // Relative simulator particle counts: 101, 401, 1601 -> (Np - 1) = 100, 400, 1600
    const ens100 = buildMaxwellianEnsemble(101, T, 1, FN);
    const ens400 = buildMaxwellianEnsemble(401, T, 2, FN);
    const ens1600 = buildMaxwellianEnsemble(1601, T, 3, FN);

    const s100 = estimateEquilibriumEntropyFromTemperature(ens100, V);
    const s400 = estimateEquilibriumEntropyFromTemperature(ens400, V);
    const s1600 = estimateEquilibriumEntropyFromTemperature(ens1600, V);

    // To isolate simulator sampling degrees-of-freedom scaling, normalize by N_real:
    // σ_S / N_real = k_B · √(3 / (2 (Np - 1)))
    const seNorm100 = s100.standardError! / s100.realParticleCount;
    const seNorm400 = s400.standardError! / s400.realParticleCount;
    const seNorm1600 = s1600.standardError! / s1600.realParticleCount;

    // Quadrupling (Np - 1) halves the normalized standard error:
    // √(100 / 400) = 0.5
    expect(seNorm400 / seNorm100).toBeCloseTo(0.5, 8);

    // 16x (Np - 1) quarters the normalized standard error:
    // √(100 / 1600) = 0.25
    expect(seNorm1600 / seNorm100).toBeCloseTo(0.25, 8);
  });
});
