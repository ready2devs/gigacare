import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import App from "../src/App";
import "../src/i18n";
import { SmartCareAnalysis } from "../src/types/models";

const mockAnalysis: SmartCareAnalysis = {
  id: "flow-test-1",
  timestamp: "2026-10-05T12:00:00Z",
  drive_health: {
    drive_letter: "C:",
    drive_label: "OS",
    drive_path: "C:\\",
    total_bytes: 1_000_000_000_000,
    used_bytes: 400_000_000_000,
    free_bytes: 600_000_000_000,
    usage_percent: 40.0,
    disk_type: "SSD_NVMe",
    filesystem: "NTFS",
    smart_status: "Healthy",
    temperature_celsius: 39,
    drive_wear_percent: 1,
    reallocated_sectors: 0,
    power_on_hours: 800,
    fill_forecast: null,
  },
  junk_summary: {
    temp_files_bytes: 1000,
    windows_leftovers_bytes: 2000,
    installers_bytes: 3000,
    browser_caches_bytes: 4000,
    messaging_caches_bytes: 5000,
    recycle_bin_bytes: 6000,
    total_bytes: 21000,
    item_count: 50,
  },
  dev_summary: {
    safe_caches_bytes: 5000,
    unused_models_bytes: 10000,
    stale_python_bytes: 15000,
    total_bytes: 30000,
    item_count: 10,
  },
  apps_summary: {
    unused_apps_count: 2,
    unused_apps_bytes: 50000,
  },
  total_recoverable_bytes: 101000,
  is_valid: true,
};

let analysisToReturn: SmartCareAnalysis | null = null;
let scanningResolve: (data: SmartCareAnalysis) => void;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    switch (cmd) {
      case "get_smartcare_analysis":
        return Promise.resolve(analysisToReturn);
      case "run_full_smartcare_analysis":
        return new Promise((resolve) => {
          scanningResolve = resolve;
        });
      case "scan_junk_files":
        return Promise.resolve({
          total_junk_bytes: 21000,
          categories: [],
          browsers: [],
          scan_timestamp: "2026-10-05T12:00:00Z",
        });
      case "clean_items":
        return Promise.resolve({
          scan_id: "clean-1",
          timestamp: "2026-10-05T12:00:00Z",
          items_moved: 5,
          items_failed: 0,
          bytes_freed: 21000,
          errors: [],
        });
      case "list_storage_devices":
        return Promise.resolve([
          {
            id: "C:",
            label: "Disco Local (C:)",
            device_type: "local_disk",
            root_path: "C:\\",
            total_bytes: 1_000_000_000_000,
            used_bytes: 400_000_000_000,
            free_bytes: 600_000_000_000,
            is_removable: false,
            icon_hint: "hard-drive",
            is_ready: true,
          },
        ]);
      case "get_disk_info":
        return Promise.resolve({
          total_bytes: 1_000_000_000_000,
          used_bytes: 400_000_000_000,
          free_bytes: 600_000_000_000,
          drive_label: "Disco Local (C:)",
        });
      case "get_config":
        return Promise.resolve({
          version: 2,
          smartcare: { analysis_cache_hours: 1 },
          ui: { language: "es", theme: "dark" },
          space_map: { preview_threshold_mb: 50 },
          scanning: { temp_min_age_days: 7, dev_inactive_days: 30, excluded_paths: [] },
          quarantine: { retention_days: 7, max_size_gb: 5 },
          photos: { keep_count: 1, phash_threshold: 8, thumbnail_max_px: 512, thumbnail_quality: 60, thumbnail_max_kb: 100 },
          ai_providers: { enabled: [], priority_order: [], rate_limits: {} },
        });
      case "find_photo_groups":
        return Promise.resolve([]);
      case "quarantine_stats":
        return Promise.resolve({ total_items: 0, total_bytes: 0 });
      default:
        return Promise.resolve([]);
    }
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

describe("T034: SmartCare Full Flow in App.tsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analysisToReturn = null;
  });

  it("sin análisis previo muestra Welcome y sidebar muestra 'Cuidado Inteligente'", async () => {
    const { getByTestId, findByText } = render(<App />);

    expect(await findByText("Cuidado Inteligente")).toBeDefined();
    expect(getByTestId("smartcare-welcome")).toBeDefined();
    expect(getByTestId("analyze-btn")).toBeDefined();
  });

  it("con análisis previo válido en cache muestra Results directamente", async () => {
    analysisToReturn = mockAnalysis;
    const { getByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId("smartcare-results")).toBeDefined();
    });
  });

  it("clic en Volver a empezar vuelve a Welcome", async () => {
    analysisToReturn = mockAnalysis;
    const { getByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId("smartcare-results")).toBeDefined();
    });

    fireEvent.click(getByTestId("restart-btn"));

    await waitFor(() => {
      expect(getByTestId("smartcare-welcome")).toBeDefined();
    });
  });

  it("clic en Ejecutar ejecuta la limpieza y muestra resumen", async () => {
    analysisToReturn = mockAnalysis;
    const { getByTestId, findByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId("smartcare-results")).toBeDefined();
    });

    fireEvent.click(getByTestId("execute-btn"));

    const summary = await findByTestId("smartcare-clean-summary");
    expect(summary.textContent).toContain("Limpieza completada");
  });
});
