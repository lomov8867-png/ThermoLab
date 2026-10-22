/**
 * DSMCConfigPanel — Microscopic Initial Conditions & Structural Setup
 * ====================================================================
 *
 * Provides calibrated parameter controls for:
 *  - Simulator particle count (N_p)
 *  - Target initial temperature (T_0)
 *  - Simulator statistical weighting factor (F_N)
 *  - Chamber dimensions (L_x, L_y, L_z)
 *  - Deterministic PRNG seed
 *  - Explicit "Rebuild Ensemble" action when configuration changes
 *
 * @module
 */

import React from 'react';
import type { PendingDSMCConfig } from '../../hooks/useDSMCSimulation';

interface Props {
  pendingConfig: PendingDSMCConfig;
  hasUnsavedChanges: boolean;
  isSimulating: boolean;
  onConfigChange: (updater: Partial<PendingDSMCConfig>) => void;
  onRebuild: () => void;
}

export const DSMCConfigPanel: React.FC<Props> = ({
  pendingConfig,
  hasUnsavedChanges,
  isSimulating,
  onConfigChange,
  onRebuild,
}) => {
  return (
    <section id="dsmc-config-panel" className="argon-glass-panel p-4 flex flex-col gap-3">
      {/* Title bar */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="spectral-header-accent pl-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Ensemble Configuration
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            INITIAL PARTICLES &amp; SPATIAL BOUNDS
          </p>
        </div>

        {hasUnsavedChanges && (
          <span className="text-[10px] font-mono px-2 py-0.5 bg-amber-950/70 border border-amber-500/50 text-amber-300 animate-pulse">
            MODIFIED · REBUILD REQ
          </span>
        )}
      </div>

      {/* Form Controls */}
      <div className="flex flex-col gap-2.5">
        {/* Particle Count N_p */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <label htmlFor="dsmc-particle-count" className="text-slate-300">
              Particle Count (N_p):
            </label>
            <span className="font-bold text-white text-glow-cyan">
              {pendingConfig.particleCount}
            </span>
          </div>
          <input
            id="dsmc-particle-count"
            type="range"
            min={50}
            max={3000}
            step={50}
            value={pendingConfig.particleCount}
            onChange={(e) =>
              onConfigChange({ particleCount: parseInt(e.target.value, 10) })
            }
            className="w-full accent-cyan-400 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-500">
            <span>50 particles</span>
            <span>Recommended: 500</span>
            <span>3,000 particles</span>
          </div>
        </div>

        {/* Initial Temperature T_0 */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <label htmlFor="dsmc-initial-temp" className="text-slate-300">
              Initial Temperature (T₀):
            </label>
            <span className="font-bold text-white text-glow-cyan">
              {pendingConfig.initialTemperature} K
            </span>
          </div>
          <input
            id="dsmc-initial-temp"
            type="range"
            min={20}
            max={1200}
            step={10}
            value={pendingConfig.initialTemperature}
            onChange={(e) =>
              onConfigChange({ initialTemperature: parseFloat(e.target.value) })
            }
            className="w-full accent-cyan-400 cursor-pointer"
          />
          <div className="flex justify-between text-[9px] font-mono text-slate-500">
            <span>20 K (Cryogenic)</span>
            <span>300 K (Ambient)</span>
            <span>1,200 K (Thermal)</span>
          </div>
        </div>

        {/* Statistical Weight F_N */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <label htmlFor="dsmc-stat-weight" className="text-slate-300">
              Statistical Weight (F_N):
            </label>
            <span className="text-[10px] text-slate-400">real / sim</span>
          </div>
          <input
            id="dsmc-stat-weight"
            type="number"
            min={1e15}
            max={1e24}
            step={1e19}
            value={pendingConfig.statisticalWeight}
            onChange={(e) =>
              onConfigChange({ statisticalWeight: parseFloat(e.target.value) || 1e20 })
            }
            className="w-full bg-[rgba(6,12,28,0.7)] border border-[rgba(160,195,235,0.25)] px-2.5 py-1 text-xs font-mono text-white"
          />
        </div>

        {/* Chamber Dimensions (Lx, Ly, Lz) */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono text-slate-300">
            Chamber Dimensions [Lx, Ly, Lz] (meters):
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <label htmlFor="dsmc-dim-lx" className="text-[9px] font-mono text-slate-400">
                Lx (m):
              </label>
              <input
                id="dsmc-dim-lx"
                type="number"
                min={0.01}
                max={1.0}
                step={0.01}
                value={pendingConfig.chamberLx}
                onChange={(e) =>
                  onConfigChange({ chamberLx: parseFloat(e.target.value) || 0.1 })
                }
                className="w-full bg-[rgba(6,12,28,0.7)] border border-[rgba(160,195,235,0.25)] px-2 py-0.5 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label htmlFor="dsmc-dim-ly" className="text-[9px] font-mono text-slate-400">
                Ly (m):
              </label>
              <input
                id="dsmc-dim-ly"
                type="number"
                min={0.01}
                max={1.0}
                step={0.01}
                value={pendingConfig.chamberLy}
                onChange={(e) =>
                  onConfigChange({ chamberLy: parseFloat(e.target.value) || 0.1 })
                }
                className="w-full bg-[rgba(6,12,28,0.7)] border border-[rgba(160,195,235,0.25)] px-2 py-0.5 text-xs font-mono text-white"
              />
            </div>
            <div>
              <label htmlFor="dsmc-dim-lz" className="text-[9px] font-mono text-slate-400">
                Lz (m):
              </label>
              <input
                id="dsmc-dim-lz"
                type="number"
                min={0.01}
                max={1.0}
                step={0.01}
                value={pendingConfig.chamberLz}
                onChange={(e) =>
                  onConfigChange({ chamberLz: parseFloat(e.target.value) || 0.1 })
                }
                className="w-full bg-[rgba(6,12,28,0.7)] border border-[rgba(160,195,235,0.25)] px-2 py-0.5 text-xs font-mono text-white"
              />
            </div>
          </div>
        </div>

        {/* PRNG Seed */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <label htmlFor="dsmc-prng-seed" className="text-slate-300">
              PRNG Deterministic Seed:
            </label>
            <span className="text-[10px] text-slate-400">Mulberry32</span>
          </div>
          <input
            id="dsmc-prng-seed"
            type="number"
            value={pendingConfig.seed}
            onChange={(e) =>
              onConfigChange({ seed: parseInt(e.target.value, 10) || 42 })
            }
            className="w-full bg-[rgba(6,12,28,0.7)] border border-[rgba(160,195,235,0.25)] px-2.5 py-1 text-xs font-mono text-white"
          />
        </div>
      </div>

      {/* Rebuild Action Button */}
      <button
        id="dsmc-rebuild-btn"
        onClick={onRebuild}
        className={`w-full py-2 text-xs font-mono font-semibold tracking-wider cursor-pointer border transition-all ${
          hasUnsavedChanges
            ? 'bg-cyan-900/80 border-cyan-400 text-cyan-100 shadow-[0_0_12px_rgba(6,182,212,0.35)] hover:bg-cyan-800'
            : 'bg-[rgba(8,16,35,0.58)] border-[rgba(160,195,235,0.2)] text-slate-400 hover:text-white'
        }`}
      >
        {hasUnsavedChanges ? '⚡ APPLY & REBUILD ENSEMBLE' : 'REINITIALIZE ENSEMBLE'}
      </button>

      {isSimulating && (
        <p className="text-[9px] font-mono text-slate-500 italic text-center">
          Note: Rebuilding will reset the simulation time and re-sample Maxwellian velocities.
        </p>
      )}
    </section>
  );
};
