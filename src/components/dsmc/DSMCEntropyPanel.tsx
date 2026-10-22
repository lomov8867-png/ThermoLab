/**
 * DSMCEntropyPanel — Microscopic Entropy & Kinetic H-Functional Observables
 * =========================================================================
 *
 * Provides a rigorous, scientifically delineated presentation of:
 *  1. Sackur–Tetrode Analytical Reference Entropy (exact classical formula).
 *  2. Equilibrium Entropy Estimate Derived from Kinetic Temperature (with σ_S).
 *  3. Boltzmann Velocity-Space H-Functional (nats relative to (m/s)⁻³ vs theoretical H_Maxwell).
 *  4. Thermodynamic Process Entropy Change (ΔS relative to initial state).
 *
 * Strict Scientific Boundaries:
 *  - H-functional is NEVER labeled as total thermodynamic entropy.
 *  - Temperature-derived entropy is explicitly marked as an equilibrium estimate
 *    (does NOT measure arbitrary non-equilibrium entropy).
 *  - Missing or unsupported uncertainties are NEVER displayed as zero.
 *  - Estimator limitation flags are prominently exposed.
 *
 * @module
 */

import React from 'react';
import type { DSMCSimulationSnapshot } from '../../physics/dsmc';
import { formatValue } from '../../utils/formatting';

interface Props {
  snapshot: DSMCSimulationSnapshot;
}

export const DSMCEntropyPanel: React.FC<Props> = ({ snapshot }) => {
  const { entropyRef, entropyEq, kineticH, entropyChange } = snapshot;

  return (
    <section id="dsmc-entropy-panel" className="argon-glass-panel p-4 flex flex-col gap-3">
      {/* Title bar */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
        <div className="spectral-header-accent pl-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200 font-mono">
            Statistical Entropy &amp; Kinetic H-Functional
          </h2>
          <p className="text-[10px] text-slate-400 font-mono">
            STAGE 5 SCIENTIFIC FORMULATION &amp; REFERENCE METRICS
          </p>
        </div>

        <span className="text-[10px] font-mono px-2 py-0.5 bg-[rgba(6,12,28,0.65)] border border-[rgba(160,195,235,0.22)] text-indigo-300">
          STAGE 5 ENGINE
        </span>
      </div>

      {/* 4 Distinct Cards */}
      <div className="flex flex-col gap-2.5">
        {/* 1. Sackur–Tetrode Analytical Reference */}
        <div className="bg-[rgba(6,12,28,0.55)] border border-[rgba(160,195,235,0.18)] p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-200">
              1. Sackur–Tetrode Analytical Reference
            </span>
            <span className="text-[9px] font-mono text-cyan-300 px-1.5 py-0.5 bg-cyan-950/60 border border-cyan-500/30">
              EXACT FORMULA
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <span className="text-sm font-bold font-mono text-white text-glow-cyan">
              {entropyRef.isValid ? formatValue(entropyRef.value, 4) : 'NaN'}{' '}
              <span className="text-xs font-normal text-cyan-300">J/K</span>
            </span>
            <span className="text-xs font-mono text-slate-300">
              {entropyRef.molarValue !== undefined
                ? `${formatValue(entropyRef.molarValue, 2)} J/(mol·K)`
                : '—'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Stochastic Uncertainty (σ_S):</span>
            <span className="text-slate-400 italic">N/A — Exact reference (zero sampling variance)</span>
          </div>

          <p className="text-[9px] font-mono text-slate-400 leading-tight">
            Exact analytical entropy of classical monatomic ideal gas in canonical equilibrium.
          </p>
        </div>

        {/* 2. Equilibrium Entropy from Kinetic Temperature */}
        <div className="bg-[rgba(6,12,28,0.55)] border border-[rgba(160,195,235,0.18)] p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-200">
              2. Equilibrium Entropy from Kinetic Temperature
            </span>
            <span className="text-[9px] font-mono text-amber-300 px-1.5 py-0.5 bg-amber-950/60 border border-amber-500/30">
              EQUILIBRIUM MAPPING
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <span className="text-sm font-bold font-mono text-white text-glow-cyan">
              {entropyEq.isValid ? formatValue(entropyEq.value, 4) : 'NaN'}{' '}
              <span className="text-xs font-normal text-cyan-300">J/K</span>
            </span>
            <span className="text-xs font-mono text-slate-300">
              {entropyEq.molarValue !== undefined
                ? `${formatValue(entropyEq.molarValue, 2)} J/(mol·K)`
                : '—'}
            </span>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Propagated Uncertainty (σ_S):</span>
            <span className="text-cyan-300">
              {entropyEq.standardError !== undefined
                ? `±${formatValue(entropyEq.standardError, 4)} J/K`
                : 'Unavailable'}
            </span>
          </div>

          {/* Scientific Scope Warning */}
          <div className="px-2 py-1 bg-amber-950/40 border border-amber-500/30 text-[9px] font-mono text-amber-200 leading-tight">
            <span className="font-bold text-amber-300">SCOPE:</span> Evaluated by substituting measured peculiar temperature T_est into the Sackur–Tetrode equation. Assumes equilibrium; agreement with analytical reference is by algebraic construction and does NOT validate non-equilibrium entropy.
          </div>
        </div>

        {/* 3. Kinetic Velocity-Distribution H-Functional */}
        <div className="bg-[rgba(6,12,28,0.55)] border border-[rgba(160,195,235,0.18)] p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-200">
              3. Kinetic Boltzmann H-Functional
            </span>
            <span className="text-[9px] font-mono text-indigo-300 px-1.5 py-0.5 bg-indigo-950/60 border border-indigo-500/30">
              VELOCITY SHAPE
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <div>
              <div className="text-[10px] font-mono text-slate-400">Measured H_v:</div>
              <div className="text-sm font-bold font-mono text-white text-glow-cyan">
                {kineticH.isValid ? formatValue(kineticH.H, 3) : 'NaN'}{' '}
                <span className="text-[10px] font-normal text-slate-400">nats / (m/s)³</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-mono text-slate-400">Theoretical H_Maxwell:</div>
              <div className="text-sm font-bold font-mono text-indigo-200">
                {kineticH.isValid ? formatValue(kineticH.theoreticalH, 3) : 'NaN'}{' '}
                <span className="text-[10px] font-normal text-slate-400">nats / (m/s)³</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Statistical Uncertainty:</span>
            <span className="text-slate-400 italic">N/A — Unsupported for non-parametric histogram</span>
          </div>

          {/* Scientific Scope Warning */}
          <div className="px-2 py-1 bg-indigo-950/40 border border-indigo-500/30 text-[9px] font-mono text-indigo-200 leading-tight">
            <span className="font-bold text-indigo-300">IMPORTANT:</span> H_v is an intensive velocity-distribution functional, NOT total thermodynamic entropy S. Evaluated from speed histogram assuming isotropy; reference scale v_ref = 1 m/s.
          </div>
        </div>

        {/* 4. Thermodynamic Process Entropy Change */}
        <div className="bg-[rgba(6,12,28,0.55)] border border-[rgba(160,195,235,0.18)] p-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-slate-200">
              4. Process Entropy Change (ΔS = S - S₀)
            </span>
            <span className="text-[9px] font-mono text-cyan-300 px-1.5 py-0.5 bg-cyan-950/60 border border-cyan-500/30">
              RELATIVE PATH
            </span>
          </div>

          <div className="flex items-baseline justify-between mt-1">
            <span className="text-sm font-bold font-mono text-white text-glow-cyan">
              {entropyChange.isValid ? `${entropyChange.deltaS >= 0 ? '+' : ''}${formatValue(entropyChange.deltaS, 4)}` : 'NaN'}{' '}
              <span className="text-xs font-normal text-cyan-300">J/K</span>
            </span>
            <div className="flex items-center gap-1">
              {entropyChange.flags.map((flag) => (
                <span
                  key={flag}
                  className="text-[9px] font-mono px-1.5 py-0.2 bg-slate-800 text-slate-300 border border-slate-700"
                >
                  {flag}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Propagated Uncertainty:</span>
            <span className="text-slate-300">
              {entropyChange.standardError !== undefined
                ? `±${formatValue(entropyChange.standardError, 4)} J/K`
                : 'N/A'}
            </span>
          </div>

          <p className="text-[9px] font-mono text-slate-400 leading-tight">
            Ideal-gas path integral ΔS = nR [ 3/2 ln(T/T₀) + ln(V/V₀) ] tracking thermodynamic state change from t = 0.
          </p>
        </div>
      </div>
    </section>
  );
};
