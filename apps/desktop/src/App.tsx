import { useState } from "react";
import { FluentProvider, Card, Text } from "@fluentui/react-components";
import { obsidianDarkTheme, gigacareLightTheme } from "./theme";
import { Shell } from "./components/Shell";

export default function App() {
  const [isDark, setIsDark] = useState(true);

  return (
    <FluentProvider theme={isDark ? obsidianDarkTheme : gigacareLightTheme} style={{ height: "100vh" }}>
      <Shell isDark={isDark} onToggleTheme={() => setIsDark(!isDark)}>
        <Card style={{ maxWidth: "600px", padding: "24px" }}>
          <Text weight="semibold" size={500} style={{ color: "#00E5FF" }}>
            Panel Principal de Control
          </Text>
          <Text style={{ marginTop: "12px", color: "#94A3B8" }}>
            Bienvenido a GigaCare. Selecciona un módulo de la barra lateral izquierda para comenzar a analizar u optimizar tu sistema.
          </Text>
        </Card>
      </Shell>
    </FluentProvider>
  );
}
