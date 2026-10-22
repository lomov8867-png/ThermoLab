/**
 * ArgonSpectrumBackground — Static Argon Visible Emission Spectrum
 * =================================================================
 *
 * Full-page, completely static background inspired by the visible emission
 * spectrum of neutral argon (Ar I / Ar II).
 *
 * Design characteristics:
 *  - Deep midnight navy (#030611, #050a18) and obsidian foundation.
 *  - Fine diagonal spectral lines at authentic scientific wavelengths:
 *      * Violet doublet/triplet: ~415.9 nm, 419.8 nm, 425.9 nm
 *      * Electric blue: ~451.1 nm, 470.2 nm
 *      * Intense Cyan Laser peak: ~488.0 nm, 514.5 nm
 *      * Dark optical gap
 *      * Restrained red-orange transitions: ~696.5 nm, 706.7 nm, 750.4 nm
 *  - Rich optical glows calibrated so spectral lines remain distinctly perceptible
 *    through translucent glassmorphic panels (backdrop-blur: 12px).
 *  - Completely static: zero animations, transforms, or shifting lines.
 *  - pointer-events: none; strictly layered behind all UI elements.
 */

import React from 'react';

const ArgonSpectrumBackground: React.FC = () => {
  return (
    <div
      id="argon-spectrum-bg"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#02050e]"
      aria-hidden="true"
    >
      {/* Deep foundation radial ambient gradients */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(circle at 18% 25%, rgba(99, 102, 241, 0.12) 0%, transparent 48%),
            radial-gradient(circle at 75% 65%, rgba(6, 182, 212, 0.10) 0%, transparent 52%),
            radial-gradient(circle at 50% 100%, rgba(15, 23, 42, 0.7) 0%, transparent 70%),
            linear-gradient(180deg, #02050e 0%, #030716 50%, #02050e 100%)
          `,
        }}
      />

      {/* SVG Static Diagonal Spectral Dispersion */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1920 1080"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Subtle optical dispersion filters for glowing spectral lines */}
          <filter id="argon-glow-cyan" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur1" />
            <feGaussianBlur stdDeviation="12" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="argon-glow-violet" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4.5" result="blur1" />
            <feGaussianBlur stdDeviation="14" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="argon-glow-blue" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3.5" result="blur1" />
            <feGaussianBlur stdDeviation="10" result="blur2" />
            <feMerge>
              <feMergeNode in="blur2" />
              <feMergeNode in="blur1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          <filter id="argon-glow-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── Precision Spectrometer Reticle Reference Grid (faint) ── */}
        <g stroke="#334155" strokeWidth="0.5" opacity="0.18">
          {/* Horizontal optical graticule lines */}
          <line x1="0" y1="180" x2="1920" y2="180" strokeDasharray="4 16" />
          <line x1="0" y1="360" x2="1920" y2="360" strokeDasharray="4 16" />
          <line x1="0" y1="540" x2="1920" y2="540" strokeDasharray="4 16" />
          <line x1="0" y1="720" x2="1920" y2="720" strokeDasharray="4 16" />
          <line x1="0" y1="900" x2="1920" y2="900" strokeDasharray="4 16" />

          {/* Vertical calibration ticks */}
          <line x1="280" y1="0" x2="280" y2="1080" strokeDasharray="3 18" />
          <line x1="720" y1="0" x2="720" y2="1080" strokeDasharray="3 18" />
          <line x1="1200" y1="0" x2="1200" y2="1080" strokeDasharray="3 18" />
          <line x1="1640" y1="0" x2="1640" y2="1080" strokeDasharray="3 18" />
        </g>

        {/* ── Diagonal Argon Spectral Emission Lines (Slope: dx=520, dy=1160, angle ≈ 65.8°) ── */}
        <g>
          {/* ── Far Left Violet / UV Band (~394 nm - 410 nm) ── */}
          <line
            x1="-40"
            y1="-40"
            x2="480"
            y2="1120"
            stroke="#6366f1"
            strokeWidth="0.8"
            opacity="0.45"
          />
          <line
            x1="80"
            y1="-40"
            x2="600"
            y2="1120"
            stroke="#7c3aed"
            strokeWidth="1.2"
            opacity="0.55"
            filter="url(#argon-glow-soft)"
          />

          {/* ── Violet Band (~415 nm - 430 nm) ── */}
          {/* 415.9 nm faint violet line */}
          <line
            x1="210"
            y1="-40"
            x2="730"
            y2="1120"
            stroke="#8b5cf6"
            strokeWidth="1.0"
            opacity="0.6"
            filter="url(#argon-glow-soft)"
          />
          {/* 419.8 nm prominent argon violet line with rich glow */}
          <line
            x1="240"
            y1="-40"
            x2="760"
            y2="1120"
            stroke="#a78bfa"
            strokeWidth="2.4"
            opacity="0.82"
            filter="url(#argon-glow-violet)"
          />
          {/* 420.1 nm close doublet line */}
          <line
            x1="248"
            y1="-40"
            x2="768"
            y2="1120"
            stroke="#c4b5fd"
            strokeWidth="1.2"
            opacity="0.68"
          />
          {/* 425.9 nm deep violet line */}
          <line
            x1="300"
            y1="-40"
            x2="820"
            y2="1120"
            stroke="#818cf8"
            strokeWidth="1.6"
            opacity="0.58"
            filter="url(#argon-glow-violet)"
          />
          {/* 430.0 nm indigo line */}
          <line
            x1="360"
            y1="-40"
            x2="880"
            y2="1120"
            stroke="#6366f1"
            strokeWidth="1.0"
            opacity="0.5"
          />

          {/* ── Blue Band (~450 nm - 475 nm) ── */}
          {/* 451.1 nm prominent blue line */}
          <line
            x1="480"
            y1="-40"
            x2="1000"
            y2="1120"
            stroke="#3b82f6"
            strokeWidth="2.0"
            opacity="0.7"
            filter="url(#argon-glow-blue)"
          />
          {/* 465.8 nm medium blue line */}
          <line
            x1="550"
            y1="-40"
            x2="1070"
            y2="1120"
            stroke="#2563eb"
            strokeWidth="1.1"
            opacity="0.48"
          />
          {/* 470.2 nm bright sky blue line */}
          <line
            x1="610"
            y1="-40"
            x2="1130"
            y2="1120"
            stroke="#38bdf8"
            strokeWidth="2.2"
            opacity="0.78"
            filter="url(#argon-glow-blue)"
          />
          {/* 476.5 nm fine azure line */}
          <line
            x1="670"
            y1="-40"
            x2="1190"
            y2="1120"
            stroke="#0284c7"
            strokeWidth="0.9"
            opacity="0.45"
          />

          {/* ── Intense Cyan Laser Peak Band (~488 nm - 514 nm) ── */}
          {/* 480.6 nm cyan-blue line */}
          <line
            x1="760"
            y1="-40"
            x2="1280"
            y2="1120"
            stroke="#0ea5e9"
            strokeWidth="1.4"
            opacity="0.6"
            filter="url(#argon-glow-soft)"
          />
          {/* 488.0 nm primary argon laser line (intense cyan emission) */}
          <line
            x1="820"
            y1="-40"
            x2="1340"
            y2="1120"
            stroke="#22d3ee"
            strokeWidth="3.2"
            opacity="0.92"
            filter="url(#argon-glow-cyan)"
          />
          {/* 496.5 nm fine cyan satellite line */}
          <line
            x1="865"
            y1="-40"
            x2="1385"
            y2="1120"
            stroke="#06b6d4"
            strokeWidth="1.1"
            opacity="0.6"
          />
          {/* 501.7 nm teal line */}
          <line
            x1="920"
            y1="-40"
            x2="1440"
            y2="1120"
            stroke="#14b8a6"
            strokeWidth="1.3"
            opacity="0.55"
          />
          {/* 514.5 nm secondary argon laser line (teal-cyan) */}
          <line
            x1="980"
            y1="-40"
            x2="1500"
            y2="1120"
            stroke="#2dd4bf"
            strokeWidth="2.5"
            opacity="0.8"
            filter="url(#argon-glow-cyan)"
          />
          {/* 528.7 nm green-tinted line */}
          <line
            x1="1060"
            y1="-40"
            x2="1580"
            y2="1120"
            stroke="#10b981"
            strokeWidth="0.9"
            opacity="0.4"
          />

          {/* ── Moderate Gap with Faint Optical Reference Ticks ── */}
          <line
            x1="1200"
            y1="-40"
            x2="1720"
            y2="1120"
            stroke="#eab308"
            strokeWidth="0.8"
            opacity="0.25"
          />
          <line
            x1="1310"
            y1="-40"
            x2="1830"
            y2="1120"
            stroke="#f59e0b"
            strokeWidth="0.9"
            opacity="0.32"
          />

          {/* ── Restrained Red-Orange Band (~696 nm - 763 nm) ── */}
          {/* 696.5 nm muted red-orange line */}
          <line
            x1="1420"
            y1="-40"
            x2="1940"
            y2="1120"
            stroke="#ea580c"
            strokeWidth="1.2"
            opacity="0.5"
            filter="url(#argon-glow-soft)"
          />
          {/* 706.7 nm visible argon red-orange line */}
          <line
            x1="1480"
            y1="-40"
            x2="2000"
            y2="1120"
            stroke="#f97316"
            strokeWidth="2.2"
            opacity="0.72"
            filter="url(#argon-glow-soft)"
          />
          {/* 727.3 nm warm red line */}
          <line
            x1="1550"
            y1="-40"
            x2="2070"
            y2="1120"
            stroke="#f43f5e"
            strokeWidth="1.0"
            opacity="0.45"
          />
          {/* 738.4 nm deep red line */}
          <line
            x1="1610"
            y1="-40"
            x2="2130"
            y2="1120"
            stroke="#ef4444"
            strokeWidth="1.3"
            opacity="0.5"
          />
          {/* 750.4 nm intense near-IR / red boundary line */}
          <line
            x1="1680"
            y1="-40"
            x2="2200"
            y2="1120"
            stroke="#dc2626"
            strokeWidth="2.0"
            opacity="0.68"
            filter="url(#argon-glow-soft)"
          />
          {/* 763.5 nm boundary line */}
          <line
            x1="1760"
            y1="-40"
            x2="2280"
            y2="1120"
            stroke="#b91c1c"
            strokeWidth="1.0"
            opacity="0.4"
          />
        </g>
      </svg>

      {/* Subtle edge vignette framing for negative space */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: 'inset 0 0 120px 40px rgba(2, 5, 14, 0.65)',
        }}
      />
    </div>
  );
};

export default ArgonSpectrumBackground;
