/**
 * ConfigurationPanel — Editable inputs for defining the initial thermodynamic state.
 * Sharp rectangular glassmorphism with Argon spectral scientific styling.
 */

import React from 'react';
import type { StateVariable, ValidationReport } from '../physics';
import { ALL_STATE_VARIABLES } from '../physics';
import { STATE_LABELS, UNIT_LABELS } from '../utils/formatting';

interface Props {
  rawInputs: Record<StateVariable, string>;
  dependentVariable: StateVariable;
  computedValue: number | null;
  validation: ValidationReport;
  isSimulating?: boolean;
  onInputChange: (variable: StateVariable, value: string) => void;
  onDependentChange: (variable: StateVariable) => void;
  onReset: () => void;
  onApplyToSim?: () => void;
}

const ConfigurationPanel: React.FC<Props> = ({
  rawInputs,
  dependentVariable,
  computedValue,
  validation,
  isSimulating = false,
  onInputChange,
  onDependentChange,
  onReset,
  onApplyToSim,
}) => {
  return (
    <section
      id="config-panel"
      className="argon-glass-panel p-4 flex flex-col gap-3.5"
    >
      {/* Title Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="spectral-header-accent pl-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Initial State Setup (t = 0)
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            EQUILIBRIUM BASELINE · PV = nRT
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {onApplyToSim && (
            <button
              type="button"
              id="apply-initial-state-btn"
              onClick={onApplyToSim}
              className="argon-glass-btn-primary px-2.5 py-1 text-[11px] font-mono font-medium cursor-pointer border"
              title="Apply this state as simulation initial state and reset t=0"
            >
              APPLY STATE
            </button>
          )}
          <button
            id="reset-button"
            onClick={onReset}
            className="argon-glass-interactive px-2.5 py-1 text-[11px] font-mono font-medium cursor-pointer"
          >
            DEFAULTS
          </button>
        </div>
      </div>

      {isSimulating && (
        <div className="px-3 py-1.5 bg-cyan-950/40 border border-cyan-500/30 text-xs font-mono text-cyan-300 flex items-center justify-between backdrop-blur-sm">
          <span>● SIMULATION ACTIVE</span>
          <span className="text-[10px] text-cyan-400/80">Reset to edit initial state</span>
        </div>
      )}

      {/* Dependent Variable Selector (Sharp rectangular tabs) */}
      <div className="argon-glass-subpanel p-2.5">
        <label className="block text-[10px] font-semibold text-slate-300 mb-2 uppercase tracking-widest font-mono">
          Calculate via EOS (Dependent Variable):
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_STATE_VARIABLES.map((v) => {
            const isSelected = dependentVariable === v;
            return (
              <button
                key={v}
                id={`dep-select-${v}`}
                onClick={() => onDependentChange(v)}
                className={`px-2.5 py-1.5 text-xs font-mono transition-all duration-180 cursor-pointer border text-left ${
                  isSelected
                    ? 'bg-[rgba(4,14,35,0.92)] text-cyan-200 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.25)] font-bold text-glow-cyan'
                    : 'argon-glass-interactive'
                }`}
              >
                {STATE_LABELS[v].split(' ')[0]}
              </button>
            );
          })}
        </div>
      </div>

      {/* State Variable Input Fields (Sharp) */}
      <div className="flex flex-col gap-2.5">
        {ALL_STATE_VARIABLES.map((v) => {
          const isDependent = v === dependentVariable;
          const fieldValidation = validation.fields[v];
          const hasError = !isDependent && !fieldValidation?.valid;

          return (
            <div key={v} className="relative">
              <label
                htmlFor={`input-${v}`}
                className="flex items-center justify-between text-xs font-mono text-slate-300 mb-1"
              >
                <span>{STATE_LABELS[v]}</span>
                <span className="text-slate-400 font-mono text-[11px] bg-[rgba(6,12,28,0.6)] px-1 border border-[rgba(160,195,235,0.18)]">
                  {UNIT_LABELS[v]}
                </span>
              </label>

              {isDependent ? (
                /* Computed value — read-only display */
                <div
                  id={`input-${v}`}
                  className="w-full px-3 py-1.5 bg-[rgba(6,24,38,0.55)] border border-cyan-500/40 text-cyan-200 font-mono text-sm tracking-wide flex items-center justify-between shadow-inner"
                >
                  <span className="font-bold text-glow-cyan">
                    {computedValue !== null ? computedValue.toPrecision(8) : '—'}
                  </span>
                  <span className="text-[10px] text-cyan-300 font-mono uppercase tracking-wider">
                    [CALCULATED]
                  </span>
                </div>
              ) : (
                /* Editable input */
                <input
                  id={`input-${v}`}
                  type="text"
                  inputMode="decimal"
                  value={rawInputs[v]}
                  onChange={(e) => onInputChange(v, e.target.value)}
                  className={`argon-glass-input w-full px-3 py-1.5 text-sm font-mono text-slate-100 ${
                    hasError ? 'border-red-500/70 bg-red-950/30 text-red-200' : ''
                  }`}
                  placeholder={`Enter ${STATE_LABELS[v].split(' ')[0].toLowerCase()}…`}
                />
              )}

              {/* Error message */}
              {hasError && fieldValidation?.error && (
                <p className="mt-1 text-[11px] font-mono text-red-400">
                  ⚠ {fieldValidation.error}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Equation of state footer note */}
      <div className="argon-glass-subpanel mt-1 px-3 py-2 text-center">
        <p className="text-[11px] text-slate-400 font-mono tracking-wider">
          P·V = n·R·T &nbsp;·&nbsp; HELIUM-4 IDEAL GAS
        </p>
      </div>
    </section>
  );
};

export default ConfigurationPanel;
