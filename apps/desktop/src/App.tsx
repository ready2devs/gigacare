import { useState } from "react";
import { FluentProvider, Text, Badge } from "@fluentui/react-components";
import {
  BroomRegular,
  FolderZipRegular,
  AppsListDetailRegular,
  ImageMultipleRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { obsidianDarkTheme, gigacareLightTheme } from "./theme";
import { Shell } from "./components/Shell";
import { SmartCareButton } from "./components/SmartCareButton";
import { PreviewPanel } from "./components/PreviewPanel";
import { SpaceMap } from "./components/SpaceMap";
import { PhotoCurator } from "./components/PhotoCurator";
import { QuarantinePanel } from "./components/QuarantinePanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ScanResult, CleanResult } from "./types/models";

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const searchParams = new URLSearchParams(window.location.search);
  const initialMod = searchParams.get("module") || "smartcare";
  const [activeModule, setActiveModule] = useState<string>(initialMod);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [cleanResult, setCleanResult] = useState<CleanResult | null>(null);

  const handleScanComplete = (result: ScanResult) => {
    setScanResult(result);
    setCleanResult(null);
  };

  const handleConfirmClean = async (selectedPaths: string[]) => {
    try {
      const res = await invoke<CleanResult>("clean_items", {
        item_ids: selectedPaths,
      });
      setCleanResult(res);
      setScanResult(null);
    } catch (err) {
      console.error("Error al limpiar elementos:", err);
    }
  };

  const allScanItems = scanResult
    ? scanResult.modules.flatMap((m) => m.items)
    : [];

  const overviewCategories = [
    {
      title: "Archivos Temporales",
      subtitle: "%TEMP%, Prefetch, Crash Dumps",
      size: "1.45 GB",
      icon: <BroomRegular style={{ fontSize: "24px", color: "#00E5FF" }} />,
      tag: "Sistema",
    },
    {
      title: "Caché de Mensajería",
      subtitle: "WhatsApp, Telegram Desktop",
      size: "820 MB",
      icon: <FolderZipRegular style={{ fontSize: "24px", color: "#38BDF8" }} />,
      tag: "Aplicaciones",
    },
    {
      title: "Curador de Fotos",
      subtitle: "Ráfagas, Similares y Desenfoque",
      size: "2.10 GB",
      icon: <ImageMultipleRegular style={{ fontSize: "24px", color: "#A78BFA" }} />,
      tag: "Imágenes",
    },
    {
      title: "Residuales de Apps",
      subtitle: "Archivos huérfanos de desinstalación",
      size: "450 MB",
      icon: <AppsListDetailRegular style={{ fontSize: "24px", color: "#F59E0B" }} />,
      tag: "Limpieza",
    },
  ];

  const renderActiveModule = () => {
    switch (activeModule) {
      case "smartcare":
        if (scanResult && allScanItems.length > 0) {
          return (
            <PreviewPanel
              items={allScanItems}
              onConfirmClean={handleConfirmClean}
              onCancel={() => setScanResult(null)}
            />
          );
        }
        return (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", maxWidth: "900px", margin: "0 auto", gap: "28px" }}>
            <SmartCareButton onScanComplete={handleScanComplete} />

            {/* Cuadrícula de Resumen de Módulos */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "16px",
              width: "100%",
              padding: "0 10px"
            }}>
              {overviewCategories.map((cat) => (
                <div
                  key={cat.title}
                  style={{
                    background: "rgba(15, 23, 42, 0.65)",
                    border: "1px solid rgba(255, 255, 255, 0.07)",
                    borderRadius: "14px",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                    boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
                    backdropFilter: "blur(12px)",
                    transition: "transform 0.2s ease, border-color 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "10px",
                      background: "rgba(0, 229, 255, 0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}>
                      {cat.icon}
                    </div>
                    <Badge size="small" appearance="tint">
                      {cat.tag}
                    </Badge>
                  </div>

                  <div>
                    <Text weight="bold" size={300} style={{ color: "#F8FAFC", display: "block" }}>
                      {cat.title}
                    </Text>
                    <Text size={200} style={{ color: "#94A3B8" }}>
                      {cat.subtitle}
                    </Text>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: "4px" }}>
                    <span style={{ fontSize: "11px", color: "#64748B", textTransform: "uppercase" }}>Estimado</span>
                    <Text weight="bold" size={400} style={{ color: "#00E5FF" }}>
                      {cat.size}
                    </Text>
                  </div>
                </div>
              ))}
            </div>

            {cleanResult && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "12px 20px",
                  background: "rgba(0, 229, 255, 0.1)",
                  border: "1px solid #00E5FF",
                  borderRadius: "8px",
                  color: "#00E5FF",
                  textAlign: "center",
                }}
              >
                Limpieza exitosa: {cleanResult.items_moved} elementos movidos a cuarentena (
                {(cleanResult.bytes_freed / (1024 * 1024)).toFixed(2)} MB liberados)
              </div>
            )}
          </div>
        );

      case "quarantine":
        return <QuarantinePanel />;

      case "photos":
        return (
          <PhotoCurator
            onCleanDiscarded={async (paths) => {
              try {
                await invoke("clean_items", { item_ids: paths });
                setActiveModule("quarantine");
              } catch (err) {
                console.error("Error al enviar fotos a cuarentena:", err);
              }
            }}
          />
        );

      case "space_map":
        return <SpaceMap />;

      case "settings":
        return <SettingsPanel />;

      default:
        return (
          <div style={{ padding: "32px", textAlign: "center", color: "#94A3B8" }}>
            Módulo {activeModule} en desarrollo.
          </div>
        );
    }
  };

  return (
    <FluentProvider
      theme={isDark ? obsidianDarkTheme : gigacareLightTheme}
      style={{ height: "100vh" }}
    >
      <Shell
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
      >
        {renderActiveModule()}
      </Shell>
    </FluentProvider>
  );
}
