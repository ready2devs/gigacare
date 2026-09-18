import React, { useState, useEffect } from "react";
import { Button, Text, Spinner } from "@fluentui/react-components";
import { BroomRegular, DismissRegular } from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { ScanProgress, ScanResult } from "../types/models";
import "./smartCare.css";

export interface SmartCareButtonProps {
  onScanComplete?: (result: ScanResult) => void;
  onScanStart?: () => void;
}

export const SmartCareButton: React.FC<SmartCareButtonProps> = ({
  onScanComplete,
  onScanStart,
}) => {
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [moduleStats, setModuleStats] = useState<Record<string, number>>({});

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    const setupListener = async () => {
      try {
        unlisten = await listen<ScanProgress>("scan-progress", (event) => {
          const payload = event.payload;
          setProgress(payload);
          setModuleStats((prev) => ({
            ...prev,
            [payload.module]: payload.bytes_found,
          }));
        });
      } catch {
        // En entorno web sin Tauri backend activo
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const handleStartScan = async () => {
    setIsScanning(true);
    setProgress({
      module: "system_temp",
      items_scanned: 0,
      items_found: 0,
      bytes_found: 0,
      percent: 0,
    });
    setModuleStats({});
    onScanStart?.();

    try {
      const result = await invoke<ScanResult>("scan_smart_care", {});
      setIsScanning(false);
      onScanComplete?.(result);
    } catch (err) {
      console.error("Error al ejecutar scan_smart_care:", err);
      setIsScanning(false);
    }
  };

  const handleCancelScan = async () => {
    try {
      await invoke("cancel_scan");
    } catch (err) {
      console.error("Error al cancelar escaneo:", err);
    }
    setIsScanning(false);
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatModuleName = (mod: string): string => {
    switch (mod) {
      case "system_temp":
        return "Archivos Temporales";
      case "messaging_cache":
        return "Caché de Mensajería";
      case "dev_dependencies":
        return "Dependencias Dev";
      case "installers":
        return "Instaladores Residuales";
      case "photo_duplicates":
        return "Duplicados de Fotos";
      case "uninstall_residuals":
        return "Residuales de Apps";
      case "startup_items":
        return "Elementos de Inicio";
      default:
        return mod;
    }
  };

  return (
    <div className="smartcare-container">
      {/* Botón Central Asimétrico */}
      <button
        className={`smartcare-button ${isScanning ? "scanning" : ""}`}
        onClick={isScanning ? undefined : handleStartScan}
        disabled={isScanning}
      >
        {isScanning ? (
          <>
            <Spinner size="large" appearance="inverted" />
            <span className="smartcare-btn-title">Escaneando...</span>
            <span className="smartcare-btn-subtitle">
              {progress ? `${Math.round(progress.percent)}%` : "Iniciando"}
            </span>
          </>
        ) : (
          <>
            <BroomRegular style={{ fontSize: "40px" }} />
            <span className="smartcare-btn-title">Smart Care</span>
            <span className="smartcare-btn-subtitle">Escanear Sistema</span>
          </>
        )}
      </button>

      {/* Desglose de progreso durante el escaneo */}
      {isScanning && progress && (
        <div className="smartcare-progress-card">
          <div className="smartcare-progress-header">
            <Text weight="semibold">
              Módulo: {formatModuleName(progress.module)}
            </Text>
            <Text style={{ color: "#00E5FF", fontWeight: 600 }}>
              {Math.round(progress.percent)}%
            </Text>
          </div>

          <div className="smartcare-progress-bar-bg">
            <div
              className="smartcare-progress-bar-fill"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Text size={200}>
              Elementos analizados: {progress.items_scanned}
            </Text>
            <Text size={200} style={{ color: "#A78BFA" }}>
              Recuperable: {formatBytes(progress.bytes_found)}
            </Text>
          </div>

          {/* Desglose por módulos */}
          {Object.keys(moduleStats).length > 0 && (
            <div className="smartcare-module-breakdown">
              {Object.entries(moduleStats).map(([mod, bytes]) => (
                <div key={mod} className="smartcare-module-item">
                  <span>{formatModuleName(mod)}</span>
                  <span style={{ color: "#00E5FF", fontWeight: 500 }}>
                    {formatBytes(bytes)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <Button
            appearance="subtle"
            icon={<DismissRegular />}
            className="smartcare-cancel-btn"
            onClick={handleCancelScan}
          >
            Cancelar Escaneo
          </Button>
        </div>
      )}
    </div>
  );
};
