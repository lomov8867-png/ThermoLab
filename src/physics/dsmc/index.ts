/**
 * Direct Simulation Monte Carlo (DSMC) Subsystem
 * ===============================================
 *
 * Stage 1: Seedable PRNG and Particle Ensemble Storage.
 * Stage 2: Particle Advection and Chamber Boundary Interactions.
 * Stage 3A: Elastic Binary Collision Physics and Collision-Cell Infrastructure.
 * Stage 3B: Bird NTC Collision-Selection Algorithm.
 *
 * @module
 */

// Stage 1 exports
export type { PRNG } from './prng';
export { Mulberry32PRNG, createPRNG } from './prng';

export type {
  SpatialBounds3D,
  EnsembleMetadata,
  ParticleStateRecord,
} from './particle-ensemble';
export {
  ParticleEnsemble,
  MIN_PARTICLE_COUNT,
  MAX_PARTICLE_COUNT,
} from './particle-ensemble';

// Stage 2 exports
export type {
  PistonBoundary,
  ChamberGeometry3D,
  MotionStepResult,
} from './motion';
export {
  validateChamberGeometry,
  reflect1DFixed,
  advanceParticles,
} from './motion';

// Stage 3A exports
export type { CollisionResult } from './collisions';
export { performElasticCollision, sampleUniformSphere } from './collisions';

export type { CellGridConfig, CellGrouping } from './collision-cells';
export {
  groupParticlesIntoCells,
  coordToCellIndex,
  flatCellIndex,
} from './collision-cells';

// Stage 3B exports
export type { NTCConfig, NTCCellState, NTCStepResult } from './ntc-collisions';
export { performNTCStep, createNTCCellStates } from './ntc-collisions';

// Stage 4 exports
export type {
  EstimatorFlag,
  EstimatorResult,
  KineticEnergyResult,
  PressureTensor,
  PressureResult,
  EnsembleStateEstimate,
} from './estimators';
export {
  M_HE,
  ESTIMATOR_FLAGS,
  estimateTemperature,
  estimateKineticEnergy,
  estimatePressure,
  estimateEnsembleState,
} from './estimators';

// Stage 5 exports
export type {
  EntropyFlag,
  EntropyResult,
  KineticHResult,
  ThermodynamicStateSpec,
  EntropyChangeResult,
} from './entropy';
export {
  PLANCK,
  V_REF_H,
  ENTROPY_FLAGS,
  calculateSackurTetrodeEntropy,
  estimateEquilibriumEntropyFromTemperature,
  estimateStatisticalEntropy,
  estimateKineticH,
  estimateEntropyChange,
} from './entropy';
// Stage 6 exports
export type {
  DSMCSimulationConfig,
  DSMCSimulationSnapshot,
} from './simulation';
export {
  DSMCSimulation,
  DEFAULT_HELIUM_CROSS_SECTION,
  DEFAULT_DSMC_DT,
  DEFAULT_CHAMBER_DIMS,
  DEFAULT_STATISTICAL_WEIGHT,
  DEFAULT_PARTICLE_COUNT,
  DEFAULT_TEMPERATURE,
} from './simulation';
