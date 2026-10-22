/**
 * Simulation Type Definitions
 * ===========================
 *
 * Types for the time-dependent thermodynamic simulation engine.
 *
 * Sign conventions (consistent with engine.ts)
 * ─────────────────────────────────────────────
 *  Q > 0  → heat flows INTO the system.
 *  W > 0  → work is done BY the system on the surroundings.
 *  ΔU = Q − W  (first law of thermodynamics).
 *
 * All quantities are in SI units.
 *
 * @module
 */

import type { ThermodynamicState, DerivedProperties } from './types';

// ─── Process Modes ───────────────────────────────────────────────────────── //

/**
 * Supported thermodynamic process modes.
 *
 * Each mode holds one or more state variables constant while the system
 * evolves under a specified driving input.
 */
export type ProcessMode =
  | 'constant_volume'      // Isochoric:  V fixed,  heat → ΔT, ΔP
  | 'constant_pressure'    // Isobaric:   P fixed,  heat → ΔT, ΔV
  | 'constant_temperature' // Isothermal: T fixed,  volume change → W, Q
  | 'adiabatic';           // Adiabatic:  Q = 0,    quasi-static reversible

/**
 * Human-readable metadata for each process mode.
 */
export const PROCESS_MODE_INFO: Record<
  ProcessMode,
  { label: string; shortLabel: string; description: string; constraint: string }
> = {
  constant_volume: {
    label: 'Constant Volume (Isochoric)',
    shortLabel: 'Isochoric',
    description: 'Volume is fixed. Heat transfer changes temperature and pressure.',
    constraint: 'V = const',
  },
  constant_pressure: {
    label: 'Constant Pressure (Isobaric)',
    shortLabel: 'Isobaric',
    description: 'Pressure is fixed. Heat transfer changes temperature and volume.',
    constraint: 'P = const',
  },
  constant_temperature: {
    label: 'Constant Temperature (Isothermal)',
    shortLabel: 'Isothermal',
    description: 'Temperature is fixed. Piston moves to maintain equilibrium.',
    constraint: 'T = const',
  },
  adiabatic: {
    label: 'Adiabatic (Q = 0)',
    shortLabel: 'Adiabatic',
    description: 'No heat transfer. All energy changes come from work.',
    constraint: 'Q = 0',
  },
};

export const ALL_PROCESS_MODES: ProcessMode[] = [
  'constant_volume',
  'constant_pressure',
  'constant_temperature',
  'adiabatic',
];

// ─── Environment & Driving Parameters ────────────────────────────────────── //

/**
 * External environment and driving parameters for the simulation.
 *
 * These control HOW the process is driven each time step.
 *
 * Deferred features (designed-for but not yet implemented):
 *  - ambientTemperature: for heat-transfer-coefficient-based exchange
 *  - heatTransferCoefficient: W/(m²·K) for convective heat transfer
 *  - pistonPosition / pistonVelocity: direct piston control
 */
export interface EnvironmentConfig {
  /**
   * Heating power applied to the gas [W = J/s].
   *
   * Positive → heating, Negative → cooling.
   *
   * Used by: constant_volume, constant_pressure.
   * Ignored by: adiabatic (Q = 0 enforced), constant_temperature (Q derived).
   */
  heatingPower: number;

  /**
   * Rate of volume change [m³/s].
   *
   * Positive → expansion, Negative → compression.
   *
   * Used by: constant_temperature, adiabatic.
   * Ignored by: constant_volume (V fixed).
   * For constant_pressure: volume changes are determined by heating.
   */
  volumeChangeRate: number;

  /**
   * External (atmospheric) pressure [Pa].
   *
   * In this milestone, we assume mechanical equilibrium: the gas pressure
   * equals the external pressure for isobaric processes. For other modes
   * this serves as a reference but the piston constraint determines dynamics.
   *
   * Deferred: non-equilibrium pressure differences driving piston acceleration.
   */
  externalPressure: number;

  // ─── Future: not implemented in this milestone ───────
  // ambientTemperature?: number;      // [K]
  // heatTransferCoefficient?: number; // [W/(m²·K)]
  // pistonMass?: number;              // [kg]
}

/**
 * Default environment configuration for each process mode.
 *
 * Provides ready-to-run, physically consistent defaults:
 *  - Isochoric:  heatingPower = 500 W, volumeChangeRate = 0 (piston locked)
 *  - Isobaric:   heatingPower = 500 W, volumeChangeRate = 0 (unused)
 *  - Isothermal: heatingPower = 0 (derived), volumeChangeRate = 0.1 L/s (1e-4 m³/s)
 *  - Adiabatic:  heatingPower = 0 (Q = 0), volumeChangeRate = 0.1 L/s (1e-4 m³/s)
 */
export function getDefaultEnvironment(mode: ProcessMode = 'constant_volume'): EnvironmentConfig {
  switch (mode) {
    case 'constant_volume':
      return {
        heatingPower: 500,        // 500 W heating
        volumeChangeRate: 0,       // Piston locked
        externalPressure: 101325, // 1 atm
      };
    case 'constant_pressure':
      return {
        heatingPower: 500,        // 500 W heating
        volumeChangeRate: 0,       // Not used as input
        externalPressure: 101325, // 1 atm
      };
    case 'constant_temperature':
      return {
        heatingPower: 0,          // Derived from W (Q = W)
        volumeChangeRate: 1e-4,   // 0.1 L/s expansion
        externalPressure: 101325, // 1 atm
      };
    case 'adiabatic':
      return {
        heatingPower: 0,          // Q = 0 strictly
        volumeChangeRate: 1e-4,   // 0.1 L/s expansion
        externalPressure: 101325, // 1 atm
      };
  }
}

// ─── Simulation Snapshot ─────────────────────────────────────────────────── //

/**
 * A complete snapshot of the simulation at a single point in time.
 *
 * This combines the equilibrium state, derived properties, and
 * accumulated energy-accounting quantities.
 */
export interface SimulationSnapshot {
  /** Simulation time since start [s] */
  time: number;

  /** Equilibrium state of the gas */
  state: ThermodynamicState;

  /** Derived properties computed from the state */
  derived: DerivedProperties;

  /** Cumulative heat transferred into the gas since t = 0 [J] */
  totalQ: number;

  /** Cumulative work done by the gas since t = 0 [J] */
  totalW: number;

  /** Cumulative internal-energy change since t = 0 [J] */
  totalDeltaU: number;

  /** Heat transferred in the most recent step [J] */
  stepQ: number;

  /** Work done by the gas in the most recent step [J] */
  stepW: number;

  /** Internal-energy change in the most recent step [J] */
  stepDeltaU: number;

  /** Whether the first-law energy balance (ΔU = Q − W) is satisfied this step */
  energyBalanceValid: boolean;
}

// ─── Step Result ─────────────────────────────────────────────────────────── //

/**
 * Result of a single simulation step.
 *
 * Contains the new snapshot plus diagnostic information.
 */
export interface StepResult {
  snapshot: SimulationSnapshot;

  /**
   * First-law residual: |ΔU − (Q − W)| for this step.
   * Should be < ENERGY_TOLERANCE for a valid step.
   */
  energyResidual: number;
}

// ─── Simulation Status ───────────────────────────────────────────────────── //

export type SimulationStatus = 'idle' | 'running' | 'paused';

// ─── Constraint Conflict ─────────────────────────────────────────────────── //

/**
 * Result of constraint-conflict validation.
 */
export interface ConstraintValidation {
  valid: boolean;
  conflicts: string[];
}

// ─── Full Simulation Configuration ───────────────────────────────────────── //

/**
 * Complete configuration for launching a simulation run.
 */
export interface SimulationConfig {
  /** Initial equilibrium state */
  initialState: ThermodynamicState;

  /** Thermodynamic process to simulate */
  processMode: ProcessMode;

  /** External environment and driving parameters */
  environment: EnvironmentConfig;

  /** Fixed simulation time step [s] */
  dt: number;

  /** Simulation speed multiplier (1 = real-time, 10 = 10× faster) */
  speedMultiplier: number;
}

/**
 * Numerical tolerance for energy-balance checks [J].
 *
 * We allow relative tolerance of 1e-9 or absolute tolerance of 1e-12 J,
 * whichever is larger.
 */
export const ENERGY_TOLERANCE_RELATIVE = 1e-9;
export const ENERGY_TOLERANCE_ABSOLUTE = 1e-12;
