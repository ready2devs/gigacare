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
        gap: "12px",
        width: "100%",
        boxSizing: "border-box",
      }}
      data-testid="space-recovery-bar"
    >
      {/* Barra con 3 segmentos */}
      <div
        style={{
          width: "100%",
          height: "24px",
          borderRadius: "12px",
          overflow: "hidden",
          display: "flex",
          background: "#1E293B",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
        data-testid="bar-track"
      >
        {/* Segmento permanente usado */}
        <div
          data-testid="segment-permanent"
          style={{
            width: `${permanentPct}%`,
            background: "#CBD5E1",
            transition: "width 0.5s ease",
          }}
          title={`Ocupado: ${formatBytes(permanentUsedBytes)} (${permanentPct}%)`}
        />

        {/* Segmento recuperable (verde esmeralda brillante) */}
        <div
          data-testid="segment-recoverable"
          style={{
            width: `${recoverablePct}%`,
            background: "#4ADE80",
            transition: "width 0.5s ease",
          }}
          title={`Recuperable: ${formatBytes(clampedRecoverable)} (${recoverablePct}%)`}
        />

        {/* Segmento libre */}
        <div
          data-testid="segment-free"
          style={{
            width: `${freePct}%`,
            background: "transparent",
            transition: "width 0.5s ease",
          }}
          title={`Libre: ${formatBytes(freeBytes)} (${freePct}%)`}
        />
      </div>

      {/* Leyenda inferior */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "24px",
          fontSize: "13px",
        }}
        data-testid="bar-legend"
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#CBD5E1",
            }}
          />
          <span style={{ color: "#94A3B8" }}>
            Ocupado: <strong style={{ color: "#F8FAFC" }}>{formatBytes(permanentUsedBytes)}</strong> ({permanentPct}%)
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#4ADE80",
            }}
          />
          <span style={{ color: "#94A3B8" }}>
            Recuperable: <strong style={{ color: "#4ADE80" }}>{formatBytes(clampedRecoverable)}</strong> ({recoverablePct}%)
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              border: "1px solid rgba(255, 255, 255, 0.4)",
            }}
          />
          <span style={{ color: "#94A3B8" }}>
            Libre: <strong style={{ color: "#F8FAFC" }}>{formatBytes(freeBytes)}</strong> ({freePct}%)
          </span>
        </div>
      </div>
    </div>
  );
};
