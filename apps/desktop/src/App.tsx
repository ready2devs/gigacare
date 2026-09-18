import { useState } from "react";
import { FluentProvider } from "@fluentui/react-components";
import { obsidianDarkTheme, gigacareLightTheme } from "./theme";
import { Shell } from "./components/Shell";
import { SmartCareButton } from "./components/SmartCareButton";
import { ScanResult } from "./types/models";

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [lastScanResult, setLastScanResult] = useState<ScanResult | null>(null);

  return (
    <FluentProvider theme={isDark ? obsidianDarkTheme : gigacareLightTheme} style={{ height: "100vh" }}>
      <Shell isDark={isDark} onToggleTheme={() => setIsDark(!isDark)}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <SmartCareButton
            onScanComplete={(result) => {
              setLastScanResult(result);
            }}
          />
          {lastScanResult && (
            <div style={{ marginTop: "16px", color: "#00E5FF", textAlign: "center" }}>
              Último escaneo completado: {lastScanResult.total_items} elementos encontrados (
              {(lastScanResult.total_recoverable_bytes / (1024 * 1024)).toFixed(2)} MB)
            </div>
          )}
        </div>
      </Shell>
    </FluentProvider>
  );
}
