import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import App from "../src/App";
import i18n from "../src/i18n";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    switch (cmd) {
      case "get_config":
        return Promise.resolve({
          version: 1,
          scanning: { temp_min_age_days: 7, dev_inactive_days: 30, excluded_paths: [] },
          quarantine: { retention_days: 7, max_size_gb: 5 },
          photos: { keep_count: 1, phash_threshold: 8, thumbnail_max_px: 512, thumbnail_quality: 60, thumbnail_max_kb: 100 },
          ai_providers: { enabled: [], priority_order: [], rate_limits: {} },
          space_map: { preview_threshold_mb: 50 },
          theme: "obsidian_dark",
          language: "es",
        });
      case "scan_smart_care":
        return Promise.resolve({
          total_items: 2,
          total_recoverable_bytes: 35000000,
          modules: [
            {
              module: "system_temp",
              status: "completed",
              items: [
                {
                  id: "item-1",
                  path: "C:\\Users\\Test\\AppData\\Local\\Temp\\dump.tmp",
                  category: "temp",
                  size_bytes: 15000000,
                  modified_at: "2026-09-10T10:00:00Z",
                  recommended_action: "quarantine",
                },
                {
                  id: "item-2",
                  path: "C:\\Users\\Test\\AppData\\Local\\Temp\\cache.tmp",
                  category: "temp",
                  size_bytes: 20000000,
                  modified_at: "2026-09-10T10:00:00Z",
                  recommended_action: "quarantine",
                },
              ],
              bytes_found: 35000000,
              items_found: 2,
              duration_ms: 120,
            },
          ],
          duration_ms: 120,
        });
      case "clean_items":
        return Promise.resolve({
          items_moved: 2,
          bytes_freed: 35000000,
          errors: [],
        });
      case "list_quarantine":
        return Promise.resolve([]);
      case "quarantine_stats":
        return Promise.resolve({ total_items: 0, total_bytes: 0, max_space_bytes: 5000000000 });
      default:
        return Promise.resolve({});
    }
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe("GigaCare Windows E2E UI Flow", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("es");
  });

  it("(a) Renderiza la navegación principal con módulos visibles como tarjetas", async () => {
    render(<App />);

    expect(screen.getByText("SmartCare")).toBeInTheDocument();
    expect(screen.getByText("Cuarentena")).toBeInTheDocument();
    expect(screen.getByText("Curador de Fotos")).toBeInTheDocument();
    expect(screen.getByText("Space Map")).toBeInTheDocument();
    expect(screen.getByText("Configuración")).toBeInTheDocument();
  });

  it("(b) Flujo completo: Smart Care scan → Previsualización obligatoria → Confirmar → Limpieza", async () => {
    render(<App />);

    const scanBtn = screen.getByRole("button", { name: /Smart Care/i });
    fireEvent.click(scanBtn);

    await waitFor(() => {
      expect(screen.getByText("Vista Previa de Limpieza")).toBeInTheDocument();
    });

    expect(screen.getByText(/dump.tmp/i)).toBeInTheDocument();
    expect(screen.getByText("Confirmar Limpieza (2)")).toBeInTheDocument();

    const confirmBtn = screen.getByText("Confirmar Limpieza (2)");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText("Confirmar Limpieza a Cuarentena")).toBeInTheDocument();
    });

    const finalConfirm = screen.getByRole("button", { name: "Confirmar y Mover" });
    fireEvent.click(finalConfirm);

    await waitFor(() => {
      expect(screen.getByText(/Limpieza exitosa/i)).toBeInTheDocument();
    });
  });

  it("(c) Internacionalización: cambio de idioma dinámico sin recargar", async () => {
    render(<App />);

    await act(async () => {
      await i18n.changeLanguage("en");
    });

    await waitFor(() => {
      expect(screen.getByText("Photo Curator")).toBeInTheDocument();
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    await act(async () => {
      await i18n.changeLanguage("es");
    });

    await waitFor(() => {
      expect(screen.getByText("Curador de Fotos")).toBeInTheDocument();
    });
  });

  it("(d) Snapshot test de estructura visual contra Obsidian Dark Theme", () => {
    const { asFragment } = render(<App />);
    expect(asFragment()).toMatchSnapshot();
  });
});
