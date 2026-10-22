/**
 * Public API for the physics module.
 *
 * Import everything from `@/physics` — internal module boundaries are hidden.
 */

export { R, HELIUM, AVOGADRO, BOLTZMANN } from './constants';
export type {
  StateVariable,
  ThermodynamicState,
  DerivedProperties,
  StateConfig,
  ValidationResult,
  ValidationReport,
} from './types';
export {
  resolveState,
  computeDerivedProperties,
  verifyEquationOfState,
  getDefaultState,
  ALL_STATE_VARIABLES,
} from './engine';
export { validateField, validateInputs, UNITS } from './validation';

// Simulation engine exports (Milestone 2)
export type {
  ProcessMode,
  EnvironmentConfig,
  SimulationSnapshot,
  StepResult,
  SimulationStatus,
  ConstraintValidation,
  SimulationConfig,
} from './simulation-types';
export {
  PROCESS_MODE_INFO,
  ALL_PROCESS_MODES,
  getDefaultEnvironment,
  ENERGY_TOLERANCE_RELATIVE,
  ENERGY_TOLERANCE_ABSOLUTE,
} from './simulation-types';
export { validateConstraints, normalizeEnvironment, transitionEnvironment } from './constraints';
export { Simulation } from './simulation';
