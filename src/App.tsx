/**
 * ThermoLab — Main Application Component
 * Milestone 3 + Stage 6: DSMC Microscopic & Continuum Laboratory
 *
 * Integrated precision scientific layout supporting dual simulation domains:
 *  1. Microscopic: Direct Simulation Monte Carlo (DSMC) statistical particle engine (Stage 6).
 *  2. Macroscopic: Continuum ideal gas quasi-static thermodynamic engine.
 *
 * Strict zero-radius rectangular glassmorphism with Argon spectral identity.
 */

import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ArgonSpectrumBackground from './components/ArgonSpectrumBackground';
import SimulationControls from './components/SimulationControls';
import EnvironmentControls from './components/EnvironmentControls';
import ConfigurationPanel from './components/ConfigurationPanel';
import GasChamber from './components/GasChamber';
import GraphPanel from './components/GraphPanel';
import EnergyAccountingPanel from './components/EnergyAccountingPanel';
import PropertiesPanel from './components/PropertiesPanel';
import { useThermodynamicState } from './hooks/useThermodynamicState';
import { useSimulation } from './hooks/useSimulation';

// Stage 6 DSMC Imports
import { useDSMCSimulation } from './hooks/useDSMCSimulation';
import {
  DSMCChamber,
  DSMCEntropyExplorer,
} from './components/dsmc';

export type SimulationDomain = 'dsmc' | 'macroscopic';

const App: React.FC = () => {
  // Domain switcher: Microscopic DSMC (default) vs Macroscopic Continuum
  const [domain, setDomain] = useState<SimulationDomain>('dsmc');

  // ─── 1. Macroscopic Simulation Engine ─────────────────────────────────── //
  const thermo = useThermodynamicState();
  const sim = useSimulation({
    initialState: thermo.state ?? undefined,
  });

  useEffect(() => {
    if (sim.status === 'idle' && sim.stepCount === 0 && thermo.state) {
      sim.setInitialState(thermo.state);
    }
  }, [thermo.state, sim.status, sim.stepCount, sim.setInitialState]);

  const handleApplyInitialState = () => {
    if (thermo.state) {
      sim.setInitialState(thermo.state);
    }
  };

  const activeState = sim.snapshot.state;
  const activeDerived = sim.snapshot.derived;
  const eosValid = sim.snapshot.energyBalanceValid;
  const computedInitialValue = thermo.state
    ? thermo.state[thermo.dependentVariable]
    : null;

  // ─── 2. Microscopic DSMC Engine (Stage 6) ──────────────────────────────── //
  const dsmc = useDSMCSimulation();

  return (
    <div className="relative min-h-screen flex flex-col text-slate-100 selection:bg-cyan-500/30 selection:text-white">
      {/* Static Argon Spectrum Background */}
      <ArgonSpectrumBackground />

      {/* Header Bar */}
      <Header activeEngine={domain} />

      {/* Main Dashboard Layout Container */}
      <div className="relative z-10 flex-1 flex flex-col gap-3.5 p-4 max-w-[1720px] w-full mx-auto">
        {/* Domain Mode Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-[rgba(8,16,35,0.7)] border border-[rgba(160,195,235,0.25)] backdrop-blur-md shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest hidden sm:inline">
              Engine Model:
            </span>
            <button
              id="switch-domain-dsmc"
              onClick={() => setDomain('dsmc')}
              className={`px-3.5 py-1.5 text-xs font-mono font-semibold cursor-pointer border transition-all ${
                domain === 'dsmc'
                  ? 'bg-cyan-950/90 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                  : 'bg-[rgba(6,12,28,0.5)] border-[rgba(160,195,235,0.2)] text-slate-400 hover:text-white'
              }`}
            >
              🔬 Microscopic: DSMC Particle Engine
            </button>
            <button
              id="switch-domain-macroscopic"
              onClick={() => setDomain('macroscopic')}
              className={`px-3.5 py-1.5 text-xs font-mono font-semibold cursor-pointer border transition-all ${
                domain === 'macroscopic'
                  ? 'bg-cyan-950/90 border-cyan-400 text-white shadow-[0_0_12px_rgba(6,182,212,0.3)]'
                  : 'bg-[rgba(6,12,28,0.5)] border-[rgba(160,195,235,0.2)] text-slate-400 hover:text-white'
              }`}
            >
              ⚙️ Macroscopic: Continuum Gas Engine
            </button>
          </div>
        </div>

        {/* ─── DOMAIN 1: MICROSCOPIC DSMC ENGINE (STAGE 6) ────────────────── */}
        {domain === 'dsmc' && (
          <>
            {/* Error alerts */}
            {dsmc.error && (
              <div className="px-4 py-2.5 bg-red-950/70 border border-red-500/50 text-xs font-mono text-red-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-400 inline-block" />
                  <span className="font-bold uppercase tracking-wider text-red-300">
                    DSMC Alert:
                  </span>{' '}
                  {dsmc.error}
                </div>
              </div>
            )}

            {/* 2-Column Student Layout */}
            <main className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-3.5 items-start">
              {/* Left Column: Entropy Explorer */}
              <div className="flex flex-col gap-3.5">
                <DSMCEntropyExplorer
                  simulationRef={dsmc.simulationRef}
                  snapshot={dsmc.snapshot}
                />
              </div>

              {/* Center Column: Particle Chamber */}
              <div className="flex flex-col gap-3.5">
                <DSMCChamber
                  snapshot={dsmc.snapshot}
                  simulationRef={dsmc.simulationRef}
                />
              </div>
            </main>
          </>
        )}

        {/* ─── DOMAIN 2: MACROSCOPIC CONTINUUM ENGINE ─────────────────────── */}
        {domain === 'macroscopic' && (
          <>
            {/* Global Simulation Control Bar */}
            <SimulationControls
              status={sim.status}
              processMode={sim.processMode}
              time={sim.snapshot.time}
              stepCount={sim.stepCount}
              speedMultiplier={sim.speedMultiplier}
              dt={sim.dt}
              constraintValidation={sim.constraintValidation}
              onPlay={sim.play}
              onPause={sim.pause}
              onTogglePlay={sim.togglePlay}
              onStepForward={sim.stepForward}
              onReset={sim.reset}
              onModeChange={sim.setProcessMode}
              onSpeedChange={sim.setSpeedMultiplier}
            />

            {/* Error / Conflict alerts */}
            {(sim.error || thermo.error) && (
              <div className="px-4 py-2.5 bg-red-950/70 border border-red-500/50 text-xs font-mono text-red-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-red-400 inline-block" />
                  <span className="font-bold uppercase tracking-wider text-red-300">
                    Simulation Alert:
                  </span>{' '}
                  {sim.error || thermo.error}
                </div>
              </div>
            )}

            {/* 3-Column Precision Laboratory Grid */}
            <main className="grid grid-cols-1 lg:grid-cols-[340px_1fr_360px] gap-3.5 items-start">
              {/* Left Column — Surroundings Drivers & Initial State Baseline */}
              <div className="flex flex-col gap-3.5">
                <EnvironmentControls
                  mode={sim.processMode}
                  environment={sim.environment}
                  internalPressure={activeState.pressure}
                  onHeatingPowerChange={sim.setHeatingPower}
                  onVolumeChangeRateChange={sim.setVolumeChangeRate}
                  onExternalPressureChange={sim.setExternalPressure}
                />

                <ConfigurationPanel
                  rawInputs={thermo.rawInputs}
                  dependentVariable={thermo.dependentVariable}
                  computedValue={computedInitialValue}
                  validation={thermo.validation}
                  isSimulating={sim.status === 'running' || sim.stepCount > 0}
                  onInputChange={thermo.setInput}
                  onDependentChange={thermo.setDependentVariable}
                  onReset={thermo.reset}
                  onApplyToSim={handleApplyInitialState}
                />
              </div>

              {/* Centre Column — Gas Chamber (Piston cylinder) & Real-time P-V Diagram */}
              <div className="flex flex-col gap-3.5">
                <GasChamber
                  state={activeState}
                  derived={activeDerived}
                  mode={sim.processMode}
                  heatingPower={sim.environment.heatingPower}
                  externalPressure={sim.environment.externalPressure}
                />

                <GraphPanel
                  history={sim.history}
                  currentState={activeState}
                  processMode={sim.processMode}
                />
              </div>

              {/* Right Column — Live Energy Accounting & Properties Observables */}
              <div className="flex flex-col gap-3.5">
                <EnergyAccountingPanel snapshot={sim.snapshot} />

                <PropertiesPanel
                  state={activeState}
                  derived={activeDerived}
                  eosValid={eosValid}
                />
              </div>
            </main>
          </>
        )}
      </div>

      {/* Precision Instrument Footer */}
      <footer className="relative z-10 px-6 py-2.5 border-t border-[rgba(160,195,235,0.22)] text-center bg-[rgba(8,16,35,0.58)] backdrop-blur-[12px] shadow-[0_-4px_20px_rgba(0,0,0,0.35)]">
        <p className="text-[11px] font-mono text-slate-300 tracking-wider">
          THERMOLAB v0.3.1 &nbsp;·&nbsp; DUAL-ENGINE THERMODYNAMICS LABORATORY &nbsp;·&nbsp;
          STAGE 6 DSMC PARTICLE ENGINE &amp; CONTINUUM IDEAL GAS &nbsp;·&nbsp; MONATOMIC HELIUM-4 (γ = 5/3)
        </p>
      </footer>
    </div>
  );
};

export default App;
