/**
 * DSMC Statistical Estimators
 * ============================
 *
 * Macroscopic thermodynamic property estimators derived from the microscopic
 * state of a Direct Simulation Monte Carlo (DSMC) particle ensemble.
 *
 * Implements:
 *  1. Peculiar translational temperature estimator with center-of-mass bulk
 *     motion removed and finite-particle degrees-of-freedom correction.
 *  2. Kinetic energy estimator decomposing total kinetic energy into thermal
 *     and bulk components.
 *  3. Kinetic ideal-gas pressure estimator (scalar and full symmetric stress tensor).
 *  4. Statistically justified uncertainty models under Maxwellian equilibrium.
 *
 * Physics Principles & Invariants
 * ────────────────────────────────
 * - Species: Helium-4 (monatomic, m_He = M_He / N_A ≈ 6.646476 × 10⁻²⁷ kg).
 * - Statistical weight: F_N encodes the macroscopic ratio N_real / N_p.
 * - Degrees of freedom: Center-of-mass velocity removal subtracts 3 global
 *   degrees of freedom from the 3N_real translational modes.
 * - Energy decomposition: K_total = K_bulk + K_thermal holds algebraically
 *   because the cross-term 2 v_cm · Σ c_i vanishes identically.
 * - Pressure: Represents volume-averaged kinetic momentum flux, not an
 *   instantaneous wall-impulse pressure.
 *
 * @module
 */

import { BOLTZMANN, HELIUM, AVOGADRO } from '../constants';
import type { ParticleEnsemble } from './particle-ensemble';

/** Single Helium-4 atom mass [kg]. */
export const M_HE = HELIUM.molarMass / AVOGADRO;

/**
 * Diagnostic and limitation flags for estimator results.
 */
export const ESTIMATOR_FLAGS = {
  /** Uncertainty was estimated assuming an equilibrium 3D Maxwell-Boltzmann distribution. */
  EQUILIBRIUM_MAXWELLIAN_UNCERTAINTY: 'EQUILIBRIUM_MAXWELLIAN_UNCERTAINTY',
  /** Bulk center-of-mass velocity was subtracted from laboratory velocities. */
  BULK_MOTION_REMOVED: 'BULK_MOTION_REMOVED',
  /** Scalar pressure was computed from kinetic ideal-gas momentum flux (2 K_thermal / 3V). */
  KINETIC_IDEAL_GAS_PRESSURE: 'KINETIC_IDEAL_GAS_PRESSURE',
  /** Ensemble has fewer than 2 particles; cannot form peculiar velocity distribution. */
  INSUFFICIENT_PARTICLES: 'INSUFFICIENT_PARTICLES',
  /** Ensemble is empty (count = 0). */
  EMPTY_ENSEMBLE: 'EMPTY_ENSEMBLE',
  /** Statistical weight F_N was not provided in argument or ensemble metadata. */
  MISSING_STATISTICAL_WEIGHT: 'MISSING_STATISTICAL_WEIGHT',
  /** Statistical weight F_N is non-positive or non-finite. */
  INVALID_STATISTICAL_WEIGHT: 'INVALID_STATISTICAL_WEIGHT',
  /** Volume V is non-positive or non-finite. */
  INVALID_VOLUME: 'INVALID_VOLUME',
  /** At least one particle has a non-finite (NaN or infinite) position or velocity. */
  NON_FINITE_PARTICLE_STATE: 'NON_FINITE_PARTICLE_STATE',
  /** Energy decomposition (|K_tot - (K_bulk + K_therm)|) exceeded numerical tolerance. */
  ENERGY_DECOMPOSITION_DISCREPANCY: 'ENERGY_DECOMPOSITION_DISCREPANCY',
} as const;

export type EstimatorFlag = (typeof ESTIMATOR_FLAGS)[keyof typeof ESTIMATOR_FLAGS];

/**
 * Base structured result returned by statistical estimators.
 */
export interface EstimatorResult<T = number> {
  /** Estimated numerical value (or tensor). Set to NaN when isValid is false. */
  readonly value: T;
  /** Physical SI units of the estimated quantity (e.g., 'K', 'J', 'Pa'). */
  readonly units: string;
  /** Number of simulator particles (N_p) used in this estimate. */
  readonly simulatorParticleCount: number;
  /** Whether the estimate is physically and numerically valid. */
  readonly isValid: boolean;
  /**
   * Statistically justified 1-sigma standard error under Maxwellian equilibrium.
   * Undefined if invalid or not applicable.
   */
  readonly standardError?: number;
  /** Informational, limitation, or diagnostic flags. */
  readonly flags: readonly string[];
}

/**
 * Structured result for kinetic energy estimation.
 */
export interface KineticEnergyResult extends EstimatorResult<number> {
  /** Thermal (peculiar) translational kinetic energy [J]. */
  readonly thermalKE: number;
  /** Center-of-mass bulk translational kinetic energy [J]. */
  readonly bulkKE: number;
  /** Center-of-mass velocity vector [m/s]. */
  readonly vCm: readonly [number, number, number];
}

/**
 * 3x3 symmetric microscopic kinetic stress tensor in Cartesian coordinates [Pa].
 */
export interface PressureTensor {
  readonly xx: number;
  readonly yy: number;
  readonly zz: number;
  readonly xy: number;
  readonly xz: number;
  readonly yz: number;
}

/**
 * Structured result for pressure estimation.
 */
export interface PressureResult extends EstimatorResult<number> {
  /** Full 3D kinetic pressure / stress tensor [Pa]. */
  readonly tensor?: PressureTensor;
}

/**
 * Comprehensive macroscopic state estimate containing all three primary quantities.
 */
export interface EnsembleStateEstimate {
  readonly temperature: EstimatorResult<number>;
  readonly kineticEnergy: KineticEnergyResult;
  readonly pressure: PressureResult;
  readonly vCm: readonly [number, number, number];
}

/**
 * Resolves and validates the statistical weighting factor F_N.
 */
function resolveStatisticalWeight(
  ensemble: ParticleEnsemble,
  explicitWeight?: number,
): { weight: number; errorFlag?: string } {
  const w = explicitWeight ?? ensemble.metadata.statisticalWeight;
  if (w === undefined) {
    return { weight: NaN, errorFlag: ESTIMATOR_FLAGS.MISSING_STATISTICAL_WEIGHT };
  }
  if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) {
    return { weight: NaN, errorFlag: ESTIMATOR_FLAGS.INVALID_STATISTICAL_WEIGHT };
  }
  return { weight: w };
}

/**
 * Internal helper to scan particles, compute center of mass, and evaluate sums.
 */
interface ParticleScan {
  readonly valid: boolean;
  readonly errorFlag?: string;
  readonly vCm: [number, number, number];
  readonly sumV2: number;
  readonly sumC2: number;
  readonly sumCxx: number;
  readonly sumCyy: number;
  readonly sumCzz: number;
  readonly sumCxy: number;
  readonly sumCxz: number;
  readonly sumCyz: number;
}

function scanParticles(ensemble: ParticleEnsemble): ParticleScan {
  const n = ensemble.count;
  const zeroScan: ParticleScan = {
    valid: false,
    vCm: [0, 0, 0],
    sumV2: 0,
    sumC2: 0,
    sumCxx: 0,
    sumCyy: 0,
    sumCzz: 0,
    sumCxy: 0,
    sumCxz: 0,
    sumCyz: 0,
  };

  if (n < 1) {
    return { ...zeroScan, errorFlag: ESTIMATOR_FLAGS.EMPTY_ENSEMBLE };
  }

  const vx = ensemble.vx;
  const vy = ensemble.vy;
  const vz = ensemble.vz;

  let sumVx = 0;
  let sumVy = 0;
  let sumVz = 0;
  let sumV2 = 0;

  // Pass 1: Check finiteness and compute laboratory sums
  for (let i = 0; i < n; i++) {
    const vxi = vx[i];
    const vyi = vy[i];
    const vzi = vz[i];

    if (!Number.isFinite(vxi) || !Number.isFinite(vyi) || !Number.isFinite(vzi)) {
      return { ...zeroScan, errorFlag: ESTIMATOR_FLAGS.NON_FINITE_PARTICLE_STATE };
    }

    sumVx += vxi;
    sumVy += vyi;
    sumVz += vzi;
    sumV2 += vxi * vxi + vyi * vyi + vzi * vzi;
  }

  const vCmX = sumVx / n;
  const vCmY = sumVy / n;
  const vCmZ = sumVz / n;

  // Pass 2: Compute peculiar velocity sums with center-of-mass subtracted
  // (two passes prevent catastrophic floating-point cancellation)
  let sumC2 = 0;
  let sumCxx = 0;
  let sumCyy = 0;
  let sumCzz = 0;
  let sumCxy = 0;
  let sumCxz = 0;
  let sumCyz = 0;

  for (let i = 0; i < n; i++) {
    const cx = vx[i] - vCmX;
    const cy = vy[i] - vCmY;
    const cz = vz[i] - vCmZ;

    const cxx = cx * cx;
    const cyy = cy * cy;
    const czz = cz * cz;

    sumCxx += cxx;
    sumCyy += cyy;
    sumCzz += czz;
    sumC2 += cxx + cyy + czz;

    sumCxy += cx * cy;
    sumCxz += cx * cz;
    sumCyz += cy * cz;
  }

  return {
    valid: true,
    vCm: [vCmX, vCmY, vCmZ],
    sumV2,
    sumC2,
    sumCxx,
    sumCyy,
    sumCzz,
    sumCxy,
    sumCxz,
    sumCyz,
  };
}

/**
 * Estimates the kinetic temperature of a monatomic gas from peculiar velocities.
 *
 * Removes bulk center-of-mass motion and applies the degrees-of-freedom correction:
 *   T = 2 K_thermal / (3 (N_real - 1) k_B)
 * where:
 *   K_thermal = F_N · (m_He / 2) · Σ |v_i - v_cm|²
 *   N_real = F_N · N_p
 *
 * @param ensemble         Particle ensemble containing velocities.
 * @param statisticalWeight Optional explicit statistical weight F_N. If omitted,
 *                          ensemble.metadata.statisticalWeight is used.
 * @returns Structured temperature estimate in Kelvin [K].
 */
export function estimateTemperature(
  ensemble: ParticleEnsemble,
  statisticalWeight?: number,
): EstimatorResult<number> {
  const n = ensemble.count;
  const { weight: FN, errorFlag: weightError } = resolveStatisticalWeight(
    ensemble,
    statisticalWeight,
  );

  if (weightError) {
    return {
      value: NaN,
      units: 'K',
      simulatorParticleCount: n,
      isValid: false,
      flags: [weightError],
    };
  }

  if (n < 2) {
    return {
      value: NaN,
      units: 'K',
      simulatorParticleCount: n,
      isValid: false,
      flags: [n === 0 ? ESTIMATOR_FLAGS.EMPTY_ENSEMBLE : ESTIMATOR_FLAGS.INSUFFICIENT_PARTICLES],
    };
  }

  const scan = scanParticles(ensemble);
  if (!scan.valid) {
    return {
      value: NaN,
      units: 'K',
      simulatorParticleCount: n,
      isValid: false,
      flags: [scan.errorFlag!],
    };
  }

  const Nreal = FN * n;
  const dof = 3 * (Nreal - 1);

  if (dof <= 0) {
    return {
      value: NaN,
      units: 'K',
      simulatorParticleCount: n,
      isValid: false,
      flags: [ESTIMATOR_FLAGS.INSUFFICIENT_PARTICLES],
    };
  }

  // K_thermal = F_N · (m_He / 2) · Σ c_i²
  const thermalKE = FN * 0.5 * M_HE * scan.sumC2;
  // T = 2 K_thermal / (3 (N_real - 1) k_B)
  const T = (2.0 * thermalKE) / (dof * BOLTZMANN);

  // Standard error under equilibrium Maxwellian distribution:
  // σ_T = T · √(2 / (3 (N_p - 1)))
  const standardError = T * Math.sqrt(2.0 / (3.0 * (n - 1)));

  const flags: string[] = [
    ESTIMATOR_FLAGS.BULK_MOTION_REMOVED,
    ESTIMATOR_FLAGS.EQUILIBRIUM_MAXWELLIAN_UNCERTAINTY,
  ];

  return {
    value: T,
    units: 'K',
    simulatorParticleCount: n,
    isValid: true,
    standardError,
    flags,
  };
}

/**
 * Estimates total, bulk, and thermal translational kinetic energies of the gas.
 *
 * Verifies that the algebraic decomposition:
 *   K_total = K_bulk + K_thermal
 * holds within floating-point tolerance.
 *
 * @param ensemble         Particle ensemble containing velocities.
 * @param statisticalWeight Optional explicit statistical weight F_N.
 * @returns Structured kinetic energy breakdown in Joules [J].
 */
export function estimateKineticEnergy(
  ensemble: ParticleEnsemble,
  statisticalWeight?: number,
): KineticEnergyResult {
  const n = ensemble.count;
  const { weight: FN, errorFlag: weightError } = resolveStatisticalWeight(
    ensemble,
    statisticalWeight,
  );

  const invalidResult = (flag: string): KineticEnergyResult => ({
    value: NaN,
    thermalKE: NaN,
    bulkKE: NaN,
    vCm: [NaN, NaN, NaN],
    units: 'J',
    simulatorParticleCount: n,
    isValid: false,
    flags: [flag],
  });

  if (weightError) return invalidResult(weightError);
  if (n < 1) return invalidResult(ESTIMATOR_FLAGS.EMPTY_ENSEMBLE);

  const scan = scanParticles(ensemble);
  if (!scan.valid) return invalidResult(scan.errorFlag!);

  const [vcmX, vcmY, vcmZ] = scan.vCm;
  const vcm2 = vcmX * vcmX + vcmY * vcmY + vcmZ * vcmZ;

  const totalKE = FN * 0.5 * M_HE * scan.sumV2;
  const bulkKE = FN * 0.5 * M_HE * n * vcm2;
  const thermalKE = FN * 0.5 * M_HE * scan.sumC2;

  const flags: string[] = [ESTIMATOR_FLAGS.BULK_MOTION_REMOVED];

  // Numerical consistency check: K_total = K_bulk + K_thermal
  const discrepancy = Math.abs(totalKE - (bulkKE + thermalKE));
  const scale = Math.max(totalKE, 1e-30);
  if (discrepancy / scale > 1e-12) {
    flags.push(ESTIMATOR_FLAGS.ENERGY_DECOMPOSITION_DISCREPANCY);
  }

  return {
    value: totalKE,
    thermalKE,
    bulkKE,
    vCm: scan.vCm,
    units: 'J',
    simulatorParticleCount: n,
    isValid: true,
    flags,
  };
}

/**
 * Estimates the kinetic pressure of the gas ensemble.
 *
 * Evaluates both:
 *  - Ideal-gas kinetic pressure: P = N_real · k_B · T / V = 2 K_thermal / (3 V · (N_real / (N_real - 1)))
 *  - Full 3x3 symmetric kinetic stress tensor: P_αβ = (F_N · m_He / V) · Σ c_iα c_iβ
 *
 * @param ensemble         Particle ensemble containing velocities.
 * @param volume           Physical volume of the chamber [m³].
 * @param statisticalWeight Optional explicit statistical weight F_N.
 * @returns Structured pressure estimate in Pascals [Pa].
 */
export function estimatePressure(
  ensemble: ParticleEnsemble,
  volume: number,
  statisticalWeight?: number,
): PressureResult {
  const n = ensemble.count;
  const { weight: FN, errorFlag: weightError } = resolveStatisticalWeight(
    ensemble,
    statisticalWeight,
  );

  const invalidResult = (flag: string): PressureResult => ({
    value: NaN,
    units: 'Pa',
    simulatorParticleCount: n,
    isValid: false,
    flags: [flag],
  });

  if (weightError) return invalidResult(weightError);
  if (!Number.isFinite(volume) || volume <= 0) {
    return invalidResult(ESTIMATOR_FLAGS.INVALID_VOLUME);
  }
  if (n < 2) {
    return invalidResult(n === 0 ? ESTIMATOR_FLAGS.EMPTY_ENSEMBLE : ESTIMATOR_FLAGS.INSUFFICIENT_PARTICLES);
  }

  const scan = scanParticles(ensemble);
  if (!scan.valid) return invalidResult(scan.errorFlag!);

  const tempResult = estimateTemperature(ensemble, FN);
  if (!tempResult.isValid) {
    return invalidResult(tempResult.flags[0] ?? ESTIMATOR_FLAGS.INSUFFICIENT_PARTICLES);
  }

  const Nreal = FN * n;
  // P = N_real · k_B · T / V
  const P = (Nreal * BOLTZMANN * tempResult.value) / volume;

  // Kinetic stress tensor: P_αβ = (F_N · m_He / V) · Σ c_iα c_iβ
  const tensorPrefactor = (FN * M_HE) / volume;
  const tensor: PressureTensor = {
    xx: tensorPrefactor * scan.sumCxx,
    yy: tensorPrefactor * scan.sumCyy,
    zz: tensorPrefactor * scan.sumCzz,
    xy: tensorPrefactor * scan.sumCxy,
    xz: tensorPrefactor * scan.sumCxz,
    yz: tensorPrefactor * scan.sumCyz,
  };

  // Standard error under equilibrium Maxwellian distribution:
  // σ_P = P · √(2 / (3 (N_p - 1)))
  const standardError = P * Math.sqrt(2.0 / (3.0 * (n - 1)));

  const flags: string[] = [
    ESTIMATOR_FLAGS.KINETIC_IDEAL_GAS_PRESSURE,
    ESTIMATOR_FLAGS.BULK_MOTION_REMOVED,
    ESTIMATOR_FLAGS.EQUILIBRIUM_MAXWELLIAN_UNCERTAINTY,
  ];

  return {
    value: P,
    tensor,
    units: 'Pa',
    simulatorParticleCount: n,
    isValid: true,
    standardError,
    flags,
  };
}

/**
 * Computes a coherent state estimate (T, K, P, vCm) in a single pass.
 *
 * @param ensemble         Particle ensemble containing velocities.
 * @param volume           Physical volume of the chamber [m³].
 * @param statisticalWeight Optional explicit statistical weight F_N.
 * @returns Combined macroscopic state estimate.
 */
export function estimateEnsembleState(
  ensemble: ParticleEnsemble,
  volume: number,
  statisticalWeight?: number,
): EnsembleStateEstimate {
  const temperature = estimateTemperature(ensemble, statisticalWeight);
  const kineticEnergy = estimateKineticEnergy(ensemble, statisticalWeight);
  const pressure = estimatePressure(ensemble, volume, statisticalWeight);

  return {
    temperature,
    kineticEnergy,
    pressure,
    vCm: kineticEnergy.vCm,
  };
}
