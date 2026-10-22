/**
 * useThermodynamicState — React hook wrapping the physics engine.
 *
 * Manages user inputs, dependent-variable selection, and derived properties.
 */

import { useState, useMemo, useCallback } from 'react';
import {
  resolveState,
  computeDerivedProperties,
  getDefaultState,
  verifyEquationOfState,
  validateInputs,
} from '../physics';
import type {
  StateVariable,
  ThermodynamicState,
  DerivedProperties,
  ValidationReport,
} from '../physics';

export interface ThermodynamicHookResult {
  /** Raw input strings (what the user types). */
  rawInputs: Record<StateVariable, string>;

  /** Which variable is computed. */
  dependentVariable: StateVariable;

  /** Resolved equilibrium state (null if inputs are invalid). */
  state: ThermodynamicState | null;

  /** Derived properties (null if state is null). */
  derived: DerivedProperties | null;

  /** Whether PV = nRT holds for the current state. */
  eosValid: boolean;

  /** Per-field validation report. */
  validation: ValidationReport;

  /** Error message from the engine (if any). */
  error: string | null;

  /** Update a single input field. */
  setInput: (variable: StateVariable, value: string) => void;

  /** Change which variable is the dependent one. */
  setDependentVariable: (variable: StateVariable) => void;

  /** Reset everything to defaults. */
  reset: () => void;
}

function stateToStrings(s: ThermodynamicState): Record<StateVariable, string> {
  return {
    pressure: s.pressure.toString(),
    volume: s.volume.toString(),
    temperature: s.temperature.toString(),
    moles: s.moles.toString(),
  };
}

export function useThermodynamicState(): ThermodynamicHookResult {
  const defaults = getDefaultState();

  const [rawInputs, setRawInputs] = useState<Record<StateVariable, string>>(
    () => stateToStrings(defaults),
  );

  const [dependentVariable, setDependentVariable] =
    useState<StateVariable>('volume');

  const setInput = useCallback(
    (variable: StateVariable, value: string) => {
      setRawInputs((prev) => ({ ...prev, [variable]: value }));
    },
    [],
  );

  const reset = useCallback(() => {
    const d = getDefaultState();
    setRawInputs(stateToStrings(d));
    setDependentVariable('volume');
  }, []);

  // Parse raw strings into numbers for the physics engine.
  const numericInputs = useMemo(() => {
    const result: Partial<ThermodynamicState> = {};
    const vars: StateVariable[] = ['pressure', 'volume', 'temperature', 'moles'];
    for (const v of vars) {
      if (v === dependentVariable) continue;
      const parsed = parseFloat(rawInputs[v]);
      if (Number.isFinite(parsed)) {
        result[v] = parsed;
      }
    }
    return result;
  }, [rawInputs, dependentVariable]);

  const validation = useMemo(
    () => validateInputs(numericInputs, dependentVariable),
    [numericInputs, dependentVariable],
  );

  const { state, derived, eosValid, error } = useMemo(() => {
    if (!validation.valid) {
      return { state: null, derived: null, eosValid: false, error: null };
    }

    try {
      const s = resolveState({ dependentVariable, inputs: numericInputs });
      const d = computeDerivedProperties(s);
      const eos = verifyEquationOfState(s);
      return { state: s, derived: d, eosValid: eos, error: null };
    } catch (err) {
      return {
        state: null,
        derived: null,
        eosValid: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [validation, dependentVariable, numericInputs]);

  return {
    rawInputs,
    dependentVariable,
    state,
    derived,
    eosValid,
    validation,
    error,
    setInput,
    setDependentVariable,
    reset,
  };
}
