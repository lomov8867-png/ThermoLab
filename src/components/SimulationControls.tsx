/**
 * SimulationControls — Playback controls, mode selector, and speed slider.
 * Sharp rectangular glassmorphism with Argon spectral accents.
 */

import React from 'react';
import type { ProcessMode, SimulationStatus, ConstraintValidation } from '../physics';
import { PROCESS_MODE_INFO, ALL_PROCESS_MODES } from '../physics';
import { formatTime } from '../utils/formatting';

interface Props {
  status: SimulationStatus;
  processMode: ProcessMode;
  time: number;
  stepCount: number;
  speedMultiplier: number;
  dt: number;
  constraintValidation: ConstraintValidation;
  onPlay: () => void;
  onPause: () => void;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onReset: () => void;
  onModeChange: (mode: ProcessMode) => void;
  onSpeedChange: (speed: number) => void;
}

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5, 10];

const SimulationControls: React.FC<Props> = ({
  status,
  processMode,
  time,
  stepCount,
  speedMultiplier,
  dt,
  constraintValidation,
  onTogglePlay,
  onStepForward,
  onReset,
  onModeChange,
  onSpeedChange,
}) => {
  const isRunning = status === 'running';

  return (
    <div
      id="simulation-controls"
      className="argon-glass-panel p-4 flex flex-col gap-3"
    >
      {/* Top row: Process Mode Selector Tabs (Strictly sharp rectangular) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-300 font-mono">
            Process Mode
          </span>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5">
            {PROCESS_MODE_INFO[processMode].constraint}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ALL_PROCESS_MODES.map((mode) => {
            const info = PROCESS_MODE_INFO[mode];
            const isSelected = processMode === mode;
            return (
              <button
                key={mode}
                id={`mode-select-${mode}`}
                onClick={() => onModeChange(mode)}
                className={`px-3 py-2 text-left text-xs transition-all duration-180 cursor-pointer border group ${
                  isSelected
                    ? 'bg-[rgba(4,14,35,0.92)] border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                    : 'bg-[rgba(8,16,35,0.58)] border-[rgba(160,195,235,0.22)] text-slate-300 hover:bg-[rgba(4,10,25,0.88)] hover:border-[rgba(115,190,255,0.55)] hover:text-white hover:shadow-[0_4px_20px_rgba(0,0,0,0.65),0_0_12px_rgba(105,185,255,0.25)]'
                }`}
                title={info.description}
              >
                <div
                  className={`font-semibold tracking-wide transition-all duration-180 ${
                    isSelected
                      ? 'text-cyan-300 text-glow-cyan'
                      : 'text-slate-200 group-hover:text-white group-hover:text-glow'
                  }`}
                >
                  {info.shortLabel}
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-0.5 group-hover:text-cyan-200 transition-colors duration-180">
                  {info.constraint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Conflicts banner if any (Sharp rectangular) */}
      {!constraintValidation.valid && (
        <div className="px-3 py-2 bg-amber-950/40 border border-amber-500/40 text-xs text-amber-300 flex flex-col gap-1 backdrop-blur-sm">
          <div className="font-semibold flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 bg-amber-400 animate-ping inline-block" />
            Constraint Warning:
          </div>
          {constraintValidation.conflicts.map((c, i) => (
            <div key={i} className="text-amber-200/90 pl-3 font-mono text-[11px]">
              • {c}
            </div>
          ))}
        </div>
      )}

      {/* Main Controls Row (Sharp buttons & telemetry) */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[rgba(160,195,235,0.15)]">
        {/* Playback action buttons */}
        <div className="flex items-center gap-2">
          {/* Start / Pause Button (Sharp Glassmorphic Button) */}
          <button
            id="play-pause-button"
            onClick={onTogglePlay}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold font-mono tracking-wider cursor-pointer border ${
              isRunning ? 'argon-glass-btn-amber' : 'argon-glass-btn-primary'
            }`}
          >
            {isRunning ? (
              <>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                PAUSE
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                {status === 'paused' ? 'RESUME' : 'START'}
              </>
            )}
          </button>

          {/* Step forward (+dt) */}
          <button
            id="step-button"
            onClick={onStepForward}
            disabled={isRunning}
            className="argon-glass-interactive flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium"
            title={`Advance single time step (+${dt}s)`}
          >
            <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
            </svg>
            STEP (+{dt}s)
          </button>

          {/* Reset button */}
          <button
            id="sim-reset-button"
            onClick={onReset}
            className="argon-glass-interactive flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-medium"
            title="Reset simulation to initial state"
          >
            <svg className="w-3 h-3 fill-none stroke-current stroke-2" viewBox="0 0 24 24">
              <path strokeLinecap="square" strokeLinejoin="miter" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            RESET
          </button>
        </div>

        {/* Speed multiplier selector (Sharp glass tabs) */}
        <div className="flex items-center gap-1 argon-glass-subpanel px-2 py-1">
          <span className="text-[10px] text-slate-400 font-mono font-medium uppercase mr-1">Speed:</span>
          {SPEED_OPTIONS.map((spd) => (
            <button
              key={spd}
              id={`speed-${spd}x`}
              onClick={() => onSpeedChange(spd)}
              className={`px-1.5 py-0.5 text-[10px] font-mono transition-all duration-180 cursor-pointer ${
                speedMultiplier === spd
                  ? 'bg-cyan-500/25 text-cyan-200 font-bold border border-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                  : 'text-slate-400 hover:text-white hover:bg-[rgba(4,10,25,0.88)]'
              }`}
            >
              {spd}×
            </button>
          ))}
        </div>

        {/* Live Timer and Telemetry Box (Sharp translucent glass) */}
        <div className="flex items-center gap-3 font-mono text-xs text-slate-300 argon-glass-subpanel px-3 py-1.5">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 ${
                isRunning ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-slate-500'
              }`}
            />
            <span className="text-slate-400 text-[10px] uppercase tracking-wider">
              {status}
            </span>
          </div>
          <div className="text-cyan-300 font-semibold text-glow-cyan">
            t = {formatTime(time)}
          </div>
          <div className="text-slate-400 text-[11px]">
            ({stepCount} steps)
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimulationControls;
