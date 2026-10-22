/**
 * DSMC Collision Cell Infrastructure
 * ====================================
 *
 * Provides deterministic spatial decomposition of the particle ensemble into a
 * uniform Cartesian grid of collision cells.
 *
 * Purpose in the DSMC Algorithm
 * ──────────────────────────────
 * DSMC collision sampling is local: only particles within the same spatial cell
 * are eligible to collide with each other. This spatial locality maintains
 * physical causality (particles far apart cannot collide in one timestep) and is
 * required for the Bird NTC algorithm implemented in Stage 3B.
 *
 * Cell Structure & Indexing Convention
 * ──────────────────────────────────────
 * The chamber domain [xMin,xMax]×[yMin,yMax]×[zMin,zPiston] is divided into an
 * Nx × Ny × Nz uniform grid. Cell counts (Nx, Ny, Nz) are positive integers
 * supplied by the caller — no default aspect ratio or cell size is invented.
 *
 * Cell dimensions (may be non-cubic):
 *   Lx = (xMax − xMin) / Nx    [m]
 *   Ly = (yMax − yMin) / Ny    [m]
 *   Lz = (zPiston − zMin) / Nz [m]
 *
 * 1D cell index for a position coordinate p in [pMin, pMax] with N cells:
 *   k = floor((p − pMin) / L)
 * Clamped to [0, N−1] so that particles exactly at the upper boundary fall
 * into the last cell (not out of bounds).
 *
 * 3D flat cell index (C-order, x-major):
 *   flatIndex = ix * (Ny * Nz) + iy * Nz + iz
 *
 * Data Structures
 * ───────────────
 * Two pre-allocated Int32Array buffers are used to avoid GC pressure:
 *   - cellCounts[flatIndex]:   number of particles in each cell.
 *   - particleLists:           flat array of particle indices, laid out cell by cell
 *                              using cellOffsets[flatIndex] as starting positions.
 * Offsets are computed in a prefix-sum pass, like a counting-sort bucket layout.
 *
 * These structures make per-cell particle enumeration O(1) without per-step
 * heap allocation, and directly support the NTC selection loop in Stage 3B.
 *
 * Invariants
 * ──────────
 * - Particle positions are not modified during grouping.
 * - Particle velocities are not modified during grouping.
 * - Empty cells and single-particle cells are valid (no collision possible in them).
 * - All particles must be within [xMin, xMax] × [yMin, yMax] × [zMin, zPiston]
 *   before calling groupParticlesIntoCells.
 * - The piston position used for grouping is taken from chamber.piston.position
 *   (the position at the start of the current timestep, before advection).
 *
 * @module
 */

import type { ChamberGeometry3D } from './motion';
import type { ParticleEnsemble } from './particle-ensemble';

/**
 * Configuration parameters specifying the number of collision cells per axis.
 */
export interface CellGridConfig {
  /** Number of cells along the x-axis. Must be a positive integer. */
  readonly nx: number;
  /** Number of cells along the y-axis. Must be a positive integer. */
  readonly ny: number;
  /** Number of cells along the z-axis. Must be a positive integer. */
  readonly nz: number;
}

/**
 * The result of partitioning the ensemble into collision cells.
 *
 * All arrays are pre-allocated and reused across steps to avoid GC pressure.
 * The caller must treat this structure as read-only after it is returned.
 */
export interface CellGrouping {
  /**
   * Grid dimensions (Nx, Ny, Nz) — matches the CellGridConfig used to create this grouping.
   */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;

  /**
   * Total number of cells: Nx × Ny × Nz.
   */
  readonly totalCells: number;

  /**
   * Cell particle counts: cellCounts[flatIdx] = number of particles in that cell.
   * Length = totalCells.
   */
  readonly cellCounts: Int32Array;

  /**
   * Prefix-sum start offsets into particleLists.
   * particleLists[cellOffsets[flatIdx] .. cellOffsets[flatIdx] + cellCounts[flatIdx])
   * contains the particle indices for cell flatIdx.
   * Length = totalCells + 1 (the last entry equals ensemble.count).
   */
  readonly cellOffsets: Int32Array;

  /**
   * Flat list of particle indices arranged by cell.
   * Length = ensemble.count.
   */
  readonly particleLists: Int32Array;

  /**
   * Physical cell dimensions [m].
   */
  readonly cellLx: number;
  readonly cellLy: number;
  readonly cellLz: number;
}

/**
 * Validates the collision cell grid configuration.
 */
function validateCellGridConfig(cfg: CellGridConfig): void {
  for (const [axis, val] of [
    ['nx', cfg.nx],
    ['ny', cfg.ny],
    ['nz', cfg.nz],
  ] as [string, number][]) {
    if (!Number.isFinite(val) || !Number.isInteger(val) || val < 1) {
      throw new RangeError(
        `Cell grid '${axis}' must be a positive finite integer. Received: ${val}`,
      );
    }
  }
}

/**
 * Computes the 1D cell index for a scalar coordinate, clamped to [0, N−1].
 *
 * @param p    Coordinate value [m].
 * @param pMin Lower boundary [m].
 * @param L    Cell width [m] = (pMax − pMin) / N.
 * @param N    Number of cells.
 * @returns Integer cell index in [0, N−1].
 */
export function coordToCellIndex(p: number, pMin: number, L: number, N: number): number {
  const raw = Math.floor((p - pMin) / L);
  // Clamp: particles at the exact upper boundary get index N-1, not N
  if (raw < 0) return 0;
  if (raw >= N) return N - 1;
  return raw;
}

/**
 * Computes the flat (C-order, x-major) 3D cell index from 1D indices.
 *
 * @param ix  x-axis cell index [0, Nx−1].
 * @param iy  y-axis cell index [0, Ny−1].
 * @param iz  z-axis cell index [0, Nz−1].
 * @param ny  Grid Ny.
 * @param nz  Grid Nz.
 * @returns Flat cell index in [0, Nx·Ny·Nz − 1].
 */
export function flatCellIndex(ix: number, iy: number, iz: number, ny: number, nz: number): number {
  return ix * (ny * nz) + iy * nz + iz;
}

/**
 * Groups all particles in the ensemble into collision cells.
 *
 * Positions are not modified. Two Int32Array buffers (counts + offsets) and one
 * flat particle-index list are built using a counting-sort approach.
 *
 * @param ensemble The particle ensemble (positions read, nothing written).
 * @param chamber  Chamber geometry defining the spatial domain and piston position.
 * @param cfg      Collision cell grid dimensions.
 * @returns A CellGrouping object containing cell counts, offsets, and particle lists.
 * @throws RangeError if cell configuration is invalid, geometry is degenerate,
 *                    or any particle lies outside the domain.
 */
export function groupParticlesIntoCells(
  ensemble: ParticleEnsemble,
  chamber: ChamberGeometry3D,
  cfg: CellGridConfig,
): CellGrouping {
  // 1. Validate inputs
  validateCellGridConfig(cfg);

  const { xMin, xMax, yMin, yMax, zMin, piston } = chamber;
  const zPiston = piston.position;

  if (
    !Number.isFinite(xMin) ||
    !Number.isFinite(xMax) ||
    !Number.isFinite(yMin) ||
    !Number.isFinite(yMax) ||
    !Number.isFinite(zMin) ||
    !Number.isFinite(zPiston)
  ) {
    throw new RangeError('Chamber boundary coordinates must all be finite numbers.');
  }

  if (xMax <= xMin) {
    throw new RangeError(`xMax (${xMax}) must be strictly greater than xMin (${xMin}).`);
  }
  if (yMax <= yMin) {
    throw new RangeError(`yMax (${yMax}) must be strictly greater than yMin (${yMin}).`);
  }
  if (zPiston <= zMin) {
    throw new RangeError(
      `Piston position (${zPiston}) must be strictly greater than floor zMin (${zMin}).`,
    );
  }

  const { nx, ny, nz } = cfg;
  const totalCells = nx * ny * nz;
  const n = ensemble.count;

  // 2. Compute cell dimensions
  const cellLx = (xMax - xMin) / nx;
  const cellLy = (yMax - yMin) / ny;
  const cellLz = (zPiston - zMin) / nz;

  // 3. Allocate result buffers (plain Int32Arrays — reusable typed storage)
  const cellCounts = new Int32Array(totalCells);          // counts[flatIdx]
  const cellOffsets = new Int32Array(totalCells + 1);     // prefix sums
  const particleLists = new Int32Array(n);                // particle indices per cell

  // 4. First pass: compute cell assignment for each particle and count per cell
  //    We store the cell index temporarily in particleLists (will be overwritten)
  const particleCellMap = new Int32Array(n); // scratch: cell index for particle i

  const x = ensemble.x;
  const y = ensemble.y;
  const z = ensemble.z;

  for (let i = 0; i < n; i++) {
    const px = x[i];
    const py = y[i];
    const pz = z[i];

    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) {
      throw new RangeError(
        `Non-finite position at particle index ${i}: (${px}, ${py}, ${pz})`,
      );
    }

    // Strict domain check: particle must be within the chamber at this moment
    if (px < xMin || px > xMax || py < yMin || py > yMax || pz < zMin || pz > zPiston) {
      throw new RangeError(
        `Particle ${i} is outside chamber domain: pos=(${px}, ${py}, ${pz}). ` +
          `Domain: x=[${xMin}, ${xMax}], y=[${yMin}, ${yMax}], z=[${zMin}, ${zPiston}]`,
      );
    }

    const ix = coordToCellIndex(px, xMin, cellLx, nx);
    const iy = coordToCellIndex(py, yMin, cellLy, ny);
    const iz = coordToCellIndex(pz, zMin, cellLz, nz);
    const flat = flatCellIndex(ix, iy, iz, ny, nz);

    particleCellMap[i] = flat;
    cellCounts[flat]++;
  }

  // 5. Prefix-sum pass: compute starting offset for each cell in particleLists
  cellOffsets[0] = 0;
  for (let c = 0; c < totalCells; c++) {
    cellOffsets[c + 1] = cellOffsets[c] + cellCounts[c];
  }

  // 6. Second pass: fill particleLists using a write-cursor per cell
  //    We temporarily re-use cellCounts as a write cursor (reset after)
  const writeCursor = new Int32Array(totalCells); // cursor[flatIdx] = next write position
  for (let c = 0; c < totalCells; c++) {
    writeCursor[c] = cellOffsets[c];
  }

  for (let i = 0; i < n; i++) {
    const flat = particleCellMap[i];
    particleLists[writeCursor[flat]] = i;
    writeCursor[flat]++;
  }

  return {
    nx,
    ny,
    nz,
    totalCells,
    cellCounts,
    cellOffsets,
    particleLists,
    cellLx,
    cellLy,
    cellLz,
  };
}
