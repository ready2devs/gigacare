import React, { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SmartCareAnalysis } from "../types/models";
import "./smartCareScanning.css";

export interface SmartCareScanningProps {
  onComplete: (analysis: SmartCareAnalysis) => void;
  onCancel: () => void;
}

interface ProgressPayload {
  phase: string;
  percent: number;
}

const DEFAULT_FILES = [
  "C:\\Windows\\System32\\config\\SYSTEM",
  "C:\\Users\\AppData\\Local\\Temp\\~tmp8291.tmp",
  "C:\\Windows\\SoftwareDistribution\\Download\\7a8b9c",
  "C:\\Users\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache",
  "C:\\Windows\\Prefetch\\EXPLORER.EXE-6D4E2F1A.pf",
  "C:\\$Recycle.Bin\\S-1-5-21-2137458694\\$R4HX5XA.bat",
  "C:\\Users\\AppData\\Local\\pip\\cache\\wheels",
  "C:\\Users\\AppData\\Local\\Microsoft\\Edge\\User Data\\GrShaderCache",
  "C:\\Windows\\Temp\\dism.log",
  "C:\\Users\\AppData\\Roaming\\Telegram Desktop\\tdata\\user_data",
  "C:\\Windows\\Logs\\CBS\\CBS.log",
  "C:\\Users\\AppData\\Local\\CrashDumps\\app.exe.dmp",
];

export const SmartCareScanning: React.FC<SmartCareScanningProps> = ({
  onComplete,
  onCancel,
}) => {
  const [phase, setPhase] = useState<string>("Recopilando información del sistema...");
  const [percent, setPercent] = useState<number>(5);
  const [fileList] = useState<string[]>(DEFAULT_FILES);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    let unlistenFn: (() => void) | null = null;

    // Listen to analysis progress
    listen<ProgressPayload>("smartcare-analysis-progress", (event) => {
      if (!isMountedRef.current) return;
      if (event.payload) {
        setPhase(event.payload.phase || "");
        setPercent(Math.min(100, Math.max(0, Math.round(event.payload.percent || 0))));
      }
    })
      .then((unlisten) => {
        unlistenFn = unlisten;
      })
      .catch((err) => {
        console.warn("Error al registrar listener de progreso:", err);
      });

    // Run full analysis
    invoke<SmartCareAnalysis>("run_full_smartcare_analysis")
      .then((analysis) => {
        if (!isMountedRef.current) return;
        setPercent(100);
        onComplete(analysis);
      })
      .catch((err) => {
        console.error("Error al ejecutar análisis completo:", err);
      });

    return () => {
      isMountedRef.current = false;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [onComplete]);

  const handleStop = () => {
    invoke("cancel_scan").catch((err) => {
      console.warn("Error al cancelar scan:", err);
    });
    onCancel();
  };

  // Duplicate file list to create seamless infinite vertical loop
  const duplicatedFiles = [...fileList, ...fileList];

  return (
    <div className="smartcare-scanning-container" data-testid="smartcare-scanning">
      <h2 className="smartcare-scanning-title">Recopilando información del sistema...</h2>

      <div className="smartcare-scanning-drive" data-testid="spinning-drive">
        <svg
          width="130"
          height="130"
          viewBox="0 0 130 130"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Carcasa exterior del disco */}
          <rect
            x="15"
            y="15"
            width="100"
            height="100"
            rx="16"
            fill="#0F172A"
            stroke="rgba(0, 229, 255, 0.4)"
            strokeWidth="2"
          />
          {/* Plato giratorio */}
          <g className="smartcare-spinning-disk" transform="translate(65, 65)">
            <circle cx="0" cy="0" r="38" fill="url(#platterGradient)" stroke="#38BDF8" strokeWidth="1.5" />
            <circle cx="0" cy="0" r="14" fill="#0F172A" stroke="#64748B" strokeWidth="1.5" />
            {/* Ranuras del plato para notar rotación */}
            <line x1="-38" y1="0" x2="38" y2="0" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1" />
            <line x1="0" y1="-38" x2="0" y2="38" stroke="rgba(255, 255, 255, 0.25)" strokeWidth="1" />
            <circle cx="0" cy="0" r="4" fill="#00E5FF" />
          </g>
          {/* Cabezal de lectura */}
          <path
            d="M25 25L52 52"
            stroke="#94A3B8"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="25" cy="25" r="4" fill="#CBD5E1" />
          <circle cx="52" cy="52" r="3" fill="#00E5FF" />

          <defs>
            <radialGradient id="platterGradient" cx="0" cy="0" r="38" gradientUnits="userSpaceOnUse">
              <stop stopColor="#1E293B" />
              <stop offset="0.7" stopColor="#0F172A" />
              <stop offset="1" stopColor="#0284C7" />
            </radialGradient>
          </defs>
        </svg>
      </div>

      <div className="smartcare-file-ticker" data-testid="file-ticker">
        <div className="smartcare-file-ticker-content">
          {duplicatedFiles.map((file, idx) => (
            <div key={`${file}-${idx}`} className="smartcare-file-ticker-item">
              {file}
            </div>
          ))}
        </div>
      </div>

      <div className="smartcare-progress-section">
        <div className="smartcare-progress-bar-bg">
          <div
            className="smartcare-progress-bar-fill"
            style={{ width: `${percent}%` }}
            data-testid="progress-fill"
          />
        </div>
        <div className="smartcare-progress-labels">
          <span className="smartcare-phase-text">{phase}</span>
          <span data-testid="percent-text">{percent}%</span>
        </div>
      </div>

      <button
        className="smartcare-stop-btn"
        data-testid="stop-btn"
        onClick={handleStop}
      >
        Detener
      </button>
    </div>
  );
};
