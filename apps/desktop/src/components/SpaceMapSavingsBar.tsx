import React from "react";
import { ProgressBar } from "@fluentui/react-components";

export interface SpaceMapSavingsBarProps {
  selectedBytes: number;
  folderTotalBytes: number;
  diskTotalBytes: number;
  diskName?: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export const SpaceMapSavingsBar: React.FC<SpaceMapSavingsBarProps> = ({
  selectedBytes,
  folderTotalBytes,
  diskTotalBytes,
  diskName = "Disco C:",
}) => {
  const folderFraction = folderTotalBytes > 0 ? Math.min(1, selectedBytes / folderTotalBytes) : 0;
  const diskFraction = diskTotalBytes > 0 ? Math.min(1, selectedBytes / diskTotalBytes) : 0;
  const diskPercent = (diskFraction * 100).toFixed(2);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        padding: "12px",
        background: "rgba(11, 15, 25, 0.9)",
        borderRadius: "8px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        color: "#F8FAFC",
        fontSize: "12px",
      }}
      data-testid="space-map-savings-bar"
    >
      {/* Barra 1: Carpeta actual */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            Liberarás <strong style={{ color: "#00E5FF" }}>{formatBytes(selectedBytes)}</strong> en esta carpeta
          </span>
          <span style={{ color: "#94A3B8" }}>{Math.round(folderFraction * 100)}%</span>
        </div>
        <ProgressBar
          value={folderFraction}
          color="brand"
          style={{ height: "6px", borderRadius: "3px" }}
          data-testid="savings-folder-bar"
        />
      </div>

      {/* Barra 2: Disco total */}
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>
            <strong style={{ color: "#8B5CF6" }}>{formatBytes(selectedBytes)}</strong> de{" "}
            <strong>{formatBytes(diskTotalBytes)}</strong> en {diskName}
          </span>
          <span style={{ color: "#22C55E" }}>+{diskPercent}% libre</span>
        </div>
        <ProgressBar
          value={diskFraction}
          style={{ height: "6px", borderRadius: "3px" }}
          data-testid="savings-disk-bar"
        />
      </div>
    </div>
  );
};
