import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SystemManagementPanel } from "../src/components/SystemManagementPanel";
import "../src/mockTauriBridge";

describe("T018: SystemManagementPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) renderiza dos tabs con textos correctos", () => {
    render(<SystemManagementPanel />);
    expect(screen.getByText("Desinstalador Profundo")).toBeDefined();
    expect(screen.getAllByText("Inicio de Windows").length).toBeGreaterThan(0);
  });

  it("(b) tab 'Desinstalador' activa por defecto", () => {
    render(<SystemManagementPanel />);
    const uninstallerContent = screen.getByTestId("content-uninstaller");
    const startupContent = screen.getByTestId("content-startup");

    expect(uninstallerContent.style.display).toBe("block");
    expect(startupContent.style.display).toBe("none");
  });

  it("(c) clic en tab 'Inicio' muestra StartupPanel", async () => {
    render(<SystemManagementPanel />);
    const startupTab = screen.getByTestId("tab-startup");
    fireEvent.click(startupTab);

    const uninstallerContent = screen.getByTestId("content-uninstaller");
    const startupContent = screen.getByTestId("content-startup");

    expect(uninstallerContent.style.display).toBe("none");
    expect(startupContent.style.display).toBe("block");
  });

  it("(d) alternar tabs preserva estado de búsqueda y selección", async () => {
    render(<SystemManagementPanel />);

    // Buscar en el desinstalador
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Buscar aplicación o editor...")).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText("Buscar aplicación o editor...") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "Chrome" } });
    expect(searchInput.value).toBe("Chrome");

    // Cambiar a tab de Inicio
    const startupTab = screen.getByTestId("tab-startup");
    fireEvent.click(startupTab);
    expect(screen.getByTestId("content-startup").style.display).toBe("block");

    // Volver a tab de Desinstalador
    const uninstallerTab = screen.getByTestId("tab-uninstaller");
    fireEvent.click(uninstallerTab);

    // El valor del input de búsqueda debe permanecer
    expect(searchInput.value).toBe("Chrome");
  });

  it("(e) prop defaultTab='startup' abre con pestaña de Inicio activa", () => {
    render(<SystemManagementPanel defaultTab="startup" />);
    const uninstallerContent = screen.getByTestId("content-uninstaller");
    const startupContent = screen.getByTestId("content-startup");

    expect(uninstallerContent.style.display).toBe("none");
    expect(startupContent.style.display).toBe("block");
  });

  it("(f) contenido de UninstallerPanel renderiza correctamente dentro del tab", async () => {
    render(<SystemManagementPanel defaultTab="uninstaller" />);
    expect(screen.getByText("Desinstalador Limpio")).toBeDefined();
    expect(screen.getByText("Programas Instalados")).toBeDefined();
  });

  it("(g) contenido de StartupPanel renderiza correctamente dentro del tab", async () => {
    render(<SystemManagementPanel defaultTab="startup" />);
    expect(screen.getByText("Gestor de Inicio de Windows")).toBeDefined();
    expect(screen.getByText("Total Detectados")).toBeDefined();
  });
});
