import React, { useState } from "react";
import { Text, Button, Badge } from "@fluentui/react-components";
import {
  InfoRegular,
  FolderOpenRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { JunkCategory } from "../types/models";
import { ConfirmDialog } from "./ConfirmDialog";

interface PrefetchSectionProps {
  category: JunkCategory;
  onCleanItems?: (paths: string[]) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const PrefetchSection: React.FC<PrefetchSectionProps> = ({
  category,
  onCleanItems,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleOpenFolder = async (path: string) => {
    try {
      await invoke("plugin:opener|open_path", { path });
    } catch {
      // Fallback
      console.log("Abrir carpeta:", path);
    }
  };

  const handleManualClean = () => {
    const paths = category.items.map((i) => i.path);
    onCleanItems?.(paths);
    setShowConfirm(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {/* Banner explicativo e informacional */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          padding: "12px 16px",
          background: "rgba(59, 130, 246, 0.08)",
          border: "1px solid rgba(59, 130, 246, 0.25)",
          borderRadius: "8px",
        }}
      >
        <InfoRegular style={{ fontSize: "18px", color: "#60A5FA", flexShrink: 0, marginTop: "2px" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <Text size={200} style={{ color: "#93C5FD", lineHeight: "1.4" }}>
            Windows usa estos datos para acelerar el inicio de tus programas.
            GigaCare no los borra para no ralentizar el sistema.
          </Text>
          <Text size={100} style={{ color: "#64748B" }}>
            Los archivos .pf se regeneran con el uso diario pero su eliminación puede causar lentitud temporal.
          </Text>
        </div>
      </div>

      {/* Resumen del Prefetch */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: "rgba(15, 23, 42, 0.4)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          borderRadius: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Badge appearance="tint" color="warning" size="medium">
            Revisar
          </Badge>
          <Text size={200} style={{ color: "#E2E8F0" }}>
            {category.items.length} archivos de precarga ({formatBytes(category.total_bytes)})
          </Text>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          <Button
            size="small"
            appearance="subtle"
            icon={<FolderOpenRegular />}
            onClick={() => handleOpenFolder("C:\\Windows\\Prefetch")}
          >
            Show
          </Button>

          <Button
            size="small"
            appearance="subtle"
            style={{ color: "#F59E0B" }}
            onClick={() => setShowConfirm(true)}
          >
            Limpiar con precaución
          </Button>
        </div>
      </div>

      {/* Lista de primeros items */}
      <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px" }}>
        {category.items.slice(0, 15).map((item) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 12px",
              background: "rgba(15, 23, 42, 0.2)",
              borderRadius: "4px",
              fontSize: "12px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
              <Badge appearance="tint" color="warning" size="small">
                Revisar
              </Badge>
              <span style={{ color: "#94A3B8", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                {item.display_name}
              </span>
            </div>
            <span style={{ color: "#64748B", flexShrink: 0, marginLeft: "12px" }}>
              {formatBytes(item.size_bytes)}
            </span>
          </div>
        ))}
        {category.items.length > 15 && (
          <div style={{ textAlign: "center", color: "#64748B", fontSize: "11px", padding: "4px" }}>
            ... y {category.items.length - 15} archivos más
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        itemCount={category.items.length}
        totalBytes={category.total_bytes}
        onConfirm={handleManualClean}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
};
