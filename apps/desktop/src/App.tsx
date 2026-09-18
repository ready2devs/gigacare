import { useState } from "react";
import { FluentProvider } from "@fluentui/react-components";
import { invoke } from "@tauri-apps/api/core";
import { obsidianDarkTheme, gigacareLightTheme } from "./theme";
import { Shell } from "./components/Shell";
import { SmartCareButton } from "./components/SmartCareButton";
import { PreviewPanel } from "./components/PreviewPanel";
import { ScanResult, CleanResult } from "./types/models";

export default function App() {
  const [isDark, setIsDark] = useState(true);
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

  return (
    <FluentProvider
      theme={isDark ? obsidianDarkTheme : gigacareLightTheme}
      style={{ height: "100vh" }}
    >
      <Shell isDark={isDark} onToggleTheme={() => setIsDark(!isDark)}>
        {scanResult && allScanItems.length > 0 ? (
          <PreviewPanel
            items={allScanItems}
            onConfirmClean={handleConfirmClean}
            onCancel={() => setScanResult(null)}
          />
        ) : (
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
        )}
      </Shell>
    </FluentProvider>
  );
}
