import React, { useState, useRef, useEffect } from "react";
import { StorageDevice } from "../types/models";

export interface SpaceLensDriveSelectorProps {
  currentDevice: StorageDevice | null;
  devices: StorageDevice[];
  onDeviceChange: (device: StorageDevice) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  /** Callback para abrir diálogo de selección de carpeta (T019, PA-005) */
  onPickFolder?: () => void;
}

export const formatBytesShort = (bytes: number): string => {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const getDeviceIcon = (device: StorageDevice): string => {
  if (device.device_type === "mtp_device") return "📱";
  if (device.device_type === "usb_drive" || device.is_removable) return "🔌";
  if (device.device_type === "network_drive") return "🌐";
  return "💾";
};

export const SpaceLensDriveSelector: React.FC<SpaceLensDriveSelectorProps> = ({
  currentDevice,
  devices,
  onDeviceChange,
  onRefresh,
  isRefreshing = false,
  onPickFolder,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const internalDrives = devices.filter((d) => d.device_type === "local_disk");
  const externalDrives = devices.filter(
    (d) => d.device_type === "usb_drive" || (d.is_removable && d.device_type !== "mtp_device")
  );
  const mtpDevices = devices.filter((d) => d.device_type === "mtp_device");
  const otherDevices = devices.filter(
    (d) =>
      d.device_type !== "local_disk" &&
      d.device_type !== "usb_drive" &&
      d.device_type !== "mtp_device" &&
      !d.is_removable
  );

  const renderDeviceOption = (device: StorageDevice) => {
    const isSelected = currentDevice?.id === device.id;
    const usagePercent = device.total_bytes > 0
      ? Math.min(100, Math.round((device.used_bytes / device.total_bytes) * 100))
      : 0;
    const isWarning = usagePercent >= 90;

    return (
      <div
        key={device.id}
        role="button"
        tabIndex={0}
        data-testid={`drive-option-${device.id}`}
        className={`spacelens-drive-option ${isSelected ? "selected" : ""}`}
        onClick={() => {
          onDeviceChange(device);
          setIsOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            onDeviceChange(device);
            setIsOpen(false);
          }
        }}
      >
        <span className="spacelens-drive-icon">{getDeviceIcon(device)}</span>
        <div className="spacelens-drive-details">
          <div className="spacelens-drive-name-row">
            <span className="spacelens-drive-label">{device.label}</span>
            <span className="spacelens-drive-usage-text">
              {formatBytesShort(device.used_bytes)} / {formatBytesShort(device.total_bytes)}
            </span>
          </div>
          <div className="spacelens-drive-mini-bar-track">
            <div
              className={`spacelens-drive-mini-bar-fill ${isWarning ? "warning" : ""}`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
        {isSelected && <span className="spacelens-drive-check">✓</span>}
      </div>
    );
  };

  const activePercent =
    currentDevice && currentDevice.total_bytes > 0
      ? Math.min(100, Math.round((currentDevice.used_bytes / currentDevice.total_bytes) * 100))
      : 0;

  return (
    <div className="spacelens-drive-selector-container" ref={dropdownRef}>
      <button
        type="button"
        data-testid="spacelens-drive-selector-button"
        className={`spacelens-drive-trigger ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="spacelens-drive-icon">
          {currentDevice ? getDeviceIcon(currentDevice) : "💾"}
        </span>
        <span className="spacelens-trigger-label">
          {currentDevice ? currentDevice.label : "Seleccionar unidad"}
        </span>
        {currentDevice && (
          <div className="spacelens-trigger-space-pill">
            <div className="spacelens-trigger-mini-bar">
              <div
                className="spacelens-trigger-mini-fill"
                style={{ width: `${activePercent}%` }}
              />
            </div>
            <span className="spacelens-trigger-space-text">
              {formatBytesShort(currentDevice.used_bytes)} / {formatBytesShort(currentDevice.total_bytes)}
            </span>
          </div>
        )}
        <span className={`spacelens-trigger-chevron ${isOpen ? "rotate" : ""}`}>▾</span>
      </button>

      {isOpen && (
        <div className="spacelens-drive-dropdown-menu" role="listbox">
          {internalDrives.length > 0 && (
            <div className="spacelens-drive-group">
              <div className="spacelens-drive-group-header">DISCOS INTERNOS</div>
              {internalDrives.map(renderDeviceOption)}
            </div>
          )}

          {externalDrives.length > 0 && (
            <div className="spacelens-drive-group">
              <div className="spacelens-drive-group-header">DISPOSITIVOS EXTERNOS</div>
              {externalDrives.map(renderDeviceOption)}
            </div>
          )}

          {mtpDevices.length > 0 && (
            <div className="spacelens-drive-group">
              <div className="spacelens-drive-group-header">DISPOSITIVOS MTP</div>
              {mtpDevices.map(renderDeviceOption)}
            </div>
          )}

          {otherDevices.length > 0 && (
            <div className="spacelens-drive-group">
              <div className="spacelens-drive-group-header">OTRAS UNIDADES</div>
              {otherDevices.map(renderDeviceOption)}
            </div>
          )}

          <div className="spacelens-drive-dropdown-footer">
            <button
              type="button"
              data-testid="refresh-devices-btn"
              className="spacelens-drive-refresh-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (onRefresh) onRefresh();
              }}
              disabled={isRefreshing}
            >
              <span className={`refresh-icon ${isRefreshing ? "spin" : ""}`}>🔄</span>
              <span>{isRefreshing ? "Actualizando..." : "Actualizar dispositivos"}</span>
            </button>
            {onPickFolder && (
              <button
                type="button"
                data-testid="pick-folder-btn"
                className="spacelens-drive-refresh-btn"
                style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: "4px" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                  onPickFolder();
                }}
              >
                <span>📁</span>
                <span>Elegir carpeta...</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
