/**
 * Thermodynamic Simulation Engine
 * ================================
 *
 * Time-dependent simulation of helium gas in a cylinder with a movable piston.
 * Advances the thermodynamic state through discrete time steps according to a
 * selected process mode.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  Process Modes & Equations                                            │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │                                                                       │
 * │  1. Constant Volume (Isochoric)                                       │
 * │     V = const,  n = const                                             │
 * │     Driving input: heatingPower Q̇ [W]                                │
 * │     Q  = Q̇ · dt                                                      │
 * │     W  = 0          (no volume change → no PdV work)                  │
 * │     ΔU = Q                                                            │
 * │     ΔT = Q / (n·Cv) = Q / ((3/2)nR)                                  │
 * │     T₂ = T₁ + ΔT                                                     │
 * │     P₂ = nRT₂/V    (from EOS)                                        │
 * │                                                                       │
 * │  2. Constant Pressure (Isobaric)                                      │
 * │     P = const,  n = const                                             │
 * │     Driving input: heatingPower Q̇ [W]                                │
 * │     Q  = Q̇ · dt                                                      │
 * │     ΔT = Q / (n·Cp) = Q / ((5/2)nR)                                  │
 * │     T₂ = T₁ + ΔT                                                     │
 * │     V₂ = nRT₂/P    (from EOS)                                        │
 * │     W  = P·(V₂ − V₁)                                                 │
 * │     ΔU = Q − W  = (3/2)nR·ΔT   (check: consistent with n·Cv·ΔT)     │
 * │                                                                       │
 * │  3. Constant Temperature (Isothermal)                                 │
 * │     T = const,  n = const                                             │
 * │     Driving input: volumeChangeRate dV/dt [m³/s]                      │
 * │     V₂ = V₁ + (dV/dt)·dt                                             │
 * │     P₂ = nRT/V₂    (from EOS)                                        │
 * │     W  = ∫P dV ≈ nRT·ln(V₂/V₁)  (exact for ideal gas)               │
 * │     ΔU = 0          (U depends only on T for ideal gas)               │
 * │     Q  = W          (first law: Q = ΔU + W = 0 + W)                  │
 * │                                                                       │
 * │  4. Adiabatic (Isentropic, quasi-static, reversible)                  │
 * │     Q = 0,  n = const                                                 │
 * │     Driving input: volumeChangeRate dV/dt [m³/s]                      │
 * │     V₂ = V₁ + (dV/dt)·dt                                             │
 * │     Adiabatic relation: T·V^(γ−1) = const → T₂ = T₁·(V₁/V₂)^(γ−1)  │
 * │     P₂ = nRT₂/V₂   (from EOS, or P·V^γ = const)                     │
 * │     ΔU = (3/2)nR·(T₂ − T₁)                                          │
 * │     W  = −ΔU        (first law: Q = 0 → ΔU = −W → W = −ΔU)          │
 * │                                                                       │
 * │  Sign conventions:                                                    │
 * │     Q > 0 : heat INTO the gas                                         │
 * │     W > 0 : work done BY the gas (expansion)                          │
 * │     ΔU = Q − W                                                        │
 * │                                                                       │
 * │  Mechanical equilibrium assumption:                                   │
 * │     For all modes, P_gas = P_external at each step (quasi-static).    │
 * │     The piston is frictionless and massless. True non-equilibrium      │
 * │     dynamics (piston inertia, pressure waves) are not modelled.        │
 * │                                                                       │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @module
 */

import { R, HELIUM } from './constants';
import { computeDerivedProperties } from './engine';
import type { ThermodynamicState } from './types';
import type {
  ProcessMode,
  EnvironmentConfig,
  SimulationSnapshot,
  StepResult,
  SimulationConfig,
} from './simulation-types';
import { ENERGY_TOLERANCE_RELATIVE, ENERGY_TOLERANCE_ABSOLUTE } from './simulation-types';
import { normalizeEnvironment, transitionEnvironment } from './constraints';

// ─── Energy-Balance Verification ──────────────────────────────────────────── //

/**
 * Check first-law energy balance: |ΔU − (Q − W)| within tolerance.
 *
 * Uses max(relative, absolute) tolerance to handle both large and small values.
 */
function checkEnergyBalance(deltaU: number, Q: number, W: number): {
  valid: boolean;
  residual: number;
} {
  const residual = Math.abs(deltaU - (Q - W));
  const scale = Math.max(
    Math.abs(deltaU),
    Math.abs(Q),
    Math.abs(W),
    ENERGY_TOLERANCE_ABSOLUTE,
  );
  const valid = residual <= scale * ENERGY_TOLERANCE_RELATIVE + ENERGY_TOLERANCE_ABSOLUTE;
  return { valid, residual };
}

// ─── Process Steppers ─────────────────────────────────────────────────────── //
// Each stepper takes the current state, environment, and dt, and returns
// the new state plus Q, W, ΔU for the step.

interface ProcessStepResult {
  newState: ThermodynamicState;
  Q: number;
  W: number;
  deltaU: number;
}

/**
 * Isochoric (constant volume) step.
 *
 * V = const. Heating power drives temperature change.
 * W = 0 (no volume change). ΔT = Q / (n·Cv).
 */
function stepConstantVolume(
  state: ThermodynamicState,
  env: EnvironmentConfig,
  dt: number,
): ProcessStepResult {
  const { volume, moles } = state;
  const Cv = HELIUM.Cv; // (3/2)R per mol

  if (env.heatingPower === 0) {
    return { newState: { ...state }, Q: 0, W: 0, deltaU: 0 };
  }

  const Q = env.heatingPower * dt;
  const W = 0;
  const deltaT = Q / (moles * Cv);
  const T2 = state.temperature + deltaT;

  // Guard against non-physical temperature
  if (T2 <= 0) {
    throw new Error(
      `Isochoric step would produce T = ${T2.toFixed(4)} K (non-physical). ` +
        'Reduce cooling power or time step.',
    );
  }

  const P2 = (moles * R * T2) / volume;
  const deltaU = moles * Cv * deltaT; // = Q since W = 0

  return {
    newState: { pressure: P2, volume, temperature: T2, moles },
    Q,
    W,
    deltaU,
  };
}

/**
 * Isobaric (constant pressure) step.
 *
 * P = const. Heating power drives temperature change.
 * ΔT = Q / (n·Cp). V₂ = nRT₂/P. W = P·ΔV.
 */
function stepConstantPressure(
  state: ThermodynamicState,
  env: EnvironmentConfig,
  dt: number,
): ProcessStepResult {
  const { pressure, moles } = state;
  const Cp = HELIUM.Cp; // (5/2)R per mol

  if (env.heatingPower === 0) {
    return { newState: { ...state }, Q: 0, W: 0, deltaU: 0 };
  }

  const Q = env.heatingPower * dt;
  const deltaT = Q / (moles * Cp);
  const T2 = state.temperature + deltaT;

  if (T2 <= 0) {
    throw new Error(
      `Isobaric step would produce T = ${T2.toFixed(4)} K (non-physical). ` +
        'Reduce cooling power or time step.',
    );
  }

  const V2 = (moles * R * T2) / pressure;
  const W = pressure * (V2 - state.volume);
  const deltaU = moles * HELIUM.Cv * deltaT; // (3/2)nR·ΔT

  return {
    newState: { pressure, volume: V2, temperature: T2, moles },
    Q,
    W,
    deltaU,
  };
}

/**
 * Isothermal (constant temperature) step.
 *
 * T = const. Volume change rate drives expansion/compression.
 * U depends only on T for ideal gas → ΔU = 0.
 * W = nRT·ln(V₂/V₁). Q = W.
 */
function stepConstantTemperature(
  state: ThermodynamicState,
  env: EnvironmentConfig,
  dt: number,
): ProcessStepResult {
  const { temperature, moles } = state;

  if (env.volumeChangeRate === 0) {
    return { newState: { ...state }, Q: 0, W: 0, deltaU: 0 };
  }

  const dV = env.volumeChangeRate * dt;
  const V2 = state.volume + dV;

  if (V2 <= 0) {
    throw new Error(
      `Isothermal step would produce V = ${V2.toExponential(4)} m³ (non-physical). ` +
        'Reduce compression rate or time step.',
    );
  }

  const P2 = (moles * R * temperature) / V2;

  // Exact work for ideal-gas isothermal process
  const W = moles * R * temperature * Math.log(V2 / state.volume);
  const deltaU = 0; // U(T) only for ideal gas
  const Q = W; // First law: Q = ΔU + W = 0 + W

  return {
    newState: { pressure: P2, volume: V2, temperature, moles },
    Q,
    W,
    deltaU,
  };
}

/**
 * Adiabatic (Q = 0, quasi-static, reversible) step.
 *
 * Q = 0. Volume change drives the process.
 * Adiabatic invariant: T·V^(γ−1) = const.
 * T₂ = T₁·(V₁/V₂)^(γ−1).
 * ΔU = (3/2)nR·(T₂ − T₁). W = −ΔU.
 */
function stepAdiabatic(
  state: ThermodynamicState,
  env: EnvironmentConfig,
  dt: number,
): ProcessStepResult {
  const { moles } = state;
  const gamma = HELIUM.gamma; // 5/3

  if (env.volumeChangeRate === 0) {
    return { newState: { ...state }, Q: 0, W: 0, deltaU: 0 };
  }

  const dV = env.volumeChangeRate * dt;
  const V2 = state.volume + dV;

  if (V2 <= 0) {
    throw new Error(
      `Adiabatic step would produce V = ${V2.toExponential(4)} m³ (non-physical). ` +
        'Reduce compression rate or time step.',
    );
  }

  // Adiabatic relation: T₂ = T₁ · (V₁/V₂)^(γ-1)
  const T2 = state.temperature * Math.pow(state.volume / V2, gamma - 1);

  if (T2 <= 0 || !Number.isFinite(T2)) {
    throw new Error(
      `Adiabatic step produced non-physical temperature T = ${T2}. ` +
        'Check volume change rate and time step.',
    );
  }

  const P2 = (moles * R * T2) / V2;

  const Q = 0;
  const deltaU = moles * HELIUM.Cv * (T2 - state.temperature);
  const W = deltaU === 0 ? 0 : -deltaU; // First law: ΔU = Q - W = -W → W = -ΔU

  return {
    newState: { pressure: P2, volume: V2, temperature: T2, moles },
    Q,
    W,
    deltaU,
  };
}

// ─── Step Dispatcher ──────────────────────────────────────────────────────── //

/**
 * Dispatch to the correct process stepper based on the mode.
 */
function stepProcess(
  mode: ProcessMode,
  state: ThermodynamicState,
  env: EnvironmentConfig,
  dt: number,
): ProcessStepResult {
  switch (mode) {
    case 'constant_volume':
      return stepConstantVolume(state, env, dt);
    case 'constant_pressure':
      return stepConstantPressure(state, env, dt);
    case 'constant_temperature':
      return stepConstantTemperature(state, env, dt);
    case 'adiabatic':
      return stepAdiabatic(state, env, dt);
    default:
      throw new Error(`Unknown process mode: ${mode}`);
  }
}

// ─── Simulation Class ─────────────────────────────────────────────────────── //

/**
 * The Simulation class manages the full lifecycle:
 * initialise → step → pause → resume → reset.
 *
 * It is a pure-logic class with no React dependency. The React hook wraps
 * this class and drives the animation loop.
 *
 * Determinism guarantee: given the same initial state, process mode,
 * environment, and dt, the simulation will produce identical results.
 * No random numbers are used in the physics.
 */
export class Simulation {
  private config: SimulationConfig;
  private currentSnapshot: SimulationSnapshot;
  private initialSnapshot: SimulationSnapshot;
  private _stepCount: number = 0;

  constructor(config: SimulationConfig) {
    this.config = { ...config };
    const snapshot = Simulation.createInitialSnapshot(config.initialState);
    this.currentSnapshot = snapshot;
    this.initialSnapshot = { ...snapshot };
  }

  /** Create the t = 0 snapshot from an initial state. */
  static createInitialSnapshot(state: ThermodynamicState): SimulationSnapshot {
    const derived = computeDerivedProperties(state);
    return {
      time: 0,
      state: { ...state },
      derived,
      totalQ: 0,
      totalW: 0,
      totalDeltaU: 0,
      stepQ: 0,
      stepW: 0,
      stepDeltaU: 0,
      energyBalanceValid: true,
    };
  }

  /** Read the current snapshot (immutable copy). */
  get snapshot(): SimulationSnapshot {
    return { ...this.currentSnapshot };
  }

  /** Read the configuration. */
  get configuration(): SimulationConfig {
    return { ...this.config };
  }

  /** Total number of steps taken since last reset. */
  get stepCount(): number {
    return this._stepCount;
  }

  /**
   * Advance the simulation by one time step.
   *
   * @returns StepResult with the new snapshot and energy-balance diagnostic.
   * @throws  If the step produces a non-physical state.
   */
  step(): StepResult {
    const { processMode, environment, dt } = this.config;
    const effectiveEnv = normalizeEnvironment(processMode, environment);
    const prev = this.currentSnapshot;

    // Run the process stepper
    const result = stepProcess(processMode, prev.state, effectiveEnv, dt);

    // Verify energy balance for this step
    const balance = checkEnergyBalance(result.deltaU, result.Q, result.W);

    // Build new snapshot
    const derived = computeDerivedProperties(result.newState);
    const newSnapshot: SimulationSnapshot = {
      time: prev.time + dt,
      state: result.newState,
      derived,
      totalQ: prev.totalQ + result.Q,
      totalW: prev.totalW + result.W,
      totalDeltaU: prev.totalDeltaU + result.deltaU,
      stepQ: result.Q,
      stepW: result.W,
      stepDeltaU: result.deltaU,
      energyBalanceValid: balance.valid,
    };

    this.currentSnapshot = newSnapshot;
    this._stepCount++;

    return { snapshot: newSnapshot, energyResidual: balance.residual };
  }

  /**
   * Update the environment configuration (e.g. change heating power mid-run).
   * Takes effect on the next step.
   */
  updateEnvironment(env: Partial<EnvironmentConfig>): void {
    this.config.environment = { ...this.config.environment, ...env };
  }

  /**
   * Update the process mode mid-run. The state is preserved; the process model
   * changes and environment driving inputs are adapted automatically unless disabled.
   */
  updateProcessMode(mode: ProcessMode, autoAdaptEnvironment = true): void {
    this.config.processMode = mode;
    if (autoAdaptEnvironment) {
      this.config.environment = transitionEnvironment(mode, this.config.environment);
    }
  }

  /**
   * Update the speed multiplier. This does NOT change dt — it controls
   * how many steps the UI loop takes per animation frame.
   */
  updateSpeedMultiplier(multiplier: number): void {
    this.config.speedMultiplier = Math.max(0.1, Math.min(100, multiplier));
  }

  /**
   * Reset the simulation to t = 0 with the original initial state.
   * All accumulated Q, W, ΔU are zeroed.
   */
  reset(): void {
    this.currentSnapshot = { ...this.initialSnapshot };
    this._stepCount = 0;
  }

  /**
   * Reset the simulation to t = 0 with a NEW initial state.
   */
  resetWithState(state: ThermodynamicState): void {
    const snapshot = Simulation.createInitialSnapshot(state);
    this.currentSnapshot = snapshot;
    this.initialSnapshot = { ...snapshot };
    this._stepCount = 0;
  }
}
