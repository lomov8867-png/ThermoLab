/**
 * DSMCEntropyExplorer — Qualitative Particle Distribution Explorer
 * ================================================================
 *
 * Designed for CBSE Class 11 Physics students.
 *
 * This component lets students explore what it means for particles to be
 * "spread out" versus "concentrated", which is the everyday intuition behind
 * the statistical concept of entropy.
 *
 * HOW IT WORKS
 * ─────────────
 * A single slider controls how tightly the particles are clustered at the
 * centre of the chamber when the student clicks "Apply".  After redistribution
 * the existing DSMC engine takes over: particles move naturally, collide, and
 * diffuse at their current velocities.  The slider does NOT continuously
 * override the physics — it is a one-shot initial placement tool.
 *
 * SCIENTIFIC HONESTY
 * ───────────────────
 * This component deliberately does NOT display numerical entropy values.
 * Visualising a spatial distribution is a qualitative illustration of the
 * statistical idea of disorder; it is not a measurement of thermodynamic
 * entropy S.  That distinction is stated explicitly in the UI text.
 *
 * The entropy calculations in the physics engine (Sackur-Tetrode, H-functional,
 * etc.) are preserved untouched; they are simply not shown here.
 *
 * @module
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { DSMCSimulation } from '../../physics/dsmc';
import type { DSMCSimulationSnapshot } from '../../physics/dsmc';

interface Props {
  simulationRef: React.MutableRefObject<DSMCSimulation>;
  snapshot: DSMCSimulationSnapshot;
}

/** Number of qualitative spread levels shown on the slider. */
const LEVELS = 5;

interface SpreadLevel {
  label: string;
  description: string;
  /** Fraction of the chamber half-width used as the Gaussian σ for initial placement.
   *  1.0 means fully uniform; 0.05 means tightly clustered at the centre. */
  sigma: number;
}

const SPREAD_LEVELS: SpreadLevel[] = [
  {
    label: 'Very Concentrated',
    description: 'Almost all particles are packed tightly near the centre.',
    sigma: 0.05,
  },
  {
    label: 'Partially Concentrated',
    description: 'Particles are mostly near the centre with some spread.',
    sigma: 0.20,
  },
  {
    label: 'Moderate Spread',
    description: 'Particles are spread across roughly half the chamber.',
    sigma: 0.45,
  },
  {
    label: 'Mostly Spread',
    description: 'Particles fill most of the chamber with a slight centre bias.',
    sigma: 0.75,
  },
  {
    label: 'Fully Spread (Uniform)',
    description: 'Particles are distributed uniformly throughout the entire chamber.',
    sigma: 2.0,   // σ ≫ chamber → effectively uniform
  },
];

/** A simple seeded LCG for reproducible placement without touching the simulation PRNG. */
function lcgRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Redistribute particle positions according to the chosen sigma.
 * Velocities are left completely untouched so dynamics continue naturally.
 */
function redistributeParticles(sim: DSMCSimulation, sigmaFraction: number): void {
  const geom = sim.geometry;
  const ensemble = sim.ensemble;
  const n = ensemble.count;

  const Lx = geom.xMax - geom.xMin;
  const Ly = geom.yMax - geom.yMin;
  const Lz = geom.piston.position - geom.zMin;

  const cx = Lx / 2;
  const cy = Ly / 2;
  const cz = Lz / 2;

  // σ in metres
  const sx = Lx * sigmaFraction;
  const sy = Ly * sigmaFraction;
  const sz = Lz * sigmaFraction;

  const rand = lcgRandom(0xdeadbeef);

  // Box-Muller for Gaussian placement, clamped to chamber bounds
  const gaussian = (mean: number, sigma: number, lo: number, hi: number): number => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const u1 = Math.max(1e-10, rand());
      const u2 = rand();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const v = mean + sigma * z0;
      if (v >= lo && v <= hi) return v;
    }
    // Fallback: uniform within bounds
    return lo + rand() * (hi - lo);
  };

  if (sigmaFraction >= 2.0) {
    // Uniform distribution — simple and exact
    for (let i = 0; i < n; i++) {
      ensemble.x[i] = geom.xMin + rand() * Lx;
      ensemble.y[i] = geom.yMin + rand() * Ly;
      ensemble.z[i] = geom.zMin + rand() * Lz;
    }
  } else {
    for (let i = 0; i < n; i++) {
      ensemble.x[i] = gaussian(cx, sx, geom.xMin, geom.xMax);
      ensemble.y[i] = gaussian(cy, sy, geom.yMin, geom.yMax);
      ensemble.z[i] = gaussian(cz, sz, geom.zMin, geom.piston.position);
    }
  }
}

// ─── Mini canvas: shows the top-down (X–Y) spatial spread ─────────────────── //

interface SpreadPreviewProps {
  simulationRef: React.MutableRefObject<DSMCSimulation>;
  /** Trigger re-draw whenever this increments (post-apply) */
  drawTrigger: number;
}

const SpreadPreview: React.FC<SpreadPreviewProps> = ({ simulationRef, drawTrigger }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#03060f';
    ctx.fillRect(0, 0, W, H);

    const sim = simulationRef.current;
    const geom = sim.geometry;
    const ensemble = sim.ensemble;
    const n = ensemble.count;

    const Lx = geom.xMax - geom.xMin;
    const Ly = geom.yMax - geom.yMin;

    const pad = 8;
    const drawW = W - 2 * pad;
    const drawH = H - 2 * pad;

    // Chamber outline
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, drawW, drawH);

    const toX = (x: number) => pad + (x / Lx) * drawW;
    const toY = (y: number) => pad + (y / Ly) * drawH;

    // Draw particles as tiny golden dots
    ctx.fillStyle = 'rgba(245, 200, 66, 0.70)';
    for (let i = 0; i < n; i++) {
      const px = ensemble.x[i];
      const py = ensemble.y[i];
      if (px < 0 || px > Lx || py < 0 || py > Ly) continue;
      ctx.beginPath();
      ctx.arc(toX(px), toY(py), 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [simulationRef, drawTrigger]);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={120}
      className="w-full block border border-slate-800/50 bg-[#03060f]"
      aria-label="Top-down view of particle distribution"
    />
  );
};

// ─── Entropy bar — qualitative only ────────────────────────────────────────── //

interface EntropyBarProps {
  levelIndex: number;  // 0 = least spread, LEVELS-1 = most spread
}

const DISORDER_LABELS = ['Very Low', 'Low', 'Medium', 'High', 'Very High'];
const BAR_COLOURS = [
  'bg-blue-600',
  'bg-cyan-500',
  'bg-emerald-500',
  'bg-amber-400',
  'bg-orange-400',
];

const EntropyBar: React.FC<EntropyBarProps> = ({ levelIndex }) => {
  const filledFraction = (levelIndex + 1) / LEVELS;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span>Disorder (qualitative)</span>
        <span className={`font-semibold ${levelIndex >= 3 ? 'text-amber-400' : 'text-slate-300'}`}>
          {DISORDER_LABELS[levelIndex]}
        </span>
      </div>
      <div className="h-2 w-full bg-slate-800 border border-slate-700/50 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${BAR_COLOURS[levelIndex]}`}
          style={{ width: `${filledFraction * 100}%` }}
        />
      </div>
    </div>
  );
};

// ─── Main component ─────────────────────────────────────────────────────────── //

export const DSMCEntropyExplorer: React.FC<Props> = ({ simulationRef, snapshot }) => {
  const [selectedLevel, setSelectedLevel] = useState<number>(LEVELS - 1);
  const [appliedLevel, setAppliedLevel] = useState<number>(LEVELS - 1);
  const [drawTrigger, setDrawTrigger] = useState<number>(0);

  // Keep preview in sync with running simulation
  useEffect(() => {
    let id: number;
    const loop = () => {
      setDrawTrigger((t) => t + 1);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  const handleApply = useCallback(() => {
    const level = SPREAD_LEVELS[selectedLevel];
    redistributeParticles(simulationRef.current, level.sigma);
    setAppliedLevel(selectedLevel);
    setDrawTrigger((t) => t + 1);
  }, [selectedLevel, simulationRef]);

  const current = SPREAD_LEVELS[selectedLevel];
  const isRunning = snapshot.stepCount > 0;

  return (
    <section
      id="dsmc-entropy-explorer"
      className="argon-glass-panel p-4 flex flex-col gap-3"
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="pb-2 border-b border-slate-800/70">
        <div className="spectral-header-accent pl-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Entropy Explorer
          </h2>
          <p className="text-[10px] text-slate-500 font-mono">
            Particle distribution · qualitative illustration
          </p>
        </div>
      </div>

      {/* ── Concept explanation ──────────────────────────────────────────── */}
      <div className="bg-[rgba(6,12,28,0.55)] border border-slate-700/40 px-3 py-2.5 text-[11px] text-slate-300 leading-relaxed">
        <span className="font-semibold text-[#f5c842]">What is entropy?</span>
        {' '}In physics, entropy is related to how many different ways the particles of a
        substance can be arranged. When particles are spread out and mixed uniformly,
        there are far more possible arrangements — so the entropy is higher.
        When they are all crowded into one corner, there are very few arrangements — so the entropy is lower.
        <br /><br />
        Use the slider below to concentrate or spread the particles, then watch
        what happens when they keep moving on their own.
      </div>

      {/* ── Slider ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span>← More concentrated</span>
          <span className="text-slate-200 font-semibold">{current.label}</span>
          <span>More spread out →</span>
        </div>
        <input
          type="range"
          min={0}
          max={LEVELS - 1}
          step={1}
          value={selectedLevel}
          onChange={(e) => setSelectedLevel(Number(e.target.value))}
          className="w-full accent-[#f5c842] cursor-pointer"
          aria-label="Particle distribution spread level"
        />
        <p className="text-[10px] text-slate-400 font-mono text-center">
          {current.description}
        </p>
      </div>

      {/* ── Apply button ─────────────────────────────────────────────────── */}
      <button
        onClick={handleApply}
        className="w-full py-2 text-xs font-mono font-semibold cursor-pointer border transition-all
          bg-[rgba(245,200,66,0.08)] border-[#f5c842]/40 text-[#f5c842]
          hover:bg-[rgba(245,200,66,0.16)] hover:border-[#f5c842]/70"
        aria-label="Apply particle distribution"
      >
        Apply Distribution
        {isRunning && (
          <span className="text-[10px] font-normal text-slate-400 ml-2">
            — particles will keep moving
          </span>
        )}
      </button>

      {/* ── Disorder bar ─────────────────────────────────────────────────── */}
      <EntropyBar levelIndex={appliedLevel} />

      {/* ── Top-down preview ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">
          Top-down view (X–Y plane)
        </span>
        <SpreadPreview simulationRef={simulationRef} drawTrigger={drawTrigger} />
      </div>

      {/* ── Disclaimer ───────────────────────────────────────────────────── */}
      <div className="border border-slate-700/40 bg-[rgba(6,12,28,0.45)] px-3 py-2 text-[10px] text-slate-500 leading-relaxed font-mono">
        <span className="text-slate-400 font-semibold">Note — </span>
        This is a qualitative illustration only. Spreading particles out in a
        simulation does not directly measure or calculate thermodynamic entropy
        (S). Real entropy depends on temperature, volume, and the number of
        particles in ways that cannot be captured by a single slider.
      </div>
    </section>
  );
};
