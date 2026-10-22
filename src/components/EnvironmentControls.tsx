/**
 * EnvironmentControls — External controls driving the thermodynamic processes.
 * Sharp rectangular glassmorphism with Argon spectral styling.
 */

import React, { useState } from 'react';
import type { ProcessMode, EnvironmentConfig } from '../physics';
import { formatPower } from '../utils/formatting';

interface Props {
  mode: ProcessMode;
  environment: EnvironmentConfig;
  internalPressure: number;
  onHeatingPowerChange: (power: number) => void;
  onVolumeChangeRateChange: (rate: number) => void;
  onExternalPressureChange: (pressure: number) => void;
}

const EnvironmentControls: React.FC<Props> = ({
  mode,
  environment,
  internalPressure,
  onHeatingPowerChange,
  onVolumeChangeRateChange,
  onExternalPressureChange,
}) => {
  const [showDeferred, setShowDeferred] = useState(false);

  const isHeatPrimary = mode === 'constant_volume' || mode === 'constant_pressure';
  const isVolumePrimary = mode === 'constant_temperature' || mode === 'adiabatic';

  // Volume rate in L/s for user convenience (1 m³/s = 1000 L/s)
  const rateInLitersPerSec = environment.volumeChangeRate * 1000;

  return (
    <div
      id="environment-controls"
      className="argon-glass-panel p-4 flex flex-col gap-3.5"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="spectral-header-accent pl-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Surroundings &amp; Driving Inputs
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            ADAPTIVE CONTROLS · QUASI-STATIC
          </p>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5">
          {mode.replace('_', ' ').toUpperCase()}
        </span>
      </div>

      {/* 1. Heating / Cooling Power Section (Sharp glass subpanel) */}
      <div
        className={`argon-glass-subpanel p-3 border transition-all duration-180 ${
          isHeatPrimary
            ? 'border-amber-500/50 shadow-[0_0_12px_rgba(245,158,11,0.12)]'
            : 'border-[rgba(160,195,235,0.15)] opacity-60'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor={isHeatPrimary ? 'input-heating-power' : undefined}
            className="text-xs font-medium text-slate-300 flex items-center gap-1.5 font-mono"
          >
            <span>HEATING POWER (Q̇)</span>
            {isHeatPrimary ? (
              <span className="text-[9px] bg-amber-500/20 text-amber-300 font-semibold px-1.5 py-0.5 border border-amber-500/40 uppercase">
                Primary Driver
              </span>
            ) : mode === 'adiabatic' ? (
              <span className="text-[9px] bg-[rgba(6,12,28,0.6)] text-slate-400 font-mono px-1.5 py-0.5 border border-[rgba(160,195,235,0.2)]">
                LOCKED (Q = 0)
              </span>
            ) : (
              <span className="text-[9px] bg-[rgba(6,12,28,0.6)] text-slate-400 font-mono px-1.5 py-0.5 border border-[rgba(160,195,235,0.2)]">
                DERIVED (Q = W)
              </span>
            )}
          </label>

          <span
            className={`font-mono text-xs font-bold ${
              isHeatPrimary ? 'text-amber-300 text-glow-amber' : 'text-slate-500'
            }`}
          >
            {isHeatPrimary ? formatPower(environment.heatingPower) : '0.0 W'}
          </span>
        </div>

        {isHeatPrimary ? (
          <>
            <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
              {mode === 'constant_volume'
                ? 'Thermal exchange directly changes internal energy (ΔU = Q) and temperature at constant volume with zero work (W = 0).'
                : 'Thermal exchange changes temperature and drives expansion/contraction at constant pressure (P_gas = P_ext). Work W = P ΔV.'}
            </p>

            <div className="flex items-center gap-3">
              <input
                id="slider-heating-power"
                type="range"
                min="-2000"
                max="2000"
                step="50"
                value={environment.heatingPower}
                onChange={(e) => onHeatingPowerChange(parseFloat(e.target.value))}
                className="flex-1 accent-amber-500 h-1.5 bg-slate-800 cursor-pointer"
              />
              <div className="relative w-24">
                <input
                  id="input-heating-power"
                  type="number"
                  step="50"
                  value={environment.heatingPower}
                  onChange={(e) =>
                    onHeatingPowerChange(parseFloat(e.target.value) || 0)
                  }
                  className="argon-glass-input w-full px-2.5 py-1 text-xs text-right pr-6"
                />
                <span className="absolute right-2 top-1 text-[10px] text-slate-400 font-mono pointer-events-none">
                  W
                </span>
              </div>
            </div>

            {/* Quick preset buttons (Sharp glass interactive) */}
            <div className="flex items-center gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => onHeatingPowerChange(-500)}
                className="argon-glass-interactive px-2 py-1 text-[10px] font-mono cursor-pointer border border-sky-500/30"
              >
                ❄ COOL (-500W)
              </button>
              <button
                type="button"
                onClick={() => onHeatingPowerChange(0)}
                className="argon-glass-interactive px-2 py-1 text-[10px] font-mono cursor-pointer border border-[rgba(160,195,235,0.22)]"
              >
                STATIONARY (0W)
              </button>
              <button
                type="button"
                onClick={() => onHeatingPowerChange(500)}
                className="argon-glass-interactive px-2 py-1 text-[10px] font-mono cursor-pointer border border-amber-500/30"
              >
                🔥 HEAT (+500W)
              </button>
              <button
                type="button"
                onClick={() => onHeatingPowerChange(1500)}
                className="argon-glass-interactive px-2 py-1 text-[10px] font-mono cursor-pointer border border-rose-500/30"
              >
                ⚡ BOOST (+1.5kW)
              </button>
            </div>
          </>
        ) : (
          <div className="mt-1 pt-1.5 border-t border-[rgba(160,195,235,0.15)]">
            <p className="text-[11px] text-slate-400 leading-relaxed italic">
              {mode === 'adiabatic'
                ? 'Insulated walls prevent heat exchange (Q = 0 by definition). All energy changes arise from mechanical work.'
                : 'Heat is not manually driven here. A constant-temperature bath automatically transfers Q = W to keep temperature strictly constant.'}
            </p>
          </div>
        )}
      </div>

      {/* 2. Piston Motion / Volume Change Rate Section (Sharp glass subpanel) */}
      <div
        className={`argon-glass-subpanel p-3 border transition-all duration-180 ${
          isVolumePrimary
            ? 'border-cyan-400/50 shadow-[0_0_12px_rgba(6,182,212,0.12)]'
            : 'border-[rgba(160,195,235,0.15)] opacity-60'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <label
            htmlFor={isVolumePrimary ? 'input-volume-rate' : undefined}
            className="text-xs font-medium text-slate-300 flex items-center gap-1.5 font-mono"
          >
            <span>VOLUME RATE (dV/dt)</span>
            {isVolumePrimary ? (
              <span className="text-[9px] bg-cyan-500/20 text-cyan-300 font-semibold px-1.5 py-0.5 border border-cyan-500/40 uppercase">
                Primary Driver
              </span>
            ) : mode === 'constant_volume' ? (
              <span className="text-[9px] bg-[rgba(6,12,28,0.6)] text-slate-400 font-mono px-1.5 py-0.5 border border-[rgba(160,195,235,0.2)]">
                LOCKED (dV = 0)
              </span>
            ) : (
              <span className="text-[9px] bg-[rgba(6,12,28,0.6)] text-slate-400 font-mono px-1.5 py-0.5 border border-[rgba(160,195,235,0.2)]">
                DERIVED (HEAT)
              </span>
            )}
          </label>

          <span
            className={`font-mono text-xs font-bold ${
              isVolumePrimary ? 'text-cyan-300 text-glow-cyan' : 'text-slate-500'
            }`}
          >
            {isVolumePrimary
              ? rateInLitersPerSec === 0
                ? '0.00 L/s (Stationary)'
                : `${rateInLitersPerSec >= 0 ? '+' : ''}${rateInLitersPerSec.toFixed(2)} L/s`
              : '0.00 L/s'}
          </span>
        </div>

        {isVolumePrimary ? (
          <>
            <p className="text-[11px] text-slate-300 mb-2 leading-relaxed">
              {mode === 'constant_temperature'
                ? 'Controlled piston motion drives expansion or compression. A thermal bath exchanges heat Q = W to keep temperature constant (ΔU = 0).'
                : 'Controlled piston motion with zero heat transfer (Q = 0). Mechanical work directly changes internal energy (ΔU = -W) and temperature.'}
            </p>

            <div className="flex items-center gap-3">
              <input
                id="slider-volume-rate"
                type="range"
                min="-1"
                max="1"
                step="0.05"
                value={rateInLitersPerSec}
                onChange={(e) =>
                  onVolumeChangeRateChange(parseFloat(e.target.value) / 1000)
                }
                className="flex-1 accent-cyan-500 h-1.5 bg-slate-800 cursor-pointer"
              />
              <div className="relative w-24">
                <input
                  id="input-volume-rate"
                  type="number"
                  step="0.05"
                  value={rateInLitersPerSec}
                  onChange={(e) =>
                    onVolumeChangeRateChange(
                      (parseFloat(e.target.value) || 0) / 1000,
                    )
                  }
                  className="argon-glass-input w-full px-2.5 py-1 text-xs text-right pr-6"
                />
                <span className="absolute right-2 top-1 text-[10px] text-slate-400 font-mono pointer-events-none">
                  L/s
                </span>
              </div>
            </div>

            {/* Quick preset buttons (Sharp glass interactive) */}
            <div className="flex items-center gap-1.5 mt-2.5">
              <button
                type="button"
                onClick={() => onVolumeChangeRateChange(-0.2 / 1000)}
                className="argon-glass-interactive px-2 py-1 text-[10px] font-mono cursor-pointer border border-purple-500/30"
              >
                ⬇ COMPRESS (-0.2 L/s)
              </button>
              <button
                type="button"
                onClick={() => onVolumeChangeRateChange(0)}
                className="argon-glass-interactive px-2 py-1 text-[10px] font-mono cursor-pointer border border-[rgba(160,195,235,0.22)]"
              >
                ⏸ STATIONARY (0 L/s)
              </button>
              <button
                type="button"
                onClick={() => onVolumeChangeRateChange(0.2 / 1000)}
                className="argon-glass-interactive px-2 py-1 text-[10px] font-mono cursor-pointer border border-cyan-500/30"
              >
                ⬆ EXPAND (+0.2 L/s)
              </button>
            </div>
          </>
        ) : (
          <div className="mt-1 pt-1.5 border-t border-[rgba(160,195,235,0.15)]">
            <p className="text-[11px] text-slate-400 leading-relaxed italic">
              {mode === 'constant_volume'
                ? 'The cylinder clamps lock the piston rigidly in position. Volume cannot change (volumeChangeRate = 0).'
                : 'Piston volume is not manually controlled in isobaric mode. It expands or contracts freely (V = nRT/P) as heat is exchanged.'}
            </p>
          </div>
        )}
      </div>

      {/* 3. External Pressure & Mechanical Equilibrium (Sharp glass subpanel) */}
      <div className="argon-glass-subpanel p-3">
        <div className="flex items-center justify-between mb-1.5">
          <label
            htmlFor="input-external-pressure"
            className="text-xs font-medium text-slate-300 font-mono"
          >
            EXTERNAL PRESSURE (P_ext)
          </label>
          <span className="text-[11px] font-mono text-cyan-300 text-glow-cyan">
            {(environment.externalPressure / 101325).toFixed(2)} atm
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="input-external-pressure"
            type="number"
            step="1000"
            min="1000"
            value={environment.externalPressure}
            onChange={(e) =>
              onExternalPressureChange(
                Math.max(1, parseFloat(e.target.value) || 101325),
              )
            }
            className="argon-glass-input flex-1 px-3 py-1.5 text-xs text-left"
          />
          <span className="text-xs font-mono text-slate-300 px-2 py-1 bg-[rgba(6,12,28,0.6)] border border-[rgba(160,195,235,0.2)]">
            Pa
          </span>
        </div>

        {/* Mechanical equilibrium readout */}
        <div className="mt-2 pt-2 border-t border-[rgba(160,195,235,0.15)] flex items-center justify-between text-[11px] font-mono text-slate-300">
          <div>
            <span className="text-slate-400">P_gas: </span>
            <span className="text-white font-semibold text-glow">
              {Math.round(internalPressure)} Pa
            </span>
          </div>
          <div className="text-emerald-300 text-right text-glow">
            {mode === 'constant_pressure'
              ? 'P_gas = P_ext (Balanced)'
              : 'Quasi-static'}
          </div>
        </div>
      </div>

      {/* Collapsible section for deferred surroundings features */}
      <div className="argon-glass-subpanel overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDeferred(!showDeferred)}
          className="argon-glass-interactive w-full px-3 py-1.5 text-left text-xs font-medium flex items-center justify-between font-mono"
        >
          <span>SURROUNDINGS ASSUMPTIONS</span>
          <span className="text-slate-400 text-xs">
            {showDeferred ? '▲ HIDE' : '▼ VIEW'}
          </span>
        </button>

        {showDeferred && (
          <div className="p-3 pt-2 text-[11px] text-slate-300 space-y-1.5 border-t border-[rgba(160,195,235,0.15)] font-sans leading-relaxed">
            <p>
              <strong className="text-slate-100">Equilibrium Assumption:</strong> Helium is
              assumed spatially uniform and in thermodynamic equilibrium at each step.
              The piston is frictionless and quasi-static.
            </p>
            <p className="text-slate-200 font-medium pt-1">
              Deferred to later milestones:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-400 font-mono text-[10px]">
              <li>Convective heat exchange: Q̇ = h·A·(T_amb − T)</li>
              <li>Piston inertia: m·a = (P_gas − P_ext)·A</li>
              <li>Fluid dynamic shockwaves &amp; viscous dissipation</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnvironmentControls;
