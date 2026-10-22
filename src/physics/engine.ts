/**
 * Thermodynamic State Engine
 * ==========================
 *
 * Pure-function module that resolves equilibrium states and computes derived
 * properties for a monatomic ideal gas (helium).
 *
 * Equations implemented
 * ─────────────────────
 *  Equation of state   :  PV = nRT
 *  Internal energy      :  U  = (3/2) nRT
 *  Enthalpy             :  H  = (5/2) nRT  =  U + PV
 *  Cv (molar, const V)  :  (3/2) R
 *  Cp (molar, const P)  :  (5/2) R
 *  γ = Cp / Cv          :  5/3
 *
 * Sign conventions
 * ────────────────
 *  Q > 0  → heat flows INTO the system.
 *  W > 0  → work is done BY the system on the surroundings.
 *
 * Assumptions
 * ───────────
 *  1. Gas behaves ideally (no intermolecular forces, point particles).
 *  2. Only translational degrees of freedom (f = 3).
 *  3. All quantities in SI units.
 *  4. Equilibrium: the state is fully defined by any 3 of {P, V, T, n}.
 *
 * @module
 */

import { R, HELIUM, AVOGADRO, BOLTZMANN } from './constants';
import type {
  StateVariable,
  ThermodynamicState,
  DerivedProperties,
  StateConfig,
} from './types';
import { validateInputs } from './validation';

// ─── State Resolution ────────────────────────────────────────────────────── //

/**
 * Resolve a complete equilibrium state from three independent variables.
 *
 * @param config  Which variable is dependent + the three supplied values.
 * @returns       A fully-defined `ThermodynamicState`.
 * @throws        If validation fails or the computed value is non-physical.
 */
export function resolveState(config: StateConfig): ThermodynamicState {
  const { dependentVariable, inputs } = config;

  // 1. Validate the three independent inputs.
  const report = validateInputs(inputs, dependentVariable);
  if (!report.valid) {
    const errors = Object.entries(report.fields)
      .filter(([, r]) => !r.valid)
      .map(([k, r]) => `${k}: ${r.error}`)
      .join('; ');
    throw new Error(`Invalid inputs — ${errors}`);
  }

  // 2. Extract the known values (cast is safe after validation).
  const P = inputs.pressure!;
  const V = inputs.volume!;
  const T = inputs.temperature!;
  const n = inputs.moles!;

  // 3. Compute the dependent variable via PV = nRT.
  let state: ThermodynamicState;

  switch (dependentVariable) {
    case 'pressure':
      state = {
        pressure: (n * R * T) / V,
        volume: V,
        temperature: T,
        moles: n,
      };
      break;

    case 'volume':
      state = {
        pressure: P,
        volume: (n * R * T) / P,
        temperature: T,
        moles: n,
      };
      break;

    case 'temperature':
      state = {
        pressure: P,
        volume: V,
        temperature: (P * V) / (n * R),
        moles: n,
      };
      break;

    case 'moles':
      state = {
        pressure: P,
        volume: V,
        temperature: T,
        moles: (P * V) / (R * T),
      };
      break;

    default:
      throw new Error(`Unknown dependent variable: ${dependentVariable}`);
  }

  // 4. Sanity-check the computed value.
  const computed = state[dependentVariable];
  if (!Number.isFinite(computed) || computed <= 0) {
    throw new Error(
      `Computed ${dependentVariable} = ${computed} is non-physical. ` +
        'Check your independent variable values.',
    );
  }

  return state;
}

// ─── Derived Properties ──────────────────────────────────────────────────── //

/**
 * Compute all derived thermodynamic properties from a valid state.
 */
export function computeDerivedProperties(
  state: ThermodynamicState,
): DerivedProperties {
  const { volume, temperature, moles } = state;

  const internalEnergy = (3 / 2) * moles * R * temperature;
  const enthalpy = (5 / 2) * moles * R * temperature;
  const Cv = HELIUM.Cv;
  const Cp = HELIUM.Cp;
  const gamma = HELIUM.gamma;
  const totalMass = moles * HELIUM.molarMass; // kg
  const density = totalMass / volume;
  const specificVolume = volume / totalMass;
  const particleCount = moles * AVOGADRO;
  const averageKineticEnergy = (3 / 2) * BOLTZMANN * temperature;
  const rmsSpeed = Math.sqrt((3 * R * temperature) / HELIUM.molarMass);

  return {
    internalEnergy,
    enthalpy,
    Cv,
    Cp,
    gamma,
    density,
    specificVolume,
    particleCount,
    averageKineticEnergy,
    rmsSpeed,
  };
}

// ─── Convenience ─────────────────────────────────────────────────────────── //

/**
 * Verify that PV = nRT holds for the given state within a relative tolerance.
 */
export function verifyEquationOfState(
  state: ThermodynamicState,
  tolerance = 1e-9,
): boolean {
  const lhs = state.pressure * state.volume;
  const rhs = state.moles * R * state.temperature;
  return Math.abs(lhs - rhs) / Math.max(Math.abs(rhs), 1e-30) < tolerance;
}

/**
 * Return default physically-consistent initial values.
 *
 * Defaults: 1 mol He at STP-like conditions.
 *  P = 101 325 Pa  (1 atm)
 *  T = 298.15 K    (25 °C)
 *  n = 1 mol
 *  V = nRT/P       (≈ 0.02445 m³ ≈ 24.45 L)
 */
export function getDefaultState(): ThermodynamicState {
  const pressure = 101325;
  const temperature = 298.15;
  const moles = 1;
  const volume = (moles * R * temperature) / pressure;

  return { pressure, volume, temperature, moles };
}

/**
 * List of all state variables.
 */
export const ALL_STATE_VARIABLES: StateVariable[] = [
  'pressure',
  'volume',
  'temperature',
  'moles',
];
