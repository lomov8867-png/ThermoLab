/**
 * DSMCMeasurementsPanel — Microscopic Estimator Live Telemetry
 * ============================================================
 *
 * Displays live thermodynamic quantities derived from the DSMC particle ensemble:
 *  - Peculiar translational kinetic temperature T ± σ_T [K]
 *  - Kinetic pressure P ± σ_P [Pa] with full diagonal tensor (P_xx, P_yy, P_zz)
 *  - Exact kinetic energy decomposition: K_total = K_thermal + K_bulk [J]
 *  - Simulator particle count (N_p) vs real atom population (N_real) and moles (n)
 *  - Physical chamber volume V [m³], number density n₀ [m⁻³], mean free path λ [m]
 *  - Diagnostic estimator flags and scientific assumptions
 *
 * @module
 */

import React from 'react';
import type { DSMCSimulationSnapshot } from '../../physics/dsmc';
import { formatValue } from '../../utils/formatting';

interface Props {
  snapshot: DSMCSimulationSnapshot;
}

export const DSMCMeasurementsPanel: React.FC<Props> = ({ snapshot }) => {
  const {
    stateEstimate,
    volume,
    statisticalWeight,
    simulatorParticleCount,
    realParticleCount,
    moles,
    numberDensity,
  } = snapshot;

  const { temperature, pressure, kineticEnergy } = stateEstimate;

  const tempVal = temperature.isValid ? temperature.value : NaN;
  const tempErr = temperature.standardError;

  const pressVal = pressure.isValid ? pressure.value : NaN;
  const pressErr = pressure.standardError;
  const tensor = pressure.tensor;

  const thermalKE = kineticEnergy.isValid ? kineticEnergy.thermalKE : NaN;
  const bulkKE = kineticEnergy.isValid ? kineticEnergy.bulkKE : NaN;
  const totalKE = Number.isFinite(thermalKE) && Number.isFinite(bulkKE) ? thermalKE + bulkKE : NaN;

  return (
    <section id="dsmc-measurements-panel" className="argon-glass-panel p-4 flex flex-col gap-3">
      {/* Title bar */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="spectral-header-accent pl-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            DSMC Live Observables
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            MICROSCOPIC ENSEMBLE ESTIMATORS (STAGE 4)
          </p>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono border bg-[rgba(6,28,18,0.65)] text-emerald-300 border-emerald-500/40">
          <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse inline-block" />
          <span>INSTANTANEOUS ESTIMATES</span>
        </div>
      </div>

      {/* Primary Observables (Cards) */}
      <div className="grid grid-cols-2 gap-2">
        {/* Kinetic Temperature */}
        <div className="bg-[rgba(6,12,28,0.55)] border border-[rgba(160,195,235,0.18)] p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Kinetic Temperature (T)
            </span>
            <span className="text-[9px] font-mono text-cyan-300">Translational</span>
          </div>
          <div className="mt-1">
            <div className="text-base font-bold font-mono text-white text-glow-cyan">
              {Number.isFinite(tempVal) ? formatValue(tempVal, 1) : '—'}{' '}
              <span className="text-xs font-normal text-cyan-300">K</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              σ_T: {tempErr !== undefined ? `±${formatValue(tempErr, 2)} K` : 'N/A'}
            </div>
          </div>
        </div>

        {/* Kinetic Pressure */}
        <div className="bg-[rgba(6,12,28,0.55)] border border-[rgba(160,195,235,0.18)] p-2.5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              Kinetic Pressure (P)
            </span>
            <span className="text-[9px] font-mono text-cyan-300">Momentum Flux</span>
          </div>
          <div className="mt-1">
            <div className="text-base font-bold font-mono text-white text-glow-cyan">
              {Number.isFinite(pressVal) ? formatValue(pressVal, 0) : '—'}{' '}
              <span className="text-xs font-normal text-cyan-300">Pa</span>
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              σ_P: {pressErr !== undefined ? `±${formatValue(pressErr, 0)} Pa` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Diagonal Pressure Tensor */}
      {tensor && (
        <div className="bg-[rgba(6,12,28,0.4)] border border-[rgba(160,195,235,0.12)] px-2.5 py-1.5 flex items-center justify-between text-[10px] font-mono text-slate-300">
          <span className="text-slate-400">Pressure Tensor Diagonal:</span>
          <span>
            P_xx: <span className="text-white">{formatValue(tensor.xx, 0)}</span> | P_yy:{' '}
            <span className="text-white">{formatValue(tensor.yy, 0)}</span> | P_zz:{' '}
            <span className="text-white">{formatValue(tensor.zz, 0)}</span> Pa
          </span>
        </div>
      )}

      {/* Energy Decomposition Rows */}
      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-1">
          Kinetic Energy Decomposition
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-[rgba(6,12,28,0.45)] border border-[rgba(160,195,235,0.14)] text-xs font-mono">
          <span className="text-slate-400">Thermal Kinetic Energy (K_thermal):</span>
          <span className="font-bold text-white">
            {Number.isFinite(thermalKE) ? thermalKE.toExponential(4) : '—'}{' '}
            <span className="text-cyan-300 font-normal">J</span>
          </span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-[rgba(6,12,28,0.45)] border border-[rgba(160,195,235,0.14)] text-xs font-mono">
          <span className="text-slate-400">Bulk Kinetic Energy (K_bulk):</span>
          <span className="font-bold text-white">
            {Number.isFinite(bulkKE) ? bulkKE.toExponential(4) : '—'}{' '}
            <span className="text-cyan-300 font-normal">J</span>
          </span>
        </div>
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-[rgba(6,12,28,0.45)] border border-[rgba(160,195,235,0.14)] text-xs font-mono">
          <span className="text-slate-400">Total Kinetic Energy (K_total):</span>
          <span className="font-bold text-white">
            {Number.isFinite(totalKE) ? totalKE.toExponential(4) : '—'}{' '}
            <span className="text-cyan-300 font-normal">J</span>
          </span>
        </div>
      </div>

      {/* Population & Chamber Parameters */}
      <div className="flex flex-col gap-1">
        <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 px-1">
          Population &amp; Spatial Metrics
        </div>
        <div className="grid grid-cols-2 gap-1 text-[11px] font-mono">
          <div className="px-2.5 py-1 bg-[rgba(6,12,28,0.4)] border border-[rgba(160,195,235,0.1)] flex justify-between">
            <span className="text-slate-400">Sim Particles:</span>
            <span className="text-white">{simulatorParticleCount}</span>
          </div>
          <div className="px-2.5 py-1 bg-[rgba(6,12,28,0.4)] border border-[rgba(160,195,235,0.1)] flex justify-between">
            <span className="text-slate-400">Stat Weight (F_N):</span>
            <span className="text-white">{statisticalWeight.toExponential(2)}</span>
          </div>
          <div className="px-2.5 py-1 bg-[rgba(6,12,28,0.4)] border border-[rgba(160,195,235,0.1)] flex justify-between">
            <span className="text-slate-400">Real Atoms:</span>
            <span className="text-white">{realParticleCount.toExponential(3)}</span>
          </div>
          <div className="px-2.5 py-1 bg-[rgba(6,12,28,0.4)] border border-[rgba(160,195,235,0.1)] flex justify-between">
            <span className="text-slate-400">Moles (n):</span>
            <span className="text-white">{moles.toFixed(4)} mol</span>
          </div>
          <div className="px-2.5 py-1 bg-[rgba(6,12,28,0.4)] border border-[rgba(160,195,235,0.1)] flex justify-between">
            <span className="text-slate-400">Volume (V):</span>
            <span className="text-white">{(volume * 1000).toFixed(2)} L</span>
          </div>
          <div className="px-2.5 py-1 bg-[rgba(6,12,28,0.4)] border border-[rgba(160,195,235,0.1)] flex justify-between">
            <span className="text-slate-400">Number Density:</span>
            <span className="text-white">{numberDensity.toExponential(2)} m⁻³</span>
          </div>
        </div>
      </div>

      {/* Estimator Diagnostics / Flags */}
      <div className="argon-glass-subpanel px-3 py-2 flex flex-col gap-1 text-[9px] font-mono text-slate-400">
        <span className="text-slate-300 font-semibold uppercase tracking-wider">
          Statistical Assumptions &amp; Flags:
        </span>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {temperature.flags.map((flag) => (
            <span
              key={flag}
              className="px-1.5 py-0.5 bg-[rgba(6,12,28,0.7)] border border-[rgba(160,195,235,0.2)] text-slate-300"
            >
              {flag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
};
