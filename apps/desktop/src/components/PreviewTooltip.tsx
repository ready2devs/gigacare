import React from "react";
import { Text, Badge } from "@fluentui/react-components";
import { DocumentRegular, ImageRegular, VideoRegular } from "@fluentui/react-icons";
import { SpaceMapNode } from "../types/models";

export interface PreviewTooltipProps {
  node: SpaceMapNode | null;
  position: { x: number; y: number } | null;
  thresholdBytes?: number;
}

export const PreviewTooltip: React.FC<PreviewTooltipProps> = ({
  node,
  position,
  thresholdBytes = 50 * 1024 * 1024, // 50 MB default
}) => {
  if (!node || !position || node.size_bytes < thresholdBytes) {
    return null;
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getExtension = (path: string): string => {
    const parts = path.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  };

  const ext = getExtension(node.path);
  const isImage = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);
  const isVideo = ["mp4", "mkv", "avi", "mov"].includes(ext);

  return (
    <div
      className="space-map-tooltip"
      style={{
        left: `${Math.min(position.x + 15, window.innerWidth - 280)}px`,
        top: `${Math.min(position.y + 15, window.innerHeight - 200)}px`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
        {isImage ? (
          <ImageRegular style={{ color: "#00E5FF", fontSize: "20px" }} />
        ) : isVideo ? (
          <VideoRegular style={{ color: "#7C3AED", fontSize: "20px" }} />
        ) : (
          <DocumentRegular style={{ color: "#94A3B8", fontSize: "20px" }} />
        )}
        <Text weight="bold" size={300} style={{ color: "#F8FAFC", wordBreak: "break-all" }}>
          {node.name}
        </Text>
      </div>

      {isImage && (
        <div style={{ width: "100%", height: "100px", background: "rgba(0,0,0,0.3)", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "8px" }}>
          <Text size={200} style={{ color: "#64748B" }}>Previsualización (≤512px)</Text>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Badge size="small" appearance="tint">
          {node.is_directory ? "Carpeta" : ext.toUpperCase() || "Archivo"}
        </Badge>
        <Text weight="semibold" style={{ color: "#00E5FF" }}>
          {formatBytes(node.size_bytes)}
        </Text>
      </div>

      <div style={{ marginTop: "6px", fontSize: "10px", color: "#64748B", wordBreak: "break-all" }}>
        {node.path}
      </div>
    </div>
  );
};
