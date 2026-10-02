import React from "react";

export interface SpaceRecoveryBarProps {
  totalBytes: number;
  usedBytes: number;
  recoverableBytes: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const SpaceRecoveryBar: React.FC<SpaceRecoveryBarProps> = ({
  totalBytes,
  usedBytes,
  recoverableBytes,
}) => {
  const safeTotal = totalBytes > 0 ? totalBytes : 1;
  const clampedRecoverable = Math.min(usedBytes, recoverableBytes);
  const permanentUsedBytes = Math.max(0, usedBytes - clampedRecoverable);
  const freeBytes = Math.max(0, totalBytes - usedBytes);

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
            transition: "width 0.4s ease",
          }}
          title={`Ocupado: ${formatBytes(permanentUsedBytes)} (${permanentPct}%)`}
        />
        {/* Segmento recuperable */}
        <div
          data-testid="segment-recoverable"
          style={{
            width: `${recoverablePct}%`,
            background: "#4ADE80",
            transition: "width 0.4s ease",
          }}
          title={`Recuperable: ${formatBytes(clampedRecoverable)} (${recoverablePct}%)`}
        />
        {/* Segmento libre */}
        <div
          data-testid="segment-free"
          style={{
            width: `${freePct}%`,
            background: "#1E293B",
            transition: "width 0.4s ease",
          }}
          title={`Libre: ${formatBytes(freeBytes)} (${freePct}%)`}
        />
      </div>

      {/* Leyenda */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          fontSize: "13px",
          color: "#94A3B8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#CBD5E1" }} />
          <span>Espacio ocupado: {formatBytes(permanentUsedBytes)} ({permanentPct}%)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#4ADE80" }} />
          <span style={{ color: "#4ADE80", fontWeight: 600 }}>
            Espacio recuperable: {formatBytes(clampedRecoverable)} ({recoverablePct}%)
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ width: "12px", height: "12px", borderRadius: "3px", background: "#1E293B", border: "1px solid #475569" }} />
          <span>Espacio libre: {formatBytes(freeBytes)} ({freePct}%)</span>
        </div>
      </div>
    </div>
  );
};
