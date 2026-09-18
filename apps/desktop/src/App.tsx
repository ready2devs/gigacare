import { useState } from "react";
import { FluentProvider, Button, Title1, Body1, Card } from "@fluentui/react-components";
import { obsidianDarkTheme, gigacareLightTheme } from "./theme";

export default function App() {
  const [isDark, setIsDark] = useState(true);

  return (
    <FluentProvider theme={isDark ? obsidianDarkTheme : gigacareLightTheme} style={{ height: "100vh" }}>
      <div className="app-container">
        <header className="header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <Title1 style={{ color: isDark ? "#00E5FF" : "#007384" }}>GigaCare</Title1>
            <Body1 style={{ display: "block", color: isDark ? "#94A3B8" : "#475569" }}>
              Suite de Optimización para Windows 11 & Android
            </Body1>
          </div>
          <Button appearance="subtle" onClick={() => setIsDark(!isDark)}>
            {isDark ? "Modo Claro" : "Modo Oscuro"}
          </Button>
        </header>
        <main className="content">
          <Card className="card">
            <h2 style={{ color: "#7C3AED" }}>SmartCare & Mica Backdrop</h2>
            <p>Tema Obsidian Dark activo (#0B0F19, #00E5FF, #7C3AED) con Fluent UI v9.</p>
          </Card>
        </main>
      </div>
    </FluentProvider>
  );
}
