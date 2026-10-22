/**
 * Physical constants used throughout ThermoLab.
 *
 * All values are in SI units.
 * Source: NIST CODATA 2018 recommended values.
 */

/** Universal gas constant R [J/(mol·K)] */
export const R = 8.314462618;

/** Avogadro's number Nₐ [1/mol] */
export const AVOGADRO = 6.02214076e23;

/** Boltzmann constant kB [J/K] */
export const BOLTZMANN = 1.380649e-23;

/**
 * Helium-specific constants.
 *
 * Helium is a monatomic noble gas (f = 3 translational degrees of freedom).
 * We model it as an ideal gas in this milestone; all vibrational/electronic
 * modes are frozen out at the temperatures we consider.
 */
export const HELIUM = {
  /** Molar mass [kg/mol] */
  molarMass: 4.002602e-3,

  /** Degrees of freedom (translational only) */
  degreesOfFreedom: 3,

  /** Ratio of specific heats γ = Cp/Cv = 5/3 ≈ 1.6667 */
  gamma: 5 / 3,

  /** Molar heat capacity at constant volume Cv = (3/2)R [J/(mol·K)] */
  get Cv(): number {
    return (this.degreesOfFreedom / 2) * R;
  },

  /** Molar heat capacity at constant pressure Cp = (5/2)R [J/(mol·K)] */
  get Cp(): number {
    return this.Cv + R;
  },
} as const;
