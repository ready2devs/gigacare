import React, { useState } from "react";
import { StorageDevice } from "../types/models";
import { SpaceLensDriveSelector } from "./SpaceLensDriveSelector";

export interface SpaceLensWelcomeProps {
  devices: StorageDevice[];
  selectedDevice: StorageDevice | null;
  onSelectDevice: (device: StorageDevice) => void;
  onStartScan: () => void;
  /** Callback cuando el usuario elige una carpeta personalizada (T018) */
  onPickFolder?: (device: StorageDevice) => void;
  onRefreshDevices?: () => void;
  isRefreshingDevices?: boolean;
}

export const SpaceLensWelcome: React.FC<SpaceLensWelcomeProps> = ({
  devices,
  selectedDevice,
  onSelectDevice,
  onStartScan,
  onPickFolder,
  onRefreshDevices,
  isRefreshingDevices = false,
}) => {
  const [mtpWarning, setMtpWarning] = useState<string | null>(null);

  const handlePickFolder = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        title: "Elegir carpeta a analizar",
      });
      if (selected && onPickFolder) {
        const folderPath = typeof selected === "string" ? selected : (selected as string[])[0];
        if (folderPath) {
          const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
          const customDevice: StorageDevice = {
            id: "custom_folder",
            label: folderName,
            device_type: "local_disk",
            root_path: folderPath,
            total_bytes: 0,
            used_bytes: 0,
            free_bytes: 0,
            is_removable: false,
            icon_hint: "folder",
            is_ready: true,
          };
          onPickFolder(customDevice);
        }
      }
    } catch (err) {
      console.log("[SpaceLens] Elegir carpeta (mock en web):", err);
      if (onPickFolder) {
        const customDevice: StorageDevice = {
          id: "custom_folder",
          label: "Carpeta seleccionada",
          device_type: "local_disk",
          root_path: "C:\\Users",
          total_bytes: 0,
          used_bytes: 0,
          free_bytes: 0,
          is_removable: false,
          icon_hint: "folder",
          is_ready: true,
        };
        onPickFolder(customDevice);
      }
    }
  };

  const handleScanClick = () => {
    if (selectedDevice && selectedDevice.device_type === "mtp_device" && !selectedDevice.is_ready) {
      setMtpWarning(
        "Para escanear este dispositivo, conéctalo en modo Transferencia de Archivos (Almacenamiento Masivo) o selecciona una carpeta sincronizada"
      );
      return;
    }
    setMtpWarning(null);
    onStartScan();
  };

  return (
    <div className="spacelens-welcome-container" data-testid="spacelens-welcome-screen">
      {/* Icono de Lupa 3D estilo CleanMyMac */}
      <div className="spacelens-lupa-3d-wrapper">
        <div className="spacelens-lupa-glow-ring" />
        <div className="spacelens-lupa-glass-badge">
          <svg
            className="spacelens-lupa-svg"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              {/* T024: Gradiente de 4 stops: cyan → púrpura → azul → blanco */}
              <linearGradient id="lupaRimGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
                <stop stopColor="#00E5FF" stopOpacity="0.95" />
                <stop offset="0.33" stopColor="#A855F7" stopOpacity="0.9" />
                <stop offset="0.66" stopColor="#3B82F6" stopOpacity="0.85" />
                <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.7" />
              </linearGradient>
              <linearGradient id="lupaLensGrad" x1="20" y1="20" x2="80" y2="80" gradientUnits="userSpaceOnUse">
                <stop stopColor="#38BDF8" stopOpacity="0.4" />
                <stop offset="0.5" stopColor="#7C3AED" stopOpacity="0.25" />
                <stop offset="1" stopColor="#0B0F19" stopOpacity="0.35" />
              </linearGradient>
              <filter id="lupaShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#7C3AED" floodOpacity="0.5" />
              </filter>
            </defs>
            {/* Sombra exterior más pronunciada */}
            <circle cx="54" cy="54" r="34" fill="rgba(124,58,237,0.15)" filter="url(#lupaShadow)" />
            {/* Lente principal */}
            <circle cx="54" cy="54" r="34" stroke="url(#lupaRimGrad)" strokeWidth="12" fill="url(#lupaLensGrad)" />
            {/* Brillo especular principal */}
            <path
              d="M34 38 A 24 24 0 0 1 68 28"
              stroke="#FFFFFF"
              strokeWidth="4"
              strokeLinecap="round"
              strokeOpacity="0.7"
            />
            {/* T024: Segundo reflejo especular más pequeño */}
            <path
              d="M44 32 A 10 10 0 0 1 58 28"
              stroke="#FFFFFF"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeOpacity="0.4"
            />
            {/* Mango ergonómico CleanMyMac */}
            <rect
              x="78"
              y="74"
              width="15"
              height="34"
              rx="7.5"
              transform="rotate(-45 78 74)"
              fill="url(#lupaRimGrad)"
            />
          </svg>
        </div>
      </div>

      <h1 className="spacelens-welcome-title">Visualizando tu espacio</h1>
      <p className="spacelens-welcome-subtitle">
        Selecciona una unidad o carpeta para comenzar el análisis
      </p>

      {/* T020: Selector central estilizado reutilizando SpaceLensDriveSelector */}
      <div className="spacelens-welcome-device-picker">
        <span className="spacelens-welcome-picker-label">
          Unidad a analizar:
        </span>
        <div className="spacelens-welcome-select-wrapper" data-testid="welcome-drive-select">
          <SpaceLensDriveSelector
            currentDevice={selectedDevice}
            devices={devices}
            onDeviceChange={(dev) => {
              setMtpWarning(null);
              onSelectDevice(dev);
            }}
            onRefresh={onRefreshDevices}
            isRefreshing={isRefreshingDevices}
            onPickFolder={onPickFolder ? handlePickFolder : undefined}
          />
        </div>

        {/* T018: Botón "Elegir carpeta..." */}
        <button
          type="button"
          data-testid="welcome-pick-folder-btn"
          className="spacelens-welcome-folder-btn"
          onClick={handlePickFolder}
          title="Seleccionar una carpeta específica para analizar"
        >
          📁 Elegir carpeta...
        </button>
      </div>

      {/* T020: Aviso elegante para dispositivos MTP sin letra de unidad */}
      {mtpWarning && (
        <div
          data-testid="welcome-mtp-warning"
          style={{
            background: "rgba(245, 158, 11, 0.12)",
            border: "1px solid #F59E0B",
            color: "#FCD34D",
            borderRadius: "8px",
            padding: "10px 16px",
            maxWidth: "420px",
            textAlign: "center",
            fontSize: "13px",
            marginBottom: "12px",
          }}
        >
          📱 {mtpWarning}
        </div>
      )}

      {/* Botón Circular Pulsante CleanMyMac "Analizar" */}
      <button
        type="button"
        data-testid="welcome-start-scan-btn"
        className="spacelens-welcome-scan-btn"
        onClick={handleScanClick}
      >
        <span className="spacelens-scan-btn-pulse-wave" />
        <span className="spacelens-scan-btn-text">Analizar</span>
      </button>
    </div>
  );
};
