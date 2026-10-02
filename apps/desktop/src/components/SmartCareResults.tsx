import React from "react";
import { ArrowLeftRegular } from "@fluentui/react-icons";
import { SmartCareAnalysis } from "../types/models";
import { DriveHealthPanel } from "./DriveHealthPanel";
import { CleanupCard } from "./CleanupCard";
import { SpaceRecoveryBar } from "./SpaceRecoveryBar";
import "./smartCareResults.css";

export interface SmartCareResultsProps {
  analysis?: SmartCareAnalysis | null;
  onReview: () => void;
  onExecute: () => void;
  onRestart: () => void;
  onRefreshDrive: () => void;
}

export const SmartCareResults: React.FC<SmartCareResultsProps> = ({
  analysis,
  onReview,
  onExecute,
  onRestart,
  onRefreshDrive,
}) => {
  if (!analysis) {
    return (
      <div className="smartcare-results-container" data-testid="smartcare-results">
        <div className="smartcare-results-top-actions">
          <button
            className="smartcare-restart-btn"
            data-testid="restart-btn"
            onClick={onRestart}
          >
            <ArrowLeftRegular /> Volver a empezar
          </button>
        </div>
        <p style={{ color: "#94A3B8", textAlign: "center", padding: "40px" }}>
          No hay datos de análisis disponibles.
        </p>
      </div>
    );
  }

  const driveHealth = analysis.drive_health || {
    drive_letter: "C:",
    drive_label: "Disco local (C:)",
    drive_path: "C:",
    total_bytes: 1024 * 1024 * 1024 * 1024,
    free_bytes: 512 * 1024 * 1024 * 1024,
    used_bytes: 512 * 1024 * 1024 * 1024,
    usage_percent: 50,
    disk_type: "SSD",
    filesystem: "NTFS",
    smart_status: "Healthy",
  };

  const totalBytes = driveHealth.total_bytes ?? 0;
  const freeBytes = driveHealth.free_bytes ?? 0;
  const usedBytes = driveHealth.used_bytes ?? Math.max(0, totalBytes - freeBytes);
  const recoverableBytes = analysis.total_recoverable_bytes ?? 0;

  return (
    <div className="smartcare-results-container" data-testid="smartcare-results">
      <div className="smartcare-results-top-actions">
        <button
          className="smartcare-restart-btn"
          data-testid="restart-btn"
          onClick={onRestart}
        >
          <ArrowLeftRegular /> Volver a empezar
        </button>
      </div>

      {/* 1. Drive Health Panel arriba */}
      <DriveHealthPanel
        data={driveHealth}
        onRefresh={onRefreshDrive}
      />

      {/* 2. Tarjeta Limpieza con total recuperable */}
      <CleanupCard
        totalBytes={recoverableBytes}
        onReview={onReview}
      />

      {/* 3. Botón circular Ejecutar estilo CleanMyMac */}
      <div className="smartcare-execute-wrapper">
        <button
          className="smartcare-execute-btn"
          data-testid="execute-btn"
          onClick={onExecute}
        >
          Ejecutar
        </button>
      </div>

      {/* 4. Barra de recuperación de espacio */}
      <SpaceRecoveryBar
        totalBytes={totalBytes}
        usedBytes={usedBytes}
        recoverableBytes={recoverableBytes}
      />
    </div>
  );
};
