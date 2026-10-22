/**
 * useSimulation — React Hook for Time-Dependent Thermodynamic Simulation
 * =====================================================================
 *
 * Drives the simulation loop using requestAnimationFrame with a fixed-dt
 * accumulator to guarantee numerical stability, physical determinism, and
 * smooth rendering.
 *
 * Features:
 *  - Full control: Start, Pause, Resume, Step (+dt), Reset
 *  - Process mode switching (isochoric, isobaric, isothermal, adiabatic)
 *  - External controls (heating/cooling power, volume change rate, external pressure)
 *  - Real-time energy accounting (Q, W, ΔU, First Law check)
 *  - Constraint conflict validation & notifications
 *  - History recording of (time, P, V, T, Q, W, U) for process path visualization
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Simulation,
  getDefaultState,
  getDefaultEnvironment,
  validateConstraints,
  transitionEnvironment,
} from '../physics';
import type {
  ThermodynamicState,
  ProcessMode,
  EnvironmentConfig,
  SimulationSnapshot,
  SimulationStatus,
  ConstraintValidation,
} from '../physics';

export interface HistoryPoint {
  time: number;
  pressure: number;
  volume: number;
  temperature: number;
  totalQ: number;
  totalW: number;
  totalDeltaU: number;
}

export interface UseSimulationOptions {
  initialState?: ThermodynamicState;
  initialMode?: ProcessMode;
  initialEnvironment?: EnvironmentConfig;
  dt?: number; // default: 0.05 s
}

export interface SimulationHookResult {
  // Current state & snapshot
  snapshot: SimulationSnapshot;
  status: SimulationStatus;
  processMode: ProcessMode;
  environment: EnvironmentConfig;
  dt: number;
  speedMultiplier: number;
  stepCount: number;

  // History for plotting
  history: HistoryPoint[];

  // Validation & errors
  constraintValidation: ConstraintValidation;
  error: string | null;

  // Controls
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepForward: () => void;
  reset: () => void;
  setProcessMode: (mode: ProcessMode) => void;
  setHeatingPower: (power: number) => void;
  setVolumeChangeRate: (rate: number) => void;
  setExternalPressure: (pressure: number) => void;
  setSpeedMultiplier: (speed: number) => void;
  setInitialState: (state: ThermodynamicState) => void;
}

const DEFAULT_DT = 0.05; // 50 ms simulation time step

export function useSimulation(options?: UseSimulationOptions): SimulationHookResult {
  const initialGasState = useMemo(
    () => options?.initialState ?? getDefaultState(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const initialMode = options?.initialMode ?? 'constant_volume';

  const [processMode, setProcessModeState] = useState<ProcessMode>(initialMode);

  const [environment, setEnvironmentState] = useState<EnvironmentConfig>(() => ({
    ...getDefaultEnvironment(initialMode),
    ...options?.initialEnvironment,
  }));

  const [status, setStatus] = useState<SimulationStatus>('idle');
  const [speedMultiplier, setSpeedMultiplierState] = useState<number>(1);
  const dt = options?.dt ?? DEFAULT_DT;

  // Instantiate the simulation engine ref
  const simRef = useRef<Simulation>(
    new Simulation({
      initialState: initialGasState,
      processMode: initialMode,
      environment: {
        ...getDefaultEnvironment(initialMode),
        ...options?.initialEnvironment,
      },
      dt,
      speedMultiplier: 1,
    }),
  );

  const [snapshot, setSnapshot] = useState<SimulationSnapshot>(() => simRef.current.snapshot);
  const [stepCount, setStepCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // History buffer for process trajectory
  const [history, setHistory] = useState<HistoryPoint[]>([
    {
      time: 0,
      pressure: initialGasState.pressure,
      volume: initialGasState.volume,
      temperature: initialGasState.temperature,
      totalQ: 0,
      totalW: 0,
      totalDeltaU: 0,
    },
  ]);

  // Validate constraints whenever mode or environment changes
  const constraintValidation = useMemo(
    () => validateConstraints(processMode, environment),
    [processMode, environment],
  );

  // Synchronize processMode changes with the engine and auto-adapt driving inputs
  const setProcessMode = useCallback((mode: ProcessMode) => {
    setProcessModeState(mode);
    setEnvironmentState((prev) => {
      const next = transitionEnvironment(mode, prev);
      simRef.current.updateProcessMode(mode, false);
      simRef.current.updateEnvironment(next);
      return next;
    });
    setError(null);
  }, []);

  // Synchronize environment updates with the engine
  const updateEnv = useCallback((patch: Partial<EnvironmentConfig>) => {
    setEnvironmentState((prev) => {
      const next = { ...prev, ...patch };
      simRef.current.updateEnvironment(next);
      return next;
    });
    setError(null);
  }, []);

  const setHeatingPower = useCallback(
    (power: number) => updateEnv({ heatingPower: power }),
    [updateEnv],
  );

  const setVolumeChangeRate = useCallback(
    (rate: number) => updateEnv({ volumeChangeRate: rate }),
    [updateEnv],
  );

  const setExternalPressure = useCallback(
    (pressure: number) => updateEnv({ externalPressure: pressure }),
    [updateEnv],
  );

  const setSpeedMultiplier = useCallback((speed: number) => {
    const clamped = Math.max(0.1, Math.min(20, speed));
    setSpeedMultiplierState(clamped);
    simRef.current.updateSpeedMultiplier(clamped);
  }, []);

  // Reset to initial state
  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    simRef.current.reset();
    const snap = simRef.current.snapshot;
    setSnapshot(snap);
    setStepCount(0);
    setHistory([
      {
        time: 0,
        pressure: snap.state.pressure,
        volume: snap.state.volume,
        temperature: snap.state.temperature,
        totalQ: 0,
        totalW: 0,
        totalDeltaU: 0,
      },
    ]);
  }, []);

  // Reset with new initial state
  const setInitialState = useCallback((state: ThermodynamicState) => {
    setStatus('idle');
    setError(null);
    simRef.current.resetWithState(state);
    const snap = simRef.current.snapshot;
    setSnapshot(snap);
    setStepCount(0);
    setHistory([
      {
        time: 0,
        pressure: snap.state.pressure,
        volume: snap.state.volume,
        temperature: snap.state.temperature,
        totalQ: 0,
        totalW: 0,
        totalDeltaU: 0,
      },
    ]);
  }, []);

  // Single step forward
  const stepForward = useCallback(() => {
    if (status === 'running') return; // Only step manually when paused/idle
    setError(null);
    try {
      const result = simRef.current.step();
      const snap = result.snapshot;
      setSnapshot(snap);
      setStepCount(simRef.current.stepCount);
      setHistory((prev) => [
        ...prev.slice(-300), // retain last 300 points
        {
          time: snap.time,
          pressure: snap.state.pressure,
          volume: snap.state.volume,
          temperature: snap.state.temperature,
          totalQ: snap.totalQ,
          totalW: snap.totalW,
          totalDeltaU: snap.totalDeltaU,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [status]);

  const play = useCallback(() => {
    setError(null);
    setStatus('running');
  }, []);

  const pause = useCallback(() => {
    setStatus('paused');
  }, []);

  const togglePlay = useCallback(() => {
    if (status === 'running') {
      pause();
    } else {
      play();
    }
  }, [status, play, pause]);

  // ─── Animation loop with fixed-step accumulator ─────────────────────────── //
  const lastTimeRef = useRef<number | null>(null);
  const accumulatorRef = useRef<number>(0);

  useEffect(() => {
    if (status !== 'running') {
      lastTimeRef.current = null;
      accumulatorRef.current = 0;
      return;
    }

    let animationFrameId: number;

    const tick = (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
        animationFrameId = requestAnimationFrame(tick);
        return;
      }

      const elapsedSec = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      // Accumulate scaled simulation time
      accumulatorRef.current += Math.min(elapsedSec, 0.25) * speedMultiplier;

      let stepsTaken = 0;
      let lastSnap: SimulationSnapshot | null = null;
      const newPoints: HistoryPoint[] = [];

      try {
        // Run physics steps for accrued time
        while (accumulatorRef.current >= dt && stepsTaken < 30) {
          const res = simRef.current.step();
          lastSnap = res.snapshot;
          accumulatorRef.current -= dt;
          stepsTaken++;

          // Sample history every few steps or on major changes
          if (simRef.current.stepCount % 2 === 0) {
            newPoints.push({
              time: lastSnap.time,
              pressure: lastSnap.state.pressure,
              volume: lastSnap.state.volume,
              temperature: lastSnap.state.temperature,
              totalQ: lastSnap.totalQ,
              totalW: lastSnap.totalW,
              totalDeltaU: lastSnap.totalDeltaU,
            });
          }
        }

        if (stepsTaken >= 30) {
          // Drop accumulator spiral of death
          accumulatorRef.current = 0;
        }

        if (lastSnap) {
          setSnapshot(lastSnap);
          setStepCount(simRef.current.stepCount);
          if (newPoints.length > 0) {
            setHistory((prev) => [...prev.slice(-300 + newPoints.length), ...newPoints]);
          }
        }

        animationFrameId = requestAnimationFrame(tick);
      } catch (err) {
        setStatus('paused');
        setError(err instanceof Error ? err.message : String(err));
      }
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [status, dt, speedMultiplier]);

  return {
    snapshot,
    status,
    processMode,
    environment,
    dt,
    speedMultiplier,
    stepCount,
    history,
    constraintValidation,
    error,
    play,
    pause,
    togglePlay,
    stepForward,
    reset,
    setProcessMode,
    setHeatingPower,
    setVolumeChangeRate,
    setExternalPressure,
    setSpeedMultiplier,
    setInitialState,
  };
}
