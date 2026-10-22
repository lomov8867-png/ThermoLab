/**
 * ThermoLab — Physics Engine Tests
 * =================================
 *
 * Automated tests covering:
 *  1. Ideal-gas equation of state (PV = nRT).
 *  2. Internal energy and enthalpy calculations.
 *  3. Input validation (positive, finite, in-range).
 *  4. Consistency of derived state variables.
 *  5. Dependent-variable resolution for each of {P, V, T, n}.
 *  6. Heat-capacity and γ values.
 */

import { describe, it, expect } from 'vitest';
import {
  R,
  HELIUM,
  AVOGADRO,
  BOLTZMANN,
  resolveState,
  computeDerivedProperties,
  verifyEquationOfState,
  getDefaultState,
  validateField,
  validateInputs,
} from '../physics';
import type { StateVariable, ThermodynamicState } from '../physics';

// ─── Constants ────────────────────────────────────────────────────────────── //

describe('Physical constants', () => {
  it('R should be approximately 8.314', () => {
    expect(R).toBeCloseTo(8.314, 3);
  });

  it('Helium molar mass should be ~4e-3 kg/mol', () => {
    expect(HELIUM.molarMass).toBeCloseTo(4.002602e-3, 6);
  });

  it('Helium degrees of freedom = 3', () => {
    expect(HELIUM.degreesOfFreedom).toBe(3);
  });

  it('γ = 5/3 for monatomic ideal gas', () => {
    expect(HELIUM.gamma).toBeCloseTo(5 / 3, 10);
  });

  it('Cv = (3/2)R', () => {
    expect(HELIUM.Cv).toBeCloseTo((3 / 2) * R, 10);
  });

  it('Cp = Cv + R = (5/2)R', () => {
    expect(HELIUM.Cp).toBeCloseTo((5 / 2) * R, 10);
    expect(HELIUM.Cp).toBeCloseTo(HELIUM.Cv + R, 10);
  });

  it('kB × Nₐ ≈ R', () => {
    expect(BOLTZMANN * AVOGADRO).toBeCloseTo(R, 4);
  });
});

// ─── Equation of State ───────────────────────────────────────────────────── //

describe('Ideal-gas equation of state (PV = nRT)', () => {
  it('PV = nRT holds for the default state', () => {
    const s = getDefaultState();
    expect(s.pressure * s.volume).toBeCloseTo(s.moles * R * s.temperature, 4);
  });

  it('verifyEquationOfState returns true for a consistent state', () => {
    const s = getDefaultState();
    expect(verifyEquationOfState(s)).toBe(true);
  });

  it('verifyEquationOfState returns false for an inconsistent state', () => {
    const bad: ThermodynamicState = {
      pressure: 101325,
      volume: 1,
      temperature: 300,
      moles: 1,
    };
    // PV = 101325, nRT = 2494.34 → mismatch
    expect(verifyEquationOfState(bad)).toBe(false);
  });
});

// ─── State Resolution ────────────────────────────────────────────────────── //

describe('resolveState — dependent-variable computation', () => {
  const P = 101325;
  const T = 298.15;
  const n = 1;
  const V = (n * R * T) / P;

  it('computes pressure from {V, T, n}', () => {
    const s = resolveState({
      dependentVariable: 'pressure',
      inputs: { volume: V, temperature: T, moles: n },
    });
    expect(s.pressure).toBeCloseTo(P, 1);
    expect(verifyEquationOfState(s)).toBe(true);
  });

  it('computes volume from {P, T, n}', () => {
    const s = resolveState({
      dependentVariable: 'volume',
      inputs: { pressure: P, temperature: T, moles: n },
    });
    expect(s.volume).toBeCloseTo(V, 8);
    expect(verifyEquationOfState(s)).toBe(true);
  });

  it('computes temperature from {P, V, n}', () => {
    const s = resolveState({
      dependentVariable: 'temperature',
      inputs: { pressure: P, volume: V, moles: n },
    });
    expect(s.temperature).toBeCloseTo(T, 4);
    expect(verifyEquationOfState(s)).toBe(true);
  });

  it('computes moles from {P, V, T}', () => {
    const s = resolveState({
      dependentVariable: 'moles',
      inputs: { pressure: P, volume: V, temperature: T },
    });
    expect(s.moles).toBeCloseTo(n, 8);
    expect(verifyEquationOfState(s)).toBe(true);
  });

  it('throws on invalid inputs', () => {
    expect(() =>
      resolveState({
        dependentVariable: 'pressure',
        inputs: { volume: -1, temperature: T, moles: n },
      }),
    ).toThrow();
  });

  it('state is self-consistent for every dependent choice', () => {
    const vars: StateVariable[] = ['pressure', 'volume', 'temperature', 'moles'];
    const base: ThermodynamicState = { pressure: P, volume: V, temperature: T, moles: n };

    for (const dep of vars) {
      const inputs: Partial<ThermodynamicState> = { ...base };
      delete inputs[dep];

      const s = resolveState({ dependentVariable: dep, inputs });
      expect(verifyEquationOfState(s)).toBe(true);
      expect(s[dep]).toBeCloseTo(base[dep], 4);
    }
  });
});

// ─── Derived Properties ──────────────────────────────────────────────────── //

describe('Derived thermodynamic properties', () => {
  const state = getDefaultState();
  const derived = computeDerivedProperties(state);

  it('U = (3/2)nRT', () => {
    const expected = (3 / 2) * state.moles * R * state.temperature;
    expect(derived.internalEnergy).toBeCloseTo(expected, 4);
  });

  it('H = (5/2)nRT', () => {
    const expected = (5 / 2) * state.moles * R * state.temperature;
    expect(derived.enthalpy).toBeCloseTo(expected, 4);
  });

  it('H = U + PV', () => {
    const upv = derived.internalEnergy + state.pressure * state.volume;
    expect(derived.enthalpy).toBeCloseTo(upv, 4);
  });

  it('Cv = (3/2)R', () => {
    expect(derived.Cv).toBeCloseTo((3 / 2) * R, 10);
  });

  it('Cp = (5/2)R', () => {
    expect(derived.Cp).toBeCloseTo((5 / 2) * R, 10);
  });

  it('γ = 5/3', () => {
    expect(derived.gamma).toBeCloseTo(5 / 3, 10);
  });

  it('Cp - Cv = R (Mayer relation)', () => {
    expect(derived.Cp - derived.Cv).toBeCloseTo(R, 10);
  });

  it('density = nM/V', () => {
    const expected = (state.moles * HELIUM.molarMass) / state.volume;
    expect(derived.density).toBeCloseTo(expected, 6);
  });

  it('specificVolume × density ≈ 1', () => {
    expect(derived.specificVolume * derived.density).toBeCloseTo(1, 8);
  });

  it('particleCount = n × Nₐ', () => {
    expect(derived.particleCount).toBeCloseTo(state.moles * AVOGADRO, 10);
  });

  it('average KE = (3/2)kBT', () => {
    const expected = (3 / 2) * BOLTZMANN * state.temperature;
    expect(derived.averageKineticEnergy).toBeCloseTo(expected, 25);
  });

  it('rmsSpeed = √(3RT/M)', () => {
    const expected = Math.sqrt(
      (3 * R * state.temperature) / HELIUM.molarMass,
    );
    expect(derived.rmsSpeed).toBeCloseTo(expected, 2);
  });
});

// ─── Input Validation ────────────────────────────────────────────────────── //

describe('Input validation', () => {
  it('rejects negative values', () => {
    expect(validateField('pressure', -100).valid).toBe(false);
    expect(validateField('volume', -0.01).valid).toBe(false);
    expect(validateField('temperature', -273).valid).toBe(false);
    expect(validateField('moles', -1).valid).toBe(false);
  });

  it('rejects zero values', () => {
    expect(validateField('pressure', 0).valid).toBe(false);
    expect(validateField('volume', 0).valid).toBe(false);
    expect(validateField('temperature', 0).valid).toBe(false);
    expect(validateField('moles', 0).valid).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(validateField('pressure', Infinity).valid).toBe(false);
    expect(validateField('volume', NaN).valid).toBe(false);
    expect(validateField('temperature', -Infinity).valid).toBe(false);
  });

  it('rejects empty / null / undefined', () => {
    expect(validateField('pressure', '').valid).toBe(false);
    expect(validateField('volume', null).valid).toBe(false);
    expect(validateField('temperature', undefined).valid).toBe(false);
  });

  it('accepts valid values', () => {
    expect(validateField('pressure', 101325).valid).toBe(true);
    expect(validateField('volume', 0.025).valid).toBe(true);
    expect(validateField('temperature', 300).valid).toBe(true);
    expect(validateField('moles', 1).valid).toBe(true);
  });

  it('rejects values outside allowed ranges', () => {
    expect(validateField('pressure', 1e-4).valid).toBe(false); // below 1e-3
    expect(validateField('pressure', 1e13).valid).toBe(false); // above 1e12
    expect(validateField('temperature', 0.001).valid).toBe(false); // below 0.01
  });

  it('validateInputs marks dependent variable as valid', () => {
    const report = validateInputs(
      { pressure: 101325, temperature: 300, moles: 1 },
      'volume',
    );
    expect(report.fields.volume.valid).toBe(true);
    expect(report.valid).toBe(true);
  });

  it('validateInputs detects missing independent variables', () => {
    const report = validateInputs(
      { pressure: 101325, temperature: 300 },
      'volume',
    );
    // moles is missing
    expect(report.fields.moles.valid).toBe(false);
    expect(report.valid).toBe(false);
  });
});

// ─── Default State ───────────────────────────────────────────────────────── //

describe('Default state', () => {
  const s = getDefaultState();

  it('has positive values for all variables', () => {
    expect(s.pressure).toBeGreaterThan(0);
    expect(s.volume).toBeGreaterThan(0);
    expect(s.temperature).toBeGreaterThan(0);
    expect(s.moles).toBeGreaterThan(0);
  });

  it('satisfies PV = nRT', () => {
    expect(verifyEquationOfState(s)).toBe(true);
  });

  it('defaults to 1 mol at ~STP', () => {
    expect(s.moles).toBe(1);
    expect(s.pressure).toBe(101325);
    expect(s.temperature).toBe(298.15);
  });
});
