/**
 * GasChamber — Precision Cylinder with Movable Piston
 * ===================================================
 *
 * Scientific visualization of helium in a vertical cylinder with a movable piston.
 * Sharp rectangular glassmorphism with Argon spectral accents.
 *
 * Features:
 *  - Calibrated volume graticule on the cylinder wall (graduated scale markings).
 *  - Sharp rectangular piston head & rod tracking gas volume V.
 *  - Force indicators: Downward external pressure vs upward gas pressure.
 *  - Thermal interface at cylinder base: heating glow, cooling sink, or adiabatic insulation.
 *  - Qualitative helium particle animation scaled to temperature and density.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import type {
  ThermodynamicState,
  DerivedProperties,
  ProcessMode,
} from '../physics';
import { formatValue } from '../utils/formatting';

interface Props {
  state: ThermodynamicState | null;
  derived: DerivedProperties | null;
  mode: ProcessMode;
  heatingPower: number;
  externalPressure: number;
}

/** Deterministic LCG used only for stable initial particle placement. */
function lcg(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

const GasChamber: React.FC<Props> = ({
  state,
  derived,
  mode,
  heatingPower,
  externalPressure,
}) => {
  // Volume to piston height mapping
  const pistonHeightPct = useMemo(() => {
    if (!state) return 50;
    const normalized = (state.volume - 0.005) / (0.055 - 0.005);
    return Math.min(88, Math.max(16, 15 + normalized * 70));
  }, [state]);

  // Particle count based on gas density
  const particleCount = useMemo(() => {
    if (!derived) return 24;
    return Math.min(50, Math.max(12, Math.round(derived.density * 18)));
  }, [derived]);

  // Animation speed based on rms speed (temperature) — used as canvas loop speed
  const animDuration = useMemo(() => {
    if (!state) return 3;
    const t = Math.max(10, state.temperature);
    return Math.max(0.4, Math.min(6, 1800 / t));
  }, [state]);

  // Canvas ref for golden particle rendering
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Golden particle canvas loop.
  // Particles are placed deterministically by the LCG and then drift at a speed
  // proportional to animDuration (which is derived from temperature via the existing
  // useMemo above).  Lower animDuration = higher temperature = faster motion.
  // No physics forces are introduced — this is a qualitative visual only.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const N = particleCount;
    const rand = lcg(77);

    // Each particle: normalised position (0-1) within the gas cavity, velocity, brightness
    type Particle = { x: number; y: number; vx: number; vy: number; bright: number; r: number };
    const pts: Particle[] = [];
    for (let i = 0; i < N; i++) {
      pts.push({
        x: rand(),
        y: rand(),
        // Speed range tied to animDuration: fast at low duration, slow at high
        vx: (rand() - 0.5) * 0.6 / animDuration,
        vy: (rand() - 0.5) * 0.6 / animDuration,
        bright: 0.55 + rand() * 0.45,
        r: 1.3 + rand() * 0.9,
      });
    }

    let animId: number;
    const tick = () => {
      const W = canvas.width;
      const H = canvas.height;
      // Transparent clear so underlying cavity gradient still shows through
      ctx.clearRect(0, 0, W, H);

      for (const p of pts) {
        // Drift and wrap within [0,1]
        p.x = (p.x + p.vx / 60 + 1) % 1;
        p.y = (p.y + p.vy / 60 + 1) % 1;

        const cx = p.x * W;
        const cy = p.y * H;

        // Golden colour: r ~240, g ~165, b ~10, brightness-modulated
        const r = Math.round(220 + p.bright * 35);
        const g = Math.round(140 + p.bright * 40);
        const b = Math.round(8  + p.bright * 12);
        ctx.fillStyle = `rgba(${r},${g},${b},${(0.5 + p.bright * 0.45).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      animId = requestAnimationFrame(tick);
    };
    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [particleCount, animDuration]);

  const isAdiabatic = mode === 'adiabatic';
  const isHeating = !isAdiabatic && heatingPower > 0;
  const isCooling = !isAdiabatic && heatingPower < 0;

  return (
    <section
      id="gas-chamber"
      className="argon-glass-panel p-4 flex flex-col"
    >
      {/* Header with Title & Operational Mode Badge */}
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800/80">
        <div className="spectral-header-accent pl-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Cylinder &amp; Movable Piston
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            QUASI-STATIC THERMODYNAMIC CAVITY
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdiabatic && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-[rgba(6,12,28,0.65)] border border-[rgba(160,195,235,0.22)] text-slate-300">
              INSULATED (Q = 0)
            </span>
          )}
          {isHeating && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-950/60 border border-amber-500/50 text-amber-300 flex items-center gap-1 shadow-[0_0_8px_rgba(245,158,11,0.25)]">
              <span className="w-1.5 h-1.5 bg-amber-400 animate-pulse inline-block" />
              HEAT FLUX (Q &gt; 0)
            </span>
          )}
          {isCooling && (
            <span className="text-[10px] font-mono px-2 py-0.5 bg-sky-950/60 border border-sky-500/50 text-sky-300 flex items-center gap-1 shadow-[0_0_8px_rgba(14,165,233,0.25)]">
              <span className="w-1.5 h-1.5 bg-sky-400 animate-pulse inline-block" />
              HEAT SINK (Q &lt; 0)
            </span>
          )}
        </div>
      </div>

      {/* Main Chamber Graphic (Sharp precision translucent glass viewport) */}
      <div className="relative w-full aspect-[4/3] bg-[rgba(6,12,28,0.52)] backdrop-blur-[8px] border border-[rgba(160,195,235,0.22)] overflow-hidden flex flex-col justify-end shadow-inner">
        {/* Ambient surroundings background (translucent above the piston) */}
        <div className="absolute inset-0 bg-gradient-to-b from-[rgba(4,10,25,0.35)] via-[rgba(6,14,32,0.45)] to-[rgba(4,10,25,0.6)] pointer-events-none" />

        {/* Graduated Volumetric Scale Ticks (Scientific cylinder marking) */}
        <div className="absolute left-1 top-4 bottom-4 w-5 z-20 flex flex-col justify-between pointer-events-none opacity-50 font-mono text-[8px] text-slate-400">
          <span>50L</span>
          <span className="border-b border-slate-500/60 w-2" />
          <span>40L</span>
          <span className="border-b border-slate-500/60 w-2" />
          <span>30L</span>
          <span className="border-b border-slate-500/60 w-2" />
          <span>20L</span>
          <span className="border-b border-slate-500/60 w-2" />
          <span>10L</span>
        </div>

        {/* Cylinder walls (Left and Right - Sharp rectangular) */}
        <div
          className={`absolute left-6 top-3 bottom-3 w-2 border-r ${
            isAdiabatic
              ? 'bg-[repeating-linear-gradient(45deg,#1e293b,#1e293b_4px,#475569_4px,#475569_8px)] border-amber-500/50'
              : 'bg-slate-700/80 border-[rgba(160,195,235,0.3)]'
          }`}
          title={isAdiabatic ? 'Adiabatic thermally insulating wall' : 'Conducting cylinder wall'}
        />
        <div
          className={`absolute right-6 top-3 bottom-3 w-2 border-l ${
            isAdiabatic
              ? 'bg-[repeating-linear-gradient(-45deg,#1e293b,#1e293b_4px,#475569_4px,#475569_8px)] border-amber-500/50'
              : 'bg-slate-700/80 border-[rgba(160,195,235,0.3)]'
          }`}
          title={isAdiabatic ? 'Adiabatic thermally insulating wall' : 'Conducting cylinder wall'}
        />

        {/* Movable Piston Assembly (Sharp rectangular) */}
        <div
          className="absolute left-8 right-8 transition-all duration-75 ease-out pointer-events-none z-10"
          style={{
            bottom: `${pistonHeightPct}%`,
          }}
        >
          {/* Piston Rod (Sharp rectangular) */}
          <div className="mx-auto w-3.5 h-24 bg-gradient-to-r from-slate-400 via-slate-200 to-slate-500 border-x border-slate-400 shadow-md -mb-0.5" />

          {/* External force indicator */}
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-1 text-[9px] font-mono text-slate-200 bg-[rgba(4,10,25,0.88)] px-2 py-0.5 border border-[rgba(160,195,235,0.3)] shadow-sm">
            <span>↓ P_ext = {Math.round(externalPressure)} Pa</span>
          </div>

          {/* Piston Head (Sharp rectangular block) */}
          <div className="h-5 bg-gradient-to-b from-slate-200 via-slate-400 to-slate-600 border border-slate-300 shadow-lg shadow-black/80 relative flex items-center justify-center">
            {/* Precision seal markers */}
            <div className="absolute left-1 top-0 bottom-0 w-0.5 bg-amber-700" />
            <div className="absolute right-1 top-0 bottom-0 w-0.5 bg-amber-700" />
            <span className="text-[9px] font-mono font-bold tracking-widest text-slate-900 uppercase">
              PISTON HEAD
            </span>
          </div>
        </div>

        {/* Gas Volume Cavity (Beneath the piston) */}
        <div
          className="relative mx-8 transition-all duration-75 ease-out overflow-hidden border-x border-[rgba(160,195,235,0.2)]"
          style={{ height: `${pistonHeightPct}%`, background: '#05091a' }}
        >
          {/* Golden particle canvas — fills the cavity exactly */}
          <canvas
            ref={canvasRef}
            width={300}
            height={300}
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          />

          {/* Internal gas pressure upward force indicator */}
          {state && (
            <div className="absolute top-1.5 left-1/2 -translate-x-1/2 bg-[rgba(4,14,35,0.88)] border border-cyan-400/50 px-2 py-0.5 text-[9px] font-mono text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.2)]">
              ↑ P_gas = {formatValue(state.pressure, 0)} Pa
            </div>
          )}

          {/* Center telemetry HUD badge (Sharp rectangular glass) */}
          {state && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center bg-[rgba(4,10,25,0.85)] backdrop-blur-md px-4 py-2 border border-[rgba(160,195,235,0.3)] shadow-[0_4px_20px_rgba(0,0,0,0.55)]">
                <div className="text-xl font-bold font-mono text-white tracking-wide text-glow">
                  {formatValue(state.temperature, 1)}{' '}
                  <span className="text-xs text-cyan-300 font-mono font-normal">K</span>
                </div>
                <div className="text-[10px] font-mono text-slate-300 mt-0.5">
                  V = {formatValue(state.volume, 5)}{' '}
                  <span className="text-cyan-300">m³</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Cylinder Bottom Base (Thermal Interface - Sharp rectangular) */}
        <div
          className={`h-4 mx-6 border-t flex items-center justify-center relative transition-colors ${
            isAdiabatic
              ? 'bg-[repeating-linear-gradient(45deg,#1e293b,#1e293b_4px,#475569_4px,#475569_8px)] border-amber-500/50'
              : isHeating
              ? 'bg-gradient-to-r from-amber-600 via-rose-600 to-amber-600 border-amber-400 shadow-md shadow-amber-500/30'
              : isCooling
              ? 'bg-gradient-to-r from-sky-600 via-blue-600 to-sky-600 border-sky-400 shadow-md shadow-sky-500/30'
              : 'bg-slate-800 border-slate-700'
          }`}
        >
          <span className="text-[9px] font-mono text-slate-200 font-semibold uppercase tracking-widest">
            {isAdiabatic
              ? 'ADIABATIC BOUNDARY (Q = 0)'
              : isHeating
              ? '🔥 THERMAL SOURCE (+Q̇)'
              : isCooling
              ? '❄ CRYOGENIC SINK (-Q̇)'
              : 'THERMAL INTERFACE'}
          </span>
        </div>
      </div>

      {/* Educational notice */}
      <div className="argon-glass-subpanel mt-2.5 px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span>GAS: MONATOMIC HELIUM-4</span>
        <span className="text-slate-400">QUASI-STATIC EQUILIBRIUM</span>
      </div>
    </section>
  );
};

export default GasChamber;
