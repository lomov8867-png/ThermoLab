/**
 * Utility functions for formatting numbers with SI units.
 */

import type { StateVariable } from '../physics';

/**
 * Format a number in engineering/scientific notation appropriate for the magnitude.
 * Uses fixed decimal places for "human-scale" numbers and scientific notation otherwise.
 */
export function formatValue(value: number, decimals = 4): string {
  if (!Number.isFinite(value)) return '—';

  const abs = Math.abs(value);

  // Very small or very large → scientific notation
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e7)) {
    return value.toExponential(decimals);
  }

  // Otherwise fixed
  return value.toFixed(decimals);
}

/**
 * Format a number with its unit string.
 */
export function formatWithUnit(value: number, unit: string, decimals = 4): string {
  return `${formatValue(value, decimals)} ${unit}`;
}

/** Display labels for state variables. */
export const STATE_LABELS: Record<StateVariable, string> = {
  pressure: 'Pressure (P)',
  volume: 'Volume (V)',
  temperature: 'Temperature (T)',
  moles: 'Amount (n)',
};

/** SI unit labels. */
export const UNIT_LABELS: Record<StateVariable, string> = {
  pressure: 'Pa',
  volume: 'm³',
  temperature: 'K',
  moles: 'mol',
};

/** Labels for derived properties. */
export const DERIVED_LABELS: Record<string, { label: string; unit: string }> = {
  internalEnergy: { label: 'Internal Energy (U)', unit: 'J' },
  enthalpy: { label: 'Enthalpy (H)', unit: 'J' },
  Cv: { label: 'Cv (molar)', unit: 'J/(mol·K)' },
  Cp: { label: 'Cp (molar)', unit: 'J/(mol·K)' },
  gamma: { label: 'γ = Cp/Cv', unit: '' },
  density: { label: 'Density (ρ)', unit: 'kg/m³' },
  specificVolume: { label: 'Specific Volume (v)', unit: 'm³/kg' },
  particleCount: { label: 'Particle Count (N)', unit: '' },
  averageKineticEnergy: { label: 'Avg. KE per Particle', unit: 'J' },
  rmsSpeed: { label: 'RMS Speed (v_rms)', unit: 'm/s' },
};

/**
 * Format energy with sensible metric prefixes (J, kJ, MJ).
 */
export function formatEnergy(joules: number, decimals = 3): string {
  if (!Number.isFinite(joules)) return '—';
  const abs = Math.abs(joules);
  if (abs >= 1e6) {
    return `${(joules / 1e6).toFixed(decimals)} MJ`;
  }
  if (abs >= 1e3) {
    return `${(joules / 1e3).toFixed(decimals)} kJ`;
  }
  if (abs < 1e-2 && abs > 0) {
    return `${(joules * 1e3).toFixed(decimals)} mJ`;
  }
  return `${joules.toFixed(decimals)} J`;
}

/**
 * Format power in W or kW.
 */
export function formatPower(watts: number): string {
  if (!Number.isFinite(watts)) return '—';
  const abs = Math.abs(watts);
  if (abs >= 1e3) {
    return `${(watts / 1e3).toFixed(2)} kW`;
  }
  return `${watts.toFixed(1)} W`;
}

/**
 * Format time in seconds, milliseconds, or minutes:seconds.
 */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  if (seconds < 1) {
    return `${(seconds * 1000).toFixed(0)} ms`;
  }
  if (seconds < 60) {
    return `${seconds.toFixed(2)} s`;
  }
  const mins = Math.floor(seconds / 60);
  const remSec = (seconds % 60).toFixed(1);
  return `${mins}m ${remSec}s`;
}
