import React from "react";
import { Text, Button, Badge } from "@fluentui/react-components";
import {
  ChevronDownRegular,
  ChevronRightRegular,
  DeleteRegular,
  FolderOpenRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { JunkCategory, JunkItem } from "../types/models";

interface JunkCategorySectionProps {
  category: JunkCategory;
  icon?: React.ReactNode;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCleanSafe: (category: JunkCategory) => void;
  onCleanIndividual?: (item: JunkItem) => void;
  children?: React.ReactNode;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const JunkCategorySection: React.FC<JunkCategorySectionProps> = ({
  category,
  icon,
  isExpanded,
  onToggleExpand,
  onCleanSafe,
  onCleanIndividual,
  children,
}) => {
  const handleOpenPath = async (path: string) => {
    try {
      await invoke("plugin:opener|open_path", { path });
    } catch {
      console.log("Abrir ruta:", path);
    }
  };

  return (
    <div
      style={{
        background: "rgba(15, 23, 42, 0.65)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "12px",
        overflow: "hidden",
        transition: "border-color 0.2s ease",
      }}
    >
      {/* Header colapsable */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 18px",
          cursor: "pointer",
          userSelect: "none",
          background: isExpanded ? "rgba(255, 255, 255, 0.02)" : "transparent",
        }}
        onClick={onToggleExpand}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {isExpanded ? (
            <ChevronDownRegular style={{ fontSize: "16px", color: "#00E5FF" }} />
          ) : (
            <ChevronRightRegular style={{ fontSize: "16px", color: "#64748B" }} />
          )}

          {icon && (
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "rgba(0, 229, 255, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#00E5FF",
              }}
            >
              {icon}
            </div>
          )}

          <div>
            <Text weight="bold" size={300} style={{ color: "#F8FAFC" }}>
              {category.display_name}
            </Text>
            <span style={{ fontSize: "12px", color: "#64748B", marginLeft: "8px" }}>
              ({category.items.length} elementos)
            </span>
          </div>
        </div>

        <div
          style={{ display: "flex", alignItems: "center", gap: "12px" }}
          onClick={(e) => e.stopPropagation()}
        >
          <Text weight="semibold" size={300} style={{ color: "#00E5FF" }}>
            {formatBytes(category.total_bytes)}
          </Text>

          {!category.informational && category.safe_bytes > 0 && (
            <Button
              size="small"
              appearance="outline"
              icon={<DeleteRegular />}
              style={{ borderColor: "#00E5FF", color: "#00E5FF" }}
              onClick={() => onCleanSafe(category)}
            >
              Limpiar elementos seguros ({formatBytes(category.safe_bytes)})
            </Button>
          )}
        </div>
      </div>

      {/* Contenido expandible */}
      {isExpanded && (
        <div
          style={{
            padding: "14px 18px",
            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
            animation: "fadeIn 0.25s ease",
          }}
        >
          {children ? (
            children
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {category.items.length === 0 ? (
                <div style={{ color: "#64748B", fontSize: "13px", padding: "8px 0" }}>
                  No se encontraron elementos en esta categoría.
                </div>
              ) : (
                category.items.slice(0, 50).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      background: "rgba(15, 23, 42, 0.4)",
                      borderRadius: "6px",
                      fontSize: "13px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", overflow: "hidden" }}>
                      <Badge
                        appearance="tint"
                        color={item.safe ? "success" : "warning"}
                        size="small"
                        style={{ flexShrink: 0 }}
                      >
                        {item.safe ? "Seguro" : "Revisar"}
                      </Badge>

                      {item.age_display && (
                        <Badge appearance="outline" size="small" style={{ flexShrink: 0, color: "#94A3B8" }}>
                          {item.age_display}
                        </Badge>
                      )}

                      <span
                        style={{
                          color: "#E2E8F0",
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                        }}
                        title={item.path}
                      >
                        {item.display_name}
                      </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                      <span style={{ color: "#94A3B8", minWidth: "60px", textAlign: "right" }}>
                        {formatBytes(item.size_bytes)}
                      </span>

                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<FolderOpenRegular />}
                        title="Abrir ubicación"
                        onClick={() => handleOpenPath(item.path)}
                      >
                        Show
                      </Button>

                      {onCleanIndividual && (
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<DeleteRegular />}
                          style={{ color: "#EF4444" }}
                          title="Limpiar elemento"
                          onClick={() => onCleanIndividual(item)}
                        >
                          Clean
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}

              {category.items.length > 50 && (
                <div style={{ textAlign: "center", color: "#64748B", fontSize: "12px", padding: "8px" }}>
                  Mostrando 50 de {category.items.length} archivos
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
