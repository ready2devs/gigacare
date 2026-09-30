import React from "react";
import { Button, Spinner } from "@fluentui/react-components";
import { OpenRegular, DeleteRegular, DismissCircleRegular } from "@fluentui/react-icons";
import { FileMetadata } from "../hooks/useInspector";

export interface SpaceMapInspectorProps {
  path: string | null;
  name: string;
  isDirectory: boolean;
  previewUrl: string | null;
  mediaType: string | null;
  metadata: FileMetadata | null;
  loading?: boolean;
  onOpen?: (path: string) => void;
  onQuarantine?: (path: string) => void;
  onExclude?: (path: string) => void;
  onClose?: () => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export const SpaceMapInspector: React.FC<SpaceMapInspectorProps> = ({
  path,
  name,
  isDirectory,
  previewUrl,
  mediaType,
  metadata,
  loading = false,
  onOpen,
  onQuarantine,
  onExclude,
  onClose,
}) => {
  if (!path) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "16px",
        background: "rgba(17, 24, 39, 0.95)",
        backdropFilter: "blur(20px)",
        borderRadius: "12px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.5)",
        width: "320px",
        transition: "transform 200ms ease-out, opacity 200ms ease-out",
        color: "#F8FAFC",
      }}
      data-testid="space-map-inspector"
    >
      {/* Header con botón de cerrar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "240px",
          }}
          title={name}
        >
          {name}
        </h4>
        {onClose && (
          <button
            onClick={onClose}
            data-testid="inspector-close-btn"
            style={{
              background: "transparent",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Previsualización o Thumbnail */}
      <div
        style={{
          width: "100%",
          height: "160px",
          borderRadius: "8px",
          background: "#0B0F19",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          border: "1px solid rgba(255, 255, 255, 0.05)",
        }}
        data-testid="inspector-preview-box"
      >
        {loading ? (
          <Spinner size="medium" label="Cargando vista previa..." />
        ) : previewUrl ? (
          mediaType && mediaType.startsWith("video") ? (
            <video
              src={previewUrl}
              controls
              muted
              playsInline
              preload="metadata"
              style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: "6px" }}
              data-testid="inspector-preview-video"
            />
          ) : (
            <img
              src={previewUrl}
              alt={name}
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
              data-testid="inspector-preview-img"
            />
          )
        ) : (
          <div style={{ color: "#64748B", fontSize: "28px", textAlign: "center" }}>
            {isDirectory ? "📁" : "📄"}
            <div style={{ fontSize: "12px", marginTop: "4px" }}>
              {isDirectory ? "Directorio" : mediaType || "Sin previsualización"}
            </div>
          </div>
        )}
      </div>

      {/* Metadata Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px",
          fontSize: "12px",
          background: "#0B0F19",
          padding: "10px",
          borderRadius: "8px",
        }}
        data-testid="inspector-metadata-grid"
      >
        <div>
          <span style={{ color: "#64748B" }}>Tamaño:</span>
          <div style={{ fontWeight: 600 }}>{formatBytes(metadata?.size_bytes)}</div>
        </div>
        <div>
          <span style={{ color: "#64748B" }}>Tipo:</span>
          <div style={{ fontWeight: 600 }}>{isDirectory ? "Carpeta" : mediaType || "Archivo"}</div>
        </div>
        {metadata?.dimensions && (
          <div>
            <span style={{ color: "#64748B" }}>Dimensiones:</span>
            <div style={{ fontWeight: 600 }}>{metadata.dimensions}</div>
          </div>
        )}
        {metadata?.codec && (
          <div>
            <span style={{ color: "#64748B" }}>Códec:</span>
            <div style={{ fontWeight: 600 }}>{metadata.codec}</div>
          </div>
        )}
      </div>

      {/* Ruta copiable */}
      <div
        style={{
          fontSize: "11px",
          color: "#94A3B8",
          wordBreak: "break-all",
          background: "rgba(0,0,0,0.2)",
          padding: "6px",
          borderRadius: "4px",
          cursor: "pointer",
        }}
        onClick={() => navigator.clipboard && navigator.clipboard.writeText(path)}
        title="Clic para copiar ruta"
        data-testid="inspector-path"
      >
        {path}
      </div>

      {/* Botones de acción rápida */}
      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        <Button
          size="small"
          icon={<OpenRegular />}
          onClick={() => onOpen && onOpen(path)}
          data-testid="inspector-btn-open"
          style={{ flex: 1 }}
        >
          Abrir
        </Button>
        <Button
          size="small"
          appearance="primary"
          icon={<DeleteRegular />}
          onClick={() => onQuarantine && onQuarantine(path)}
          data-testid="inspector-btn-quarantine"
          style={{ flex: 1, backgroundColor: "#EF4444" }}
        >
          Cuarentena
        </Button>
        <Button
          size="small"
          icon={<DismissCircleRegular />}
          onClick={() => onExclude && onExclude(path)}
          data-testid="inspector-btn-exclude"
        >
          Excluir
        </Button>
      </div>
    </div>
  );
};
