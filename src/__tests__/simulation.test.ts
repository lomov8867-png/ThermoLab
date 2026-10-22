/**
 * ThermoLab — Milestone 2: Thermodynamic Simulation Engine Tests
 * ==============================================================
 *
 * Automated tests covering:
 *  1. Every supported process mode:
 *     - Constant Volume (Isochoric)
 *     - Constant Pressure (Isobaric)
 *     - Constant Temperature (Isothermal)
 *     - Adiabatic (Q = 0, reversible)
 *  2. Conservation of energy (First Law: ΔU = Q − W).
 *  3. Ideal-gas equation of state (PV = nRT) at every step.
 *  4. Reversibility and consistency (forward + reverse process returns to start).
 *  5. Invalid and contradictory constraints / conflict detection.
 *  6. Numerical stability for extreme / small / large valid parameters.
 *  7. Correct pause, resume, single-step, and reset behaviour.
 *  8. Determinism: identical initial conditions yield identical results.
 *  9. Comparison of numerical results against analytical ideal-gas formulas.
 */

import { describe, it, expect } from 'vitest';
import {
  R,
  HELIUM,
  Simulation,
  getDefaultState,
  verifyEquationOfState,
  validateConstraints,
  normalizeEnvironment,
  transitionEnvironment,
  getDefaultEnvironment,
} from '../physics';
import type {
  ThermodynamicState,
  ProcessMode,
  EnvironmentConfig,
  SimulationConfig,
} from '../physics';

function createTestConfig(
  processMode: ProcessMode,
  overrides?: {
    initialState?: Partial<ThermodynamicState>;
    environment?: Partial<EnvironmentConfig>;
    dt?: number;
  },
): SimulationConfig {
  const defaultState = getDefaultState(); // P=101325, T=298.15, n=1, V=nRT/P
  const defaultEnv = getDefaultEnvironment();
  return {
    initialState: { ...defaultState, ...overrides?.initialState },
    processMode,
    environment: { ...defaultEnv, ...overrides?.environment },
    dt: overrides?.dt ?? 0.05,
    speedMultiplier: 1,
  };
}

// ─── 1. Constant Volume (Isochoric) ───────────────────────────────────────── //

describe('Process Mode: Constant Volume (Isochoric)', () => {
  it('advances temperature and pressure analytically under heating', () => {
    const P0 = 101325;
    const T0 = 300;
    const n = 1;
    const V0 = (n * R * T0) / P0;
    const heatingPower = 500; // 500 W
    const dt = 0.1; // 0.1 s
    const steps = 50; // total t = 5.0 s

    const sim = new Simulation({
      initialState: { pressure: P0, volume: V0, temperature: T0, moles: n },
      processMode: 'constant_volume',
      environment: { heatingPower, volumeChangeRate: 0, externalPressure: P0 },
      dt,
      speedMultiplier: 1,
    });

    for (let i = 0; i < steps; i++) {
      const res = sim.step();
      expect(res.snapshot.energyBalanceValid).toBe(true);
      expect(res.snapshot.state.volume).toBe(V0); // Volume strictly unchanged
      expect(verifyEquationOfState(res.snapshot.state)).toBe(true);
    }

    const totalTime = dt * steps;
    const expectedQ = heatingPower * totalTime;
    const expectedDeltaT = expectedQ / (n * HELIUM.Cv);
    const expectedT = T0 + expectedDeltaT;
    const expectedP = (n * R * expectedT) / V0;

    const snap = sim.snapshot;
    expect(snap.time).toBeCloseTo(totalTime, 8);
    expect(snap.totalW).toBe(0); // No work in constant volume
    expect(snap.totalQ).toBeCloseTo(expectedQ, 8);
    expect(snap.totalDeltaU).toBeCloseTo(expectedQ, 8);
    expect(snap.state.temperature).toBeCloseTo(expectedT, 8);
    expect(snap.state.pressure).toBeCloseTo(expectedP, 8);
  });

  it('handles cooling (negative heating power) correctly', () => {
    const sim = new Simulation(
      createTestConfig('constant_volume', {
        environment: { heatingPower: -200, volumeChangeRate: 0 },
        dt: 0.1,
      }),
    );

    const initT = sim.snapshot.state.temperature;
    const res = sim.step();

    expect(res.snapshot.state.temperature).toBeLessThan(initT);
    expect(res.snapshot.totalQ).toBeLessThan(0);
    expect(res.snapshot.totalDeltaU).toBeLessThan(0);
    expect(res.snapshot.totalW).toBe(0);
    expect(res.snapshot.energyBalanceValid).toBe(true);
  });

  it('throws an error if cooling would lead to non-physical T <= 0', () => {
    const sim = new Simulation(
      createTestConfig('constant_volume', {
        initialState: { temperature: 5 }, // 5 K
        environment: { heatingPower: -100000, volumeChangeRate: 0 }, // massive cooling
        dt: 1.0,
      }),
    );

    expect(() => sim.step()).toThrow(/non-physical/i);
  });
});

// ─── 2. Constant Pressure (Isobaric) ──────────────────────────────────────── //

describe('Process Mode: Constant Pressure (Isobaric)', () => {
  it('expands volume and increases temperature at constant pressure', () => {
    const P0 = 101325;
    const T0 = 300;
    const n = 1;
    const V0 = (n * R * T0) / P0;
    const heatingPower = 800; // 800 W
    const dt = 0.05;
    const steps = 40; // t = 2.0 s

    const sim = new Simulation({
      initialState: { pressure: P0, volume: V0, temperature: T0, moles: n },
      processMode: 'constant_pressure',
      environment: { heatingPower, volumeChangeRate: 0, externalPressure: P0 },
      dt,
      speedMultiplier: 1,
    });

    for (let i = 0; i < steps; i++) {
      const res = sim.step();
      expect(res.snapshot.energyBalanceValid).toBe(true);
      expect(res.snapshot.state.pressure).toBe(P0); // Pressure strictly unchanged
      expect(verifyEquationOfState(res.snapshot.state)).toBe(true);
    }

    const totalTime = dt * steps;
    const expectedQ = heatingPower * totalTime;
    const expectedDeltaT = expectedQ / (n * HELIUM.Cp);
    const expectedT = T0 + expectedDeltaT;
    const expectedV = (n * R * expectedT) / P0;
    const expectedW = P0 * (expectedV - V0);
    const expectedDeltaU = n * HELIUM.Cv * expectedDeltaT;

    const snap = sim.snapshot;
    expect(snap.totalQ).toBeCloseTo(expectedQ, 7);
    expect(snap.state.temperature).toBeCloseTo(expectedT, 7);
    expect(snap.state.volume).toBeCloseTo(expectedV, 7);
    expect(snap.totalW).toBeCloseTo(expectedW, 7);
    expect(snap.totalDeltaU).toBeCloseTo(expectedDeltaU, 7);

    // First law verification: ΔU = Q - W
    expect(snap.totalDeltaU).toBeCloseTo(snap.totalQ - snap.totalW, 8);
  });
});

// ─── 3. Constant Temperature (Isothermal) ─────────────────────────────────── //

describe('Process Mode: Constant Temperature (Isothermal)', () => {
  it('calculates exact logarithmic work and heat transfer for expansion', () => {
    const P0 = 101325;
    const T0 = 300;
    const n = 1;
    const V0 = (n * R * T0) / P0;
    const volumeChangeRate = 2e-4; // 0.2 L/s
    const dt = 0.1;
    const steps = 30;

    const sim = new Simulation({
      initialState: { pressure: P0, volume: V0, temperature: T0, moles: n },
      processMode: 'constant_temperature',
      environment: { heatingPower: 0, volumeChangeRate, externalPressure: P0 },
      dt,
      speedMultiplier: 1,
    });

    for (let i = 0; i < steps; i++) {
      const res = sim.step();
      expect(res.snapshot.energyBalanceValid).toBe(true);
      expect(res.snapshot.state.temperature).toBe(T0); // T strictly unchanged
      expect(res.snapshot.stepDeltaU).toBe(0); // ΔU = 0 for isothermal ideal gas
      expect(verifyEquationOfState(res.snapshot.state)).toBe(true);
    }

    const totalDeltaV = volumeChangeRate * dt * steps;
    const finalV = V0 + totalDeltaV;
    const analyticalWork = n * R * T0 * Math.log(finalV / V0);

    const snap = sim.snapshot;
    expect(snap.state.volume).toBeCloseTo(finalV, 8);
    expect(snap.totalDeltaU).toBe(0);
    expect(snap.totalW).toBeCloseTo(analyticalWork, 6);
    expect(snap.totalQ).toBeCloseTo(snap.totalW, 6); // Q = W
  });

  it('calculates negative work (compression) and heat rejection for compression', () => {
    const sim = new Simulation(
      createTestConfig('constant_temperature', {
        environment: { volumeChangeRate: -1e-4 },
        dt: 0.1,
      }),
    );

    const res = sim.step();
    expect(res.snapshot.state.volume).toBeLessThan(sim.configuration.initialState.volume);
    expect(res.snapshot.totalW).toBeLessThan(0); // Work done ON gas
    expect(res.snapshot.totalQ).toBeLessThan(0); // Heat rejected
    expect(res.snapshot.totalDeltaU).toBe(0);
    expect(res.snapshot.energyBalanceValid).toBe(true);
  });
});

// ─── 4. Adiabatic (Q = 0, Reversible) ─────────────────────────────────────── //

describe('Process Mode: Adiabatic (Q = 0, Reversible)', () => {
  it('satisfies T·V^(γ-1) = const and ΔU = -W during expansion', () => {
    const P0 = 101325;
    const T0 = 350;
    const n = 1;
    const V0 = (n * R * T0) / P0;
    const volumeChangeRate = 5e-4; // 0.5 L/s
    const dt = 0.05;
    const steps = 40;

    const sim = new Simulation({
      initialState: { pressure: P0, volume: V0, temperature: T0, moles: n },
      processMode: 'adiabatic',
      environment: { heatingPower: 0, volumeChangeRate, externalPressure: P0 },
      dt,
      speedMultiplier: 1,
    });

    const gamma = HELIUM.gamma;
    const initialInvariant = T0 * Math.pow(V0, gamma - 1);

    for (let i = 0; i < steps; i++) {
      const res = sim.step();
      expect(res.snapshot.stepQ).toBe(0); // Q = 0 strictly
      expect(res.snapshot.energyBalanceValid).toBe(true);
      expect(verifyEquationOfState(res.snapshot.state)).toBe(true);

      // Check adiabatic invariant at each step: T * V^(γ-1) = const
      const currentInvariant =
        res.snapshot.state.temperature *
        Math.pow(res.snapshot.state.volume, gamma - 1);
      expect(currentInvariant).toBeCloseTo(initialInvariant, 6);
    }

    const snap = sim.snapshot;
    expect(snap.totalQ).toBe(0);
    expect(snap.state.temperature).toBeLessThan(T0); // Expands and cools
    expect(snap.state.pressure).toBeLessThan(P0); // Expands and drops pressure
    expect(snap.totalW).toBeGreaterThan(0); // Positive work done
    expect(snap.totalDeltaU).toBeCloseTo(-snap.totalW, 8); // ΔU = -W
  });

  it('heats up under adiabatic compression', () => {
    const P0 = 101325;
    const T0 = 300;
    const n = 1;
    const V0 = (n * R * T0) / P0;

    const sim = new Simulation({
      initialState: { pressure: P0, volume: V0, temperature: T0, moles: n },
      processMode: 'adiabatic',
      environment: { heatingPower: 0, volumeChangeRate: -3e-4, externalPressure: P0 },
      dt: 0.1,
      speedMultiplier: 1,
    });

    const res = sim.step();
    expect(res.snapshot.state.temperature).toBeGreaterThan(T0);
    expect(res.snapshot.state.pressure).toBeGreaterThan(P0);
    expect(res.snapshot.totalW).toBeLessThan(0);
    expect(res.snapshot.totalDeltaU).toBeGreaterThan(0);
    expect(res.snapshot.totalQ).toBe(0);
    expect(res.snapshot.energyBalanceValid).toBe(true);
  });
});

// ─── 5. Reversibility and Consistency ────────────────────────────────────── //

describe('Reversibility and Consistency', () => {
  it('returns to original state after adiabatic expansion followed by compression', () => {
    const P0 = 101325;
    const T0 = 300;
    const n = 1;
    const V0 = (n * R * T0) / P0;
    const rate = 4e-4;
    const dt = 0.05;
    const steps = 30;

    const sim = new Simulation({
      initialState: { pressure: P0, volume: V0, temperature: T0, moles: n },
      processMode: 'adiabatic',
      environment: { heatingPower: 0, volumeChangeRate: rate, externalPressure: P0 },
      dt,
      speedMultiplier: 1,
    });

    // Expand
    for (let i = 0; i < steps; i++) {
      sim.step();
    }

    // Now reverse the volume rate: compress by same amount
    sim.updateEnvironment({ volumeChangeRate: -rate });
    for (let i = 0; i < steps; i++) {
      sim.step();
    }

    const finalSnap = sim.snapshot;
    // Volume should be identical to initial
    expect(finalSnap.state.volume).toBeCloseTo(V0, 7);
    // Temperature should be identical to initial
    expect(finalSnap.state.temperature).toBeCloseTo(T0, 6);
    // Pressure should be identical to initial
    expect(finalSnap.state.pressure).toBeCloseTo(P0, 5);
    // Net work should be near zero (expansion work cancelled by compression work)
    expect(finalSnap.totalW).toBeCloseTo(0, 5);
    expect(finalSnap.totalDeltaU).toBeCloseTo(0, 5);
  });

  it('returns to original state after isothermal expansion followed by compression', () => {
    const P0 = 101325;
    const T0 = 300;
    const n = 1;
    const V0 = (n * R * T0) / P0;
    const rate = 3e-4;
    const dt = 0.05;
    const steps = 25;

    const sim = new Simulation({
      initialState: { pressure: P0, volume: V0, temperature: T0, moles: n },
      processMode: 'constant_temperature',
      environment: { heatingPower: 0, volumeChangeRate: rate, externalPressure: P0 },
      dt,
      speedMultiplier: 1,
    });

    for (let i = 0; i < steps; i++) {
      sim.step();
    }

    sim.updateEnvironment({ volumeChangeRate: -rate });
    for (let i = 0; i < steps; i++) {
      sim.step();
    }

    const finalSnap = sim.snapshot;
    expect(finalSnap.state.volume).toBeCloseTo(V0, 8);
    expect(finalSnap.state.pressure).toBeCloseTo(P0, 6);
    expect(finalSnap.totalW).toBeCloseTo(0, 6);
    expect(finalSnap.totalQ).toBeCloseTo(0, 6);
  });
});

// ─── 6. Conservation of Energy Across All Modes ───────────────────────────── //

describe('Conservation of Energy (First Law)', () => {
  const modes: ProcessMode[] = [
    'constant_volume',
    'constant_pressure',
    'constant_temperature',
    'adiabatic',
  ];

  for (const mode of modes) {
    it(`conserves energy ΔU = Q − W for mode: ${mode}`, () => {
      const sim = new Simulation(createTestConfig(mode, { dt: 0.05 }));

      for (let i = 0; i < 20; i++) {
        const step = sim.step();
        expect(step.snapshot.energyBalanceValid).toBe(true);
        expect(step.energyResidual).toBeLessThan(1e-9);
      }

      const snap = sim.snapshot;
      const cumulativeResidual = Math.abs(snap.totalDeltaU - (snap.totalQ - snap.totalW));
      expect(cumulativeResidual).toBeLessThan(1e-8);
    });
  }
});

// ─── 7. Constraints and Conflict Validation ───────────────────────────────── //

describe('Constraints and Conflict Validation', () => {
  it('detects conflict for constant_volume with non-zero volumeChangeRate', () => {
    const val = validateConstraints('constant_volume', {
      heatingPower: 500,
      volumeChangeRate: 0.01,
      externalPressure: 101325,
    });
    expect(val.valid).toBe(false);
    expect(val.conflicts.some((c) => c.includes('volumeChangeRate must be 0'))).toBe(true);
  });

  it('detects conflict for adiabatic with non-zero heatingPower', () => {
    const val = validateConstraints('adiabatic', {
      heatingPower: 200,
      volumeChangeRate: 0.01,
      externalPressure: 101325,
    });
    expect(val.valid).toBe(false);
    expect(val.conflicts.some((c) => c.includes('heatingPower must be 0'))).toBe(true);
  });

  it('allows stationary states without warnings (zero volume rate / heating power)', () => {
    // Isochoric with zero heating power (stationary)
    const valIso = validateConstraints('constant_volume', {
      heatingPower: 0,
      volumeChangeRate: 0,
      externalPressure: 101325,
    });
    expect(valIso.valid).toBe(true);
    expect(valIso.conflicts).toHaveLength(0);

    // Isothermal with zero volume rate (stationary)
    const valIsoT = validateConstraints('constant_temperature', {
      heatingPower: 0,
      volumeChangeRate: 0,
      externalPressure: 101325,
    });
    expect(valIsoT.valid).toBe(true);
    expect(valIsoT.conflicts).toHaveLength(0);

    // Adiabatic with zero volume rate (stationary)
    const valAdia = validateConstraints('adiabatic', {
      heatingPower: 0,
      volumeChangeRate: 0,
      externalPressure: 101325,
    });
    expect(valAdia.valid).toBe(true);
    expect(valAdia.conflicts).toHaveLength(0);
  });

  it('does not warn about an unused volume-rate input in isobaric mode', () => {
    const valIsobaric = validateConstraints('constant_pressure', {
      heatingPower: 500,
      volumeChangeRate: 0.001, // unused input
      externalPressure: 101325,
    });
    expect(valIsobaric.valid).toBe(true);
    expect(valIsobaric.conflicts).toHaveLength(0);
  });

  it('detects non-positive external pressure', () => {
    const val = validateConstraints('constant_pressure', {
      heatingPower: 500,
      volumeChangeRate: 0,
      externalPressure: -100,
    });
    expect(val.valid).toBe(false);
    expect(val.conflicts.some((c) => c.includes('External pressure must be positive'))).toBe(true);
  });

  it('normalizes irrelevant parameters correctly', () => {
    const normAdiabatic = normalizeEnvironment('adiabatic', {
      heatingPower: 500,
      volumeChangeRate: 0.01,
      externalPressure: 101325,
    });
    expect(normAdiabatic.heatingPower).toBe(0);

    const normVolume = normalizeEnvironment('constant_volume', {
      heatingPower: 500,
      volumeChangeRate: 0.01,
      externalPressure: 101325,
    });
    expect(normVolume.volumeChangeRate).toBe(0);
  });
});

// ─── 8. Numerical Stability for Large & Small Valid Parameters ─────────────── //

describe('Numerical Stability', () => {
  it('handles very small dt stably', () => {
    const sim = new Simulation(
      createTestConfig('constant_pressure', { dt: 1e-4 }),
    );
    for (let i = 0; i < 50; i++) {
      const res = sim.step();
      expect(res.snapshot.energyBalanceValid).toBe(true);
      expect(Number.isFinite(res.snapshot.state.temperature)).toBe(true);
    }
  });

  it('handles small mole amounts stably (e.g. 1 mmol)', () => {
    const sim = new Simulation(
      createTestConfig('constant_volume', {
        initialState: { moles: 1e-3, temperature: 300, volume: 1e-4 },
        environment: { heatingPower: 1, volumeChangeRate: 0 },
        dt: 0.01,
      }),
    );
    for (let i = 0; i < 20; i++) {
      const res = sim.step();
      expect(res.snapshot.energyBalanceValid).toBe(true);
      expect(verifyEquationOfState(res.snapshot.state)).toBe(true);
    }
  });

  it('handles high temperature and pressure stably', () => {
    const sim = new Simulation(
      createTestConfig('constant_volume', {
        initialState: {
          pressure: 5e6, // 5 MPa
          temperature: 2000, // 2000 K
          moles: 2,
          volume: (2 * R * 2000) / 5e6,
        },
        environment: { heatingPower: 50000, volumeChangeRate: 0 },
        dt: 0.02,
      }),
    );
    for (let i = 0; i < 20; i++) {
      const res = sim.step();
      expect(res.snapshot.energyBalanceValid).toBe(true);
      expect(verifyEquationOfState(res.snapshot.state)).toBe(true);
    }
  });
});

// ─── 9. Pause, Resume, Reset, and Determinism ──────────────────────────────── //

describe('Simulation Lifecycle and Determinism', () => {
  it('produces identical states when given identical initial conditions (determinism)', () => {
    const config1 = createTestConfig('adiabatic', { dt: 0.05 });
    const config2 = createTestConfig('adiabatic', { dt: 0.05 });

    const sim1 = new Simulation(config1);
    const sim2 = new Simulation(config2);

    for (let i = 0; i < 30; i++) {
      sim1.step();
      sim2.step();
    }

    expect(sim1.snapshot.time).toBe(sim2.snapshot.time);
    expect(sim1.snapshot.state.pressure).toBe(sim2.snapshot.state.pressure);
    expect(sim1.snapshot.state.volume).toBe(sim2.snapshot.state.volume);
    expect(sim1.snapshot.state.temperature).toBe(sim2.snapshot.state.temperature);
    expect(sim1.snapshot.totalW).toBe(sim2.snapshot.totalW);
  });

  it('pausing and resuming does not introduce jumps', () => {
    const sim = new Simulation(createTestConfig('constant_volume', { dt: 0.05 }));

    // Run 10 steps
    for (let i = 0; i < 10; i++) sim.step();
    const pausedSnapshot = sim.snapshot;

    // Simulate pause (idle, no stepping)
    expect(sim.snapshot).toEqual(pausedSnapshot);

    // Resume (step 10 more)
    for (let i = 0; i < 10; i++) sim.step();
    expect(sim.snapshot.time).toBeCloseTo(20 * 0.05, 8);
    expect(sim.stepCount).toBe(20);
  });

  it('resets cleanly back to t = 0 with initial state and zeroed energy', () => {
    const sim = new Simulation(createTestConfig('constant_pressure', { dt: 0.1 }));
    for (let i = 0; i < 20; i++) sim.step();

    expect(sim.snapshot.time).toBeGreaterThan(0);
    expect(sim.snapshot.totalQ).toBeGreaterThan(0);

    sim.reset();

    const snap = sim.snapshot;
    expect(snap.time).toBe(0);
    expect(snap.totalQ).toBe(0);
    expect(snap.totalW).toBe(0);
    expect(snap.totalDeltaU).toBe(0);
    expect(sim.stepCount === 0).toBe(true);
    expect(snap.state.temperature).toBe(sim.configuration.initialState.temperature);
  });

  it('resets with a new state properly', () => {
    const sim = new Simulation(createTestConfig('constant_volume'));
    const newState: ThermodynamicState = {
      pressure: 200000,
      volume: 0.05,
      temperature: 500,
      moles: 2.4,
    };

    sim.resetWithState(newState);

    expect(sim.snapshot.time).toBe(0);
    expect(sim.snapshot.state.temperature).toBe(500);
    expect(sim.snapshot.state.moles).toBe(2.4);
    expect(sim.snapshot.totalQ).toBe(0);
  });
});

// ─── 10. Milestone 2.1: Smart Process-Mode Transitions & Defaults ─────────── //

describe('Milestone 2.1: Smart Process-Mode Transitions & Defaults', () => {
  it('switching from adiabatic to isochoric automatically sets volumeChangeRate = 0', () => {
    const adiabaticEnv: EnvironmentConfig = {
      heatingPower: 0,
      volumeChangeRate: 2e-4, // 0.2 L/s expansion
      externalPressure: 101325,
    };

    const isochoricEnv = transitionEnvironment('constant_volume', adiabaticEnv);
    expect(isochoricEnv.volumeChangeRate).toBe(0);
    expect(isochoricEnv.heatingPower).toBeGreaterThan(0); // ready-to-run default
    expect(isochoricEnv.externalPressure).toBe(101325);

    // Validation passes with zero conflicts
    const val = validateConstraints('constant_volume', isochoricEnv);
    expect(val.valid).toBe(true);
    expect(val.conflicts).toHaveLength(0);
  });

  it('switching from isothermal to isochoric does not produce a false constraint warning', () => {
    const isothermalEnv: EnvironmentConfig = {
      heatingPower: 0,
      volumeChangeRate: 1.5e-4,
      externalPressure: 101325,
    };

    const isochoricEnv = transitionEnvironment('constant_volume', isothermalEnv);
    const val = validateConstraints('constant_volume', isochoricEnv);
    expect(val.valid).toBe(true);
    expect(val.conflicts).toHaveLength(0);
    expect(isochoricEnv.volumeChangeRate).toBe(0);
  });

  it('isobaric mode does not warn about an unused volume-rate input', () => {
    const env: EnvironmentConfig = {
      heatingPower: 600,
      volumeChangeRate: 5e-4, // carried over or unused
      externalPressure: 101325,
    };

    const val = validateConstraints('constant_pressure', env);
    expect(val.valid).toBe(true);
    expect(val.conflicts).toHaveLength(0);
  });

  it('isothermal mode can remain stationary with zero volume rate without warning', () => {
    const env: EnvironmentConfig = {
      heatingPower: 0,
      volumeChangeRate: 0, // stationary state
      externalPressure: 101325,
    };

    const val = validateConstraints('constant_temperature', env);
    expect(val.valid).toBe(true);
    expect(val.conflicts).toHaveLength(0);

    // Stepping simulation in stationary isothermal state
    const sim = new Simulation({
      initialState: getDefaultState(),
      processMode: 'constant_temperature',
      environment: env,
      dt: 0.1,
      speedMultiplier: 1,
    });

    const initT = sim.snapshot.state.temperature;
    const initV = sim.snapshot.state.volume;
    const initP = sim.snapshot.state.pressure;

    const res = sim.step();
    expect(res.snapshot.state.temperature).toBe(initT);
    expect(res.snapshot.state.volume).toBe(initV);
    expect(res.snapshot.state.pressure).toBe(initP);
    expect(res.snapshot.stepW).toBe(0);
    expect(res.snapshot.stepQ).toBe(0);
    expect(res.snapshot.stepDeltaU).toBe(0);
    expect(res.snapshot.energyBalanceValid).toBe(true);
    expect(verifyEquationOfState(res.snapshot.state)).toBe(true);
  });

  it('adiabatic mode can remain stationary with zero volume rate without warning', () => {
    const env: EnvironmentConfig = {
      heatingPower: 0,
      volumeChangeRate: 0, // stationary state
      externalPressure: 101325,
    };

    const val = validateConstraints('adiabatic', env);
    expect(val.valid).toBe(true);
    expect(val.conflicts).toHaveLength(0);

    // Stepping simulation in stationary adiabatic state
    const sim = new Simulation({
      initialState: getDefaultState(),
      processMode: 'adiabatic',
      environment: env,
      dt: 0.1,
      speedMultiplier: 1,
    });

    const initT = sim.snapshot.state.temperature;
    const initV = sim.snapshot.state.volume;
    const initP = sim.snapshot.state.pressure;

    const res = sim.step();
    expect(res.snapshot.state.temperature).toBe(initT);
    expect(res.snapshot.state.volume).toBe(initV);
    expect(res.snapshot.state.pressure).toBe(initP);
    expect(res.snapshot.stepW).toBe(0);
    expect(res.snapshot.stepQ).toBe(0);
    expect(res.snapshot.stepDeltaU).toBe(0);
    expect(res.snapshot.energyBalanceValid).toBe(true);
    expect(verifyEquationOfState(res.snapshot.state)).toBe(true);
  });

  it('nonzero volume rates are rejected by validation and corrected by normalize/transition in isochoric mode', () => {
    const badEnv: EnvironmentConfig = {
      heatingPower: 500,
      volumeChangeRate: 1e-4, // incompatible with locked piston
      externalPressure: 101325,
    };

    // Validation rejects it
    const val = validateConstraints('constant_volume', badEnv);
    expect(val.valid).toBe(false);
    expect(val.conflicts.some((c) => c.includes('volumeChangeRate must be 0'))).toBe(true);

    // Normalization corrects it
    const normalized = normalizeEnvironment('constant_volume', badEnv);
    expect(normalized.volumeChangeRate).toBe(0);

    // Transition corrects it
    const transitioned = transitionEnvironment('constant_volume', badEnv);
    expect(transitioned.volumeChangeRate).toBe(0);
  });

  it('preserves user settings where valid when switching between compatible modes', () => {
    // Isochoric with custom heating power -> Isobaric preserves heating power
    const customHeatEnv: EnvironmentConfig = {
      heatingPower: 1200,
      volumeChangeRate: 0,
      externalPressure: 101325,
    };
    const isobaricEnv = transitionEnvironment('constant_pressure', customHeatEnv);
    expect(isobaricEnv.heatingPower).toBe(1200);

    // Isothermal with custom compression rate -> Adiabatic preserves compression rate
    const customRateEnv: EnvironmentConfig = {
      heatingPower: 0,
      volumeChangeRate: -3e-4,
      externalPressure: 101325,
    };
    const adiabaticEnv = transitionEnvironment('adiabatic', customRateEnv);
    expect(adiabaticEnv.volumeChangeRate).toBe(-3e-4);
    expect(adiabaticEnv.heatingPower).toBe(0);
  });

  it('Simulation.updateProcessMode auto-adapts environment and preserves physical consistency without resetting', () => {
    const sim = new Simulation({
      initialState: getDefaultState(),
      processMode: 'adiabatic',
      environment: { heatingPower: 0, volumeChangeRate: 1e-4, externalPressure: 101325 },
      dt: 0.05,
      speedMultiplier: 1,
    });

    // Run 5 adiabatic steps
    for (let i = 0; i < 5; i++) sim.step();
    expect(sim.stepCount).toBe(5);
    const snapBeforeModeChange = sim.snapshot;

    // Switch mode to isochoric mid-run: state is preserved, environment auto-adapts
    sim.updateProcessMode('constant_volume');
    expect(sim.configuration.processMode).toBe('constant_volume');
    expect(sim.configuration.environment.volumeChangeRate).toBe(0);
    expect(sim.configuration.environment.heatingPower).toBeGreaterThan(0);
    expect(sim.stepCount).toBe(5); // Not reset!
    expect(sim.snapshot.time).toBe(snapBeforeModeChange.time);

    // Take next step in isochoric mode
    const res = sim.step();
    expect(res.snapshot.energyBalanceValid).toBe(true);
    expect(verifyEquationOfState(res.snapshot.state)).toBe(true);
    expect(res.snapshot.state.volume).toBe(snapBeforeModeChange.state.volume); // Volume locked
  });

  it('all process modes start in a valid, ready-to-run state with getDefaultEnvironment', () => {
    const modes: ProcessMode[] = [
      'constant_volume',
      'constant_pressure',
      'constant_temperature',
      'adiabatic',
    ];

    for (const mode of modes) {
      const defaultEnv = getDefaultEnvironment(mode);
      const validation = validateConstraints(mode, defaultEnv);
      expect(validation.valid).toBe(true);
      expect(validation.conflicts).toHaveLength(0);

      // Verify that stepping with default environment satisfies First Law and PV=nRT
      const sim = new Simulation({
        initialState: getDefaultState(),
        processMode: mode,
        environment: defaultEnv,
        dt: 0.05,
        speedMultiplier: 1,
      });

      const res = sim.step();
      expect(res.snapshot.energyBalanceValid).toBe(true);
      expect(verifyEquationOfState(res.snapshot.state)).toBe(true);
    }
  });
});
