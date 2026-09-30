import React from "react";
import { Button } from "@fluentui/react-components";
import { FolderOpenRegular } from "@fluentui/react-icons";

export interface EmptyStateCuratorProps {
  onScanAnotherFolder?: () => void;
  title?: string;
  subtitle?: string;
}

export const EmptyStateCurator: React.FC<EmptyStateCuratorProps> = ({
  onScanAnotherFolder,
  title = "¡Todas tus fotos están en orden!",
  subtitle = "No se detectaron duplicados ni fotos desenfocadas.",
}) => {
  return (
    <div
      className="empty-state-curator"
      data-testid="empty-state-curator"
      style={{
        margin: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "48px 24px",
        gap: "16px",
      }}
    >
      {/* Ilustración SVG de cámara con checkmark cyan / púrpura */}
      <svg
        width="110"
        height="110"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        data-testid="empty-state-camera-svg"
      >
        <defs>
          <linearGradient id="camGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00E5FF" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          <linearGradient id="checkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10B981" />
            <stop offset="100%" stopColor="#00E5FF" />
          </linearGradient>
        </defs>

        {/* Cuerpo de la cámara */}
        <rect
          x="16"
          y="32"
          width="88"
          height="62"
          rx="14"
          stroke="url(#camGrad)"
          strokeWidth="3"
          fill="rgba(15, 23, 42, 0.7)"
        />
        {/* Visor superior */}
        <path
          d="M40 32 L46 22 H74 L80 32 Z"
          stroke="url(#camGrad)"
          strokeWidth="3"
          strokeLinejoin="round"
          fill="rgba(124, 58, 237, 0.15)"
        />
        {/* Flash */}
        <circle cx="88" cy="44" r="4" fill="#00E5FF" />

        {/* Lente circular exterior */}
        <circle
          cx="60"
          cy="63"
          r="22"
          stroke="url(#camGrad)"
          strokeWidth="2.5"
          fill="rgba(3, 7, 18, 0.6)"
        />
        {/* Anillo de lente interior */}
        <circle
          cx="60"
          cy="63"
          r="15"
          stroke="rgba(0, 229, 255, 0.4)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />

        {/* Badge circular con Checkmark verde/cyan */}
        <circle
          cx="86"
          cy="86"
          r="16"
          fill="#0B0F19"
          stroke="url(#checkGrad)"
          strokeWidth="2.5"
        />
        <path
          d="M78 86 L83 91 L94 80"
          stroke="#10B981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div style={{ maxWidth: "420px" }}>
        <h3
          style={{
            margin: "0 0 8px 0",
            fontSize: "18px",
            fontWeight: 700,
            color: "#F8FAFC",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "#94A3B8",
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </p>
      </div>

      {onScanAnotherFolder && (
        <Button
          appearance="subtle"
          icon={<FolderOpenRegular />}
          onClick={onScanAnotherFolder}
          style={{
            color: "#00E5FF",
            border: "1px solid rgba(0, 229, 255, 0.25)",
            background: "rgba(0, 229, 255, 0.05)",
            borderRadius: "8px",
            padding: "6px 14px",
            fontSize: "12px",
            marginTop: "6px",
          }}
        >
          Escanear otra carpeta
        </Button>
      )}
    </div>
  );
};
