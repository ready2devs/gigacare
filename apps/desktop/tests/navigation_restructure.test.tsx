import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../src/App";
import "../src/mockTauriBridge";

describe("T022: Navigation Restructure Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "Test", "/");
  });

  it("(a) sidebar muestra 8 módulos sin 'Desinstalador' ni 'Inicio de Windows' independientes", async () => {
    render(<App />);

    // Verificar los 8 módulos esperados
    expect(screen.getByText(/Cuidado Inteligente|SmartCare/)).toBeDefined();
    expect(screen.getByText("Cuarentena")).toBeDefined();
    expect(screen.getByText("Curador de Fotos")).toBeDefined();
    expect(screen.getByText("Archivos Basura")).toBeDefined();
    expect(screen.getByText("Gestión del Sistema")).toBeDefined();
    expect(screen.getByText("Space Map")).toBeDefined();
    expect(screen.getByText("Dev Cleaning")).toBeDefined();
    expect(screen.getByText("Configuración")).toBeDefined();

    // Las entradas separadas en la sidebar ya NO deben existir como tarjetas de módulo
    // (pueden existir como subtítulos dentro del nuevo módulo, pero no en nav)
    const sidebar = document.querySelector(".gc-shell-sidebar");
    expect(sidebar).toBeDefined();
    expect(sidebar?.textContent).not.toContain("Optimizar Arranque");
  });

  it("(b) clic en 'Archivos Basura' renderiza JunkFilesPanel", async () => {
    render(<App />);

    const junkModuleBtn = screen.getByText("Archivos Basura");
    fireEvent.click(junkModuleBtn);

    await waitFor(() => {
      expect(screen.getByText("No cachés — archivos olvidados que ocupan espacio silenciosamente")).toBeDefined();
      expect(screen.getByText("Basura encontrada")).toBeDefined();
    });
  });

  it("(c) clic en 'Gestión del Sistema' renderiza SystemManagementPanel", async () => {
    render(<App />);

    const sysMgmtBtn = screen.getByText("Gestión del Sistema");
    fireEvent.click(sysMgmtBtn);

    await waitFor(() => {
      expect(screen.getByTestId("system-management-panel")).toBeDefined();
      expect(screen.getByText("Desinstalador Profundo")).toBeDefined();
    });
  });

  it("(d) deep-link ?module=uninstaller redirige a system_management con tab desinstalador", async () => {
    window.history.pushState({}, "Test", "/?module=uninstaller");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("system-management-panel")).toBeDefined();
      expect(screen.getByTestId("content-uninstaller").style.display).toBe("block");
      expect(screen.getByTestId("content-startup").style.display).toBe("none");
    });
  });

  it("(e) deep-link ?module=startup redirige a system_management con tab inicio", async () => {
    window.history.pushState({}, "Test", "/?module=startup");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId("system-management-panel")).toBeDefined();
      expect(screen.getByTestId("content-startup").style.display).toBe("block");
      expect(screen.getByTestId("content-uninstaller").style.display).toBe("none");
    });
  });

  it.skip("(f) tarjeta SmartCare 'Archivos Temporales' navega a junk_files con categoría temp_files expandida (reemplazado en spec 008 por Welcome/Results)", async () => {
    render(<App />);

    // Buscar tarjeta de resumen en SmartCare
    const tempCard = screen.getByText("%TEMP%, Prefetch, Crash Dumps");
    fireEvent.click(tempCard);

    await waitFor(() => {
      expect(screen.getByText("No cachés — archivos olvidados que ocupan espacio silenciosamente")).toBeDefined();
      // Debe estar expandida la sección de temporales mostrando sus ítems
      expect(screen.getByText("tmp_001.tmp")).toBeDefined();
    });
  });

  it.skip("(g) tarjeta SmartCare 'Caché de Mensajería' navega a junk_files con categoría messaging_cache expandida (reemplazado en spec 008 por Welcome/Results)", async () => {
    render(<App />);

    const msgCard = screen.getByText("WhatsApp, Telegram Desktop");
    fireEvent.click(msgCard);

    await waitFor(() => {
      expect(screen.getByText("No cachés — archivos olvidados que ocupan espacio silenciosamente")).toBeDefined();
      expect(screen.getByText("media_1.mp4")).toBeDefined();
    });
  });

  it.skip("(h) tarjeta SmartCare 'Residuales de Apps' navega a junk_files con categoría app_residuals expandida (reemplazado en spec 008 por Welcome/Results)", async () => {
    render(<App />);

    const resCard = screen.getByText("Archivos huérfanos de desinstalación");
    fireEvent.click(resCard);

    await waitFor(() => {
      expect(screen.getByText("No cachés — archivos olvidados que ocupan espacio silenciosamente")).toBeDefined();
      expect(screen.getByText("OldApp")).toBeDefined();
    });
  });
});
