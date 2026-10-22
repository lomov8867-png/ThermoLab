/**
 * DSMC Stage 3B Tests: Bird NTC Collision Sampling
 * =================================================
 *
 * Tests for the Bird No-Time-Counter (NTC) collision-selection algorithm.
 *
 * Validation strategy
 * ───────────────────
 * NTC is a stochastic algorithm. Tests must distinguish between:
 *  - DETERMINISTIC properties: exact invariants (momentum, energy), zero-dt
 *    no-ops, determinism under fixed seed, input rejection.
 *  - STATISTICAL properties: collision rates scale correctly with σ_T, Δt,
 *    V_c, N_p, F_N. These are checked with generous tolerances justified by
 *    finite-sample variance (~1/√N).
 *
 * Physical constants used for representative scenarios:
 *  - Helium hard-sphere diameter: d_He ≈ 2.18 × 10⁻¹⁰ m
 *    → σ_T = π d² ≈ 1.4924 × 10⁻¹⁹ m²
 *  - Helium molar mass: 4.002602 × 10⁻³ kg/mol
 *  - At 300 K, most-probable speed: v_p = √(2RT/M) ≈ 1114 m/s
 *    → typical relative speed ≈ √2 × v_p ≈ 1575 m/s
 */

import { describe, it, expect } from 'vitest';
import {
  Mulberry32PRNG,
  ParticleEnsemble,
  groupParticlesIntoCells,
  performNTCStep,
  createNTCCellStates,
} from '../physics/dsmc';
import type {
  ChamberGeometry3D,
  CellGridConfig,
  NTCConfig,
} from '../physics/dsmc';
import { HELIUM, AVOGADRO, BOLTZMANN } from '../physics/constants';

// ─── Physical constants for He hard sphere ─────────────────────────────── //
const D_HE = 2.18e-10;                              // [m] hard-sphere diameter
const SIGMA_T = Math.PI * D_HE * D_HE;             // [m²] cross-section ≈ 1.49e-19
const M0 = HELIUM.molarMass / AVOGADRO;            // single atom mass [kg]
const F_N_TEST = 1e20;                              // representative statistical weight

// ─── Shared test geometry ────────────────────────────────────────────────── //
const chamber: ChamberGeometry3D = {
  xMin: -0.05, xMax: 0.05,   // 0.1 m wide in x
  yMin: -0.05, yMax: 0.05,   // 0.1 m wide in y
  zMin: 0.0,
  piston: { position: 0.1, velocity: 0 }, // 0.1 m tall → V_total = 0.001 m³
};
// 2×2×2 grid → 8 cells, each 0.05×0.05×0.05 m = 1.25 × 10⁻⁴ m³
const cfg2x2x2: CellGridConfig = { nx: 2, ny: 2, nz: 2 };
const CELL_VOL = 0.05 * 0.05 * 0.05; // 1.25 × 10⁻⁴ m³

// Seed g_max: 2 × most-probable speed at 300 K
const G_MAX_SEED = 2 * Math.sqrt(2 * BOLTZMANN * 300 / M0); // ≈ 3150 m/s

// ─── Helpers ────────────────────────────────────────────────────────────── //

function ke(ens: ParticleEnsemble, i: number): number {
  return 0.5 * M0 * (ens.vx[i] ** 2 + ens.vy[i] ** 2 + ens.vz[i] ** 2);
}

function totalKE(ens: ParticleEnsemble): number {
  let sum = 0;
  for (let i = 0; i < ens.count; i++) sum += ke(ens, i);
  return sum;
}

function totalMomentum(ens: ParticleEnsemble): [number, number, number] {
  let px = 0, py = 0, pz = 0;
  for (let i = 0; i < ens.count; i++) {
    px += M0 * ens.vx[i];
    py += M0 * ens.vy[i];
    pz += M0 * ens.vz[i];
  }
  return [px, py, pz];
}

/**
 * Builds a small ensemble with particles placed uniformly in the chamber,
 * with Maxwell-Boltzmann velocities at a given temperature.
 */
function buildEnsemble(count: number, T: number, seed: number): ParticleEnsemble {
  const prng = new Mulberry32PRNG(seed);
  const ens = new ParticleEnsemble(count);
  const bounds = {
    xMin: chamber.xMin, xMax: chamber.xMax,
    yMin: chamber.yMin, yMax: chamber.yMax,
    zMin: chamber.zMin, zMax: chamber.piston.position,
  };
  ens.initializeUniformPositions(bounds, prng);
  ens.initializeMaxwellianVelocities(T, HELIUM.molarMass, prng);
  return ens;
}

// ─── 1. Input validation ─────────────────────────────────────────────────── //

describe('DSMC Stage 3B: performNTCStep — input validation', () => {
  it('rejects non-positive or non-finite cross-section', () => {
    const ens = buildEnsemble(10, 300, 1);
    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(1);

    expect(() =>
      performNTCStep(ens, grp, states, { crossSection: 0, statisticalWeight: F_N_TEST, dt: 1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);

    expect(() =>
      performNTCStep(ens, grp, states, { crossSection: -1e-19, statisticalWeight: F_N_TEST, dt: 1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);

    expect(() =>
      performNTCStep(ens, grp, states, { crossSection: NaN, statisticalWeight: F_N_TEST, dt: 1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);

    expect(() =>
      performNTCStep(ens, grp, states, { crossSection: Infinity, statisticalWeight: F_N_TEST, dt: 1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);
  });

  it('rejects non-positive or non-finite statistical weight', () => {
    const ens = buildEnsemble(10, 300, 2);
    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(2);

    expect(() =>
      performNTCStep(ens, grp, states, { crossSection: SIGMA_T, statisticalWeight: 0, dt: 1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);

    expect(() =>
      performNTCStep(ens, grp, states, { crossSection: SIGMA_T, statisticalWeight: -1e20, dt: 1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);

    expect(() =>
      performNTCStep(ens, grp, states, { crossSection: SIGMA_T, statisticalWeight: NaN, dt: 1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);
  });

  it('rejects non-finite timestep and negative timestep', () => {
    const ens = buildEnsemble(10, 300, 3);
    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(3);
    const baseCfg: NTCConfig = { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 1e-6 };

    expect(() =>
      performNTCStep(ens, grp, states, { ...baseCfg, dt: NaN }, CELL_VOL, prng),
    ).toThrow(TypeError);

    expect(() =>
      performNTCStep(ens, grp, states, { ...baseCfg, dt: Infinity }, CELL_VOL, prng),
    ).toThrow(TypeError);

    expect(() =>
      performNTCStep(ens, grp, states, { ...baseCfg, dt: -1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);
  });

  it('rejects non-positive or non-finite cellVolume', () => {
    const ens = buildEnsemble(10, 300, 4);
    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(4);
    const baseCfg: NTCConfig = { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 1e-6 };

    expect(() => performNTCStep(ens, grp, states, baseCfg, 0, prng)).toThrow(RangeError);
    expect(() => performNTCStep(ens, grp, states, baseCfg, -0.001, prng)).toThrow(RangeError);
    expect(() => performNTCStep(ens, grp, states, baseCfg, NaN, prng)).toThrow(RangeError);
  });

  it('rejects cellStates array with wrong length', () => {
    const ens = buildEnsemble(10, 300, 5);
    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const wrongStates = createNTCCellStates(5, G_MAX_SEED); // need 8
    const prng = new Mulberry32PRNG(5);

    expect(() =>
      performNTCStep(ens, grp, wrongStates, { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);
  });

  it('rejects cellStates with non-positive gMax', () => {
    const ens = buildEnsemble(10, 300, 6);
    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    states[0].gMax = 0; // corrupt one cell
    const prng = new Mulberry32PRNG(6);

    expect(() =>
      performNTCStep(ens, grp, states, { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 1e-6 }, CELL_VOL, prng),
    ).toThrow(RangeError);
  });
});

// ─── 2. Zero timestep no-op ──────────────────────────────────────────────── //

describe('DSMC Stage 3B: zero timestep no-op', () => {
  it('returns zero candidate pairs and accepted collisions for dt = 0', () => {
    const ens = buildEnsemble(40, 300, 10);
    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(10);

    const result = performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 0 },
      CELL_VOL, prng,
    );

    expect(result.totalCandidatePairs).toBe(0);
    expect(result.totalAcceptedCollisions).toBe(0);
    expect(result.maxRelativeSpeedObserved).toBe(0);
    expect(result.emptyCellsSkipped).toBe(grp.totalCells);
  });

  it('does not modify any velocities when dt = 0', () => {
    const ens = buildEnsemble(20, 300, 11);
    // Snapshot pre-step velocities
    const vxSnap = Float64Array.from(ens.vx);
    const vySnap = Float64Array.from(ens.vy);
    const vzSnap = Float64Array.from(ens.vz);

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(11);

    performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 0 },
      CELL_VOL, prng,
    );

    for (let i = 0; i < ens.count; i++) {
      expect(ens.vx[i]).toBe(vxSnap[i]);
      expect(ens.vy[i]).toBe(vySnap[i]);
      expect(ens.vz[i]).toBe(vzSnap[i]);
    }
  });
});

// ─── 3. Empty and single-particle cells ─────────────────────────────────── //

describe('DSMC Stage 3B: empty and single-particle cell handling', () => {
  it('skips cells with fewer than 2 particles without throwing', () => {
    // Place exactly 1 particle in the entire chamber → all cells have 0 or 1
    const ens = new ParticleEnsemble(1);
    ens.setParticle(0, 0, 0, 0.05, 1000, 0, 0);

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(20);

    const result = performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 1e-6 },
      CELL_VOL, prng,
    );

    expect(result.totalCandidatePairs).toBe(0);
    expect(result.totalAcceptedCollisions).toBe(0);
    expect(result.emptyCellsSkipped).toBe(grp.totalCells);
  });

  it('reports skipped cells correctly when only some cells have particles', () => {
    // 2 particles in the same cell, rest empty
    const ens = new ParticleEnsemble(2);
    // Both in bottom-left-front cell of 2×2×2
    ens.setParticle(0, -0.04, -0.04, 0.02, 500, 0, 0);
    ens.setParticle(1, -0.03, -0.04, 0.02, -500, 0, 0);

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(21);

    const result = performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 1e-6 },
      CELL_VOL, prng,
    );

    // 7 out of 8 cells should be skipped
    expect(result.emptyCellsSkipped).toBe(7);
  });
});

// ─── 4. Conservation laws during accepted collisions ────────────────────── //

describe('DSMC Stage 3B: conservation laws', () => {
  it('conserves total kinetic energy across a full NTC step', () => {
    const ens = buildEnsemble(100, 300, 30);
    const keBefore = totalKE(ens);

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(30);

    const result = performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 },
      CELL_VOL, prng,
    );

    expect(result.totalAcceptedCollisions).toBeGreaterThan(0);
    const keAfter = totalKE(ens);
    // Relative tolerance: floating-point rounding over many collisions
    expect(Math.abs(keAfter - keBefore) / keBefore).toBeLessThan(1e-10);
  });

  it('conserves total momentum across a full NTC step', () => {
    const ens = buildEnsemble(80, 300, 31);
    const [px0, py0, pz0] = totalMomentum(ens);

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(31);

    const result = performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 },
      CELL_VOL, prng,
    );

    expect(result.totalAcceptedCollisions).toBeGreaterThan(0);
    const [px1, py1, pz1] = totalMomentum(ens);
    const scale = Math.max(Math.abs(px0), Math.abs(py0), Math.abs(pz0), 1e-30);

    expect(Math.abs(px1 - px0) / scale).toBeLessThan(1e-10);
    expect(Math.abs(py1 - py0) / scale).toBeLessThan(1e-10);
    expect(Math.abs(pz1 - pz0) / scale).toBeLessThan(1e-10);
  });

  it('does not modify particle positions during the collision step', () => {
    const ens = buildEnsemble(60, 300, 32);
    const xSnap = Float64Array.from(ens.x);
    const ySnap = Float64Array.from(ens.y);
    const zSnap = Float64Array.from(ens.z);

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(32);

    const result = performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 },
      CELL_VOL, prng,
    );

    expect(result.totalAcceptedCollisions).toBeGreaterThan(0);
    for (let i = 0; i < ens.count; i++) {
      expect(ens.x[i]).toBe(xSnap[i]);
      expect(ens.y[i]).toBe(ySnap[i]);
      expect(ens.z[i]).toBe(zSnap[i]);
    }
  });
});

// ─── 5. Determinism ──────────────────────────────────────────────────────── //

describe('DSMC Stage 3B: determinism', () => {
  it('produces identical results for identical seed, ensemble, and config', () => {
    function runStep(seed: number) {
      const ens = buildEnsemble(50, 300, 99);  // same ensemble construction seed
      const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
      const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
      const prng = new Mulberry32PRNG(seed);

      const result = performNTCStep(
        ens, grp, states,
        { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 },
        CELL_VOL, prng,
      );

      return {
        result,
        vxSum: Array.from(ens.vx).reduce((a, b) => a + b, 0),
        vySum: Array.from(ens.vy).reduce((a, b) => a + b, 0),
        vzSum: Array.from(ens.vz).reduce((a, b) => a + b, 0),
      };
    }

    const runA = runStep(42);
    const runB = runStep(42);

    expect(runA.result.totalCandidatePairs).toBe(runB.result.totalCandidatePairs);
    expect(runA.result.totalAcceptedCollisions).toBe(runB.result.totalAcceptedCollisions);
    expect(runA.vxSum).toBe(runB.vxSum);
    expect(runA.vySum).toBe(runB.vySum);
    expect(runA.vzSum).toBe(runB.vzSum);
  });

  it('produces different results for different PRNG seeds (stochastic)', () => {
    function acceptedCount(seed: number): number {
      const ens = buildEnsemble(60, 300, 77);
      const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
      const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
      const prng = new Mulberry32PRNG(seed);
      const result = performNTCStep(
        ens, grp, states,
        { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 },
        CELL_VOL, prng,
      );
      return result.totalAcceptedCollisions;
    }

    const counts = [1, 2, 3, 4, 5].map(acceptedCount);
    const allSame = counts.every(c => c === counts[0]);
    // With high collision rate, different seeds will produce different acceptance counts
    // (not guaranteed for every pair, but across 5 runs they should differ)
    expect(allSame).toBe(false);
  });
});

// ─── 6. g_max self-correction ────────────────────────────────────────────── //

describe('DSMC Stage 3B: g_max self-correction', () => {
  it('updates gMax when a pair exceeds the initial estimate', () => {
    // Set a very small g_max seed so the first real pair will exceed it
    const ens = new ParticleEnsemble(2);
    // Very high relative speed: 3000 m/s
    ens.setParticle(0, -0.04, -0.04, 0.02, 1500, 0, 0);
    ens.setParticle(1, -0.03, -0.04, 0.02, -1500, 0, 0);
    // relative speed = 3000 m/s

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, 1.0); // very small g_max
    const prng = new Mulberry32PRNG(50);

    performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 1e-9 },
      CELL_VOL, prng,
    );

    // The occupied cell's g_max must have been updated to ≥ 3000 m/s
    let occupiedCellGMax = 0;
    for (let c = 0; c < states.length; c++) {
      if (states[c].gMax > occupiedCellGMax) {
        occupiedCellGMax = states[c].gMax;
      }
    }
    expect(occupiedCellGMax).toBeGreaterThanOrEqual(3000 - 1e-6);
  });

  it('persists updated gMax across multiple steps', () => {
    const ens = new ParticleEnsemble(2);
    ens.setParticle(0, -0.04, -0.04, 0.02, 2000, 0, 0);
    ens.setParticle(1, -0.03, -0.04, 0.02, -2000, 0, 0);
    // relative speed = 4000 m/s

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, 1.0);
    const prng = new Mulberry32PRNG(51);
    const cfg: NTCConfig = { crossSection: SIGMA_T, statisticalWeight: F_N_TEST, dt: 1e-12 };

    // Run two steps
    performNTCStep(ens, grp, states, cfg, CELL_VOL, prng);
    const gMaxAfterStep1 = Math.max(...states.map(s => s.gMax));

    // Second step: g_max from step 1 should be retained
    performNTCStep(ens, grp, states, cfg, CELL_VOL, prng);
    const gMaxAfterStep2 = Math.max(...states.map(s => s.gMax));

    expect(gMaxAfterStep2).toBeGreaterThanOrEqual(gMaxAfterStep1 - 1e-6);
  });
});

// ─── 7. Collision rate scaling ───────────────────────────────────────────── //

describe('DSMC Stage 3B: collision rate scaling (statistical)', () => {
  /**
   * For fixed g_max, the expected candidate pair count is:
   *   M_cand = ceil( N_p(N_p-1)/2 · F_N · σ_T · g_max · Δt / V_c )
   * This is deterministic — we can verify it exactly for a known configuration.
   */
  it('candidate pair count scales proportionally with crossSection', () => {
    // Place all particles in one cell for predictable counts
    const ens = new ParticleEnsemble(4);
    // All in cell (0,0,0) of 2×2×2 grid
    for (let i = 0; i < 4; i++) {
      ens.setParticle(i, -0.04 + i * 0.002, -0.04, 0.02, 0, 0, 0);
    }

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const gMax = 1000.0; // fixed seed
    const dt = 1e-5;
    const FN = 1e18;
    const Np = 4;

    const expectedM = Math.ceil((Np * (Np - 1)) / 2 * gMax * FN * SIGMA_T * dt / CELL_VOL);
    const expected2M = Math.ceil((Np * (Np - 1)) / 2 * gMax * FN * (2 * SIGMA_T) * dt / CELL_VOL);

    const states1 = createNTCCellStates(grp.totalCells, gMax);
    const prng1 = new Mulberry32PRNG(60);
    const r1 = performNTCStep(ens, grp, states1, { crossSection: SIGMA_T, statisticalWeight: FN, dt }, CELL_VOL, prng1);

    // Reset ensemble (positions didn't change, velocities zeroed for determinism)
    for (let i = 0; i < 4; i++) ens.setParticle(i, -0.04 + i * 0.002, -0.04, 0.02, 0, 0, 0);
    const grp2 = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states2 = createNTCCellStates(grp2.totalCells, gMax);
    const prng2 = new Mulberry32PRNG(60);
    const r2 = performNTCStep(ens, grp2, states2, { crossSection: 2 * SIGMA_T, statisticalWeight: FN, dt }, CELL_VOL, prng2);

    expect(r1.totalCandidatePairs).toBe(expectedM);
    expect(r2.totalCandidatePairs).toBe(expected2M);
    // Doubling cross-section should approximately double candidate pairs
    // (exact ratio may differ by 1 due to ceil)
    expect(r2.totalCandidatePairs).toBeGreaterThanOrEqual(r1.totalCandidatePairs);
  });

  it('candidate pair count scales proportionally with dt', () => {
    const ens = new ParticleEnsemble(4);
    for (let i = 0; i < 4; i++) {
      ens.setParticle(i, -0.04 + i * 0.002, -0.04, 0.02, 0, 0, 0);
    }

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const gMax = 500.0;
    const FN = 1e16;
    const dt1 = 1e-5;
    const dt2 = 2e-5;

    const states1 = createNTCCellStates(grp.totalCells, gMax);
    const prng1 = new Mulberry32PRNG(61);
    const r1 = performNTCStep(ens, grp, states1, { crossSection: SIGMA_T, statisticalWeight: FN, dt: dt1 }, CELL_VOL, prng1);

    // Reset
    for (let i = 0; i < 4; i++) ens.setParticle(i, -0.04 + i * 0.002, -0.04, 0.02, 0, 0, 0);
    const grp2 = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states2 = createNTCCellStates(grp2.totalCells, gMax);
    const prng2 = new Mulberry32PRNG(61);
    const r2 = performNTCStep(ens, grp2, states2, { crossSection: SIGMA_T, statisticalWeight: FN, dt: dt2 }, CELL_VOL, prng2);

    // Doubling dt should approximately double candidate pairs
    expect(r2.totalCandidatePairs).toBeGreaterThanOrEqual(r1.totalCandidatePairs);
  });

  it('candidate pair count scales with F_N', () => {
    const ens = new ParticleEnsemble(4);
    for (let i = 0; i < 4; i++) {
      ens.setParticle(i, -0.04 + i * 0.002, -0.04, 0.02, 0, 0, 0);
    }

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const gMax = 500.0;
    const dt = 1e-5;

    const states1 = createNTCCellStates(grp.totalCells, gMax);
    const prng1 = new Mulberry32PRNG(62);
    const r1 = performNTCStep(ens, grp, states1, { crossSection: SIGMA_T, statisticalWeight: 1e15, dt }, CELL_VOL, prng1);

    for (let i = 0; i < 4; i++) ens.setParticle(i, -0.04 + i * 0.002, -0.04, 0.02, 0, 0, 0);
    const grp2 = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states2 = createNTCCellStates(grp2.totalCells, gMax);
    const prng2 = new Mulberry32PRNG(62);
    const r2 = performNTCStep(ens, grp2, states2, { crossSection: SIGMA_T, statisticalWeight: 2e15, dt }, CELL_VOL, prng2);

    // Doubling F_N should approximately double candidate pairs
    expect(r2.totalCandidatePairs).toBeGreaterThanOrEqual(r1.totalCandidatePairs);
  });

  it('accepted collision count is statistically non-zero for high collision probability', () => {
    const ens = buildEnsemble(100, 300, 70);
    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(70);

    const result = performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 },
      CELL_VOL, prng,
    );

    expect(result.totalAcceptedCollisions).toBeGreaterThan(0);
    expect(result.totalCandidatePairs).toBeGreaterThan(0);
    // Accepted ≤ candidates
    expect(result.totalAcceptedCollisions).toBeLessThanOrEqual(result.totalCandidatePairs);
  });

  it('accepted collisions are ≤ candidate pairs in every run', () => {
    for (let seed = 80; seed < 90; seed++) {
      const ens = buildEnsemble(50, 300, seed);
      const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
      const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
      const prng = new Mulberry32PRNG(seed);

      const result = performNTCStep(
        ens, grp, states,
        { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 },
        CELL_VOL, prng,
      );

      expect(result.totalAcceptedCollisions).toBeLessThanOrEqual(result.totalCandidatePairs);
    }
  });
});

// ─── 8. Particles in unrelated cells are not mutated ────────────────────── //

describe('DSMC Stage 3B: isolation between cells', () => {
  it('particles in cells with 0 or 1 members are not velocity-modified', () => {
    // Place 2 particles in one cell and 1 in another;
    // the singleton particle's velocity must remain unchanged.
    const ens = new ParticleEnsemble(3);
    // Cell (0,0,0): two particles
    ens.setParticle(0, -0.04, -0.04, 0.02, 1000, 0, 0);
    ens.setParticle(1, -0.03, -0.04, 0.02, -1000, 0, 0);
    // Cell (1,1,1): one particle
    ens.setParticle(2, 0.04, 0.04, 0.09, 500, 500, 500);

    const vx2 = ens.vx[2], vy2 = ens.vy[2], vz2 = ens.vz[2];

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(90);

    performNTCStep(
      ens, grp, states,
      { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-4 },
      CELL_VOL, prng,
    );

    // Singleton particle must be unchanged
    expect(ens.vx[2]).toBe(vx2);
    expect(ens.vy[2]).toBe(vy2);
    expect(ens.vz[2]).toBe(vz2);
  });
});

// ─── 9. createNTCCellStates validation ──────────────────────────────────── //

describe('DSMC Stage 3B: createNTCCellStates', () => {
  it('creates the correct number of states all seeded with initialGMax', () => {
    const states = createNTCCellStates(10, 2000);
    expect(states.length).toBe(10);
    for (const s of states) {
      expect(s.gMax).toBe(2000);
    }
  });

  it('rejects zero or negative totalCells', () => {
    expect(() => createNTCCellStates(0, 1000)).toThrow(RangeError);
    expect(() => createNTCCellStates(-5, 1000)).toThrow(RangeError);
  });

  it('rejects non-positive or non-finite initialGMax', () => {
    expect(() => createNTCCellStates(8, 0)).toThrow(RangeError);
    expect(() => createNTCCellStates(8, -100)).toThrow(RangeError);
    expect(() => createNTCCellStates(8, NaN)).toThrow(RangeError);
    expect(() => createNTCCellStates(8, Infinity)).toThrow(RangeError);
  });

  it('states can be mutated independently between cells', () => {
    const states = createNTCCellStates(4, 1000);
    states[2].gMax = 9999;
    expect(states[0].gMax).toBe(1000);
    expect(states[2].gMax).toBe(9999);
    expect(states[3].gMax).toBe(1000);
  });
});

// ─── 10. Multi-step ensemble health check ───────────────────────────────── //

describe('DSMC Stage 3B: multi-step ensemble health', () => {
  it('all velocities remain finite after 10 NTC steps with regrouping', () => {
    const prng = new Mulberry32PRNG(100);
    const ens = buildEnsemble(200, 300, 100);
    const cfg: NTCConfig = { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 };

    for (let step = 0; step < 10; step++) {
      const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
      const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
      performNTCStep(ens, grp, states, cfg, CELL_VOL, prng);
    }

    for (let i = 0; i < ens.count; i++) {
      expect(Number.isFinite(ens.vx[i])).toBe(true);
      expect(Number.isFinite(ens.vy[i])).toBe(true);
      expect(Number.isFinite(ens.vz[i])).toBe(true);
    }
  });

  it('total kinetic energy is conserved over 10 NTC steps', () => {
    const ens = buildEnsemble(150, 300, 101);
    const keBefore = totalKE(ens);
    const prng = new Mulberry32PRNG(101);
    const cfg: NTCConfig = { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 };

    for (let step = 0; step < 10; step++) {
      const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
      const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
      performNTCStep(ens, grp, states, cfg, CELL_VOL, prng);
    }

    const keAfter = totalKE(ens);
    expect(Math.abs(keAfter - keBefore) / keBefore).toBeLessThan(1e-9);
  });
});

// ─── 11. Candidate-pair uniqueness ──────────────────────────────────────── //

describe('DSMC Stage 3B: candidate-pair uniqueness', () => {
  it('never selects the same particle twice within a candidate pair', () => {
    const ens = new ParticleEnsemble(3);
    ens.setParticle(0, -0.04, -0.04, 0.02, 100, 0, 0);
    ens.setParticle(1, -0.03, -0.04, 0.02, -100, 0, 0);
    ens.setParticle(2, -0.02, -0.04, 0.02, 0, 100, 0);

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(42);

    // If performNTCStep ever selects ia === ib, performElasticCollision will throw RangeError
    expect(() => {
      for (let s = 0; s < 50; s++) {
        performNTCStep(
          ens,
          grp,
          states,
          { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 },
          CELL_VOL,
          prng,
        );
      }
    }).not.toThrow();
  });
});

// ─── 12. Volume and particle count scaling ──────────────────────────────── //

describe('DSMC Stage 3B: cell volume and particle count scaling', () => {
  it('candidate pair count scales inversely with cell volume', () => {
    const ens = new ParticleEnsemble(4);
    for (let i = 0; i < 4; i++) {
      ens.setParticle(i, -0.04 + i * 0.002, -0.04, 0.02, 0, 0, 0);
    }
    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const gMax = 500.0;
    const FN = 1e16;
    const dt = 1e-5;

    const states1 = createNTCCellStates(grp.totalCells, gMax);
    const prng1 = new Mulberry32PRNG(63);
    const r1 = performNTCStep(ens, grp, states1, { crossSection: SIGMA_T, statisticalWeight: FN, dt }, CELL_VOL, prng1);

    for (let i = 0; i < 4; i++) ens.setParticle(i, -0.04 + i * 0.002, -0.04, 0.02, 0, 0, 0);
    const grp2 = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states2 = createNTCCellStates(grp2.totalCells, gMax);
    const prng2 = new Mulberry32PRNG(63);
    // Double cell volume -> candidate count halved (subject to ceil)
    const r2 = performNTCStep(ens, grp2, states2, { crossSection: SIGMA_T, statisticalWeight: FN, dt }, 2 * CELL_VOL, prng2);

    expect(r1.totalCandidatePairs).toBeGreaterThanOrEqual(r2.totalCandidatePairs);
  });

  it('candidate pair count scales quadratically with particle count N_p*(N_p-1)/2', () => {
    const gMax = 1000.0;
    // Set parameters such that (gMax * FN * crossSection * dt / CELL_VOL) = 10 exactly
    // with crossSection = CELL_VOL, FN = 1, dt = 0.01:
    // 1000 * 1 * (CELL_VOL / CELL_VOL) * 0.01 = 10
    const FN = 1;
    const dt = 0.01;
    const crossSection = CELL_VOL;

    // Case 1: 2 particles in cell -> Np*(Np-1)/2 = 1 -> candidate pairs = ceil(1 * 10) = 10
    const ens2 = new ParticleEnsemble(2);
    ens2.setParticle(0, -0.04, -0.04, 0.02, 0, 0, 0);
    ens2.setParticle(1, -0.03, -0.04, 0.02, 0, 0, 0);
    const grp2 = groupParticlesIntoCells(ens2, chamber, cfg2x2x2);
    const states2 = createNTCCellStates(grp2.totalCells, gMax);
    const prng2 = new Mulberry32PRNG(64);
    const r2 = performNTCStep(ens2, grp2, states2, { crossSection, statisticalWeight: FN, dt }, CELL_VOL, prng2);

    // Case 2: 4 particles in cell -> Np*(Np-1)/2 = 6 -> candidate pairs = ceil(6 * 10) = 60
    const ens4 = new ParticleEnsemble(4);
    for (let i = 0; i < 4; i++) {
      ens4.setParticle(i, -0.04 + i * 0.002, -0.04, 0.02, 0, 0, 0);
    }
    const grp4 = groupParticlesIntoCells(ens4, chamber, cfg2x2x2);
    const states4 = createNTCCellStates(grp4.totalCells, gMax);
    const prng4 = new Mulberry32PRNG(64);
    const r4 = performNTCStep(ens4, grp4, states4, { crossSection, statisticalWeight: FN, dt }, CELL_VOL, prng4);

    expect(r2.totalCandidatePairs).toBe(10);
    expect(r4.totalCandidatePairs).toBe(60);
    expect(r4.totalCandidatePairs).toBe(6 * r2.totalCandidatePairs);
  });
});

// ─── 13. Non-finite particle states ─────────────────────────────────────── //

describe('DSMC Stage 3B: non-finite particle states', () => {
  it('throws RangeError if a particle has NaN or infinite velocity', () => {
    const ens = new ParticleEnsemble(2);
    ens.setParticle(0, -0.04, -0.04, 0.02, NaN, 0, 0);
    ens.setParticle(1, -0.03, -0.04, 0.02, 100, 0, 0);

    const grp = groupParticlesIntoCells(ens, chamber, cfg2x2x2);
    const states = createNTCCellStates(grp.totalCells, G_MAX_SEED);
    const prng = new Mulberry32PRNG(65);

    expect(() =>
      performNTCStep(
        ens,
        grp,
        states,
        { crossSection: SIGMA_T, statisticalWeight: 1e18, dt: 1e-5 },
        CELL_VOL,
        prng,
      ),
    ).toThrow(RangeError);
  });
});
