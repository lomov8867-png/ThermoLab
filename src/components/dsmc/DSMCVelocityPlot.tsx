/**
 * DSMCVelocityPlot — Peculiar Speed Distribution vs. Maxwell-Boltzmann
 * ====================================================================
 *
 * Real-time comparison between the empirical peculiar speed histogram of the
 * DSMC particle ensemble and the theoretical 3D Maxwell-Boltzmann distribution:
 *
 *   f_MB(c) = 4π c² (m_He / (2π k_B T))^(3/2) exp(-m_He c² / (2 k_B T))
 *
 * Displays relaxation to equilibrium and visualizes the Boltzmann H-theorem.
 *
 * @module
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { DSMCSimulation } from '../../physics/dsmc';
import { BOLTZMANN } from '../../physics/constants';
import { M_HE } from '../../physics/dsmc/estimators';
import { formatValue } from '../../utils/formatting';

interface Props {
  simulationRef: React.MutableRefObject<DSMCSimulation>;
  temperature: number;
}

interface PlotData {
  bins: Array<{ vMid: number; density: number; count: number }>;
  maxDensity: number;
  maxSpeed: number;
  mbPoints: string;
}

export const DSMCVelocityPlot: React.FC<Props> = ({
  simulationRef,
  temperature,
}) => {
  const numBins = 24;

  const [plotData, setPlotData] = useState<PlotData>({
    bins: [],
    maxDensity: 0.001,
    maxSpeed: 2000,
    mbPoints: '',
  });

  useEffect(() => {
    const sim = simulationRef.current;
    const ensemble = sim.ensemble;
    const n = ensemble.count;

    if (n < 2) {
      setPlotData({ bins: [], maxDensity: 0.001, maxSpeed: 2000, mbPoints: '' });
      return;
    }

    // Center of mass velocity
    let sumVx = 0, sumVy = 0, sumVz = 0;
    for (let i = 0; i < n; i++) {
      sumVx += ensemble.vx[i];
      sumVy += ensemble.vy[i];
      sumVz += ensemble.vz[i];
    }
    const vcmX = sumVx / n;
    const vcmY = sumVy / n;
    const vcmZ = sumVz / n;

    // Peculiar speeds
    const speeds = new Float64Array(n);
    let topSpeed = 0;
    for (let i = 0; i < n; i++) {
      const cx = ensemble.vx[i] - vcmX;
      const cy = ensemble.vy[i] - vcmY;
      const cz = ensemble.vz[i] - vcmZ;
      const s = Math.sqrt(cx * cx + cy * cy + cz * cz);
      speeds[i] = s;
      if (s > topSpeed) topSpeed = s;
    }

    const T = Number.isFinite(temperature) && temperature > 0 ? temperature : 300;
    const vThermal = Math.sqrt((2 * BOLTZMANN * T) / M_HE);
    const upperLimit = Math.max(topSpeed * 1.05, vThermal * 3.0);

    const binWidth = upperLimit / numBins;
    const counts = new Int32Array(numBins);

    for (let i = 0; i < n; i++) {
      const b = Math.floor(speeds[i] / binWidth);
      if (b >= 0 && b < numBins) counts[b]++;
    }

    // Convert counts to probability density: p / Δv
    let peakDensity = 0;
    const binData = [];
    for (let b = 0; b < numBins; b++) {
      const p = counts[b] / n;
      const density = p / binWidth; // 1 / (m/s)
      if (density > peakDensity) peakDensity = density;
      binData.push({
        vMid: (b + 0.5) * binWidth,
        density,
        count: counts[b],
      });
    }

    // Theoretical Maxwell-Boltzmann curve points
    const mbCurve: [number, number][] = [];
    const constFactor = 4.0 * Math.PI * Math.pow(M_HE / (2.0 * Math.PI * BOLTZMANN * T), 1.5);
    const expFactor = M_HE / (2.0 * BOLTZMANN * T);

    const steps = 60;
    for (let s = 0; s <= steps; s++) {
      const v = (s / steps) * upperLimit;
      const fv = constFactor * v * v * Math.exp(-expFactor * v * v);
      if (fv > peakDensity) peakDensity = fv;
      mbCurve.push([v, fv]);
    }

    setPlotData({
      bins: binData,
      maxDensity: peakDensity * 1.15 || 0.001,
      maxSpeed: upperLimit,
      mbPoints: mbCurve.map(([v, f]) => `${v},${f}`).join(' '),
    });
  }, [simulationRef, temperature, numBins]);

  const { bins, maxDensity, maxSpeed, mbPoints } = plotData;

  const plotW = 320;
  const plotH = 140;
  const padLeft = 35;
  const padBottom = 20;
  const graphW = plotW - padLeft - 10;
  const graphH = plotH - padBottom - 10;

  const toX = (v: number) => padLeft + (v / maxSpeed) * graphW;
  const toY = (d: number) => 10 + graphH - (d / maxDensity) * graphH;

  const binPixelWidth = (graphW / numBins) * 0.9;

  // Transform theoretical curve points to SVG pixel coordinates
  const svgPath = useMemo(() => {
    if (!mbPoints) return '';
    const pts = mbPoints.split(' ').map((p) => {
      const [vStr, fStr] = p.split(',');
      const v = parseFloat(vStr);
      const f = parseFloat(fStr);
      return `${toX(v).toFixed(1)},${toY(f).toFixed(1)}`;
    });
    return `M ${pts.join(' L ')}`;
  }, [mbPoints, maxSpeed, maxDensity]);

  return (
    <div id="dsmc-velocity-plot" className="argon-glass-panel p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800/80">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-200 font-mono">
          Peculiar Speed Distribution vs. Maxwell-Boltzmann
        </span>
        <div className="flex items-center gap-2 text-[9px] font-mono">
          <span className="flex items-center gap-1 text-cyan-300">
            <span className="w-2 h-2 bg-cyan-500 inline-block" /> DSMC Bins
          </span>
          <span className="flex items-center gap-1 text-amber-400">
            <span className="w-2 h-0.5 bg-amber-400 inline-block" /> Theoretical MB
          </span>
        </div>
      </div>

      <div className="relative w-full aspect-[21/9] bg-[rgba(4,10,25,0.7)] border border-[rgba(160,195,235,0.18)]">
        <svg
          viewBox={`0 0 ${plotW} ${plotH}`}
          className="w-full h-full block"
          preserveAspectRatio="none"
        >
          {/* Axis lines */}
          <line
            x1={padLeft}
            y1={10 + graphH}
            x2={padLeft + graphW}
            y2={10 + graphH}
            stroke="rgba(160, 195, 235, 0.3)"
            strokeWidth="1"
          />
          <line
            x1={padLeft}
            y1={10}
            x2={padLeft}
            y2={10 + graphH}
            stroke="rgba(160, 195, 235, 0.3)"
            strokeWidth="1"
          />

          {/* Histogram Bars */}
          {bins.map((b, i) => {
            const bx = toX(b.vMid) - binPixelWidth / 2;
            const by = toY(b.density);
            const bh = 10 + graphH - by;
            return (
              <rect
                key={i}
                x={bx}
                y={by}
                width={Math.max(1, binPixelWidth)}
                height={Math.max(0, bh)}
                fill="rgba(6, 182, 212, 0.45)"
                stroke="rgba(34, 211, 238, 0.75)"
                strokeWidth="0.5"
              />
            );
          })}

          {/* Theoretical Maxwell-Boltzmann Curve */}
          {svgPath && (
            <path
              d={svgPath}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )}

          {/* Axis Labels */}
          <text
            x={padLeft + graphW}
            y={plotH - 4}
            fill="rgba(148, 163, 184, 0.7)"
            fontSize="8"
            fontFamily="monospace"
            textAnchor="end"
          >
            Speed c (m/s) [Max: {maxSpeed.toFixed(0)}]
          </text>
          <text
            x={6}
            y={14}
            fill="rgba(148, 163, 184, 0.7)"
            fontSize="8"
            fontFamily="monospace"
          >
            f(c)
          </text>
        </svg>
      </div>

      <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
        <span>T = {formatValue(temperature, 1)} K</span>
        <span>
          Thermal Most Probable Speed: v_mp ={' '}
          {formatValue(Math.sqrt((2 * BOLTZMANN * Math.max(1, temperature)) / M_HE), 0)} m/s
        </span>
      </div>
    </div>
  );
};
