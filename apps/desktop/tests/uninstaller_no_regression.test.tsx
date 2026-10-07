import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SystemManagementPanel } from "../src/components/SystemManagementPanel";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: any) => {
    if (cmd === "list_installed_apps") {
      return Promise.resolve([
        {
          id: "app-1",
          name: "Visual Studio Code",
          publisher: "Microsoft Corporation",
          version: "1.93.0",
          size_bytes: 450000000,
          source: "registry",
        },
        {
          id: "app-2",
          name: "Steam",
          publisher: "Valve Corporation",
          version: "2.10.91",
          size_bytes: 2500000000,
          source: "registry_wow64",
        },
        {
          id: "app-3",
          name: "Microsoft.WindowsStore",
          publisher: "Microsoft Corporation",
          version: "22405.1401",
          size_bytes: 120000000,
          source: "uwp",
        },
      ]);
    }
    if (cmd === "scan_residuals") {
      return Promise.resolve({
        app_name: args?.app_name || "App",
        residual_paths: ["C:\\Users\\Test\\AppData\\Local\\Steam"],
        total_residual_bytes: 15000000,
      });
    }
    if (cmd === "uninstall_app") {
      return Promise.resolve({
        success: true,
        message: "Desinstalado con éxito",
      });
    }
    if (cmd === "list_startup_items") {
      return Promise.resolve([]);
    }
    return Promise.resolve({});
  }),
}));

describe("T023: Uninstaller No-Regression in SystemManagementPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) lista apps instaladas correctamente (invoke list_installed_apps)", async () => {
    render(<SystemManagementPanel defaultTab="uninstaller" />);
    await waitFor(() => {
      expect(screen.getByText("Visual Studio Code")).toBeDefined();
      expect(screen.getByText("Steam")).toBeDefined();
    });
  });

  it("(b) búsqueda por nombre y editor funciona", async () => {
    render(<SystemManagementPanel defaultTab="uninstaller" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Buscar aplicación o editor...")).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText("Buscar aplicación o editor...") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "Valve" } });

    await waitFor(() => {
      expect(screen.getByText("Steam")).toBeDefined();
      expect(screen.queryByText("Visual Studio Code")).toBeNull();
    });
  });

  it("(c) selección de app muestra panel de detalles", async () => {
    render(<SystemManagementPanel defaultTab="uninstaller" />);
    await waitFor(() => {
      expect(screen.getByText("Visual Studio Code")).toBeDefined();
    });

    const appItem = screen.getByText("Visual Studio Code");
    fireEvent.click(appItem);

    await waitFor(() => {
      expect(screen.getByText("Detalles de la Aplicación")).toBeDefined();
    });
  });

  it("(d) escaneo de residuales funciona (invoke scan_residuals)", async () => {
    render(<SystemManagementPanel defaultTab="uninstaller" />);
    await waitFor(() => {
      expect(screen.getByText("Steam")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Steam"));

    await waitFor(() => {
      expect(screen.getByText("Rastreo de Residuales")).toBeDefined();
      expect(screen.getByText(/en residuos/)).toBeDefined();
    });
  });

  it("(e) botón de desinstalación abre diálogo modal de confirmación Fluent UI", async () => {
    render(<SystemManagementPanel defaultTab="uninstaller" />);
    await waitFor(() => {
      expect(screen.getAllByText("Desinstalar").length).toBeGreaterThan(0);
    });

    const uninstallBtns = screen.getAllByText("Desinstalar");
    fireEvent.click(uninstallBtns[0]);

    await waitFor(() => {
      expect(screen.getByText("¿Confirmar desinstalación?")).toBeDefined();
      expect(screen.getByText("Iniciar Desinstalación")).toBeDefined();
    });
  });

  it("(f) badges de fuente (Registro, WOW64, UWP, Store) se muestran correctamente", async () => {
    render(<SystemManagementPanel defaultTab="uninstaller" />);
    await waitFor(() => {
      expect(screen.getByText("Detectados (Registro + UWP + Store)")).toBeDefined();
      expect(screen.getByText("WOW64")).toBeDefined();
      expect(screen.getByText("UWP")).toBeDefined();
    });
  });
});
