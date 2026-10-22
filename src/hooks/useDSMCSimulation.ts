/**
 * useDSMCSimulation — React Hook for Microscopic DSMC Simulation
 * ==============================================================
 *
 * Drives the microscopic DSMC particle simulation with:
 *  - Controlled requestAnimationFrame animation loop.
 *  - Full playback controls: Play, Pause, Resume, Single-Step (+dt), Reset.
 *  - Persistent typed-array ParticleEnsemble preserved across React renders.
 *  - Sub-stepped physics integration decoupled from React rendering.
 *  - Immediate cleanup of animation frames on component unmount.
 *  - Dynamic runtime controls (piston velocity, collision toggle, speed multiplier).
 *  - Explicit ensemble rebuild workflow for structural parameter changes.
 *  - Graceful validation and error recovery.
 *
 * @module
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { DSMCSimulationConfig, DSMCSimulationSnapshot } from '../physics/dsmc';
import {
  DSMCSimulation,
  DEFAULT_PARTICLE_COUNT,
  DEFAULT_TEMPERATURE,
  DEFAULT_STATISTICAL_WEIGHT,
  DEFAULT_CHAMBER_DIMS,
} from '../physics/dsmc';


export type DSMCStatus = 'idle' | 'running' | 'paused';

export interface PendingDSMCConfig {
  particleCount: number;
  initialTemperature: number;
  statisticalWeight: number;
  chamberLx: number;
  chamberLy: number;
  chamberLz: number;
  enableCollisions: boolean;
  seed: number;
}

export interface UseDSMCSimulationResult {
  /** Active simulation engine snapshot with live estimators. */
  snapshot: DSMCSimulationSnapshot;
  /** Direct reference to particle ensemble for high-performance canvas rendering. */
  simulationRef: React.MutableRefObject<DSMCSimulation>;
  /** Playback status: idle, running, paused. */
  status: DSMCStatus;
  /** Speed multiplier (0.25x to 5x). */
  speedMultiplier: number;
  /** Active error message, if any. */
  error: string | null;
  /** Pending configuration draft in the control panel. */
  pendingConfig: PendingDSMCConfig;
  /** Whether the pending configuration differs from the active simulation (requires rebuild). */
  hasUnsavedChanges: boolean;

  // Controls
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepForward: () => void;
  reset: () => void;
  rebuild: () => void;
  setPendingConfig: (updater: Partial<PendingDSMCConfig> | ((prev: PendingDSMCConfig) => PendingDSMCConfig)) => void;
  setSpeedMultiplier: (speed: number) => void;
  setPistonVelocity: (velocity: number) => void;
  setCollisionsEnabled: (enabled: boolean) => void;
}

export function useDSMCSimulation(initialConfig?: DSMCSimulationConfig): UseDSMCSimulationResult {
  // 1. Stable physics simulation engine ref (never recreated across renders)
  // Use useState with lazy initializer to satisfy linter
  const [sim] = useState(() => new DSMCSimulation(initialConfig));
  const simRef = useRef(sim); // Keep ref for external access

  // 2. Reactive snapshot state for UI presentation
  const [snapshot, setSnapshot] = useState<DSMCSimulationSnapshot>(() => sim.getSnapshot());
  const [status, setStatus] = useState<DSMCStatus>('idle');
  const [speedMultiplier, setSpeedMultiplierState] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  // Track active config in state to avoid ref access during render
  const [activeConfig, setActiveConfig] = useState<Required<DSMCSimulationConfig>>(() => sim.config);

  // 3. Draft configuration state for parameter adjustments
  const [pendingConfig, setPendingConfigState] = useState<PendingDSMCConfig>(() => ({
    particleCount: initialConfig?.particleCount ?? DEFAULT_PARTICLE_COUNT,
    initialTemperature: initialConfig?.initialTemperature ?? DEFAULT_TEMPERATURE,
    statisticalWeight: initialConfig?.statisticalWeight ?? DEFAULT_STATISTICAL_WEIGHT,
    chamberLx: initialConfig?.chamberDimensions?.[0] ?? DEFAULT_CHAMBER_DIMS[0],
    chamberLy: initialConfig?.chamberDimensions?.[1] ?? DEFAULT_CHAMBER_DIMS[1],
    chamberLz: initialConfig?.chamberDimensions?.[2] ?? DEFAULT_CHAMBER_DIMS[2],
    enableCollisions: initialConfig?.enableCollisions ?? true,
    seed: initialConfig?.seed ?? 42,
  }));

  // Detect whether draft differs from active engine config
  const hasUnsavedChanges = useMemo(() => {
    return (
      pendingConfig.particleCount !== activeConfig.particleCount ||
      pendingConfig.initialTemperature !== activeConfig.initialTemperature ||
      pendingConfig.statisticalWeight !== activeConfig.statisticalWeight ||
      pendingConfig.chamberLx !== activeConfig.chamberDimensions[0] ||
      pendingConfig.chamberLy !== activeConfig.chamberDimensions[1] ||
      pendingConfig.chamberLz !== activeConfig.chamberDimensions[2] ||
      pendingConfig.seed !== activeConfig.seed
    );
  }, [pendingConfig, activeConfig]);

  // 4. Animation frame handling with fixed substeps and cleanup
  const rafIdRef = useRef<number | null>(null);
  const statusRef = useRef<DSMCStatus>(status);
  statusRef.current = status;

  const speedRef = useRef<number>(speedMultiplier);
  speedRef.current = speedMultiplier;

  // Single simulation step
  const performStep = useCallback(() => {
    try {
      const snap = sim.step();
      setSnapshot(snap);
      setError(null);
      return snap;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Simulation step failed: ${msg}`);
      setStatus('paused');
      return null;
    }
  }, [sim]);

  // Animation loop
  useEffect(() => {
    if (status !== 'running') {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      return;
    }

    let lastTime = performance.now();
    let accumulatedTime = 0;

    const tick = (now: number) => {
      if (statusRef.current !== 'running') return;

      const elapsed = Math.min(0.1, (now - lastTime) / 1000); // limit delta to 100ms
      lastTime = now;
      accumulatedTime += elapsed * speedRef.current;

      const dt = sim.config.dt;
      let stepsExecuted = 0;
      const maxStepsPerFrame = 10;

      while (accumulatedTime >= dt && stepsExecuted < maxStepsPerFrame) {
        sim.step();
        accumulatedTime -= dt;
        stepsExecuted++;
      }

      if (stepsExecuted > 0) {
        setSnapshot(sim.getSnapshot());
      }

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [status, sim]);

  // Playback actions
  const play = useCallback(() => {
    setError(null);
    setStatus('running');
  }, []);

  const pause = useCallback(() => {
    setStatus('paused');
  }, []);

  const togglePlay = useCallback(() => {
    setStatus((prev) => (prev === 'running' ? 'paused' : 'running'));
  }, []);

  const stepForward = useCallback(() => {
    if (status === 'running') {
      setStatus('paused');
    }
    performStep();
  }, [status, performStep]);

  const reset = useCallback(() => {
    setStatus('idle');
    try {
      const snap = sim.reset();
      setSnapshot(snap);
      setActiveConfig(sim.config);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Reset failed: ${msg}`);
    }
  }, [sim]);

  // Structural rebuild
  const rebuild = useCallback(() => {
    setStatus('idle');
    try {
      // Validate inputs before passing to engine
      if (pendingConfig.particleCount < 20 || pendingConfig.particleCount > 10000) {
        throw new Error('Particle count must be between 20 and 10,000');
      }
      if (pendingConfig.initialTemperature <= 0 || pendingConfig.initialTemperature > 5000) {
        throw new Error('Temperature must be between 1 K and 5000 K');
      }
      if (pendingConfig.statisticalWeight <= 0) {
        throw new Error('Statistical weight must be strictly positive');
      }
      if (
        pendingConfig.chamberLx <= 0 ||
        pendingConfig.chamberLy <= 0 ||
        pendingConfig.chamberLz <= 0
      ) {
        throw new Error('Chamber dimensions must be strictly positive');
      }

      const snap = sim.reconfigure({
        particleCount: pendingConfig.particleCount,
        initialTemperature: pendingConfig.initialTemperature,
        statisticalWeight: pendingConfig.statisticalWeight,
        chamberDimensions: [
          pendingConfig.chamberLx,
          pendingConfig.chamberLy,
          pendingConfig.chamberLz,
        ],
        enableCollisions: pendingConfig.enableCollisions,
        seed: pendingConfig.seed,
      });

      setSnapshot(snap);
      setActiveConfig(sim.config);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Rebuild failed: ${msg}`);
    }
  }, [pendingConfig, sim]);

  // Runtime parameter modifiers
  const setSpeedMultiplier = useCallback((multiplier: number) => {
    if (Number.isFinite(multiplier) && multiplier > 0) {
      setSpeedMultiplierState(multiplier);
    }
  }, []);

  const setPistonVelocity = useCallback((vel: number) => {
    sim.setPistonVelocity(vel);
    setSnapshot(sim.getSnapshot());
  }, [sim]);

  const setCollisionsEnabled = useCallback((enabled: boolean) => {
    sim.setCollisionsEnabled(enabled);
    setPendingConfigState((prev) => ({ ...prev, enableCollisions: enabled }));
    setSnapshot(sim.getSnapshot());
  }, [sim]);

  const setPendingConfig = useCallback(
    (updater: Partial<PendingDSMCConfig> | ((prev: PendingDSMCConfig) => PendingDSMCConfig)) => {
      setPendingConfigState((prev) => {
        if (typeof updater === 'function') {
          return updater(prev);
        }
        return { ...prev, ...updater };
      });
    },
    [],
  );

  return {
    snapshot,
    simulationRef: simRef,
    status,
    speedMultiplier,
    error,
    pendingConfig,
    hasUnsavedChanges,
    play,
    pause,
    togglePlay,
    stepForward,
    reset,
    rebuild,
    setPendingConfig,
    setSpeedMultiplier,
    setPistonVelocity,
    setCollisionsEnabled,
  };
}
