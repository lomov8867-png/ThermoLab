/**
 * Header — Application title bar with Argon spectral scientific identity.
 */

import React from 'react';

interface Props {
  activeEngine?: 'dsmc' | 'macroscopic';
}

const Header: React.FC<Props> = ({ activeEngine = 'dsmc' }) => (
  <header className="relative z-10 flex items-center justify-between px-6 py-3.5 bg-[rgba(8,16,35,0.58)] backdrop-blur-[12px] border-b border-[rgba(160,195,235,0.22)] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
    {/* Left: Branding & Subtitle */}
    <div className="flex items-center gap-3.5">
      {/* Precision Instrument Logo Icon (Sharp rectangular) */}
      <div className="flex items-center justify-center w-9 h-9 bg-[rgba(6,12,28,0.65)] border border-[rgba(160,195,235,0.3)] text-cyan-400 shadow-sm shadow-cyan-500/15">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="square"
          strokeLinejoin="miter"
          className="w-5 h-5"
        >
          <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
          <line x1="10" y1="9" x2="14" y2="9" />
          <line x1="10" y1="12" x2="13" y2="12" />
        </svg>
      </div>

      <div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-lg font-bold tracking-wider uppercase text-white font-mono">
            Thermo<span className="text-cyan-400">Lab</span>
          </h1>
          <span className="text-[10px] font-mono text-cyan-300 px-1.5 py-0.2 border border-cyan-400/40 bg-cyan-950/50">
            v0.3.1
          </span>
        </div>
        <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
          PRECISION THERMODYNAMICS LABORATORY · MONATOMIC HELIUM
        </p>
      </div>
    </div>

    {/* Right: Scientific Status & Spectral Tag */}
    <div className="flex items-center gap-3">
      {/* Spectral Emission Reference Tag (Interactive on hover) */}
      <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[rgba(6,12,28,0.55)] border border-[rgba(160,195,235,0.2)] text-[11px] font-mono text-slate-300">
        <span className="w-1.5 h-1.5 bg-indigo-400 inline-block shadow-[0_0_6px_rgba(99,102,241,0.8)]" />
        <span>Ar λ: 419.8 / 488.0 nm</span>
      </div>

      {/* Equilibrium / Engine Status Badge (Sharp rectangular glass) */}
      <div className="flex items-center gap-2 px-3 py-1 bg-[rgba(6,28,18,0.65)] border border-emerald-500/40 text-[11px] font-mono text-emerald-300 backdrop-blur-sm shadow-[0_0_8px_rgba(16,185,129,0.15)]">
        <span className="w-1.5 h-1.5 bg-emerald-400 animate-pulse inline-block shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
        <span className="font-semibold uppercase tracking-wider">
          {activeEngine === 'dsmc' ? 'DSMC Microscopic Engine' : 'Continuum Equilibrium State'}
        </span>
      </div>
    </div>


    {/* Spectral hairline accent on bottom border */}
    <div
      className="absolute bottom-0 left-0 right-0 h-[1px] pointer-events-none"
      style={{
        background: 'linear-gradient(90deg, transparent 0%, rgba(6,182,212,0.6) 20%, rgba(139,92,246,0.6) 50%, rgba(249,115,22,0.4) 80%, transparent 100%)',
      }}
    />
  </header>
);

export default Header;
