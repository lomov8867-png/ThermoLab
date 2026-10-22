# ThermoLab

An interactive, browser-based physics simulator for learning thermodynamics and molecular motion. Built with React 19, TypeScript, and Vite.

ThermoLab provides two simulation engines that run side by side:

- **Macroscopic engine** — models a confined ideal gas (monatomic Helium-4) through classic thermodynamic processes: isochoric, isobaric, isothermal, and adiabatic. Every step enforces the equation of state (PV = nRT) and the First Law (ΔU = Q − W) to numerical precision.
- **Microscopic engine** — a Direct Simulation Monte Carlo (DSMC) particle simulator. Hundreds of simulator particles move, bounce off walls, and undergo elastic binary collisions using Bird's No-Time-Counter (NTC) algorithm. Statistical estimators recover temperature, pressure, and kinetic energy from the particle ensemble.

Both engines are independent. You can switch between them or compare their outputs without one overriding the other.

---

## Features

### Macroscopic mode
- Four process steppers: isochoric, isobaric, isothermal, adiabatic
- Real-time First Law energy accounting (Q, W, ΔU) with residual diagnostics
- Live P–V state diagram
- Derived property readouts: internal energy, enthalpy, density, RMS speed, particle count

### Microscopic DSMC mode
- Particle ensemble stored in typed arrays (Float64Array) for performance
- Bird NTC elastic collisions with hard-sphere cross-section
- Specular wall reflections and moving-piston boundary interactions
- Kinetic temperature and pressure estimators
- Entropy Explorer: qualitative particle-distribution tool for understanding disorder (illustrative only — not a numerical entropy measurement)
- Golden particle canvas visualization driven by the live simulation

---

## Technology stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | ~6.0 |
| UI framework | React | ^19.3 |
| Build tool | Vite | ^8.3 |
| Styling | Tailwind CSS | ^4.3 |
| Linter | Oxlint | ^1.88 |
| Test runner | Vitest | ^5.0 |

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- npm 9 or later (included with Node.js)

---

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/thermolab.git
cd thermolab
npm install
```

Replace `YOUR_USERNAME` with your GitHub username once the repository is published.

---

## Running the development server

```bash
npm run dev
```

Opens the app at `http://localhost:5173` with hot module replacement.

---

## Production build

```bash
npm run build
```

Compiles TypeScript and bundles the app into `dist/`. The build fails on any TypeScript error.

To preview the production build locally:

```bash
npm run preview
```

---

## Running tests

```bash
npm run test:run
```

Runs the full Vitest suite once (215 tests across 7 files) and exits. Tests cover the macroscopic physics engine, the DSMC particle ensemble, PRNG, collision kernel, estimators, and entropy calculations.

For interactive watch mode during development:

```bash
npm test
```

---

## Linting

```bash
npm run lint
```

Runs Oxlint over the source tree.

---

## Project structure

```
src/
├── App.tsx                     # Root component and domain switcher
├── components/
│   ├── GasChamber.tsx          # Macroscopic cylinder and piston visualization
│   ├── GraphPanel.tsx          # P–V diagram
│   ├── EnergyAccountingPanel.tsx
│   ├── PropertiesPanel.tsx
│   └── dsmc/
│       ├── DSMCChamber.tsx     # DSMC canvas particle visualizer
│       ├── DSMCEntropyExplorer.tsx
│       └── ...
├── hooks/
│   ├── useSimulation.ts        # Macroscopic animation loop
│   └── useDSMCSimulation.ts    # DSMC animation loop
└── physics/
    ├── engine.ts               # Ideal gas state resolution
    ├── simulation.ts           # Macroscopic process steppers
    └── dsmc/
        ├── particle-ensemble.ts
        ├── ntc-collisions.ts
        ├── estimators.ts
        ├── entropy.ts
        └── ...
```

---

## Physical scope and limitations

- The ideal gas model assumes PV = nRT exactly. Real helium deviates at high pressures or near 4.2 K.
- The DSMC engine uses coarse collision cells and a scaled timestep. It is not a time-accurate rarefied-gas solver for continuum atmospheric conditions — it is an educational statistical relaxation model.
- The Entropy Explorer provides a qualitative illustration of particle spreading. It does not compute or display thermodynamic entropy values.
- Statistical estimators (temperature, pressure) fluctuate by roughly 1/√N around the mean. With 500 particles the fluctuation is about 4–5%.

---

## License

To be determined. Not yet licensed for redistribution.
