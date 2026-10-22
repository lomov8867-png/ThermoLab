/**
 * DSMC Simulation Engine Orchestrator
 * ===================================
 *
 * Headless controller coordinating:
 *  1. Microscopic particle ensemble storage and deterministic PRNG seeding.
 *  2. 3D ballistic advection and boundary reflections (fixed walls + moving piston).
 *  3. Spatial cell grouping and Bird No-Time-Counter (NTC) elastic collisions.
 *  4. Real-time statistical estimators (temperature, pressure, energy decomposition).
 *  5. Absolute Sackur–Tetrode reference, equilibrium entropy, kinetic H-functional,
 *     and thermodynamic process entropy change (Stage 5).
 *
 * @module
 */

import { AVOGADRO, HELIUM, R } from '../constants';
import type { PRNG } from './prng';
import { Mulberry32PRNG } from './prng';
import type { SpatialBounds3D } from './particle-ensemble';
import { ParticleEnsemble } from './particle-ensemble';
import type { ChamberGeometry3D, MotionStepResult } from './motion';
import { advanceParticles, validateChamberGeometry } from './motion';
import type { CellGridConfig } from './collision-cells';
import { groupParticlesIntoCells } from './collision-cells';
import type { NTCConfig, NTCCellState, NTCStepResult } from './ntc-collisions';
import { createNTCCellStates, performNTCStep } from './ntc-collisions';
import type { EnsembleStateEstimate } from './estimators';
import { estimateEnsembleState } from './estimators';
import type {
  EntropyResult,
  KineticHResult,
  EntropyChangeResult,
  ThermodynamicStateSpec,
} from './entropy';
import {
  calculateSackurTetrodeEntropy,
  estimateEquilibriumEntropyFromTemperature,
  estimateKineticH,
  estimateEntropyChange,
} from './entropy';

/** Default hard-sphere cross-section for Helium-4 (d ≈ 2.18e-10 m) -> σ = π d² ≈ 1.493e-19 m² */
export const DEFAULT_HELIUM_CROSS_SECTION = Math.PI * (2.18e-10) ** 2;

/** Default physical simulation timestep (20 microseconds) */
export const DEFAULT_DSMC_DT = 2e-5;

/** Default chamber dimensions [m]: 0.1m x 0.1m x 0.1m (1 liter) */
export const DEFAULT_CHAMBER_DIMS: [number, number, number] = [0.1, 0.1, 0.1];

/** Default statistical weight: 1.0e20 real atoms per simulator particle */
export const DEFAULT_STATISTICAL_WEIGHT = 1.0e20;

/** Default particle count for responsive browser execution */
export const DEFAULT_PARTICLE_COUNT = 500;

/** Default initial gas temperature [K] */
export const DEFAULT_TEMPERATURE = 300;

export interface DSMCSimulationConfig {
  /** Simulator particle count (20 to 10,000) */
  particleCount?: number;
  /** Initial gas temperature [K] */
  initialTemperature?: number;
  /** Statistical weighting factor F_N [real atoms / simulator particle] */
  statisticalWeight?: number;
  /** Chamber dimensions [Lx, Ly, Lz] in meters */
  chamberDimensions?: [number, number, number];
  /** Velocity of the upper piston head along the z-axis [m/s] */
  pistonVelocity?: number;
  /** Simulation advection timestep [s] */
  dt?: number;
  /** Whether binary NTC collisions are enabled */
  enableCollisions?: boolean;
  /** Hard-sphere collision cross-section [m²] */
  collisionCrossSection?: number;
  /** Spatial collision grid cell counts [nx, ny, nz] */
  gridCells?: [number, number, number];
  /** PRNG seed for deterministic repeatability */
  seed?: number;
}

export interface DSMCSimulationSnapshot {
  readonly time: number;
  readonly stepCount: number;
  readonly dt: number;
  readonly volume: number;
  readonly chamber: ChamberGeometry3D;
  readonly stateEstimate: EnsembleStateEstimate;
  readonly entropyRef: EntropyResult;
  readonly entropyEq: EntropyResult;
  readonly kineticH: KineticHResult;
  readonly entropyChange: EntropyChangeResult;
  readonly motionResult: MotionStepResult;
  readonly ntcResult?: NTCStepResult;
  readonly collisionsEnabled: boolean;
  readonly statisticalWeight: number;
  readonly simulatorParticleCount: number;
  readonly realParticleCount: number;
  readonly moles: number;
  readonly numberDensity: number;
  readonly meanFreePath: number;
}

export class DSMCSimulation {
  private _config: Required<DSMCSimulationConfig>;
  private _prng: PRNG;
  private _ensemble: ParticleEnsemble;
  private _geometry: ChamberGeometry3D;
  private _gridConfig: CellGridConfig;
  private _cellStates: NTCCellState[];
  private _time: number = 0;
  private _stepCount: number = 0;
  private _lastMotionResult: MotionStepResult;
  private _lastNTCResult?: NTCStepResult;
  private _initialStateSpec: ThermodynamicStateSpec;

  constructor(config?: DSMCSimulationConfig) {
    this._config = this._normalizeConfig(config);
    this._prng = new Mulberry32PRNG(this._config.seed);

    const [Lx, Ly, Lz] = this._config.chamberDimensions;
    this._geometry = {
      xMin: 0,
      xMax: Lx,
      yMin: 0,
      yMax: Ly,
      zMin: 0,
      piston: {
        position: Lz,
        velocity: this._config.pistonVelocity,
      },
    };

    validateChamberGeometry(this._geometry);

    const bounds: SpatialBounds3D = {
      xMin: 0,
      xMax: Lx,
      yMin: 0,
      yMax: Ly,
      zMin: 0,
      zMax: Lz,
    };

    this._ensemble = new ParticleEnsemble(this._config.particleCount, {
      statisticalWeight: this._config.statisticalWeight,
    });
    this._ensemble.initializeUniformPositions(bounds, this._prng);
    this._ensemble.initializeMaxwellianVelocities(
      this._config.initialTemperature,
      HELIUM.molarMass,
      this._prng,
    );

    const [nx, ny, nz] = this._config.gridCells;
    this._gridConfig = { nx, ny, nz };
    const initialGMax = 2.0 * Math.sqrt((2.0 * R * this._config.initialTemperature) / HELIUM.molarMass);
    this._cellStates = createNTCCellStates(nx * ny * nz, initialGMax);

    this._lastMotionResult = {
      fixedWallCollisions: 0,
      pistonCollisions: 0,
      pistonWorkTransferred: 0,
    };

    const initialV = Lx * Ly * Lz;
    const initialNreal = this._config.particleCount * this._config.statisticalWeight;
    this._initialStateSpec = {
      temperature: this._config.initialTemperature,
      volume: initialV,
      Nreal: initialNreal,
    };
  }

  private _normalizeConfig(config?: DSMCSimulationConfig): Required<DSMCSimulationConfig> {
    const particleCount = Math.max(
      20,
      Math.min(10000, Math.round(config?.particleCount ?? DEFAULT_PARTICLE_COUNT)),
    );
    const initialTemperature = Math.max(5, Math.min(5000, config?.initialTemperature ?? DEFAULT_TEMPERATURE));
    const statisticalWeight =
      config?.statisticalWeight !== undefined &&
      Number.isFinite(config.statisticalWeight) &&
      config.statisticalWeight > 0
        ? config.statisticalWeight
        : DEFAULT_STATISTICAL_WEIGHT;

    const dims = config?.chamberDimensions ?? DEFAULT_CHAMBER_DIMS;
    const Lx = Math.max(0.001, Math.min(10, dims[0]));
    const Ly = Math.max(0.001, Math.min(10, dims[1]));
    const Lz = Math.max(0.001, Math.min(10, dims[2]));

    const pistonVelocity = Number.isFinite(config?.pistonVelocity) ? config!.pistonVelocity! : 0;
    const dt = Math.max(1e-7, Math.min(1e-3, config?.dt ?? DEFAULT_DSMC_DT));
    const enableCollisions = config?.enableCollisions ?? true;
    const collisionCrossSection =
      config?.collisionCrossSection !== undefined &&
      Number.isFinite(config.collisionCrossSection) &&
      config.collisionCrossSection > 0
        ? config.collisionCrossSection
        : DEFAULT_HELIUM_CROSS_SECTION;

    const gridCells: [number, number, number] = [
      Math.max(1, Math.min(16, config?.gridCells?.[0] ?? 4)),
      Math.max(1, Math.min(16, config?.gridCells?.[1] ?? 4)),
      Math.max(1, Math.min(16, config?.gridCells?.[2] ?? 4)),
    ];

    const seed = (config?.seed ?? 42) >>> 0;

    return {
      particleCount,
      initialTemperature,
      statisticalWeight,
      chamberDimensions: [Lx, Ly, Lz],
      pistonVelocity,
      dt,
      enableCollisions,
      collisionCrossSection,
      gridCells,
      seed,
    };
  }

  public get config(): Readonly<Required<DSMCSimulationConfig>> {
    return this._config;
  }

  public get ensemble(): ParticleEnsemble {
    return this._ensemble;
  }

  public get geometry(): ChamberGeometry3D {
    return this._geometry;
  }

  public get time(): number {
    return this._time;
  }

  public get stepCount(): number {
    return this._stepCount;
  }

  public get volume(): number {
    const Lx = this._geometry.xMax - this._geometry.xMin;
    const Ly = this._geometry.yMax - this._geometry.yMin;
    const Lz = this._geometry.piston.position - this._geometry.zMin;
    return Lx * Ly * Lz;
  }

  /**
   * Updates upper piston velocity [m/s].
   */
  public setPistonVelocity(velocity: number): void {
    if (!Number.isFinite(velocity)) return;
    this._geometry = {
      ...this._geometry,
      piston: {
        ...this._geometry.piston,
        velocity,
      },
    };
  }

  /**
   * Sets piston position directly [m].
   */
  public setPistonPosition(position: number): void {
    if (!Number.isFinite(position) || position <= this._geometry.zMin) return;
    this._geometry = {
      ...this._geometry,
      piston: {
        ...this._geometry.piston,
        position,
      },
    };
  }

  /**
   * Toggles binary collisions.
   */
  public setCollisionsEnabled(enabled: boolean): void {
    this._config.enableCollisions = enabled;
  }

  /**
   * Advances the simulation by dt seconds (default: config.dt).
   */
  public step(customDt?: number): DSMCSimulationSnapshot {
    const dt = customDt ?? this._config.dt;

    // 1. Advance particles with specular fixed-wall & moving-piston reflections
    this._lastMotionResult = advanceParticles(this._ensemble, this._geometry, dt);

    // 2. Advance moving piston position
    if (this._geometry.piston.velocity !== 0) {
      const newZ = this._geometry.piston.position + this._geometry.piston.velocity * dt;
      // Safety limit: do not let piston compress below 10% of initial height
      const minZ = this._config.chamberDimensions[2] * 0.1;
      const maxZ = this._config.chamberDimensions[2] * 3.0;
      const clampedZ = Math.max(minZ, Math.min(maxZ, newZ));

      this._geometry = {
        ...this._geometry,
        piston: {
          ...this._geometry.piston,
          position: clampedZ,
        },
      };
    }

    // 3. Collision handling (Bird NTC method)
    if (this._config.enableCollisions && this._ensemble.count >= 2) {
      const grouping = groupParticlesIntoCells(this._ensemble, this._geometry, this._gridConfig);

      const cellLx = (this._geometry.xMax - this._geometry.xMin) / this._gridConfig.nx;
      const cellLy = (this._geometry.yMax - this._geometry.yMin) / this._gridConfig.ny;
      const cellLz = (this._geometry.piston.position - this._geometry.zMin) / this._gridConfig.nz;
      const cellVolume = cellLx * cellLy * cellLz;

      const ntcConfig: NTCConfig = {
        crossSection: this._config.collisionCrossSection,
        statisticalWeight: this._config.statisticalWeight,
        dt,
      };

      this._lastNTCResult = performNTCStep(
        this._ensemble,
        grouping,
        this._cellStates,
        ntcConfig,
        cellVolume,
        this._prng,
      );
    } else {
      this._lastNTCResult = undefined;
    }

    this._time += dt;
    this._stepCount++;

    return this.getSnapshot();
  }

  /**
   * Samples current microscopic observables and macroscopic estimators.
   */
  public getSnapshot(): DSMCSimulationSnapshot {
    const V = this.volume;
    const FN = this._config.statisticalWeight;
    const Np = this._ensemble.count;
    const Nreal = Np * FN;
    const moles = Nreal / AVOGADRO;
    const numberDensity = Nreal / V;

    // Stage 4 Statistical Estimators (Temperature, Pressure, Energy)
    const stateEstimate = estimateEnsembleState(this._ensemble, V, FN);

    const tempVal = stateEstimate.temperature.isValid ? stateEstimate.temperature.value : 300;

    // Stage 5 Absolute Reference
    const entropyRef = calculateSackurTetrodeEntropy(Nreal, V, tempVal);

    // Stage 5 Equilibrium Estimate from Kinetic Temperature
    const entropyEq = estimateEquilibriumEntropyFromTemperature(this._ensemble, V, FN);

    // Stage 5 Velocity-Distribution H-Functional
    const kineticH = estimateKineticH(this._ensemble, 40);

    // Stage 5 Process Entropy Change relative to Initial State
    const currentStateSpec: ThermodynamicStateSpec = {
      temperature: tempVal,
      volume: V,
      Nreal,
      standardError: entropyEq.isValid ? entropyEq.standardError : undefined,
    };
    const entropyChange = estimateEntropyChange(this._initialStateSpec, currentStateSpec);

    // Theoretical mean free path: λ = 1 / (√2 · n₀ · σ_T)
    const sigmaT = this._config.collisionCrossSection;
    const meanFreePath = 1.0 / (Math.SQRT2 * numberDensity * sigmaT);

    return {
      time: this._time,
      stepCount: this._stepCount,
      dt: this._config.dt,
      volume: V,
      chamber: this._geometry,
      stateEstimate,
      entropyRef,
      entropyEq,
      kineticH,
      entropyChange,
      motionResult: this._lastMotionResult,
      ntcResult: this._lastNTCResult,
      collisionsEnabled: this._config.enableCollisions,
      statisticalWeight: FN,
      simulatorParticleCount: Np,
      realParticleCount: Nreal,
      moles,
      numberDensity,
      meanFreePath,
    };
  }

  /**
   * Resets simulation to initial state with the original PRNG seed.
   */
  public reset(): DSMCSimulationSnapshot {
    this._prng = new Mulberry32PRNG(this._config.seed);

    const [Lx, Ly, Lz] = this._config.chamberDimensions;
    this._geometry = {
      xMin: 0,
      xMax: Lx,
      yMin: 0,
      yMax: Ly,
      zMin: 0,
      piston: {
        position: Lz,
        velocity: this._config.pistonVelocity,
      },
    };

    const bounds: SpatialBounds3D = {
      xMin: 0,
      xMax: Lx,
      yMin: 0,
      yMax: Ly,
      zMin: 0,
      zMax: Lz,
    };

    this._ensemble = new ParticleEnsemble(this._config.particleCount, {
      statisticalWeight: this._config.statisticalWeight,
    });
    this._ensemble.initializeUniformPositions(bounds, this._prng);
    this._ensemble.initializeMaxwellianVelocities(
      this._config.initialTemperature,
      HELIUM.molarMass,
      this._prng,
    );

    const [nx, ny, nz] = this._config.gridCells;
    const initialGMax = 2.0 * Math.sqrt((2.0 * R * this._config.initialTemperature) / HELIUM.molarMass);
    this._cellStates = createNTCCellStates(nx * ny * nz, initialGMax);

    this._time = 0;
    this._stepCount = 0;
    this._lastMotionResult = {
      fixedWallCollisions: 0,
      pistonCollisions: 0,
      pistonWorkTransferred: 0,
    };
    this._lastNTCResult = undefined;

    return this.getSnapshot();
  }

  /**
   * Reconfigures simulation parameters and rebuilds particle ensemble.
   */
  public reconfigure(newConfig: Partial<DSMCSimulationConfig>): DSMCSimulationSnapshot {
    this._config = this._normalizeConfig({ ...this._config, ...newConfig });
    const [Lx, Ly, Lz] = this._config.chamberDimensions;
    const initialV = Lx * Ly * Lz;
    const initialNreal = this._config.particleCount * this._config.statisticalWeight;
    this._initialStateSpec = {
      temperature: this._config.initialTemperature,
      volume: initialV,
      Nreal: initialNreal,
    };
    return this.reset();
  }
}
