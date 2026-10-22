/**
 * DSMCControls — Playback & Dynamic Motion Controls for DSMC
 * ==========================================================
 *
 * Sharp rectangular glassmorphism playback bar providing:
 *  - Start / Pause / Step (+dt) / Reset
 *  - Speed multipliers (0.25x, 0.5x, 1x, 2x, 5x)
 *  - Bird NTC binary collision toggle
 *  - Piston velocity drivers (Compress / Stationary / Expand)
 *  - Simulation time and step counters
 *
 * @module
 */

import React from 'react';
import type { DSMCStatus } from '../../hooks/useDSMCSimulation';

interface Props {
  status: DSMCStatus;
  time: number;
  stepCount: number;
  dt: number;
  speedMultiplier: number;
  collisionsEnabled: boolean;
  pistonVelocity: number;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onToggleCollisions: () => void;
  onPistonVelocityChange: (vel: number) => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5];

export const DSMCControls: React.FC<Props> = ({
  status,
  time,
  stepCount,
  dt,
  speedMultiplier,
  collisionsEnabled,
  pistonVelocity,
  onTogglePlay,
  onStepForward,
  onReset,
  onSpeedChange,
  onToggleCollisions,
  onPistonVelocityChange,
}) => {
  const isRunning = status === 'running';

  return (
    <div id="dsmc-controls" className="argon-glass-panel p-4 flex flex-col gap-3">
      {/* Top row: Operational Mode & Boundary Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-[rgba(160,195,235,0.15)]">
        {/* Left: Collision Method Switch */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 font-mono">
            Inter-Particle Collisions:
          </span>
          <button
            onClick={onToggleCollisions}
            className={`px-3 py-1 text-xs font-mono border cursor-pointer transition-all ${
              collisionsEnabled
                ? 'bg-emerald-950/70 border-emerald-400 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'
            }`}
          >
            {collisionsEnabled ? 'Bird NTC Active ✓' : 'Collisions Disabled ✗'}
          </button>
        </div>

        {/* Right: Piston Boundary Velocity */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300 font-mono">
            Piston Head:
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPistonVelocityChange(-15)}
              className={`px-2.5 py-1 text-[11px] font-mono border cursor-pointer ${
                pistonVelocity < 0
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : 'bg-[rgba(6,12,28,0.55)] border-[rgba(160,195,235,0.2)] text-slate-400 hover:text-white'
              }`}
              title="Compress chamber (v_piston = -15 m/s)"
            >
              ↓ Compress (-15 m/s)
            </button>
            <button
              onClick={() => onPistonVelocityChange(0)}
              className={`px-2.5 py-1 text-[11px] font-mono border cursor-pointer ${
                pistonVelocity === 0
                  ? 'bg-slate-800 border-slate-400 text-white'
                  : 'bg-[rgba(6,12,28,0.55)] border-[rgba(160,195,235,0.2)] text-slate-400 hover:text-white'
              }`}
              title="Fixed stationary piston (v_piston = 0)"
            >
              Fixed
            </button>
            <button
              onClick={() => onPistonVelocityChange(15)}
              className={`px-2.5 py-1 text-[11px] font-mono border cursor-pointer ${
                pistonVelocity > 0
                  ? 'bg-amber-950 border-amber-400 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                  : 'bg-[rgba(6,12,28,0.55)] border-[rgba(160,195,235,0.2)] text-slate-400 hover:text-white'
              }`}
              title="Expand chamber (v_piston = +15 m/s)"
            >
              ↑ Expand (+15 m/s)
            </button>
          </div>
        </div>
      </div>

      {/* Main Playback Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Playback Buttons */}
        <div className="flex items-center gap-2">
          {/* Start / Pause */}
          <button
            id="dsmc-play-pause-btn"
            onClick={onTogglePlay}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold font-mono tracking-wider cursor-pointer border ${
              isRunning ? 'argon-glass-btn-amber' : 'argon-glass-btn-primary'
            }`}
          >
            {isRunning ? (
              <>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 16 16">
                  <rect x="3" y="2" width="3.5" height="12" />
                  <rect x="9.5" y="2" width="3.5" height="12" />
                </svg>
                <span>PAUSE</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 16 16">
                  <path d="M4 2.5v11l9-5.5-9-5.5z" />
                </svg>
                <span>{stepCount > 0 ? 'RESUME' : 'START DSMC'}</span>
              </>
            )}
          </button>

          {/* Single Step (+dt) */}
          <button
            id="dsmc-step-btn"
            onClick={onStepForward}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono argon-glass-interactive"
            title="Advance exactly one physics timestep"
          >
            <svg className="w-3 h-3 fill-current" viewBox="0 0 16 16">
              <path d="M2.5 3v10l7-5-7-5z" />
              <rect x="11.5" y="3" width="2" height="10" />
            </svg>
            <span>STEP (+dt)</span>
          </button>

          {/* Reset */}
          <button
            id="dsmc-reset-btn"
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono argon-glass-interactive text-slate-300 hover:text-white"
            title="Reset particles to deterministic initial state"
          >
            <svg className="w-3 h-3 fill-none stroke-current stroke-2" viewBox="0 0 16 16">
              <path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9L2 6" />
              <path d="M2 2v4h4" />
            </svg>
            <span>RESET</span>
          </button>
        </div>

        {/* Speed Multipliers */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">
            Speed:
          </span>
          <div className="flex items-center gap-1">
            {SPEED_OPTIONS.map((speed) => (
              <button
                key={speed}
                onClick={() => onSpeedChange(speed)}
                className={`px-2 py-0.5 text-[10px] font-mono border cursor-pointer ${
                  speedMultiplier === speed
                    ? 'bg-cyan-950 border-cyan-400 text-cyan-200 font-bold'
                    : 'bg-[rgba(6,12,28,0.55)] border-[rgba(160,195,235,0.2)] text-slate-400 hover:text-white'
                }`}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        {/* Telemetry Display */}
        <div className="flex items-center gap-3 font-mono text-xs text-slate-300">
          <div>
            <span className="text-slate-500 text-[10px]">TIME: </span>
            <span className="font-bold text-white">{(time * 1000).toFixed(2)} ms</span>
            <span className="text-slate-500 text-[10px]"> ({time.toExponential(3)} s)</span>
          </div>
          <div className="border-l border-slate-700 pl-3">
            <span className="text-slate-500 text-[10px]">STEPS: </span>
            <span className="text-cyan-300">{stepCount}</span>
          </div>
          <div className="border-l border-slate-700 pl-3">
            <span className="text-slate-500 text-[10px]">dt: </span>
            <span className="text-slate-300">{(dt * 1e6).toFixed(0)} μs</span>
          </div>
        </div>
      </div>
    </div>
  );
};
