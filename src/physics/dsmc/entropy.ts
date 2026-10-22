/**
 * DSMC Statistical Entropy Estimator & Sackur–Tetrode Thermodynamic Reference
 * ============================================================================
 *
 * Implements:
 *  1. Classical Sackur–Tetrode thermodynamic reference entropy for a monatomic
 *     ideal gas (Helium-4).
 *  2. Equilibrium entropy estimate derived from the ensemble's peculiar kinetic
 *     temperature (Stage 4) and chamber volume.
 *  3. Boltzmann velocity-space H-theorem speed distribution estimator.
 *  4. Path-based entropy change estimator (ΔS) across thermodynamic processes.
 *  5. Statistically justified uncertainty models accounting for finite simulator
 *     particle count N_p (without confusing N_p with real particle count N_real).
 *
 * Physical Conventions & Units
 * ────────────────────────────
 * - Primary thermodynamic entropy unit: Joules per Kelvin [J/K] (extensive).
 * - Molar entropy unit: Joules per mole-Kelvin [J/(mol·K)].
 * - Kinetic H-functional unit: nats relative to unit velocity volume (m/s)³.
 * - Thermal motion only: Bulk center-of-mass motion is excluded.
 * - Helium-4 parameters: m_He = M_He / N_A ≈ 6.646476 × 10⁻²⁷ kg.
 * - Quantum constant: Planck constant h = 6.62607015 × 10⁻³⁴ J·s.
 * - Velocity reference scale for continuous H-functional: v_ref = 1 m/s.
 *
 * @module
 */

import { BOLTZMANN, AVOGADRO, R } from '../constants';
import type { ParticleEnsemble } from './particle-ensemble';
import { estimateTemperature, M_HE } from './estimators';

/** Planck constant h [J·s] (NIST CODATA 2018 exact). */
export const PLANCK = 6.62607015e-34;

/** Reference velocity scale for continuous H-functional [m/s]. */
export const V_REF_H = 1.0;

/**
 * Diagnostic, process, and limitation flags for entropy estimation.
 */
export const ENTROPY_FLAGS = {
  /** Value computed directly from analytical Sackur–Tetrode equation. */
  SACKUR_TETRODE_REFERENCE: 'SACKUR_TETRODE_REFERENCE',
  /** Analytical reference is an exact formula; reports no stochastic sampling uncertainty. */
  ANALYTICAL_REFERENCE_EXACT: 'ANALYTICAL_REFERENCE_EXACT',
  /** Equilibrium entropy calculated by evaluating Sackur–Tetrode at the kinetic temperature. */
  EQUILIBRIUM_ENTROPY_FROM_TEMPERATURE: 'EQUILIBRIUM_ENTROPY_FROM_TEMPERATURE',
  /** Backward-compatible alias flag for equilibrium temperature-derived entropy. */
  STATISTICAL_ENSEMBLE_ENTROPY: 'STATISTICAL_ENSEMBLE_ENTROPY',
  /** Uncertainty is strictly the propagated kinetic-temperature variance; does not include volume or non-equilibrium bias. */
  PROPAGATED_TEMPERATURE_UNCERTAINTY_ONLY: 'PROPAGATED_TEMPERATURE_UNCERTAINTY_ONLY',
  /** Kinetic H-function evaluated from empirical particle speed histogram. */
  KINETIC_H_THEOREM_SPEED_DISTRIBUTION: 'KINETIC_H_THEOREM_SPEED_DISTRIBUTION',
  /** Assumes velocity distribution is isotropic (f(v) = f_speed(v) / (4π v²)). */
  ASSUMES_VELOCITY_ISOTROPY: 'ASSUMES_VELOCITY_ISOTROPY',
  /** Velocity density in H-functional is non-dimensionalized relative to v_ref³ = 1 (m/s)³. */
  VELOCITY_REFERENCE_SCALE_1_M_PER_S: 'VELOCITY_REFERENCE_SCALE_1_M_PER_S',
  /** Analytical uncertainty for non-parametric speed histogram H-functional is unsupported. */
  H_UNCERTAINTY_UNSUPPORTED: 'H_UNCERTAINTY_UNSUPPORTED',
  /** Relies on equilibrium 3D Maxwell-Boltzmann distribution assumption. */
  EQUILIBRIUM_MAXWELLIAN_ASSUMPTION: 'EQUILIBRIUM_MAXWELLIAN_ASSUMPTION',
  /** States form an isothermal path (T1 === T2). */
  ISOTHERMAL_PATH: 'ISOTHERMAL_PATH',
  /** States form a reversible adiabatic path (T2/T1 === (V1/V2)^(2/3)). */
  ADIABATIC_PATH: 'ADIABATIC_PATH',
  /** Initial and final states are identical (ΔS === 0). */
  IDENTICAL_STATES: 'IDENTICAL_STATES',
  /** Particle sample size is too small for reliable speed histogram binning. */
  INSUFFICIENT_BIN_OCCUPANCY: 'INSUFFICIENT_BIN_OCCUPANCY',
  /** Ensemble has fewer than 2 particles (cannot form thermal temperature). */
  INSUFFICIENT_PARTICLES: 'INSUFFICIENT_PARTICLES',
  /** Statistical weight F_N was not supplied or found in metadata. */
  MISSING_STATISTICAL_WEIGHT: 'MISSING_STATISTICAL_WEIGHT',
  /** Statistical weight F_N is non-positive or non-finite. */
  INVALID_STATISTICAL_WEIGHT: 'INVALID_STATISTICAL_WEIGHT',
  /** Volume V is non-positive or non-finite. */
  INVALID_VOLUME: 'INVALID_VOLUME',
  /** Temperature T is non-positive or non-finite. */
  INVALID_TEMPERATURE: 'INVALID_TEMPERATURE',
  /** Real particle count N_real is non-positive or non-finite. */
  INVALID_PARTICLE_COUNT: 'INVALID_PARTICLE_COUNT',
  /** Argument of logarithm in Sackur-Tetrode formula is non-positive. */
  NON_POSITIVE_LOG_ARGUMENT: 'NON_POSITIVE_LOG_ARGUMENT',
  /** At least one particle state has NaN or infinite coordinate/velocity. */
  NON_FINITE_PARTICLE_STATE: 'NON_FINITE_PARTICLE_STATE',
} as const;

export type EntropyFlag = (typeof ENTROPY_FLAGS)[keyof typeof ENTROPY_FLAGS];

/**
 * Structured result returned by absolute entropy calculations and estimators.
 */
export interface EntropyResult {
  /** Extensive thermodynamic entropy S [J/K]. Set to NaN if invalid. */
  readonly value: number;
  /** Specific molar entropy s_molar = S / n [J/(mol·K)]. */
  readonly molarValue?: number;
  /** Units of the primary estimate ('J/K'). */
  readonly units: 'J/K';
  /**
   * Method used to obtain this value:
   *  - 'sackur-tetrode-reference': Direct analytical Sackur-Tetrode formula with known (N, V, T).
   *  - 'equilibrium-temperature-derived': Sackur-Tetrode evaluated at ensemble's kinetic temperature T_est.
   *  - 'statistical-ensemble': Alias for 'equilibrium-temperature-derived'.
   */
  readonly method:
    | 'sackur-tetrode-reference'
    | 'equilibrium-temperature-derived'
    | 'statistical-ensemble';
  /** Whether the inputs and numerical domain are physically valid. */
  readonly isValid: boolean;
  /**
   * Statistically justified 1-sigma standard error in J/K.
   * For equilibrium temperature-derived estimates: propagated strictly from finite simulator
   * particle count N_p under Maxwellian assumptions: σ_S = N_real · k_B · √(3 / (2 (N_p - 1))).
   * For analytical reference calculations: undefined (exact formula, no stochastic sampling variance).
   */
  readonly standardError?: number;
  /** Number of simulator particles used in this estimate (0 for analytical reference). */
  readonly simulatorParticleCount: number;
  /** Real particle population represented: N_real = N_p · F_N. */
  readonly realParticleCount: number;
  /** Explicit list of mathematical/physical assumptions underlying the estimate. */
  readonly statisticalAssumptions: readonly string[];
  /** Informational, diagnostic, and limitation flags. */
  readonly flags: readonly string[];
}

/**
 * Structured result returned by the kinetic Boltzmann H-function estimator.
 */
export interface KineticHResult {
  /**
   * Measured continuous velocity-space Boltzmann H-functional:
   *   H_v = ∫ f(c) ln( f(c) / v_ref⁻³ ) d³c
   * where c is peculiar speed and v_ref = 1 m/s.
   * Units: nats relative to unit velocity volume (m/s)³.
   */
  readonly H: number;
  /**
   * Theoretical H-function for an isotropic 3D Maxwellian at temperature T:
   *   H_Maxwell = 3/2 ln( (m_He · v_ref²) / (2π k_B T) ) - 3/2
   * Evaluated under the identical reference scale v_ref = 1 m/s.
   */
  readonly theoreticalH: number;
  /** Units of the H-functional. */
  readonly units: 'nats relative to (m/s)⁻³';
  /**
   * Standard error for the non-parametric H-functional is unsupported/unavailable
   * because discrete histogram variance without unverified ad-hoc assumptions is undefined.
   */
  readonly standardError?: undefined;
  /** Whether bin occupancy and particle count support valid estimation. */
  readonly isValid: boolean;
  /** Total number of speed histogram bins used. */
  readonly binCount: number;
  /** Number of bins containing at least one particle. */
  readonly occupiedBins: number;
  /** Diagnostic and limitation flags. */
  readonly flags: readonly string[];
}

/**
 * Minimal state specification for thermodynamic process calculations.
 */
export interface ThermodynamicStateSpec {
  /** Temperature T [K]. */
  readonly temperature: number;
  /** Volume V [m³]. */
  readonly volume: number;
  /** Real particle count N_real = n · N_A. */
  readonly Nreal: number;
  /** Optional standard error of entropy at this state [J/K]. */
  readonly standardError?: number;
}

/**
 * Structured result for entropy change (ΔS) between two thermodynamic states.
 */
export interface EntropyChangeResult {
  /** Entropy change ΔS = S2 - S1 [J/K]. Set to NaN if invalid. */
  readonly deltaS: number;
  /** Units ('J/K'). */
  readonly units: 'J/K';
  /** Whether the process transition is valid. */
  readonly isValid: boolean;
  /** Propagated standard error: √(σ_S1² + σ_S2²) [J/K]. */
  readonly standardError?: number;
  /** Process classification and diagnostic flags. */
  readonly flags: readonly string[];
}

/**
 * Calculates absolute thermodynamic entropy using the classical Sackur–Tetrode equation.
 *
 * Formula:
 *   S_ref = N_real · k_B · [ ln( (V / N_real) · (2π m_He k_B T / h²)^(3/2) ) + 5/2 ]
 *
 * This is an exact analytical thermodynamic reference calculation for given macroscopic
 * inputs (N_real, V, T). It possesses zero stochastic sampling error.
 *
 * @param Nreal       Total real particle count (N_real = n · N_A). Must be positive.
 * @param volume      Chamber volume V [m³]. Must be positive.
 * @param temperature Equilibrium temperature T [K]. Must be positive.
 * @returns Structured EntropyResult in J/K.
 */
export function calculateSackurTetrodeEntropy(
  Nreal: number,
  volume: number,
  temperature: number,
): EntropyResult {
  const invalidResult = (flag: string): EntropyResult => ({
    value: NaN,
    units: 'J/K',
    method: 'sackur-tetrode-reference',
    isValid: false,
    simulatorParticleCount: 0,
    realParticleCount: Nreal,
    statisticalAssumptions: ['Classical dilute monatomic ideal gas in thermodynamic equilibrium'],
    flags: [flag],
  });

  if (!Number.isFinite(Nreal) || Nreal <= 0) {
    return invalidResult(ENTROPY_FLAGS.INVALID_PARTICLE_COUNT);
  }
  if (!Number.isFinite(volume) || volume <= 0) {
    return invalidResult(ENTROPY_FLAGS.INVALID_VOLUME);
  }
  if (!Number.isFinite(temperature) || temperature <= 0) {
    return invalidResult(ENTROPY_FLAGS.INVALID_TEMPERATURE);
  }

  // Thermal de Broglie wavelength squared: Λ² = h² / (2π m_He k_B T)
  const thermalLambdaSq = (PLANCK * PLANCK) / (2.0 * Math.PI * M_HE * BOLTZMANN * temperature);
  const thermalLambdaCubed = thermalLambdaSq * Math.sqrt(thermalLambdaSq);

  // Dimensionless phase space volume argument: Θ = V / (N_real · Λ³)
  const theta = volume / (Nreal * thermalLambdaCubed);

  if (!Number.isFinite(theta) || theta <= 0) {
    return invalidResult(ENTROPY_FLAGS.NON_POSITIVE_LOG_ARGUMENT);
  }

  const S = Nreal * BOLTZMANN * (Math.log(theta) + 2.5);
  const moles = Nreal / AVOGADRO;
  const molarValue = S / moles;

  return {
    value: S,
    molarValue,
    units: 'J/K',
    method: 'sackur-tetrode-reference',
    isValid: true,
    simulatorParticleCount: 0,
    realParticleCount: Nreal,
    statisticalAssumptions: [
      'Classical dilute monatomic ideal gas limit (n_0 · Λ³ ≪ 1)',
      'Quantum indistinguishability (Gibbs 1/N! factor via Stirling approximation)',
      'Spatial homogeneity throughout volume V',
      'Equilibrium isotropic Maxwell-Boltzmann distribution',
      'Exact analytical calculation (zero stochastic sampling variance)',
    ],
    flags: [
      ENTROPY_FLAGS.SACKUR_TETRODE_REFERENCE,
      ENTROPY_FLAGS.ANALYTICAL_REFERENCE_EXACT,
    ],
  };
}

/**
 * Evaluates an equilibrium entropy estimate by applying the Sackur–Tetrode
 * equation to the ensemble's measured peculiar kinetic temperature T_est.
 *
 * IMPORTANT SCIENTIFIC SCOPE & LIMITATIONS:
 *  1. This is an EQUILIBRIUM estimate: it assumes the gas is in local thermodynamic
 *     equilibrium and spatially uniform across volume V.
 *  2. Agreement with the Sackur–Tetrode reference is by construction (evaluating
 *     the formula at T_est) and does NOT constitute an independent validation
 *     of non-equilibrium entropy.
 *  3. This estimator cannot measure arbitrary non-equilibrium entropy states
 *     (e.g., beam flows, non-Maxwellian tails, or spatial segregation).
 *  4. Uncertainty σ_S = N_real · k_B · √(3 / (2 (N_p - 1))) is strictly the
 *     propagated temperature-estimation variance from finite simulator count N_p.
 *     It does NOT include volume uncertainty, weight uncertainty, or non-equilibrium bias.
 *
 * @param ensemble          Particle ensemble containing laboratory velocities.
 * @param volume            Physical volume of the chamber [m³].
 * @param statisticalWeight  Optional explicit statistical weight F_N.
 * @returns Structured EntropyResult in J/K.
 */
export function estimateEquilibriumEntropyFromTemperature(
  ensemble: ParticleEnsemble,
  volume: number,
  statisticalWeight?: number,
): EntropyResult {
  const n = ensemble.count;
  const FN = statisticalWeight ?? ensemble.metadata.statisticalWeight;

  const invalidResult = (flag: string): EntropyResult => ({
    value: NaN,
    units: 'J/K',
    method: 'equilibrium-temperature-derived',
    isValid: false,
    simulatorParticleCount: n,
    realParticleCount: typeof FN === 'number' && Number.isFinite(FN) && FN > 0 ? n * FN : NaN,
    statisticalAssumptions: ['Statistical ensemble sampling of classical monatomic ideal gas'],
    flags: [flag],
  });

  if (FN === undefined) {
    return invalidResult(ENTROPY_FLAGS.MISSING_STATISTICAL_WEIGHT);
  }
  if (!Number.isFinite(FN) || FN <= 0) {
    return invalidResult(ENTROPY_FLAGS.INVALID_STATISTICAL_WEIGHT);
  }
  if (!Number.isFinite(volume) || volume <= 0) {
    return invalidResult(ENTROPY_FLAGS.INVALID_VOLUME);
  }
  if (n < 2) {
    return invalidResult(ENTROPY_FLAGS.INSUFFICIENT_PARTICLES);
  }

  // Evaluate peculiar kinetic temperature
  const tempEst = estimateTemperature(ensemble, FN);
  if (!tempEst.isValid) {
    return invalidResult(tempEst.flags[0] ?? ENTROPY_FLAGS.INSUFFICIENT_PARTICLES);
  }

  const Nreal = n * FN;
  const refResult = calculateSackurTetrodeEntropy(Nreal, volume, tempEst.value);
  if (!refResult.isValid) {
    return invalidResult(refResult.flags[0]);
  }

  // Uncertainty propagation: S ∝ (3/2) N_real k_B ln(T)
  // σ_S = |dS/dT| · σ_T = (3/2 N_real k_B / T) · T · √(2 / (3(Np - 1)))
  //      = N_real · k_B · √(3 / (2(Np - 1)))
  const standardError = Nreal * BOLTZMANN * Math.sqrt(3.0 / (2.0 * (n - 1)));

  return {
    value: refResult.value,
    molarValue: refResult.molarValue,
    units: 'J/K',
    method: 'equilibrium-temperature-derived',
    isValid: true,
    standardError,
    simulatorParticleCount: n,
    realParticleCount: Nreal,
    statisticalAssumptions: [
      'Peculiar velocity thermalization (center-of-mass bulk motion removed)',
      'Assumes local thermodynamic equilibrium (Maxwell-Boltzmann distribution)',
      'Assumes spatial homogeneity throughout volume V',
      'Uncertainty is strictly propagated from kinetic temperature variance of finite simulator count N_p',
    ],
    flags: [
      ENTROPY_FLAGS.EQUILIBRIUM_ENTROPY_FROM_TEMPERATURE,
      ENTROPY_FLAGS.STATISTICAL_ENSEMBLE_ENTROPY,
      ENTROPY_FLAGS.EQUILIBRIUM_MAXWELLIAN_ASSUMPTION,
      ENTROPY_FLAGS.PROPAGATED_TEMPERATURE_UNCERTAINTY_ONLY,
    ],
  };
}

/**
 * Backward-compatible alias for estimateEquilibriumEntropyFromTemperature.
 */
export const estimateStatisticalEntropy = estimateEquilibriumEntropyFromTemperature;

/**
 * Evaluates the empirical Boltzmann H-functional from particle peculiar speeds.
 *
 * Exact Mathematical Quantity:
 *   H_v = ∫_ℝ³ f(c) ln( f(c) / v_ref⁻³ ) d³c
 * where c is peculiar velocity (|v - v_cm|) and v_ref = 1 m/s.
 *
 * Space & Projection Assumptions:
 *  - Projects 3D velocity vectors into a 1D scalar speed histogram.
 *  - ASSUMES VELOCITY ISOTROPY: f(c) = f_speed(c) / (4π c²).
 *    If the gas possesses directional anisotropy or shear, this projection
 *    averages away the directional modes, yielding a lower bound on the true
 *    velocity-space H-functional (Jensen's inequality).
 *  - Reference scale: v_ref = 1 m/s ensures the argument of the logarithm is
 *    strictly dimensionless.
 *  - Binning effects: Discretization into finite bins introduces O(Δv²) bias.
 *  - Statistical weight: As an intensive shape functional, H_v is independent
 *    of F_N; however, sampling variance depends directly on simulator count N_p.
 *  - Uncertainty: Non-parametric histogram entropy uncertainty is not supported/
 *    unavailable without unverified ad-hoc assumptions; no standardError is reported.
 *
 * @param ensemble Particle ensemble containing laboratory velocities.
 * @param numBins  Number of speed histogram bins (default: 40).
 * @returns Structured KineticHResult.
 */
export function estimateKineticH(
  ensemble: ParticleEnsemble,
  numBins = 40,
): KineticHResult {
  const n = ensemble.count;
  const invalidResult = (flag: string): KineticHResult => ({
    H: NaN,
    theoreticalH: NaN,
    units: 'nats relative to (m/s)⁻³',
    isValid: false,
    binCount: numBins,
    occupiedBins: 0,
    flags: [flag, ENTROPY_FLAGS.H_UNCERTAINTY_UNSUPPORTED],
  });

  if (n < 20) {
    return invalidResult(ENTROPY_FLAGS.INSUFFICIENT_BIN_OCCUPANCY);
  }

  // 1. Center of mass velocity
  let sumVx = 0, sumVy = 0, sumVz = 0;
  for (let i = 0; i < n; i++) {
    const vxi = ensemble.vx[i], vyi = ensemble.vy[i], vzi = ensemble.vz[i];
    if (!Number.isFinite(vxi) || !Number.isFinite(vyi) || !Number.isFinite(vzi)) {
      return invalidResult(ENTROPY_FLAGS.NON_FINITE_PARTICLE_STATE);
    }
    sumVx += vxi;
    sumVy += vyi;
    sumVz += vzi;
  }
  const vcmX = sumVx / n;
  const vcmY = sumVy / n;
  const vcmZ = sumVz / n;

  // 2. Compute peculiar speeds and maximum speed
  const speeds = new Float64Array(n);
  let maxSpeed = 0;
  let sumC2 = 0;

  for (let i = 0; i < n; i++) {
    const cx = ensemble.vx[i] - vcmX;
    const cy = ensemble.vy[i] - vcmY;
    const cz = ensemble.vz[i] - vcmZ;
    const s2 = cx * cx + cy * cy + cz * cz;
    const s = Math.sqrt(s2);
    speeds[i] = s;
    sumC2 += s2;
    if (s > maxSpeed) maxSpeed = s;
  }

  if (maxSpeed <= 0) {
    return invalidResult(ENTROPY_FLAGS.INSUFFICIENT_PARTICLES);
  }

  // Estimated temperature from mean squared peculiar speed: <c²> = 3 k_B T / m_He
  const meanC2 = sumC2 / (n - 1);
  const T = (M_HE * meanC2) / (3.0 * BOLTZMANN);

  // Theoretical H for 3D Maxwellian under identical reference scale v_ref = 1 m/s:
  // H_Maxwell = 3/2 ln( (m_He · v_ref²) / (2π k_B T) ) - 3/2
  const theoreticalH =
    1.5 * Math.log((M_HE * V_REF_H * V_REF_H) / (2.0 * Math.PI * BOLTZMANN * T)) - 1.5;

  // 3. Speed histogram binning
  const binWidth = (maxSpeed * 1.001) / numBins;
  const counts = new Int32Array(numBins);

  for (let i = 0; i < n; i++) {
    const b = Math.floor(speeds[i] / binWidth);
    if (b >= 0 && b < numBins) counts[b]++;
  }

  let H = 0;
  let occupiedBins = 0;

  for (let b = 0; b < numBins; b++) {
    if (counts[b] > 0) {
      occupiedBins++;
      const p = counts[b] / n;
      const vMid = (b + 0.5) * binWidth;
      // Volume element of spherical shell: 4π v² Δv [in (m/s)³]
      const shellVol = 4.0 * Math.PI * vMid * vMid * binWidth;
      // Probability density in 3D velocity space normalized by v_ref³ = 1:
      const f3d = p / shellVol;
      // f3d · v_ref³ is dimensionless
      H += p * Math.log(f3d * V_REF_H * V_REF_H * V_REF_H);
    }
  }

  const flags: string[] = [
    ENTROPY_FLAGS.KINETIC_H_THEOREM_SPEED_DISTRIBUTION,
    ENTROPY_FLAGS.ASSUMES_VELOCITY_ISOTROPY,
    ENTROPY_FLAGS.VELOCITY_REFERENCE_SCALE_1_M_PER_S,
    ENTROPY_FLAGS.H_UNCERTAINTY_UNSUPPORTED,
  ];

  if (occupiedBins < numBins * 0.3) {
    flags.push(ENTROPY_FLAGS.INSUFFICIENT_BIN_OCCUPANCY);
  }

  return {
    H,
    theoreticalH,
    units: 'nats relative to (m/s)⁻³',
    isValid: true,
    binCount: numBins,
    occupiedBins,
    flags,
  };
}

/**
 * Computes entropy change ΔS across a thermodynamic process between State 1 and State 2.
 *
 * Evaluates:
 *   ΔS = n · R · [ (3/2) ln(T₂ / T₁) + ln(V₂ / V₁) ]
 *
 * @param state1 Initial thermodynamic state specification.
 * @param state2 Final thermodynamic state specification.
 * @returns Structured EntropyChangeResult in J/K.
 */
export function estimateEntropyChange(
  state1: ThermodynamicStateSpec,
  state2: ThermodynamicStateSpec,
): EntropyChangeResult {
  const invalidResult = (flag: string): EntropyChangeResult => ({
    deltaS: NaN,
    units: 'J/K',
    isValid: false,
    flags: [flag],
  });

  if (
    !Number.isFinite(state1.temperature) ||
    state1.temperature <= 0 ||
    !Number.isFinite(state2.temperature) ||
    state2.temperature <= 0
  ) {
    return invalidResult(ENTROPY_FLAGS.INVALID_TEMPERATURE);
  }
  if (
    !Number.isFinite(state1.volume) ||
    state1.volume <= 0 ||
    !Number.isFinite(state2.volume) ||
    state2.volume <= 0
  ) {
    return invalidResult(ENTROPY_FLAGS.INVALID_VOLUME);
  }
  if (
    !Number.isFinite(state1.Nreal) ||
    state1.Nreal <= 0 ||
    !Number.isFinite(state2.Nreal) ||
    state2.Nreal <= 0
  ) {
    return invalidResult(ENTROPY_FLAGS.INVALID_PARTICLE_COUNT);
  }

  const Nreal = state1.Nreal;
  const moles = Nreal / AVOGADRO;
  const nR = moles * R;

  const tempRatio = state2.temperature / state1.temperature;
  const volRatio = state2.volume / state1.volume;

  // Ideal-gas entropy change: ΔS = nR · [ (3/2) ln(T₂/T₁) + ln(V₂/V₁) ]
  const deltaS = nR * (1.5 * Math.log(tempRatio) + Math.log(volRatio));

  const flags: string[] = [];

  // Identify special thermodynamic paths
  if (tempRatio === 1.0 && volRatio === 1.0) {
    flags.push(ENTROPY_FLAGS.IDENTICAL_STATES);
  }
  if (Math.abs(tempRatio - 1.0) < 1e-12) {
    flags.push(ENTROPY_FLAGS.ISOTHERMAL_PATH);
  }
  // Reversible adiabatic condition for monatomic gas (γ = 5/3): T · V^(2/3) = const
  // ln(T₂/T₁) + (2/3) ln(V₂/V₁) === 0
  const adiabaticResidual = Math.abs(1.5 * Math.log(tempRatio) + Math.log(volRatio));
  if (adiabaticResidual < 1e-10) {
    flags.push(ENTROPY_FLAGS.ADIABATIC_PATH);
  }

  let standardError: number | undefined;
  if (state1.standardError !== undefined && state2.standardError !== undefined) {
    standardError = Math.sqrt(
      state1.standardError * state1.standardError + state2.standardError * state2.standardError,
    );
  }

  return {
    deltaS,
    units: 'J/K',
    isValid: true,
    standardError,
    flags,
  };
}
