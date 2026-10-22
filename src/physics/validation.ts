/**
 * Input validation for thermodynamic state variables.
 *
 * Rules
 * ─────
 * 1. All values must be finite, positive numbers.
 * 2. Pressure > 0  (absolute pressure in Pa).
 * 3. Volume   > 0  (m³).
 * 4. Temperature > 0  (K — absolute zero is excluded).
 * 5. Moles    > 0.
 * 6. Upper bounds are set generously so the simulation stays numerically stable
 *    while still allowing a wide educational range.
 */

import type {
  StateVariable,
  ThermodynamicState,
  ValidationResult,
  ValidationReport,
} from './types';

/** Human-readable labels for each variable (used in error messages). */
const LABELS: Record<StateVariable, string> = {
  pressure: 'Pressure',
  volume: 'Volume',
  temperature: 'Temperature',
  moles: 'Amount of gas',
};

/** SI unit strings for each variable. */
export const UNITS: Record<StateVariable, string> = {
  pressure: 'Pa',
  volume: 'm³',
  temperature: 'K',
  moles: 'mol',
};

/** Acceptable ranges for each state variable [min, max]. */
const RANGES: Record<StateVariable, [number, number]> = {
  pressure: [1e-3, 1e12],       // 1 mPa  → 1 TPa
  volume: [1e-12, 1e6],         // 1 pm³ (pico-m³) → 1 Mm³
  temperature: [0.01, 1e8],     // 10 mK → 100 MK
  moles: [1e-12, 1e12],         // picomole → teramole
};

/**
 * Validate a single state-variable value.
 */
export function validateField(
  variable: StateVariable,
  value: unknown,
): ValidationResult {
  const label = LABELS[variable];
  const unit = UNITS[variable];
  const [min, max] = RANGES[variable];

  if (value === undefined || value === null || value === '') {
    return { valid: false, error: `${label} is required.` };
  }

  const num = typeof value === 'string' ? parseFloat(value) : Number(value);

  if (!Number.isFinite(num)) {
    return { valid: false, error: `${label} must be a finite number.` };
  }
  if (num <= 0) {
    return { valid: false, error: `${label} must be positive.` };
  }
  if (num < min) {
    return {
      valid: false,
      error: `${label} must be ≥ ${min} ${unit}.`,
    };
  }
  if (num > max) {
    return {
      valid: false,
      error: `${label} must be ≤ ${max} ${unit}.`,
    };
  }

  return { valid: true };
}

/**
 * Validate a complete set of *independent* state inputs.
 *
 * @param inputs  Partial state object with the three user-supplied values.
 * @param dependentVariable  The variable that will be calculated (not validated here).
 */
export function validateInputs(
  inputs: Partial<ThermodynamicState>,
  dependentVariable: StateVariable,
): ValidationReport {
  const allVars: StateVariable[] = ['pressure', 'volume', 'temperature', 'moles'];

  const fields = {} as Record<StateVariable, ValidationResult>;
  let allValid = true;

  for (const v of allVars) {
    if (v === dependentVariable) {
      // The dependent variable is not user-supplied — always "valid" at this stage.
      fields[v] = { valid: true };
      continue;
    }
    const result = validateField(v, inputs[v]);
    fields[v] = result;
    if (!result.valid) allValid = false;
  }

  return { valid: allValid, fields };
}
