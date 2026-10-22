/**
 * Constraint Validation & Smart Process-Mode Transitions
 * =====================================================
 *
 * Validates that a process mode + environment config combination does not
 * overdetermine the thermodynamic state or violate physical principles.
 *
 * Provides intelligent process-mode transitions that adapt driving inputs
 * automatically, preserving user choices where meaningful without carrying
 * over invalid constraints from prior modes.
 *
 * Valid configurations per mode
 * ──────────────────────────────
 *  - Constant Volume (Isochoric):
 *      volumeChangeRate must be 0 (piston locked).
 *      heatingPower drives the process (can be positive, negative, or 0 for stationary).
 *
 *  - Constant Pressure (Isobaric):
 *      heatingPower drives the process.
 *      volumeChangeRate is unused as a direct driver (volume expands/contracts via EOS).
 *      No false warning is raised for an unused volumeChangeRate.
 *
 *  - Constant Temperature (Isothermal):
 *      volumeChangeRate drives expansion/compression (or 0 for stationary equilibrium).
 *      Heat transfer Q is derived as Q = W to keep T constant.
 *
 *  - Adiabatic (Reversible, Q = 0):
 *      heatingPower must be 0 (Q = 0 by definition).
 *      volumeChangeRate drives expansion/compression (or 0 for stationary equilibrium).
 *
 * @module
 */

import type { ProcessMode, EnvironmentConfig, ConstraintValidation } from './simulation-types';
import { getDefaultEnvironment } from './simulation-types';

/**
 * Validate that the chosen process mode and environment config are physically compatible.
 *
 * Warnings appear ONLY for genuinely invalid configurations, not for stationary states
 * (zero driving rate) or unused parameters.
 */
export function validateConstraints(
  mode: ProcessMode,
  env: EnvironmentConfig,
): ConstraintValidation {
  const conflicts: string[] = [];

  // Check numerical validity first
  if (
    !Number.isFinite(env.heatingPower) ||
    !Number.isFinite(env.volumeChangeRate) ||
    !Number.isFinite(env.externalPressure)
  ) {
    conflicts.push('Environment parameters must be finite numbers.');
  }

  if (env.externalPressure <= 0) {
    conflicts.push(
      `External pressure must be positive. Got ${env.externalPressure} Pa.`,
    );
  }

  switch (mode) {
    case 'constant_volume':
      // The piston is locked in place: non-zero volume rate is a physical conflict
      if (env.volumeChangeRate !== 0) {
        conflicts.push(
          'Constant-volume process: volumeChangeRate must be 0 (volume is locked). ' +
            `Got ${env.volumeChangeRate} m³/s.`,
        );
      }
      // Note: heatingPower === 0 is a valid stationary equilibrium state (no warning).
      break;

    case 'constant_pressure':
      // volumeChangeRate is not used by the isobaric model — do NOT warn about it.
      // heatingPower === 0 is a valid stationary equilibrium state (no warning).
      break;

    case 'constant_temperature':
      // volumeChangeRate === 0 is a valid stationary equilibrium state (no warning).
      // heatingPower is not a driving input (Q is computed from W) — no warning.
      break;

    case 'adiabatic':
      // By definition, an adiabatic system permits zero heat transfer across boundaries
      if (env.heatingPower !== 0) {
        conflicts.push(
          'Adiabatic process: heatingPower must be 0 (Q = 0 by definition). ' +
            `Got ${env.heatingPower} W.`,
        );
      }
      // volumeChangeRate === 0 is a valid stationary equilibrium state (no warning).
      break;
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
  };
}

/**
 * Intelligently transition environment parameters when switching process modes.
 *
 * Rules:
 *  1. Automatically update driving inputs to valid defaults for the newly selected mode.
 *  2. Do not carry over incompatible settings from the previous mode (e.g. volumeChangeRate to isochoric, heatingPower to adiabatic).
 *  3. Preserve user-entered settings where they remain valid and meaningful:
 *     - Between heat-driven modes (isochoric ↔ isobaric): preserve heatingPower.
 *     - Between volume-driven modes (isothermal ↔ adiabatic): preserve volumeChangeRate.
 *     - When switching between different driving types: set sensible, ready-to-run defaults.
 *  4. External pressure is always preserved.
 */
export function transitionEnvironment(
  newMode: ProcessMode,
  currentEnv: EnvironmentConfig,
): EnvironmentConfig {
  const defaults = getDefaultEnvironment(newMode);
  const nextEnv: EnvironmentConfig = {
    ...currentEnv,
    externalPressure: currentEnv.externalPressure > 0 ? currentEnv.externalPressure : 101325,
  };

  switch (newMode) {
    case 'constant_volume':
      // Piston is locked rigidly: volumeChangeRate must be 0
      nextEnv.volumeChangeRate = 0;
      // Preserve heating power if user had set a non-zero value; otherwise provide ready-to-run default
      nextEnv.heatingPower =
        currentEnv.heatingPower !== 0 ? currentEnv.heatingPower : defaults.heatingPower;
      break;

    case 'constant_pressure':
      // Piston volume rate is not a manual input for isobaric
      nextEnv.volumeChangeRate = 0;
      // Preserve heating power if user had set a non-zero value; otherwise provide ready-to-run default
      nextEnv.heatingPower =
        currentEnv.heatingPower !== 0 ? currentEnv.heatingPower : defaults.heatingPower;
      break;

    case 'constant_temperature':
      // Heating power is not a driver in isothermal (Q = W is derived)
      nextEnv.heatingPower = 0;
      // Preserve volume rate if user had set a non-zero value; otherwise provide ready-to-run default
      nextEnv.volumeChangeRate =
        currentEnv.volumeChangeRate !== 0
          ? currentEnv.volumeChangeRate
          : defaults.volumeChangeRate;
      break;

    case 'adiabatic':
      // Adiabatic strictly enforces Q = 0
      nextEnv.heatingPower = 0;
      // Preserve volume rate if user had set a non-zero value; otherwise provide ready-to-run default
      nextEnv.volumeChangeRate =
        currentEnv.volumeChangeRate !== 0
          ? currentEnv.volumeChangeRate
          : defaults.volumeChangeRate;
      break;
  }

  return nextEnv;
}

/**
 * Get the "effective" environment config for a given mode, clearing parameters
 * that are irrelevant or would cause conflicts during a simulation step.
 *
 * This does NOT suppress genuine errors — it resolves semantic overrides:
 *  - Adiabatic → heatingPower forced to 0
 *  - Constant volume → volumeChangeRate forced to 0
 *  - Constant temperature → heatingPower is ignored (derived)
 *  - Constant pressure → volumeChangeRate is ignored (derived)
 */
export function normalizeEnvironment(
  mode: ProcessMode,
  env: EnvironmentConfig,
): EnvironmentConfig {
  const normalized = { ...env };

  switch (mode) {
    case 'constant_volume':
      normalized.volumeChangeRate = 0;
      break;
    case 'constant_pressure':
      // volumeChangeRate is a consequence, not an input
      normalized.volumeChangeRate = 0;
      break;
    case 'constant_temperature':
      // heatingPower is a consequence, not an input
      normalized.heatingPower = 0;
      break;
    case 'adiabatic':
      normalized.heatingPower = 0;
      break;
  }

  return normalized;
}
