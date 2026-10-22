/**
 * PropertiesPanel — Displays all derived thermodynamic properties.
 * Sharp rectangular glassmorphism with Argon spectral scientific styling.
 */

import React from 'react';
import type { ThermodynamicState, DerivedProperties } from '../physics';
import { formatValue, DERIVED_LABELS } from '../utils/formatting';

interface Props {
  state: ThermodynamicState | null;
  derived: DerivedProperties | null;
  eosValid: boolean;
}

const PropertiesPanel: React.FC<Props> = ({ state, derived, eosValid }) => {
  if (!state || !derived) {
    return (
      <section
        id="properties-panel"
        className="argon-glass-panel p-4 flex flex-col"
      >
        <div className="spectral-header-accent pl-2.5 pb-2 mb-3 border-b border-slate-800/80">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Thermodynamic Properties
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            STATE-RESOLVED EQUILIBRIUM OBSERVABLES
          </p>
        </div>
        <div className="flex items-center justify-center py-8">
          <p className="text-xs text-slate-500 font-mono italic">
            Resolve a valid state to display properties
          </p>
        </div>
      </section>
    );
  }

  const rows: { key: string; value: number }[] = Object.entries(derived).map(
    ([key, value]) => ({ key, value: value as number }),
  );

  return (
    <section
      id="properties-panel"
      className="argon-glass-panel p-4 flex flex-col"
    >
      {/* Title Bar */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80">
        <div className="spectral-header-accent pl-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Thermodynamic Properties
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            STATE-RESOLVED EQUILIBRIUM OBSERVABLES
          </p>
        </div>

        {/* EOS verification badge (Sharp rectangular glass) */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-semibold border ${
            eosValid
              ? 'bg-[rgba(6,28,18,0.65)] text-emerald-300 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
              : 'bg-red-950/60 text-red-300 border-red-500/40'
          }`}
        >
          <span
            className={`w-1.5 h-1.5 inline-block ${
              eosValid ? 'bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-red-400'
            }`}
          />
          {eosValid ? 'PV=nRT ✓' : 'PV≠nRT ✗'}
        </div>
      </div>

      {/* Properties Table (Sharp rectangular rows with dark hover state, text brightening & glow) */}
      <div className="flex flex-col gap-1">
        {rows.map(({ key, value }) => {
          const meta = DERIVED_LABELS[key];
          if (!meta) return null;
          return (
            <div
              key={key}
              className="flex items-center justify-between px-2.5 py-1.5 bg-[rgba(6,12,28,0.45)] border border-[rgba(160,195,235,0.14)] hover:bg-[rgba(4,10,25,0.88)] hover:border-[rgba(115,190,255,0.55)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.6),0_0_12px_rgba(105,185,255,0.22)] transition-all duration-180 group cursor-default"
            >
              <span className="text-xs font-mono text-slate-400 group-hover:text-white transition-colors duration-180">
                {meta.label}
              </span>
              <span className="text-xs font-mono">
                <span className="font-bold text-slate-100 group-hover:text-white group-hover:text-glow-cyan transition-all duration-180">
                  {formatValue(value)}
                </span>
                {meta.unit && (
                  <span className="text-slate-400 text-[11px] font-mono ml-1.5 group-hover:text-cyan-300 transition-colors duration-180">
                    {meta.unit}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default PropertiesPanel;
