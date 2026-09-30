import React from "react";
import { SpaceLensScanProgress } from "../types/models";

export interface SpaceLensScanningProps {
  progress: SpaceLensScanProgress | null;
  onCancel: () => void;
  /** Cuando es true, la barra shimmer transiciona a fill completo (T027) */
  scanComplete?: boolean;
}

export const SpaceLensScanning: React.FC<SpaceLensScanningProps> = ({
  progress,
  onCancel,
  scanComplete = false,
}) => {
  // T028: Truncado inteligente de ruta (>60 chars → primeros 15 + ... + últimos 40)
  const truncatePath = (path: string): string => {
    if (!path || path.length <= 60) return path;
    return path.slice(0, 15) + "..." + path.slice(-40);
  };

  // T028: Formatear GB analizados desde total_size
  const gbAnalyzed = progress?.total_size
    ? (progress.total_size / (1024 * 1024 * 1024)).toFixed(1)
    : null;

  return (
    <div className="spacelens-scanning-container" data-testid="spacelens-scanning-screen">
      {/* Icono de Lupa 3D con animación de pulso y rotación suave */}
      <div className="spacelens-scanning-animation-wrapper">
        {/* T029: Halos concéntricos de radar */}
        <div className="spacelens-scan-halo spacelens-scan-halo-1" />
        <div className="spacelens-scan-halo spacelens-scan-halo-2" />
        <div className="spacelens-scanning-pulse-halo" />
        <div className="spacelens-lupa-glass-badge analyzing">
          <svg
            className="spacelens-lupa-svg spinning"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="scanRimGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00E5FF" />
                <stop offset="0.5" stopColor="#C084FC" />
                <stop offset="1" stopColor="#38BDF8" />
              </linearGradient>
            </defs>
            <circle cx="54" cy="54" r="34" stroke="url(#scanRimGrad)" strokeWidth="12" fill="rgba(124, 58, 237, 0.25)" />
            <path
              d="M34 38 A 24 24 0 0 1 68 28"
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeLinecap="round"
              strokeOpacity="0.8"
            />
            <rect
              x="78"
              y="74"
              width="15"
              height="34"
              rx="7.5"
              transform="rotate(-45 78 74)"
              fill="url(#scanRimGrad)"
            />
          </svg>
        </div>
      </div>

      <h2 className="spacelens-scanning-title">Visualizando tu espacio...</h2>

      {/* T027: Barra de progreso horizontal animada */}
      <div className="spacelens-progress-bar-track" data-testid="scanning-progress-bar">
        {scanComplete ? (
          <div className="spacelens-progress-bar-complete" />
        ) : (
          <div className="spacelens-progress-bar-shimmer" />
        )}
      </div>

      {/* T028: Métricas de análisis */}
      {progress && (
        <div className="spacelens-scanning-metrics" data-testid="scanning-metrics">
          {gbAnalyzed && (
            <span>{gbAnalyzed} GB analizados</span>
          )}
          <span>{progress.scanned_dirs.toLocaleString()} carpetas examinadas</span>
        </div>
      )}

      {/* T028: Ruta actual con truncado inteligente */}
      <p className="spacelens-scanning-path" title={progress?.current_path || ""}>
        {truncatePath(progress?.current_path || "Indexando estructura de archivos y carpetas...")}
      </p>

      {/* Botón Circular CleanMyMac "Detener" */}
      <button
        type="button"
        data-testid="scanning-cancel-btn"
        className="spacelens-scanning-cancel-btn"
        onClick={onCancel}
      >
        <span>Detener</span>
      </button>
    </div>
  );
};
