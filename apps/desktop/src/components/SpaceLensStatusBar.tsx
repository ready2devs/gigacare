import React from "react";
import { StorageDevice } from "../types/models";
import { formatBytesShort, getDeviceIcon } from "./SpaceLensDriveSelector";

export interface SpaceLensStatusBarProps {
  currentDevice: StorageDevice | null;
  selectedCount: number;
  selectedBytes: number;
  onReviewAndClean: () => void;
  isCleaning?: boolean;
}

export const SpaceLensStatusBar: React.FC<SpaceLensStatusBarProps> = ({
  currentDevice,
  selectedCount,
  selectedBytes,
  onReviewAndClean,
  isCleaning = false,
}) => {
  const isMtp = currentDevice?.device_type === "mtp_device";

  const totalBytes = currentDevice?.total_bytes || 0;
  const usedBytes = currentDevice?.used_bytes || 0;
  const currentFreeBytes = currentDevice?.free_bytes || Math.max(0, totalBytes - usedBytes);
  const potentialFreeBytes = currentFreeBytes + selectedBytes;
  const potentialUsedBytes = Math.max(0, usedBytes - selectedBytes);

  const usagePercent = totalBytes > 0 ? Math.min(100, (usedBytes / totalBytes) * 100) : 0;
  const potentialUsagePercent = totalBytes > 0 ? Math.min(100, (potentialUsedBytes / totalBytes) * 100) : 0;
  const isHighUsage = usagePercent >= 90;

  return (
    <footer className="spacelens-status-bar" data-testid="spacelens-status-bar">
      {/* Zona Izquierda: Icono + Nombre + Espacio disponible real vs total + Espacio proyectado */}
      <div className="spacelens-status-left">
        <span className="spacelens-status-icon">
          {currentDevice ? getDeviceIcon(currentDevice) : "💾"}
        </span>
        <div className="spacelens-status-disk-info">
          <span className="spacelens-status-device-name">
            {currentDevice?.label || "Disco local (C:)"}
          </span>
          <div className="spacelens-status-metrics-row">
            <span className="spacelens-status-usage-text">
              <strong>{formatBytesShort(currentFreeBytes)}</strong> disponibles de {formatBytesShort(totalBytes)}
            </span>
            {selectedBytes > 0 && (
              <span className="spacelens-status-projection-badge" title="Espacio libre tras confirmar la acción">
                ✨ Quedarán libres: {formatBytesShort(potentialFreeBytes)} (+{formatBytesShort(selectedBytes)})
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Zona Central: Barra de progreso horizontal dual (actual + proyectado) */}
      <div className="spacelens-status-center">
        <div className="spacelens-disk-progress-track" title={`${Math.round(usagePercent)}% usado`}>
          <div
            className={`spacelens-disk-progress-fill ${isHighUsage ? "warning" : ""}`}
            style={{ width: `${usagePercent}%` }}
          />
          {selectedBytes > 0 && (
            <div
              className="spacelens-disk-progress-freed-preview"
              style={{
                left: `${potentialUsagePercent}%`,
                width: `${usagePercent - potentialUsagePercent}%`
              }}
              title={`Espacio a liberar: ${formatBytesShort(selectedBytes)}`}
            />
          )}
        </div>
        <span className="spacelens-disk-percent-text">{Math.round(usagePercent)}% usado</span>
      </div>

      {/* Zona Derecha: Elementos seleccionados + Botón CleanMyMac Revisar y Eliminar */}
      <div className="spacelens-status-right">
        <div className="spacelens-selection-summary">
          <span className="spacelens-selection-info-icon" title="Elementos marcados para revisión">ℹ</span>
          <span className="spacelens-selection-count" data-testid="selected-count-text">
            {selectedCount} {selectedCount === 1 ? "elemento seleccionado" : "elementos seleccionados"}
          </span>
          {selectedBytes > 0 && (
            <>
              <span className="spacelens-selection-divider">|</span>
              <span className="spacelens-selection-size" data-testid="selected-bytes-text">
                {formatBytesShort(selectedBytes)}
              </span>
            </>
          )}
        </div>

        {isMtp ? (
          <div className="spacelens-mtp-badge" data-testid="mtp-status-badge">
            <span>📱 Dispositivo MTP — Solo lectura</span>
          </div>
        ) : (
          <button
            type="button"
            data-testid="review-clean-button"
            className="spacelens-clean-btn"
            disabled={selectedCount === 0 || isCleaning}
            onClick={onReviewAndClean}
          >
            {isCleaning ? (
              <span className="cleaning-spinner">⏳ Limpiando...</span>
            ) : (
              <span>Revisar y eliminar</span>
            )}
          </button>
        )}
      </div>
    </footer>
  );
};
