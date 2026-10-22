/**
 * DSMC Stage 3A Tests: Elastic Collision Physics & Collision-Cell Infrastructure
 * ===============================================================================
 *
 * Covers:
 *  1. Binary elastic collision physics (momentum, kinetic energy, relative speed).
 *  2. Uniform sphere sampling (Marsaglia method).
 *  3. Collision-cell grouping (determinism, boundary particles, empty cells,
 *     invalid inputs, read-only semantics).
 */

import { describe, it, expect } from 'vitest';
import {
  Mulberry32PRNG,
  ParticleEnsemble,
  performElasticCollision,
  sampleUniformSphere,
  groupParticlesIntoCells,
  coordToCellIndex,
  flatCellIndex,
} from '../physics/dsmc';
import type { ChamberGeometry3D, CellGridConfig } from '../physics/dsmc';
import { HELIUM, AVOGADRO } from '../physics/constants';

// ─── helpers ────────────────────────────────────────────────────────────────

const HELIUM_M0 = HELIUM.molarMass / AVOGADRO; // single atom mass [kg]

function kineticEnergy(ensemble: ParticleEnsemble, i: number): number {
  return (
    0.5 *
    HELIUM_M0 *
    (ensemble.vx[i] ** 2 + ensemble.vy[i] ** 2 + ensemble.vz[i] ** 2)
  );
}

function momentum(ensemble: ParticleEnsemble, i: number): [number, number, number] {
  return [
    HELIUM_M0 * ensemble.vx[i],
    HELIUM_M0 * ensemble.vy[i],
    HELIUM_M0 * ensemble.vz[i],
  ];
}

const defaultChamber: ChamberGeometry3D = {
  xMin: -0.1,
  xMax: 0.1,
  yMin: -0.1,
  yMax: 0.1,
  zMin: 0.0,
  piston: { position: 0.5, velocity: 0 },
};

const defaultCfg: CellGridConfig = { nx: 4, ny: 4, nz: 4 };

// ─── 1. Elastic Binary Collision Physics ─────────────────────────────────── //

describe('DSMC Stage 3A: performElasticCollision', () => {
  it('conserves total momentum for a head-on collision', () => {
    const ens = new ParticleEnsemble(2);
    ens.setParticle(0, 0, 0, 0.1, 500, 0, 0);
    ens.setParticle(1, 0, 0, 0.2, -300, 0, 0);

    const [px0, py0, pz0] = momentum(ens, 0);
    const [px1, py1, pz1] = momentum(ens, 1);
    const totalPx = px0 + px1;
    const totalPy = py0 + py1;
    const totalPz = pz0 + pz1;

    const prng = new Mulberry32PRNG(42);
    const result = performElasticCollision(0, 1, ens, prng);
    expect(result.collided).toBe(true);

    const [qx0, qy0, qz0] = momentum(ens, 0);
    const [qx1, qy1, qz1] = momentum(ens, 1);

    expect(qx0 + qx1).toBeCloseTo(totalPx, 10);
    expect(qy0 + qy1).toBeCloseTo(totalPy, 10);
    expect(qz0 + qz1).toBeCloseTo(totalPz, 10);
  });

  it('conserves total translational kinetic energy', () => {
    const ens = new ParticleEnsemble(2);
    ens.setParticle(0, 0, 0, 0.1, 300, -200, 100);
    ens.setParticle(1, 0, 0, 0.2, -100, 400, -50);

    const ke0Before = kineticEnergy(ens, 0);
    const ke1Before = kineticEnergy(ens, 1);
    const totalKeBefore = ke0Before + ke1Before;

    const prng = new Mulberry32PRNG(7);
    performElasticCollision(0, 1, ens, prng);

    const ke0After = kineticEnergy(ens, 0);
    const ke1After = kineticEnergy(ens, 1);
    const totalKeAfter = ke0After + ke1After;

    // Relative tolerance of 1e-12 (well within IEEE-754 double precision)
    expect(Math.abs(totalKeAfter - totalKeBefore) / totalKeBefore).toBeLessThan(1e-12);
  });

  it('preserves the magnitude of the relative velocity (relative speed)', () => {
    const ens = new ParticleEnsemble(2);
    ens.setParticle(0, 0, 0, 0.1, 600, -300, 200);
    ens.setParticle(1, 0, 0, 0.2, -400, 100, -100);

    const relSpeedBefore = Math.sqrt(
      (600 - -400) ** 2 + (-300 - 100) ** 2 + (200 - -100) ** 2,
    );

    const prng = new Mulberry32PRNG(999);
    const result = performElasticCollision(0, 1, ens, prng);

    const relX = ens.vx[0] - ens.vx[1];
    const relY = ens.vy[0] - ens.vy[1];
    const relZ = ens.vz[0] - ens.vz[1];
    const relSpeedAfter = Math.sqrt(relX ** 2 + relY ** 2 + relZ ** 2);

    expect(result.relativeSpeed).toBeCloseTo(relSpeedBefore, 8);
    expect(relSpeedAfter).toBeCloseTo(relSpeedBefore, 8);
  });

  it('produces deterministic outcomes for the same seed and initial conditions', () => {
    function runCollision(seed: number): [number, number, number, number, number, number] {
      const ens = new ParticleEnsemble(2);
      ens.setParticle(0, 0, 0, 0.1, 400, -200, 300);
      ens.setParticle(1, 0, 0, 0.3, -200, 100, -150);
      const prng = new Mulberry32PRNG(seed);
      performElasticCollision(0, 1, ens, prng);
      return [ens.vx[0], ens.vy[0], ens.vz[0], ens.vx[1], ens.vy[1], ens.vz[1]];
    }

    const runA = runCollision(123);
    const runB = runCollision(123);

    for (let k = 0; k < 6; k++) {
      expect(runA[k]).toBe(runB[k]);
    }
  });

  it('produces different scattering directions for different PRNG seeds', () => {
    function vz0AfterCollision(seed: number): number {
      const ens = new ParticleEnsemble(2);
      ens.setParticle(0, 0, 0, 0.1, 300, 0, 0);
      ens.setParticle(1, 0, 0, 0.2, -300, 0, 0);
      const prng = new Mulberry32PRNG(seed);
      performElasticCollision(0, 1, ens, prng);
      return ens.vz[0];
    }

    // Different seeds must not all produce the same scattering angle
    const results = [1, 2, 3, 42, 1000].map(vz0AfterCollision);
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('is a no-op when relative velocity is zero (identical velocity vectors)', () => {
    const ens = new ParticleEnsemble(2);
    ens.setParticle(0, 0, 0, 0.1, 200, -100, 300);
    ens.setParticle(1, 0, 0, 0.3, 200, -100, 300); // exact same velocity

    const prng = new Mulberry32PRNG(55);
    const result = performElasticCollision(0, 1, ens, prng);

    expect(result.collided).toBe(false);
    expect(result.relativeSpeed).toBe(0);

    // Velocities must be unchanged
    expect(ens.vx[0]).toBe(200);
    expect(ens.vy[0]).toBe(-100);
    expect(ens.vz[0]).toBe(300);
    expect(ens.vx[1]).toBe(200);
    expect(ens.vy[1]).toBe(-100);
    expect(ens.vz[1]).toBe(300);
  });

  it('positions are not modified by a collision', () => {
    const ens = new ParticleEnsemble(2);
    ens.setParticle(0, 0.01, -0.02, 0.1, 300, -200, 100);
    ens.setParticle(1, -0.03, 0.04, 0.3, -150, 50, -80);

    const prng = new Mulberry32PRNG(11);
    performElasticCollision(0, 1, ens, prng);

    expect(ens.x[0]).toBe(0.01);
    expect(ens.y[0]).toBe(-0.02);
    expect(ens.z[0]).toBe(0.1);
    expect(ens.x[1]).toBe(-0.03);
    expect(ens.y[1]).toBe(0.04);
    expect(ens.z[1]).toBe(0.3);
  });

  it('rejects out-of-bounds particle indices', () => {
    const ens = new ParticleEnsemble(3);
    ens.setParticle(0, 0, 0, 0.1, 100, 0, 0);
    ens.setParticle(1, 0, 0, 0.2, -100, 0, 0);
    const prng = new Mulberry32PRNG(1);

    expect(() => performElasticCollision(-1, 1, ens, prng)).toThrow(RangeError);
    expect(() => performElasticCollision(0, 3, ens, prng)).toThrow(RangeError);
    expect(() => performElasticCollision(0, -1, ens, prng)).toThrow(RangeError);
    expect(() => performElasticCollision(3, 0, ens, prng)).toThrow(RangeError);
  });

  it('rejects identical particle indices', () => {
    const ens = new ParticleEnsemble(3);
    ens.setParticle(0, 0, 0, 0.1, 100, 0, 0);
    const prng = new Mulberry32PRNG(1);

    expect(() => performElasticCollision(0, 0, ens, prng)).toThrow(RangeError);
    expect(() => performElasticCollision(2, 2, ens, prng)).toThrow(RangeError);
  });

  it('rejects non-integer particle indices', () => {
    const ens = new ParticleEnsemble(3);
    ens.setParticle(0, 0, 0, 0.1, 100, 0, 0);
    ens.setParticle(1, 0, 0, 0.2, -100, 0, 0);
    const prng = new Mulberry32PRNG(1);

    expect(() => performElasticCollision(0.5, 1, ens, prng)).toThrow(RangeError);
    expect(() => performElasticCollision(0, 1.9, ens, prng)).toThrow(RangeError);
  });

  it('rejects non-finite particle velocities', () => {
    const ens = new ParticleEnsemble(2);
    // Manually write NaN to a velocity component (bypassing setParticle validation)
    ens.setParticle(0, 0, 0, 0.1, 100, 0, 0);
    ens.setParticle(1, 0, 0, 0.2, 100, 0, 0);
    ens.vx[0] = NaN; // intentionally corrupt
    const prng = new Mulberry32PRNG(1);

    expect(() => performElasticCollision(0, 1, ens, prng)).toThrow(RangeError);
  });

  it('is numerically stable for representative Maxwell-Boltzmann speeds at 300 K', () => {
    // At 300 K, helium most-probable speed ≈ 1114 m/s
    const ens = new ParticleEnsemble(2);
    ens.setParticle(0, 0, 0, 0.1, 1114, -600, 300);
    ens.setParticle(1, 0, 0, 0.2, -900, 450, -200);

    const prng = new Mulberry32PRNG(314);
    performElasticCollision(0, 1, ens, prng);

    // All velocity components must remain finite
    for (const i of [0, 1]) {
      expect(Number.isFinite(ens.vx[i])).toBe(true);
      expect(Number.isFinite(ens.vy[i])).toBe(true);
      expect(Number.isFinite(ens.vz[i])).toBe(true);
    }
  });
});

// ─── 2. Uniform Sphere Sampling ──────────────────────────────────────────── //

describe('DSMC Stage 3A: sampleUniformSphere', () => {
  it('returns a unit vector (|n̂| = 1) within floating-point tolerance', () => {
    const prng = new Mulberry32PRNG(77);
    for (let trial = 0; trial < 1000; trial++) {
      const [nx, ny, nz] = sampleUniformSphere(prng);
      const norm = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(norm).toBeCloseTo(1.0, 12);
    }
  });

  it('produces deterministic output for identical seed', () => {
    const prng1 = new Mulberry32PRNG(88);
    const prng2 = new Mulberry32PRNG(88);
    for (let i = 0; i < 200; i++) {
      const [a, b, c] = sampleUniformSphere(prng1);
      const [x, y, z] = sampleUniformSphere(prng2);
      expect(a).toBe(x);
      expect(b).toBe(y);
      expect(c).toBe(z);
    }
  });

  it('nz component covers both positive and negative values across many samples', () => {
    const prng = new Mulberry32PRNG(1234);
    let pos = 0;
    let neg = 0;
    for (let i = 0; i < 500; i++) {
      const [, , nz] = sampleUniformSphere(prng);
      if (nz > 0) pos++;
      else if (nz < 0) neg++;
    }
    // Both hemispheres must be sampled
    expect(pos).toBeGreaterThan(100);
    expect(neg).toBeGreaterThan(100);
  });
});

// ─── 3. Collision-Cell Infrastructure ───────────────────────────────────── //

describe('DSMC Stage 3A: groupParticlesIntoCells', () => {
  it('assigns particles to the correct cell for known positions', () => {
    // 2×2×2 grid over the default chamber:
    // x: [-0.1, 0.1) and [0, 0.1) → cells 0 and 1
    // y: [-0.1, 0)   and [0, 0.1) → cells 0 and 1
    // z: [0, 0.25)   and [0.25, 0.5) → cells 0 and 1
    const cfg: CellGridConfig = { nx: 2, ny: 2, nz: 2 };

    const ens = new ParticleEnsemble(8);
    // Place one particle in each of the 8 cells
    const xs = [-0.05, 0.05, -0.05, 0.05, -0.05, 0.05, -0.05, 0.05];
    const ys = [-0.05, -0.05, 0.05, 0.05, -0.05, -0.05, 0.05, 0.05];
    const zs = [0.1, 0.1, 0.1, 0.1, 0.35, 0.35, 0.35, 0.35];
    for (let i = 0; i < 8; i++) {
      ens.setParticle(i, xs[i], ys[i], zs[i], 0, 0, 0);
    }

    const grouping = groupParticlesIntoCells(ens, defaultChamber, cfg);

    expect(grouping.totalCells).toBe(8);

    // Every cell should have exactly one particle
    for (let c = 0; c < 8; c++) {
      expect(grouping.cellCounts[c]).toBe(1);
    }

    // Total particles across all cells = 8
    let total = 0;
    for (let c = 0; c < 8; c++) {
      total += grouping.cellCounts[c];
    }
    expect(total).toBe(8);
  });

  it('places a particle exactly at the upper boundary into the last cell', () => {
    const cfg: CellGridConfig = { nx: 1, ny: 1, nz: 1 };
    const ens = new ParticleEnsemble(1);
    // Place at the exact upper-x and piston-z boundaries
    ens.setParticle(0, 0.1, 0.0, 0.5, 0, 0, 0);

    const grouping = groupParticlesIntoCells(ens, defaultChamber, cfg);
    expect(grouping.totalCells).toBe(1);
    expect(grouping.cellCounts[0]).toBe(1);
    expect(grouping.particleLists[0]).toBe(0);
  });

  it('places a particle at lower boundaries into cell 0', () => {
    const cfg: CellGridConfig = { nx: 4, ny: 4, nz: 4 };
    const ens = new ParticleEnsemble(1);
    ens.setParticle(0, -0.1, -0.1, 0.0, 0, 0, 0); // exact lower boundaries

    const grouping = groupParticlesIntoCells(ens, defaultChamber, cfg);
    // Should be in cell (0,0,0) = flat index 0
    expect(grouping.cellCounts[0]).toBe(1);
    expect(grouping.particleLists[grouping.cellOffsets[0]]).toBe(0);
  });

  it('supports empty cells and single-particle cells', () => {
    const cfg: CellGridConfig = { nx: 4, ny: 4, nz: 4 }; // 64 cells
    const ens = new ParticleEnsemble(2);
    // Both particles in the same corner cell
    ens.setParticle(0, -0.09, -0.09, 0.01, 0, 0, 0);
    ens.setParticle(1, -0.08, -0.09, 0.01, 0, 0, 0);

    const grouping = groupParticlesIntoCells(ens, defaultChamber, cfg);

    // Most cells are empty
    let emptyCells = 0;
    let maxCount = 0;
    for (let c = 0; c < grouping.totalCells; c++) {
      if (grouping.cellCounts[c] === 0) emptyCells++;
      if (grouping.cellCounts[c] > maxCount) maxCount = grouping.cellCounts[c];
    }

    expect(emptyCells).toBeGreaterThan(60); // most cells empty
    expect(maxCount).toBeGreaterThanOrEqual(2); // at least one cell has both particles
  });

  it('does not modify particle positions or velocities during grouping', () => {
    const cfg: CellGridConfig = { nx: 2, ny: 2, nz: 2 };
    const ens = new ParticleEnsemble(4);
    ens.setParticle(0, -0.05, -0.05, 0.1, 300, -100, 50);
    ens.setParticle(1, 0.05, 0.05, 0.4, -200, 200, -80);
    ens.setParticle(2, -0.08, 0.02, 0.2, 100, 150, -20);
    ens.setParticle(3, 0.01, -0.07, 0.35, -50, -300, 120);

    const snapshot = [
      [ens.x[0], ens.y[0], ens.z[0], ens.vx[0], ens.vy[0], ens.vz[0]],
      [ens.x[1], ens.y[1], ens.z[1], ens.vx[1], ens.vy[1], ens.vz[1]],
      [ens.x[2], ens.y[2], ens.z[2], ens.vx[2], ens.vy[2], ens.vz[2]],
      [ens.x[3], ens.y[3], ens.z[3], ens.vx[3], ens.vy[3], ens.vz[3]],
    ];

    groupParticlesIntoCells(ens, defaultChamber, cfg);

    for (let i = 0; i < 4; i++) {
      expect(ens.x[i]).toBe(snapshot[i][0]);
      expect(ens.y[i]).toBe(snapshot[i][1]);
      expect(ens.z[i]).toBe(snapshot[i][2]);
      expect(ens.vx[i]).toBe(snapshot[i][3]);
      expect(ens.vy[i]).toBe(snapshot[i][4]);
      expect(ens.vz[i]).toBe(snapshot[i][5]);
    }
  });

  it('produces identical grouping for identical ensemble states (deterministic)', () => {
    const cfg: CellGridConfig = { nx: 3, ny: 3, nz: 3 };
    const prng1 = new Mulberry32PRNG(42);
    const prng2 = new Mulberry32PRNG(42);

    const ens1 = new ParticleEnsemble(100);
    const ens2 = new ParticleEnsemble(100);
    const bounds = { xMin: -0.1, xMax: 0.1, yMin: -0.1, yMax: 0.1, zMin: 0, zMax: 0.5 };
    ens1.initializeUniformPositions(bounds, prng1);
    ens2.initializeUniformPositions(bounds, prng2);

    const g1 = groupParticlesIntoCells(ens1, defaultChamber, cfg);
    const g2 = groupParticlesIntoCells(ens2, defaultChamber, cfg);

    for (let c = 0; c < g1.totalCells; c++) {
      expect(g1.cellCounts[c]).toBe(g2.cellCounts[c]);
    }
    for (let i = 0; i < 100; i++) {
      expect(g1.particleLists[i]).toBe(g2.particleLists[i]);
    }
  });

  it('rejects invalid cell grid configuration', () => {
    const ens = new ParticleEnsemble(1);
    ens.setParticle(0, 0, 0, 0.25, 0, 0, 0);

    expect(() =>
      groupParticlesIntoCells(ens, defaultChamber, { nx: 0, ny: 4, nz: 4 }),
    ).toThrow(RangeError);

    expect(() =>
      groupParticlesIntoCells(ens, defaultChamber, { nx: 4, ny: -1, nz: 4 }),
    ).toThrow(RangeError);

    expect(() =>
      groupParticlesIntoCells(ens, defaultChamber, { nx: 4, ny: 4, nz: 1.5 }),
    ).toThrow(RangeError);
  });

  it('rejects particles outside the chamber domain', () => {
    const ens = new ParticleEnsemble(1);
    // Put the particle outside xMax
    ens.setParticle(0, 0.15, 0, 0.25, 0, 0, 0); // x = 0.15 > xMax (0.1)

    expect(() =>
      groupParticlesIntoCells(ens, defaultChamber, defaultCfg),
    ).toThrow(RangeError);
  });

  it('rejects degenerate chamber (piston below floor)', () => {
    const badChamber: ChamberGeometry3D = {
      ...defaultChamber,
      piston: { position: 0.0, velocity: 0 }, // piston at floor
    };
    const ens = new ParticleEnsemble(1);
    ens.setParticle(0, 0, 0, 0.0, 0, 0, 0);

    expect(() =>
      groupParticlesIntoCells(ens, badChamber, defaultCfg),
    ).toThrow(RangeError);
  });

  it('correctly reports cell dimensions from geometry', () => {
    const cfg: CellGridConfig = { nx: 5, ny: 10, nz: 2 };
    const ens = new ParticleEnsemble(1);
    ens.setParticle(0, 0, 0, 0.25, 0, 0, 0);

    const g = groupParticlesIntoCells(ens, defaultChamber, cfg);

    expect(g.cellLx).toBeCloseTo((0.1 - -0.1) / 5, 12);   // 0.04 m
    expect(g.cellLy).toBeCloseTo((0.1 - -0.1) / 10, 12);  // 0.02 m
    expect(g.cellLz).toBeCloseTo((0.5 - 0.0) / 2, 12);    // 0.25 m
  });
});

// ─── 4. Helper Function Unit Tests ──────────────────────────────────────── //

describe('DSMC Stage 3A: coordToCellIndex and flatCellIndex', () => {
  it('coordToCellIndex: interior point', () => {
    // Domain [0, 1], 4 cells: L = 0.25
    expect(coordToCellIndex(0.3, 0, 0.25, 4)).toBe(1);
    expect(coordToCellIndex(0.6, 0, 0.25, 4)).toBe(2);
  });

  it('coordToCellIndex: clamps lower boundary to cell 0', () => {
    expect(coordToCellIndex(0.0, 0, 0.25, 4)).toBe(0);
  });

  it('coordToCellIndex: clamps upper boundary to last cell', () => {
    expect(coordToCellIndex(1.0, 0, 0.25, 4)).toBe(3); // not 4
  });

  it('flatCellIndex: correct C-order linearization', () => {
    // 3×4×5 grid: flat = ix*(4*5) + iy*5 + iz
    expect(flatCellIndex(0, 0, 0, 4, 5)).toBe(0);
    expect(flatCellIndex(1, 0, 0, 4, 5)).toBe(20);
    expect(flatCellIndex(0, 1, 0, 4, 5)).toBe(5);
    expect(flatCellIndex(0, 0, 1, 4, 5)).toBe(1);
    expect(flatCellIndex(2, 3, 4, 4, 5)).toBe(2 * 20 + 3 * 5 + 4); // = 59
  });
});

// ─── 5. Multi-particle stress test: cells + collisions together ──────────── //

describe('DSMC Stage 3A: integration — grouping then collisions within cells', () => {
  it('can collide all pairs within each cell without corrupting ensemble state', () => {
    const prng = new Mulberry32PRNG(2024);
    const ens = new ParticleEnsemble(50);
    const bounds = { xMin: -0.1, xMax: 0.1, yMin: -0.1, yMax: 0.1, zMin: 0, zMax: 0.5 };
    ens.initializeUniformPositions(bounds, prng);
    ens.initializeMaxwellianVelocities(300, HELIUM.molarMass, prng);

    const cfg: CellGridConfig = { nx: 2, ny: 2, nz: 2 };
    const grouping = groupParticlesIntoCells(ens, defaultChamber, cfg);

    // Perform one collision between the first two particles in each cell that has ≥2
    const collisionPrng = new Mulberry32PRNG(777);
    let collisionsPerformed = 0;

    for (let c = 0; c < grouping.totalCells; c++) {
      const count = grouping.cellCounts[c];
      if (count >= 2) {
        const off = grouping.cellOffsets[c];
        const p1 = grouping.particleLists[off];
        const p2 = grouping.particleLists[off + 1];
        performElasticCollision(p1, p2, ens, collisionPrng);
        collisionsPerformed++;
      }
    }

    // At least some collisions should have occurred
    expect(collisionsPerformed).toBeGreaterThan(0);

    // All velocities must remain finite
    for (let i = 0; i < 50; i++) {
      expect(Number.isFinite(ens.vx[i])).toBe(true);
      expect(Number.isFinite(ens.vy[i])).toBe(true);
      expect(Number.isFinite(ens.vz[i])).toBe(true);
    }
  });
});
