/**
 * EnergyAccountingPanel — Displays live First-Law energy accounting:
 * ΔU = Q − W
 *
 * Sharp rectangular glassmorphism with Argon spectral scientific styling.
 */

import React from 'react';
import type { SimulationSnapshot } from '../physics';
import { formatEnergy, formatValue } from '../utils/formatting';

interface Props {
  snapshot: SimulationSnapshot;
}

const EnergyAccountingPanel: React.FC<Props> = ({ snapshot }) => {
  const {
    totalQ,
    totalW,
    totalDeltaU,
    stepQ,
    stepW,
    stepDeltaU,
    energyBalanceValid,
    derived,
  } = snapshot;

  const firstLawResidual = Math.abs(stepDeltaU - (stepQ - stepW));
  const cumulativeResidual = Math.abs(totalDeltaU - (totalQ - totalW));

  return (
    <div
      id="energy-accounting-panel"
      className="argon-glass-panel p-4 flex flex-col gap-3.5"
    >
      {/* Title & First Law equation badge */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="spectral-header-accent pl-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Energy Accounting
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            FIRST LAW: ΔU = Q − W
          </p>
        </div>

        {/* Verification badge (Sharp) */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-semibold border ${
            energyBalanceValid
              ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40'
              : 'bg-red-950/60 text-red-400 border-red-500/40'
          }`}
          title={`First-law step residual: ${firstLawResidual.toExponential(2)} J`}
        >
          <span
            className={`w-1.5 h-1.5 inline-block ${
              energyBalanceValid ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'
            }`}
          />
          {energyBalanceValid ? 'CONSERVED ✓' : 'RESIDUAL ERROR ✗'}
        </div>
      </div>

      {/* Energy Quantities Grid: Q, W, ΔU (Interactive glass cards with dark hover states) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {/* Heat (Q) */}
        <div className="argon-glass-interactive p-3 border border-amber-500/40 flex flex-col gap-1 cursor-default group">
          <div className="flex items-center justify-between text-[11px] font-mono text-amber-300 font-semibold uppercase tracking-wide group-hover:text-amber-200 transition-colors">
            <span>Heat (Q)</span>
            <span className="text-[9px] text-slate-400">Q &gt; 0 IN</span>
          </div>
          <div className="text-lg font-mono font-bold text-amber-200 mt-0.5 group-hover:text-white group-hover:text-glow-amber transition-all duration-180">
            {formatEnergy(totalQ)}
          </div>
          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between border-t border-[rgba(160,195,235,0.15)] pt-1 mt-1">
            <span>Step:</span>
            <span className={stepQ > 0 ? 'text-amber-300' : stepQ < 0 ? 'text-sky-300' : 'text-slate-400'}>
              {stepQ >= 0 ? '+' : ''}{formatEnergy(stepQ)}
            </span>
          </div>
        </div>

        {/* Work (W) */}
        <div className="argon-glass-interactive p-3 border border-emerald-500/40 flex flex-col gap-1 cursor-default group">
          <div className="flex items-center justify-between text-[11px] font-mono text-emerald-300 font-semibold uppercase tracking-wide group-hover:text-emerald-200 transition-colors">
            <span>Work (W)</span>
            <span className="text-[9px] text-slate-400">W &gt; 0 BY GAS</span>
          </div>
          <div className="text-lg font-mono font-bold text-emerald-200 mt-0.5 group-hover:text-white group-hover:text-glow transition-all duration-180">
            {formatEnergy(totalW)}
          </div>
          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between border-t border-[rgba(160,195,235,0.15)] pt-1 mt-1">
            <span>Step:</span>
            <span className={stepW > 0 ? 'text-emerald-300' : stepW < 0 ? 'text-purple-300' : 'text-slate-400'}>
              {stepW >= 0 ? '+' : ''}{formatEnergy(stepW)}
            </span>
          </div>
        </div>

        {/* Net ΔU */}
        <div className="argon-glass-interactive p-3 border border-cyan-400/40 flex flex-col gap-1 cursor-default group">
          <div className="flex items-center justify-between text-[11px] font-mono text-cyan-300 font-semibold uppercase tracking-wide group-hover:text-cyan-200 transition-colors">
            <span>Net Change (ΔU)</span>
            <span className="text-[9px] text-slate-400">Q − W</span>
          </div>
          <div className="text-lg font-mono font-bold text-cyan-200 mt-0.5 group-hover:text-white group-hover:text-glow-cyan transition-all duration-180">
            {totalDeltaU >= 0 ? '+' : ''}{formatEnergy(totalDeltaU)}
          </div>
          <div className="text-[10px] font-mono text-slate-400 flex items-center justify-between border-t border-[rgba(160,195,235,0.15)] pt-1 mt-1">
            <span>Step:</span>
            <span className={stepDeltaU > 0 ? 'text-cyan-300' : stepDeltaU < 0 ? 'text-rose-300' : 'text-slate-400'}>
              {stepDeltaU >= 0 ? '+' : ''}{formatEnergy(stepDeltaU)}
            </span>
          </div>
        </div>
      </div>

      {/* State Energies: Total U and H (Sharp dual-column glass subpanel) */}
      <div className="argon-glass-subpanel p-2.5 grid grid-cols-2 gap-3">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-0.5">
            INTERNAL ENERGY (U)
          </span>
          <span className="text-sm font-mono font-bold text-white text-glow">
            {formatEnergy(derived.internalEnergy)}
          </span>
        </div>
        <div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-0.5">
            ENTHALPY (H)
          </span>
          <span className="text-sm font-mono font-bold text-white text-glow">
            {formatEnergy(derived.enthalpy)}
          </span>
        </div>
      </div>

      {/* Numerical Check Details */}
      <div className="argon-glass-subpanel px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400">
        <span>RESIDUAL |ΔU − (Q − W)|:</span>
        <span className="text-cyan-300 font-semibold text-glow-cyan">
          {cumulativeResidual === 0 ? '0.00 J (EXACT)' : `${formatValue(cumulativeResidual, 6)} J`}
        </span>
      </div>
    </div>
  );
};

export default EnergyAccountingPanel;
