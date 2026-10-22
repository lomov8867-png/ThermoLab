/**
 * DSMC Bird's No-Time-Counter (NTC) Collision Sampling
 * ======================================================
 *
 * Implements the Bird NTC method for selecting and performing elastic
 * binary collision events in each collision cell over one timestep.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DERIVATION OF THE NTC CANDIDATE-PAIR COUNT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Symbol definitions
 * ──────────────────
 *   N_p       Simulator-particle count in cell c.
 *   F_N       Statistical weighting factor [real atoms / simulator particle].
 *             Supplied by the caller; see note on dual-source ambiguity below.
 *   V_c       Cell volume [m³] = cellLx × cellLy × cellLz.
 *   σ_T       Total collision cross-section [m²] (hard-sphere: σ_T = π d²).
 *             Must be supplied by the caller; not derived here.
 *   g         Relative speed of a candidate pair [m/s] = |v_i − v_j|.
 *   g_max     Running maximum relative speed estimate for cell c [m/s].
 *   Δt        Advection timestep [s].
 *
 * Physical collision rate (homogeneous cell)
 * ──────────────────────────────────────────
 * The expected number of real binary collisions in cell c during Δt is
 * given by the Boltzmann collision integral for a spatially homogeneous gas:
 *
 *   Ṅ_coll = (N_real,c / V_c) · N_real,c · (1/2) · σ_T · <g>
 *
 * where N_real,c = N_p · F_N is the number of physical atoms in the cell
 * and <g> is the mean pair relative speed. Integrating over Δt:
 *
 *   M_real = (N_p · F_N · (N_p · F_N − 1) / 2) · σ_T · <g> · Δt / V_c
 *
 * For large F_N this is dominated by: M_real ≈ N_p² · F_N² · ... / 2.
 *
 * Bird's NTC approximation (equal-weight particles)
 * ──────────────────────────────────────────────────
 * For equal-weight simulator particles (each representing F_N real atoms),
 * Bird's NTC algorithm evaluates a number of *simulator-particle* candidate
 * pairs, then accepts each with probability proportional to g / g_max.
 * The key identity (Bird 1994, §9.5, eq. 9.8) for uniform-weight particles is:
 *
 *   M_cand = ceil( (N_p (N_p − 1) / 2) · F_N · σ_T · g_max · Δt / V_c )
 *
 *   acceptance probability for pair (i,j):  P_acc = g_ij / g_max
 *
 * The expected number of accepted collisions is therefore:
 *
 *   E[M_accept] = M_cand · <g> / g_max
 *              = (N_p(N_p−1)/2) · F_N · σ_T · <g> · Δt / V_c
 *
 * which correctly matches the physical collision rate for simulator-particle
 * pairs scaled by F_N (one factor of F_N for the simulator→real-density
 * conversion of the *target* particle's density, while the candidate pairs
 * are counted among simulator particles).
 *
 * WHY F_N (not F_N²):
 * The simulator pair count N_p(N_p-1)/2 already represents pairs of
 * computational tracers. Each tracer represents F_N real atoms, so the
 * rate of real-space collisions per tracer pair is F_N times the single-
 * atom collision rate. One factor of F_N is therefore correct. Using F_N²
 * would correspond to counting real-real pairs directly — which contradicts
 * using N_p (simulator count) as the pair population.
 *
 * Unit check:
 *   [N_p² · F_N · σ_T · g_max · Δt / V_c]
 *   = [1 · 1 · m² · (m/s) · s / m³]
 *   = [m³ / m³] = dimensionless ✓
 *
 * Maximum relative speed update (self-correcting g_max)
 * ──────────────────────────────────────────────────────
 * If a candidate pair (i,j) has g_ij > g_max, g_max is updated to g_ij
 * BEFORE the acceptance test. The acceptance probability then becomes
 * g_ij / g_ij = 1, so the pair is always accepted. This is Bird's standard
 * self-correcting mechanism and ensures the acceptance probability is
 * always in [0, 1].
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LIMITATIONS AND PHYSICAL VALIDITY
 * ─────────────────────────────────────────────────────────────────────────
 * 1. Educational relaxation model only. At 1 atm / 298 K (Kn ~ 10⁻⁷),
 *    the DSMC mean-free-path condition (Δx ≤ λ ≈ 0.19 μm) is violated by
 *    orders of magnitude with browser-feasible grids (Δx ~ cm). Collision
 *    rates will be far below physical values. The model still drives velocity
 *    distributions toward Maxwell-Boltzmann equilibrium, but is NOT a
 *    time-accurate simulation of continuum gas dynamics.
 * 2. Cross-section σ_T must be supplied by the caller. For hard-sphere helium
 *    (d ≈ 2.18 × 10⁻¹⁰ m), σ_T ≈ 1.49 × 10⁻¹⁹ m². Under VHS or VSS models,
 *    σ_T depends on relative speed and temperature. The caller is responsible
 *    for choosing a model-consistent value.
 * 3. Angular momentum is not conserved by cell-averaged DSMC (Bird 1994 §9.1).
 * 4. g_max is maintained per cell. After re-grouping particles between steps,
 *    g_max values from the previous step remain valid lower bounds.
 *
 * @module
 */

import type { ParticleEnsemble } from './particle-ensemble';
import type { CellGrouping } from './collision-cells';
import type { PRNG } from './prng';
import { performElasticCollision } from './collisions';

/**
 * Configuration for the Bird NTC collision step.
 *
 * All fields must be supplied explicitly; no physical constant is invented
 * inside this module.
 */
export interface NTCConfig {
  /**
   * Total collision cross-section σ_T [m²].
   * For hard-sphere helium (d ≈ 2.18 × 10⁻¹⁰ m): σ_T = π d² ≈ 1.49 × 10⁻¹⁹ m².
   * Physical validity depends on the selected collision model and flow regime.
   * Must be positive and finite.
   */
  readonly crossSection: number;

  /**
   * Statistical weighting factor F_N [real atoms / simulator particle].
   * Encodes the macroscopic scaling: N_real = N_s · F_N.
   * Derivation: F_N = n · N_A / N_s (moles × Avogadro / simulator count).
   * Must be positive and finite.
   *
   * NOTE: This weight must be consistent with the ensemble's metadata.statisticalWeight
   * if that field is set. The caller is responsible for maintaining this consistency;
   * this module reads F_N exclusively from the config, not from ensemble metadata,
   * to provide a single, unambiguous source of truth per call site.
   */
  readonly statisticalWeight: number;

  /**
   * Timestep Δt [s]. Must be finite and non-negative.
   */
  readonly dt: number;
}

/**
 * Per-cell persistent state for the NTC algorithm.
 *
 * g_max must be maintained across timesteps per cell because NTC uses the
 * running maximum relative speed to estimate the candidate-pair count.
 * Forgetting g_max between steps (resetting to 0) would require infinite
 * candidate pairs on the first step, so a seed value must be provided.
 */
export interface NTCCellState {
  /**
   * Current maximum relative speed estimate for this cell [m/s].
   * Updated whenever a sampled pair's relative speed exceeds it.
   * Must be positive. Caller should initialize to a physically reasonable
   * seed value (e.g. 2 × √(2RT/M) ≈ 2 × most-probable speed at initialization T).
   */
  gMax: number;
}

/**
 * Aggregated diagnostic result from one NTC collision step over all cells.
 */
export interface NTCStepResult {
  /** Total number of candidate pairs evaluated across all cells. */
  readonly totalCandidatePairs: number;

  /** Total number of accepted (executed) collisions across all cells. */
  readonly totalAcceptedCollisions: number;

  /** Maximum relative speed observed across any accepted pair in this step [m/s]. */
  readonly maxRelativeSpeedObserved: number;

  /** Number of cells that were skipped (Np < 2). */
  readonly emptyCellsSkipped: number;
}

/**
 * Validates the NTC configuration parameters.
 */
function validateNTCConfig(cfg: NTCConfig): void {
  if (!Number.isFinite(cfg.crossSection) || cfg.crossSection <= 0) {
    throw new RangeError(
      `NTC crossSection (σ_T) must be a positive finite number [m²]. Received: ${cfg.crossSection}`,
    );
  }
  if (!Number.isFinite(cfg.statisticalWeight) || cfg.statisticalWeight <= 0) {
    throw new RangeError(
      `NTC statisticalWeight (F_N) must be a positive finite number. Received: ${cfg.statisticalWeight}`,
    );
  }
  if (!Number.isFinite(cfg.dt)) {
    throw new TypeError(
      `NTC timestep dt must be a finite number [s]. Received: ${cfg.dt}`,
    );
  }
  if (cfg.dt < 0) {
    throw new RangeError(
      `NTC timestep dt must be non-negative [s]. Received: ${cfg.dt}`,
    );
  }
}

/**
 * Validates the per-cell NTC state array.
 */
function validateCellStates(
  cellStates: NTCCellState[],
  totalCells: number,
): void {
  if (cellStates.length !== totalCells) {
    throw new RangeError(
      `cellStates length (${cellStates.length}) must equal totalCells (${totalCells}).`,
    );
  }
  for (let c = 0; c < totalCells; c++) {
    const gMax = cellStates[c].gMax;
    if (!Number.isFinite(gMax) || gMax <= 0) {
      throw new RangeError(
        `cellStates[${c}].gMax must be a positive finite number [m/s]. Received: ${gMax}`,
      );
    }
  }
}

/**
 * Creates an initial array of per-cell NTC state objects, all seeded with
 * the same initial g_max estimate.
 *
 * @param totalCells  Number of cells (= grouping.totalCells).
 * @param initialGMax Seed maximum relative speed [m/s]. Should be a physically
 *                    plausible upper bound, e.g. 2 × √(2RT/M) for the gas temperature.
 *                    Must be positive and finite.
 * @returns Array of NTCCellState objects, one per cell.
 */
export function createNTCCellStates(totalCells: number, initialGMax: number): NTCCellState[] {
  if (!Number.isInteger(totalCells) || totalCells < 1) {
    throw new RangeError(
      `totalCells must be a positive integer. Received: ${totalCells}`,
    );
  }
  if (!Number.isFinite(initialGMax) || initialGMax <= 0) {
    throw new RangeError(
      `initialGMax must be a positive finite number [m/s]. Received: ${initialGMax}`,
    );
  }
  const states: NTCCellState[] = new Array(totalCells);
  for (let c = 0; c < totalCells; c++) {
    states[c] = { gMax: initialGMax };
  }
  return states;
}

/**
 * Performs one full Bird NTC collision step over all cells.
 *
 * For each cell with Np ≥ 2 simulator particles:
 *  1. Computes M_cand = ceil( (Np(Np-1)/2) · F_N · σ_T · g_max · Δt / V_c ).
 *  2. Draws M_cand random candidate pairs (i ≠ j) from within the cell.
 *  3. For each pair, computes relative speed g = |v_i - v_j|.
 *     - If g > g_max: updates g_max ← g (self-correcting).
 *     - Accepts the pair with probability g / g_max.
 *  4. For accepted pairs, executes performElasticCollision(i, j, ensemble, prng).
 *
 * Cells with Np < 2 are skipped. Positions are never modified.
 *
 * Zero-allocation design: particle indices are read directly from the
 * CellGrouping Int32Array; no per-cell or per-collision arrays are created.
 *
 * @param ensemble    Particle ensemble (velocities modified in-place for accepted collisions).
 * @param grouping    Pre-computed cell grouping from groupParticlesIntoCells().
 * @param cellStates  Per-cell NTC state (gMax updated in-place).
 * @param cfg         NTC configuration (crossSection, statisticalWeight, dt).
 * @param cellVolume  Physical volume of each cell [m³] (= cellLx × cellLy × cellLz).
 *                    All cells share the same volume for a uniform grid.
 * @param prng        Seeded PRNG (consumed for pair selection and acceptance tests).
 * @returns NTCStepResult with diagnostic totals.
 */
export function performNTCStep(
  ensemble: ParticleEnsemble,
  grouping: CellGrouping,
  cellStates: NTCCellState[],
  cfg: NTCConfig,
  cellVolume: number,
  prng: PRNG,
): NTCStepResult {
  // 1. Validate inputs
  validateNTCConfig(cfg);

  if (!Number.isFinite(cellVolume) || cellVolume <= 0) {
    throw new RangeError(
      `cellVolume must be a positive finite number [m³]. Received: ${cellVolume}`,
    );
  }

  validateCellStates(cellStates, grouping.totalCells);

  const { crossSection: sigmaT, statisticalWeight: FN, dt } = cfg;

  // Zero-dt short-circuit: no collisions, no state change
  if (dt === 0) {
    return {
      totalCandidatePairs: 0,
      totalAcceptedCollisions: 0,
      maxRelativeSpeedObserved: 0,
      emptyCellsSkipped: grouping.totalCells,
    };
  }

  let totalCandidatePairs = 0;
  let totalAcceptedCollisions = 0;
  let maxRelativeSpeedObserved = 0;
  let emptyCellsSkipped = 0;

  const { cellCounts, cellOffsets, particleLists } = grouping;
  const vx = ensemble.vx;
  const vy = ensemble.vy;
  const vz = ensemble.vz;

  // Pre-compute the constant portion of M_cand numerator: F_N · σ_T · Δt / V_c
  const rateConstant = FN * sigmaT * dt / cellVolume;

  // 2. Loop over each cell
  for (let c = 0; c < grouping.totalCells; c++) {
    const Np = cellCounts[c];

    // Skip cells that cannot form a collision pair
    if (Np < 2) {
      emptyCellsSkipped++;
      continue;
    }

    const offset = cellOffsets[c];
    let gMax = cellStates[c].gMax;

    // M_cand = ceil( Np(Np-1)/2 · F_N · σ_T · g_max · Δt / V_c )
    // Use ceil to ensure at least 1 candidate is evaluated when the formula yields > 0
    const Mcand = Math.ceil((Np * (Np - 1)) / 2 * gMax * rateConstant);
    totalCandidatePairs += Mcand;

    // 3. Evaluate Mcand candidate pairs
    for (let k = 0; k < Mcand; k++) {
      // Draw two distinct random indices within [0, Np) without replacement.
      // This strictly guarantees ia !== ib and yields a uniform distribution over all Np*(Np-1) ordered pairs.
      const ia = Math.floor(prng.next() * Np);
      let ib = Math.floor(prng.next() * (Np - 1));
      if (ib >= ia) {
        ib++;
      }

      // Look up actual particle ensemble indices from the cell's particle list
      const pi = particleLists[offset + ia];
      const pj = particleLists[offset + ib];

      // Compute relative speed for this pair
      const dvx = vx[pi] - vx[pj];
      const dvy = vy[pi] - vy[pj];
      const dvz = vz[pi] - vz[pj];
      const g = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);

      if (!Number.isFinite(g)) {
        throw new RangeError(
          `Non-finite relative speed (${g}) encountered for particle pair (${pi}, ${pj}). Particles must have finite state.`,
        );
      }

      if (g > maxRelativeSpeedObserved) {
        maxRelativeSpeedObserved = g;
      }

      // 4. Self-correcting g_max update
      if (g > gMax) {
        gMax = g;
      }

      // 5. Acceptance test: accept with probability g / g_max
      const pAcc = g / gMax;
      if (prng.next() < pAcc) {
        // Perform the elastic binary collision
        performElasticCollision(pi, pj, ensemble, prng);
        totalAcceptedCollisions++;
      }
    }

    // 6. Persist updated g_max for this cell
    cellStates[c].gMax = gMax;
  }

  return {
    totalCandidatePairs,
    totalAcceptedCollisions,
    maxRelativeSpeedObserved,
    emptyCellsSkipped,
  };
}
