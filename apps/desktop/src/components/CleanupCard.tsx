import React from "react";
import { Button } from "@fluentui/react-components";

export interface CleanupCardProps {
  totalBytes?: number;
  onReview: () => void;
}

const formatBytes = (bytes?: number): string => {
  if (typeof bytes !== "number" || isNaN(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const CleanupCard: React.FC<CleanupCardProps> = ({
  totalBytes = 0,
  onReview,
}) => {
  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "14px",
        padding: "24px 28px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
        boxSizing: "border-box",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
      }}
      data-testid="cleanup-card"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h3
          style={{
            margin: 0,
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: "18px",
            letterSpacing: "-0.3px",
          }}
        >
          Limpieza
        </h3>
        <div
          style={{
            fontSize: "36px",
            fontWeight: 700,
            color: "#00E5FF",
            letterSpacing: "-1px",
            lineHeight: 1.1,
          }}
          data-testid="cleanup-total-bytes"
        >
          {formatBytes(totalBytes)}
        </div>
        <div style={{ color: "#94A3B8", fontSize: "14px", marginTop: "2px" }}>
          de archivos y programas inútiles para limpiar
        </div>
      </div>

      <div>
        <Button
          appearance="outline"
          data-testid="review-btn"
          onClick={onReview}
          style={{
            borderColor: "#00E5FF",
            color: "#00E5FF",
            fontWeight: 600,
            padding: "8px 20px",
            borderRadius: "8px",
            fontSize: "14px",
          }}
        >
          Revisar
        </Button>
      </div>
    </div>
  );
};
