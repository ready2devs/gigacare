import React from "react";

export interface SpaceRecoveryBarProps {
  totalBytes?: number;
  usedBytes?: number;
  recoverableBytes?: number;
}

const formatBytes = (bytes: number): string => {
  if (!bytes || isNaN(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const SpaceRecoveryBar: React.FC<SpaceRecoveryBarProps> = ({
  totalBytes = 0,
  usedBytes = 0,
  recoverableBytes = 0,
}) => {
  const safeTotal = typeof totalBytes === "number" && totalBytes > 0 ? totalBytes : 1;
  const safeUsed = typeof usedBytes === "number" && !isNaN(usedBytes) ? Math.max(0, usedBytes) : 0;
  const safeRecoverable = typeof recoverableBytes === "number" && !isNaN(recoverableBytes) ? Math.max(0, recoverableBytes) : 0;

  const clampedRecoverable = Math.min(safeUsed, safeRecoverable);
  const permanentUsedBytes = Math.max(0, safeUsed - clampedRecoverable);
  const freeBytes = Math.max(0, safeTotal - safeUsed);

  const permanentPct = Math.round((permanentUsedBytes / safeTotal) * 1000) / 10;
  const recoverablePct = Math.round((clampedRecoverable / safeTotal) * 1000) / 10;
  const freePct = Math.max(0, Math.round((100 - permanentPct - recoverablePct) * 10) / 10);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        width: "100%",
        boxSizing: "border-box",
      }}
      data-testid="space-recovery-bar"
    >
      {/* Barra estilizada ultra-fina estilo CleanMyMac */}
      <div
        style={{
          width: "100%",
          height: "6px",
          borderRadius: "999px",
          overflow: "hidden",
          display: "flex",
          background: "#080C14",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "inset 0 1px 3px rgba(0, 0, 0, 0.6)",
        }}
        data-testid="bar-track"
      >
        {/* Segmento permanente usado (blanco flúor delicado) */}
        <div
          data-testid="segment-permanent"
          style={{
            width: `${permanentPct}%`,
            background: "#FFFFFF",
            boxShadow: "0 0 8px rgba(255, 255, 255, 0.45)",
            transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          title={`Ocupado: ${formatBytes(permanentUsedBytes)} (${permanentPct}%)`}
        />

        {/* Segmento recuperable (turquesa flúor brillante como el botón Revisar) */}
        <div
          data-testid="segment-recoverable"
          style={{
            width: `${recoverablePct}%`,
            background: "#00E5FF",
            boxShadow: "0 0 12px rgba(0, 229, 255, 0.8)",
            transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          title={`Recuperable: ${formatBytes(clampedRecoverable)} (${recoverablePct}%)`}
        />

        {/* Segmento libre (negro/transparente de fondo) */}
        <div
          data-testid="segment-free"
          style={{
            width: `${freePct}%`,
            background: "transparent",
            transition: "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          title={`Libre: ${formatBytes(freeBytes)} (${freePct}%)`}
        />
      </div>

      {/* Leyenda inferior delicada y elegante */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "28px",
          fontSize: "12px",
          letterSpacing: "-0.1px",
        }}
        data-testid="bar-legend"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "#FFFFFF",
              boxShadow: "0 0 6px rgba(255, 255, 255, 0.5)",
            }}
          />
          <span style={{ color: "#94A3B8" }}>
            Ocupado: <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>{formatBytes(permanentUsedBytes)}</strong> ({permanentPct}%)
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "#00E5FF",
              boxShadow: "0 0 8px rgba(0, 229, 255, 0.85)",
            }}
          />
          <span style={{ color: "#94A3B8" }}>
            Recuperable: <strong style={{ color: "#00E5FF", fontWeight: 600 }}>{formatBytes(clampedRecoverable)}</strong> ({recoverablePct}%)
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "#080C14",
              border: "1px solid rgba(255, 255, 255, 0.35)",
            }}
          />
          <span style={{ color: "#94A3B8" }}>
            Libre: <strong style={{ color: "#E2E8F0", fontWeight: 600 }}>{formatBytes(freeBytes)}</strong> ({freePct}%)
          </span>
        </div>
      </div>
    </div>
  );
};
