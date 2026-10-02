import React, { useState } from "react";
import "./smartCareWelcome.css";

export interface SmartCareWelcomeProps {
  onAnalyze: () => void;
  lastAnalysisHours?: number | null;
}

export const SmartCareWelcome: React.FC<SmartCareWelcomeProps> = ({
  onAnalyze,
  lastAnalysisHours,
}) => {
  const [fading, setFading] = useState(false);

  const handleClick = () => {
    if (fading) return;
    setFading(true);
    setTimeout(() => {
      onAnalyze();
    }, 400);
  };

  return (
    <div
      className={`smartcare-welcome-container ${fading ? "fade-out" : ""}`}
      data-testid="smartcare-welcome"
    >
      <div className="smartcare-welcome-monitor" data-testid="monitor-svg">
        <svg
          width="160"
          height="140"
          viewBox="0 0 160 140"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Pantalla y marco */}
          <rect
            x="10"
            y="10"
            width="140"
            height="90"
            rx="10"
            fill="#0F172A"
            stroke="url(#screenBorderGradient)"
            strokeWidth="3"
          />
          {/* Brillo interno de la pantalla */}
          <rect
            x="16"
            y="16"
            width="128"
            height="78"
            rx="6"
            fill="url(#displayGradient)"
          />
          {/* Logo / Chispazo central */}
          <circle cx="80" cy="55" r="14" fill="url(#sparkleGradient)" opacity="0.8" />
          <path
            d="M80 47V63M72 55H88"
            stroke="#FFFFFF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Cuello del soporte */}
          <rect x="74" y="100" width="12" height="18" fill="#64748B" rx="2" />
          {/* Base plateada */}
          <path
            d="M50 122H110L116 128H44L50 122Z"
            fill="url(#baseGradient)"
          />

          <defs>
            <linearGradient id="screenBorderGradient" x1="0" y1="0" x2="160" y2="100" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00E5FF" />
              <stop offset="1" stopColor="#7C3AED" />
            </linearGradient>
            <linearGradient id="displayGradient" x1="16" y1="16" x2="144" y2="94" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1E293B" />
              <stop offset="1" stopColor="#090D16" />
            </linearGradient>
            <linearGradient id="sparkleGradient" x1="66" y1="41" x2="94" y2="69" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00E5FF" />
              <stop offset="1" stopColor="#7C3AED" />
            </linearGradient>
            <linearGradient id="baseGradient" x1="44" y1="122" x2="116" y2="128" gradientUnits="userSpaceOnUse">
              <stop stopColor="#94A3B8" />
              <stop offset="0.5" stopColor="#E2E8F0" />
              <stop offset="1" stopColor="#64748B" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <h1 className="smartcare-welcome-title">¡Bienvenido!</h1>
      <p className="smartcare-welcome-subtitle">
        ¿Quieres analizar tu sistema a fondo? Será rápido.
      </p>

      <div className="smartcare-welcome-btn-wrapper">
        <button
          className="smartcare-welcome-analyze-btn"
          data-testid="analyze-btn"
          onClick={handleClick}
        >
          {lastAnalysisHours && lastAnalysisHours > 0 ? "Analizar de nuevo" : "Analizar"}
        </button>

        {lastAnalysisHours && lastAnalysisHours > 0 ? (
          <div className="smartcare-welcome-last-analysis" data-testid="last-analysis-info">
            Último análisis hace {lastAnalysisHours} horas
          </div>
        ) : null}
      </div>
    </div>
  );
};
