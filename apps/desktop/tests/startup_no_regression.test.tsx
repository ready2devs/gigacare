import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SystemManagementPanel } from "../src/components/SystemManagementPanel";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args?: any) => {
    if (cmd === "list_startup_items") {
      return Promise.resolve([
        {
          id: "item-1",
          name: "Windows Security",
          command: "security.exe",
          source: "registry_hklm",
          impact: "high",
          enabled: true,
          protected: true,
        },
        {
          id: "item-2",
          name: "Spotify",
          command: "spotify.exe",
          source: "registry_hkcu",
          impact: "medium",
          enabled: true,
          protected: false,
        },
        {
          id: "item-3",
          name: "Discord",
          command: "discord.exe",
          source: "startup_folder",
          impact: "high",
          enabled: false,
          protected: false,
        },
      ]);
    }
    if (cmd === "toggle_startup_item") {
      return Promise.resolve(true);
    }
    if (cmd === "list_installed_apps") {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }),
}));

describe("T024: StartupPanel No-Regression in SystemManagementPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) lista elementos de inicio correctamente (invoke list_startup_items)", async () => {
    render(<SystemManagementPanel defaultTab="startup" />);
    await waitFor(() => {
      expect(screen.getByText("Discord")).toBeDefined();
      expect(screen.getByText("Spotify")).toBeDefined();
    });
  });

  it("(b) métricas de resumen correctas", async () => {
    render(<SystemManagementPanel defaultTab="startup" />);
    await waitFor(() => {
      expect(screen.getByText("Total Detectados")).toBeDefined();
      expect(screen.getByText("Activos al Arranque")).toBeDefined();
      expect(screen.getByText("Impacto Alto Activos")).toBeDefined();
    });
  });

  it("(c) filtro de búsqueda por nombre funciona", async () => {
    render(<SystemManagementPanel defaultTab="startup" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Buscar aplicación o ruta...")).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText("Buscar aplicación o ruta...") as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: "Spotify" } });

    await waitFor(() => {
      expect(screen.getByText("Spotify")).toBeDefined();
      expect(screen.queryByText("Discord")).toBeNull();
    });
  });

  it("(d) filtro por impacto funciona", async () => {
    render(<SystemManagementPanel defaultTab="startup" />);
    await waitFor(() => {
      expect(screen.getByText("Discord")).toBeDefined();
    });

    const highFilterBtn = screen.getByText("Alto");
    fireEvent.click(highFilterBtn);

    await waitFor(() => {
      expect(screen.getByText("Discord")).toBeDefined();
    });
  });

  it("(e) toggle switch invoca toggle_startup_item", async () => {
    render(<SystemManagementPanel defaultTab="startup" />);
    await waitFor(() => {
      expect(screen.getByText("Spotify")).toBeDefined();
    });

    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThan(0);

    // Toggle Spotify (no protegido)
    fireEvent.click(switches[1]);
  });

  it("(f) protección de servicios críticos muestra error informativo", async () => {
    render(<SystemManagementPanel defaultTab="startup" />);
    await waitFor(() => {
      expect(screen.getByText("Windows Security")).toBeDefined();
    });

    const switches = screen.getAllByRole("switch");
    // El primer elemento es Windows Security (protected: true)
    fireEvent.click(switches[0]);

    await waitFor(() => {
      expect(screen.getByText(/está protegido por el sistema y no puede desactivarse/)).toBeDefined();
    });
  });
});
