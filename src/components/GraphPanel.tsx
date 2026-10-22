/**
 * GraphPanel — Real-Time Thermodynamic P-V Diagram
 * =================================================
 *
 * Precision scientific P-V diagram tracing thermodynamic state paths.
 * Sharp rectangular glassmorphism with Argon spectral styling.
 */

import React, { useMemo } from 'react';
import type { ThermodynamicState, ProcessMode } from '../physics';
import type { HistoryPoint } from '../hooks/useSimulation';

interface Props {
  history: HistoryPoint[];
  currentState: ThermodynamicState | null;
  processMode: ProcessMode;
}

const GraphPanel: React.FC<Props> = ({ history, currentState, processMode }) => {
  // Compute bounds for P and V with padding
  const bounds = useMemo(() => {
    if (history.length === 0 && !currentState) {
      return { minV: 0.01, maxV: 0.04, minP: 50000, maxP: 150000 };
    }

    const allV = history.map((pt) => pt.volume);
    const allP = history.map((pt) => pt.pressure);
    if (currentState) {
      allV.push(currentState.volume);
      allP.push(currentState.pressure);
    }

    let minV = Math.min(...allV);
    let maxV = Math.max(...allV);
    let minP = Math.min(...allP);
    let maxP = Math.max(...allP);

    // Provide at least 20% margin
    const vMargin = Math.max(0.005, (maxV - minV) * 0.2);
    const pMargin = Math.max(10000, (maxP - minP) * 0.2);

    return {
      minV: Math.max(0.001, minV - vMargin),
      maxV: maxV + vMargin,
      minP: Math.max(1000, minP - pMargin),
      maxP: maxP + pMargin,
    };
  }, [history, currentState]);

  // SVG dimensions
  const svgWidth = 460;
  const svgHeight = 220;
  const padL = 60;
  const padR = 20;
  const padT = 20;
  const padB = 40;

  const plotW = svgWidth - padL - padR;
  const plotH = svgHeight - padT - padB;

  // Coordinate transforms
  const toX = (v: number) => {
    const frac = (v - bounds.minV) / (bounds.maxV - bounds.minV || 1);
    return padL + frac * plotW;
  };

  const toY = (p: number) => {
    const frac = (p - bounds.minP) / (bounds.maxP - bounds.minP || 1);
    return padT + (1 - frac) * plotH;
  };

  // Build path string for history
  const pathD = useMemo(() => {
    if (history.length < 2) return '';
    return history
      .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.volume).toFixed(1)} ${toY(pt.pressure).toFixed(1)}`)
      .join(' ');
  }, [history, bounds]);

  // Current point coordinates
  const currentPos = currentState
    ? { x: toX(currentState.volume), y: toY(currentState.pressure) }
    : null;

  return (
    <section
      id="graph-panel"
      className="argon-glass-panel p-4 flex flex-col"
    >
      {/* Title Bar */}
      <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-800/80">
        <div className="spectral-header-accent pl-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            P-V State Trajectory
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            PRESSURE-VOLUME STATE PLANE
          </p>
        </div>

        {currentState && (
          <div className="text-xs font-mono argon-glass-subpanel px-2.5 py-0.5 border border-[rgba(160,195,235,0.25)] flex items-center shadow-sm">
            <span className="text-slate-400">P:</span>{' '}
            <span className="text-white font-bold ml-1">{(currentState.pressure / 1000).toFixed(1)}</span>{' '}
            <span className="text-cyan-300 text-[10px] ml-0.5">kPa</span>
            &nbsp;·&nbsp;
            <span className="text-slate-400">V:</span>{' '}
            <span className="text-white font-bold ml-1">{(currentState.volume * 1000).toFixed(2)}</span>{' '}
            <span className="text-cyan-300 text-[10px] ml-0.5">L</span>
          </div>
        )}
      </div>

      {/* SVG Canvas Container (Sharp translucent glass) */}
      <div className="w-full bg-[rgba(6,12,28,0.52)] backdrop-blur-[8px] border border-[rgba(160,195,235,0.22)] p-2 flex items-center justify-center shadow-inner">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-auto max-h-56"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Subtle optical reticle crosshair in background */}
          <line
            x1={padL}
            y1={padT + plotH / 2}
            x2={padL + plotW}
            y2={padT + plotH / 2}
            stroke="#1e293b"
            strokeWidth="0.5"
            strokeDasharray="2 4"
            opacity="0.4"
          />
          <line
            x1={padL + plotW / 2}
            y1={padT}
            x2={padL + plotW / 2}
            y2={padT + plotH}
            stroke="#1e293b"
            strokeWidth="0.5"
            strokeDasharray="2 4"
            opacity="0.4"
          />

          {/* Grid lines: horizontal (Pressure) */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
            const pVal = bounds.minP + frac * (bounds.maxP - bounds.minP);
            const y = padT + (1 - frac) * plotH;
            return (
              <g key={`p-grid-${idx}`}>
                <line
                  x1={padL}
                  y1={y}
                  x2={padL + plotW}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="0.8"
                  strokeDasharray="3 3"
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {(pVal / 1000).toFixed(0)}k
                </text>
              </g>
            );
          })}

          {/* Grid lines: vertical (Volume) */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
            const vVal = bounds.minV + frac * (bounds.maxV - bounds.minV);
            const x = padL + frac * plotW;
            return (
              <g key={`v-grid-${idx}`}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={padT + plotH}
                  stroke="#1e293b"
                  strokeWidth="0.8"
                  strokeDasharray="3 3"
                />
                <text
                  x={x}
                  y={padT + plotH + 15}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {(vVal * 1000).toFixed(1)}L
                </text>
              </g>
            );
          })}

          {/* Axes lines (Sharp) */}
          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={padT + plotH}
            stroke="#475569"
            strokeWidth="1.2"
          />
          <line
            x1={padL}
            y1={padT + plotH}
            x2={padL + plotW}
            y2={padT + plotH}
            stroke="#475569"
            strokeWidth="1.2"
          />

          {/* Axis Labels */}
          <text
            x={padL + plotW / 2}
            y={padT + plotH + 32}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="600"
          >
            VOLUME V (L)
          </text>
          <text
            x={14}
            y={padT + plotH / 2}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="10"
            fontFamily="monospace"
            fontWeight="600"
            transform={`rotate(-90 14 ${padT + plotH / 2})`}
          >
            PRESSURE P (kPa)
          </text>

          {/* Process Trajectory Path (Argon Cyan with subtle glow) */}
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="#06b6d4"
              strokeWidth="2.2"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
          )}

          {/* Active State Point (Sharp diamond / reticle crosshair) */}
          {currentPos && (
            <g>
              {/* Subtle pulsing reticle circle */}
              <circle
                cx={currentPos.x}
                cy={currentPos.y}
                r="6"
                className="fill-cyan-400/25 animate-ping"
              />
              {/* Sharp diamond marker */}
              <polygon
                points={`${currentPos.x},${currentPos.y - 4} ${currentPos.x + 4},${currentPos.y} ${currentPos.x},${currentPos.y + 4} ${currentPos.x - 4},${currentPos.y}`}
                fill="#22d3ee"
                stroke="#030712"
                strokeWidth="1"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Trajectory Guide info footer */}
      <div className="argon-glass-subpanel mt-2.5 px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400">
        <div>
          PATH: <span className="text-white font-semibold uppercase">{processMode.replace('_', ' ')}</span>
        </div>
        <div>
          POINTS: <span className="text-cyan-300 font-semibold text-glow-cyan">{history.length}</span>
        </div>
      </div>
    </section>
  );
};

export default GraphPanel;
