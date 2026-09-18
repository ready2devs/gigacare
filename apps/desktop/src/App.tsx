import { useState } from "react";
import { FluentProvider } from "@fluentui/react-components";
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
  const [activeModule, setActiveModule] = useState<string>("smartcare");
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <SmartCareButton onScanComplete={handleScanComplete} />
            {cleanResult && (
              <div
                style={{
                  marginTop: "16px",
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
