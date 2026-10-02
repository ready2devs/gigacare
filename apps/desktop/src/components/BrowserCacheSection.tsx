import React from "react";
import { Text, Button, Badge } from "@fluentui/react-components";
import {
  WarningRegular,
  DeleteRegular,
  FolderOpenRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { BrowserCacheProfile } from "../types/models";

interface BrowserCacheSectionProps {
  browsers: BrowserCacheProfile[];
  onCleanComplete?: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const BrowserCacheSection: React.FC<BrowserCacheSectionProps> = ({
  browsers,
  onCleanComplete,
}) => {
  const [cleaning, setCleaningBrowser] = React.useState<string | null>(null);
  const [cleanedResult, setCleanedResult] = React.useState<Record<string, string>>({});

  const handleOpenPath = async (path: string) => {
    try {
      await invoke("plugin:opener|open_path", { path });
    } catch {
      console.log("Abrir ruta de caché:", path);
    }
  };

  const installedBrowsers = browsers.filter((b) => b.installed);

  const handleCleanBrowser = async (browserId: string, browserName: string) => {
    setCleaningBrowser(browserId);
    try {
      await invoke("clean_browser_cache", { browser_id: browserId });
      setCleanedResult((prev) => ({
        ...prev,
        [browserId]: `✔ Caché de ${browserName} limpiada con éxito`,
      }));
      onCleanComplete?.();
    } catch (err: any) {
      setCleanedResult((prev) => ({
        ...prev,
        [browserId]: `⚠ ${err?.toString() || "Error al limpiar"}`,
      }));
    } finally {
      setCleaningBrowser(null);
    }
  };

  if (installedBrowsers.length === 0) {
    return (
      <div style={{ padding: "16px", color: "#64748B", fontSize: "13px" }}>
        No se detectaron navegadores instalados.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Banner de advertencia */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          padding: "12px 16px",
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "8px",
        }}
      >
        <WarningRegular style={{ fontSize: "18px", color: "#F59E0B", flexShrink: 0, marginTop: "1px" }} />
        <Text size={200} style={{ color: "#FCD34D", lineHeight: "1.4" }}>
          Cierra el navegador antes de borrar su caché; los navegadores abiertos
          pueden recrear o bloquear archivos.
        </Text>
      </div>

      {/* Sección por navegador */}
      {installedBrowsers.map((browser) => {
        const allEntries = browser.profiles.flatMap((p) => p.cache_entries);
        const maxSize = Math.max(...allEntries.map((e) => e.size_bytes), 1);

        return (
          <div
            key={browser.browser_id}
            style={{
              background: "rgba(15, 23, 42, 0.5)",
              border: "1px solid rgba(255, 255, 255, 0.07)",
              borderRadius: "10px",
              overflow: "hidden",
            }}
          >
            {/* Header del navegador */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Text weight="bold" size={300} style={{ color: "#F8FAFC" }}>
                  {browser.browser_name}
                </Text>
                <Badge appearance="tint" color="informative" size="small">
                  {formatBytes(browser.total_all_profiles_bytes)}
                </Badge>
              </div>
              <Button
                size="small"
                appearance="outline"
                icon={<DeleteRegular />}
                style={{ borderColor: "#00E5FF", color: "#00E5FF" }}
                disabled={cleaning === browser.browser_id}
                onClick={() => handleCleanBrowser(browser.browser_id, browser.browser_name)}
              >
                {cleaning === browser.browser_id
                  ? "Limpiando..."
                  : `Limpiar todo de forma segura (${formatBytes(browser.total_all_profiles_bytes)})`}
              </Button>
            </div>

            {/* Resultado de limpieza */}
            {cleanedResult[browser.browser_id] && (
              <div
                style={{
                  padding: "8px 16px",
                  fontSize: "12px",
                  color: cleanedResult[browser.browser_id].startsWith("✔") ? "#34D399" : "#F87171",
                  borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                }}
              >
                {cleanedResult[browser.browser_id]}
              </div>
            )}

            {/* Desglose de entradas de caché */}
            <div style={{ padding: "8px 0" }}>
              {browser.profiles.map((profile) =>
                profile.cache_entries.map((entry) => (
                  <div
                    key={`${profile.profile_name}-${entry.cache_type}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "8px 16px",
                    }}
                  >
                    {/* Nombre del perfil y tipo */}
                    <div style={{ minWidth: "200px", flex: "0 0 auto" }}>
                      <Text size={200} style={{ color: "#94A3B8" }}>
                        {profile.profile_name !== "default" && (
                          <span style={{ color: "#64748B" }}>{profile.profile_name} · </span>
                        )}
                        {entry.display_name}
                      </Text>
                    </div>

                    {/* Badge seguro */}
                    <Badge appearance="tint" color="success" size="small" style={{ flexShrink: 0 }}>
                      Seguro
                    </Badge>

                    {/* Barra de progreso proporcional */}
                    <div
                      style={{
                        flex: 1,
                        height: "6px",
                        background: "rgba(255, 255, 255, 0.08)",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.max((entry.size_bytes / maxSize) * 100, 2)}%`,
                          background: "linear-gradient(90deg, #7C3AED, #00E5FF)",
                          borderRadius: "3px",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>

                    {/* Tamaño */}
                    <Text size={200} style={{ color: "#94A3B8", minWidth: "70px", textAlign: "right", flexShrink: 0 }}>
                      {formatBytes(entry.size_bytes)}
                    </Text>

                    {/* Botón Show */}
                    <Button
                      size="small"
                      appearance="subtle"
                      icon={<FolderOpenRegular />}
                      title="Abrir ubicación en el Explorador"
                      onClick={() => handleOpenPath(entry.path)}
                    >
                      Show
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
