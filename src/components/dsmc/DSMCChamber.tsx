/**
 * DSMCChamber — Canvas Particle Visualiser (golden sandbox style)
 * ===============================================================
 *
 * Renders DSMC particle positions onto a 2D canvas with:
 *  - Deep near-black chamber background.
 *  - Tiny golden-yellow particles; subtle depth-based brightness variation.
 *  - Speed-to-brightness mapping driven by the physical simulation temperature
 *    (higher T → higher average speed → brighter tint on fast particles).
 *  - 3-D to 2-D projection: (X, Z) plane shown; Y depth modulates alpha only.
 *  - Clean, minimal boundaries — thin slate walls, slim piston bar.
 *  - Live T / P / V readout in a small corner HUD.
 *
 * Particle movement is driven by the existing DSMC physics engine.
 * No decorative animation or artificial forces are introduced here.
 *
 * @module
 */

import React, { useRef, useEffect } from 'react';
import type { DSMCSimulation } from '../../physics/dsmc';
import type { DSMCSimulationSnapshot } from '../../physics/dsmc';
import { formatValue } from '../../utils/formatting';

interface Props {
  snapshot: DSMCSimulationSnapshot;
  simulationRef: React.MutableRefObject<DSMCSimulation>;
}

// Boltzmann constant and He mass — used only for the thermal speed reference.
const KB = 1.380649e-23;
const M_HE = 6.646476e-27;

export const DSMCChamber: React.FC<Props> = ({ snapshot, simulationRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { volume, stateEstimate, simulatorParticleCount, collisionsEnabled } = snapshot;

  const tempVal = stateEstimate.temperature.isValid ? stateEstimate.temperature.value : NaN;
  const pressVal = stateEstimate.pressure.isValid ? stateEstimate.pressure.value : NaN;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const W = canvas.width;   // 640
      const H = canvas.height;  // 480

      // ── Background ─────────────────────────────────────────────────────── //
      ctx.fillStyle = '#03060f';
      ctx.fillRect(0, 0, W, H);

      const sim = simulationRef.current;
      const geom = sim.geometry;
      const ensemble = sim.ensemble;
      const count = ensemble.count;

      const Lx = geom.xMax - geom.xMin;
      const Ly = geom.yMax - geom.yMin;
      // Fixed vertical render scale: 0 → 0.2 m maps to full chamber height.
      const LzScale = 0.2;
      const zPiston = geom.piston.position;

      // Layout margins (pixels)
      const padL = 18;
      const padR = 14;
      const padT = 28;  // space above piston for the rod stub
      const padB = 16;

      const cW = W - padL - padR;   // chamber interior width
      const cH = H - padT - padB;   // chamber interior height

      const toX = (x: number) => padL + (x / Lx) * cW;
      const toZ = (z: number) => H - padB - (z / LzScale) * cH;

      const floorY  = toZ(0);
      const pistonY = toZ(zPiston);

      // ── Chamber interior fill ───────────────────────────────────────────── //
      ctx.fillStyle = '#05091a';
      ctx.fillRect(padL, pistonY, cW, floorY - pistonY);

      // ── Walls & floor — thin, muted ─────────────────────────────────────── //
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.55)';   // slate-600 @ 55 %
      ctx.lineWidth = 1;
      // Left wall
      ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, floorY); ctx.stroke();
      // Right wall
      ctx.beginPath(); ctx.moveTo(padL + cW, padT); ctx.lineTo(padL + cW, floorY); ctx.stroke();
      // Floor
      ctx.beginPath(); ctx.moveTo(padL, floorY); ctx.lineTo(padL + cW, floorY); ctx.stroke();

      // ── Particles ──────────────────────────────────────────────────────── //
      const safeT = Number.isFinite(tempVal) && tempVal > 0 ? tempVal : 300;
      // Mean thermal speed at current T: v_mean = sqrt(8 k_B T / (π m))
      const vMean = Math.sqrt((8 * KB * safeT) / (Math.PI * M_HE));

      const xArr  = ensemble.x;
      const yArr  = ensemble.y;
      const zArr  = ensemble.z;
      const vxArr = ensemble.vx;
      const vyArr = ensemble.vy;
      const vzArr = ensemble.vz;

      for (let i = 0; i < count; i++) {
        const px = xArr[i];
        const py = yArr[i];
        const pz = zArr[i];

        // Skip particles transiently outside bounds during boundary reflections
        if (pz > zPiston + 1e-6 || pz < -1e-6 || px < -1e-6 || px > Lx + 1e-6) continue;

        const cx = toX(px);
        const cy = toZ(pz);

        // Y-depth: particles deeper in the 3-D box appear slightly dimmer / smaller
        const depthNorm = Math.max(0, Math.min(1, py / Ly));   // 0 = back, 1 = front
        const alpha  = 0.38 + 0.62 * depthNorm;
        const radius = 1.2  + 0.9  * depthNorm;

        // Speed-based brightness: fast particles slightly brighter gold
        const vx = vxArr[i]; const vy = vyArr[i]; const vz = vzArr[i];
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        const speedRatio = Math.min(2.5, speed / vMean);    // clamp to avoid outlier blow-out

        // Golden palette: base #c9960c, fast → #f5d060, slow → #9a7008
        // Interpolate L (lightness proxy) in the gold range.
        const brightness = Math.round(130 + speedRatio * 28);  // 130–200 range
        const r = Math.min(255, brightness + 55);
        const g = Math.min(255, Math.round(brightness * 0.82));
        const b = Math.round(brightness * 0.06);

        ctx.fillStyle = `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Piston — slim solid bar ─────────────────────────────────────────── //
      const pistonH = 7;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.92)';     // slate-800 near-opaque
      ctx.fillRect(padL, pistonY - pistonH, cW, pistonH);
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.70)'; // slate-500
      ctx.lineWidth = 1;
      ctx.strokeRect(padL, pistonY - pistonH, cW, pistonH);

      // Minimal rod stub above piston (visual cue that piston is driven)
      const rodW = 6;
      const rodX = padL + (cW - rodW) / 2;
      ctx.fillStyle = 'rgba(71, 85, 105, 0.70)';
      ctx.fillRect(rodX, padT, rodW, pistonY - pistonH - padT);

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [simulationRef, tempVal]);

  return (
    <section id="dsmc-chamber" className="argon-glass-panel p-3 flex flex-col gap-2">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/70">
        <div className="spectral-header-accent pl-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Particle Chamber
          </h2>
          <p className="text-[10px] text-slate-500 font-mono">DSMC · 3-D Cartesian domain · (X, Z) projection</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-mono px-2 py-0.5 border flex items-center gap-1 ${
              collisionsEnabled
                ? 'bg-emerald-950/50 border-emerald-700/50 text-emerald-400'
                : 'bg-slate-900/50 border-slate-700/50 text-slate-500'
            }`}
          >
            <span className={`w-1.5 h-1.5 inline-block rounded-full ${collisionsEnabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            {collisionsEnabled ? 'Collisions on' : 'Collisions off'}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 bg-[rgba(6,12,28,0.55)] border border-slate-700/40 text-slate-400">
            N = {simulatorParticleCount}
          </span>
        </div>
      </div>

      {/* ── Canvas ─────────────────────────────────────────────────────────── */}
      <div className="relative w-full aspect-[4/3] bg-[#03060f] border border-slate-800/50 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full h-full block"
        />

        {/* Corner telemetry HUD */}
        <div className="absolute top-2 right-2 pointer-events-none">
          <div className="bg-[rgba(3,6,15,0.82)] px-2.5 py-1.5 border border-slate-700/40 flex flex-col gap-0.5 font-mono text-right">
            <div className="text-[11px] text-slate-400">
              T ={' '}
              <span className="text-[#f5c842] font-semibold">
                {Number.isFinite(tempVal) ? formatValue(tempVal, 1) : '—'} K
              </span>
            </div>
            <div className="text-[10px] text-slate-500">
              P ={' '}
              <span className="text-slate-300">
                {Number.isFinite(pressVal) ? formatValue(pressVal, 0) : '—'} Pa
              </span>
            </div>
            <div className="text-[9px] text-slate-600">
              V = {(volume * 1e6).toFixed(0)} cm³
            </div>
          </div>
        </div>
      </div>

      {/* ── Projection note ────────────────────────────────────────────────── */}
      <p className="text-[9px] font-mono text-slate-600 leading-relaxed px-1">
        Particles simulated in 3-D. Canvas shows the X–Z cross-section; Y-depth encoded as brightness.
        Golden colour intensity reflects each particle&apos;s instantaneous speed relative to the mean thermal speed.
      </p>
    </section>
  );
};
