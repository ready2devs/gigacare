import React from "react";
import { ArrowLeftRegular } from "@fluentui/react-icons";
import { SmartCareAnalysis } from "../types/models";
import { DriveHealthPanel } from "./DriveHealthPanel";
import { CleanupCard } from "./CleanupCard";
import { SpaceRecoveryBar } from "./SpaceRecoveryBar";
import "./smartCareResults.css";

export interface SmartCareResultsProps {
  analysis: SmartCareAnalysis;
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
        data={analysis.drive_health}
        onRefresh={onRefreshDrive}
      />

      {/* 2. Tarjeta Limpieza con total recuperable */}
      <CleanupCard
        totalBytes={analysis.total_recoverable_bytes}
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
        totalBytes={analysis.drive_health.total_bytes}
        usedBytes={analysis.drive_health.used_bytes}
        recoverableBytes={analysis.total_recoverable_bytes}
      />
    </div>
  );
};
