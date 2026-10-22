/**
 * Core type definitions for the thermodynamic state engine.
 *
 * Design philosophy:
 *  - Every quantity carries its SI unit in the type name or JSDoc.
 *  - The `ThermodynamicState` is always a fully-resolved equilibrium snapshot.
 *  - The `IndependentVariable` enum makes it explicit which three variables the
 *    user has chosen; the fourth is computed.
 */

/** The four primary state variables the user can supply. */
export type StateVariable = 'pressure' | 'volume' | 'temperature' | 'moles';

/**
 * A fully-resolved equilibrium state for an ideal monatomic gas.
 *
 * All fields are in SI units.
 */
export interface ThermodynamicState {
  /** Absolute pressure [Pa] */
  pressure: number;

  /** Volume [m³] */
  volume: number;

  /** Absolute temperature [K] */
  temperature: number;

  /** Amount of substance [mol] */
  moles: number;
}

/**
 * Derived (extensive & intensive) thermodynamic properties.
 *
 * These are computed from a valid `ThermodynamicState` and are read-only.
 */
export interface DerivedProperties {
  /** Internal energy U = (3/2)nRT [J] */
  internalEnergy: number;

  /** Enthalpy H = U + PV = (5/2)nRT [J] */
  enthalpy: number;

  /** Molar heat capacity at constant volume Cv = (3/2)R [J/(mol·K)] */
  Cv: number;

  /** Molar heat capacity at constant pressure Cp = (5/2)R [J/(mol·K)] */
  Cp: number;

  /** Ratio of specific heats γ = Cp / Cv */
  gamma: number;

  /** Density ρ = nM/V [kg/m³] */
  density: number;

  /** Specific volume v = V/(nM) [m³/kg] */
  specificVolume: number;

  /** Number of particles N = n × Nₐ */
  particleCount: number;

  /** Average kinetic energy per particle ε = (3/2)kBT [J] */
  averageKineticEnergy: number;

  /** RMS speed of particles v_rms = √(3RT/M) [m/s] */
  rmsSpeed: number;
}

/**
 * Configuration describing which variable is the dependent (calculated) one.
 */
export interface StateConfig {
  /** Which variable to compute from the other three */
  dependentVariable: StateVariable;

  /** The three user-supplied values (keyed by variable name). */
  inputs: Partial<ThermodynamicState>;
}

/**
 * Validation result for a single input field.
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Complete validation report for all inputs.
 */
export interface ValidationReport {
  valid: boolean;
  fields: Record<StateVariable, ValidationResult>;
}
