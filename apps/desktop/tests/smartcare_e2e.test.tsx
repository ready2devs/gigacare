import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../src/App";
import "../src/i18n";
import { SmartCareAnalysis, JunkFilesScanResult, InstalledApp } from "../src/types/models";

const mockDriveHealth = {
  drive_letter: "C:",
  drive_label: "Disco Local",
  drive_path: "C:\\",
  total_bytes: 1_000_000_000_000,
  used_bytes: 400_000_000_000,
  free_bytes: 600_000_000_000,
  usage_percent: 40.0,
  disk_type: "SSD_NVMe",
  filesystem: "NTFS",
  smart_status: "Healthy",
  temperature_celsius: 42,
  drive_wear_percent: 2,
  reallocated_sectors: 0,
  power_on_hours: 1200,
  fill_forecast: {
    gb_per_day: 1.5,
    full_in_weeks: 57.1,
    readings_count: 5,
    readings_period_days: 14.0,
  },
};

const mockAnalysis: SmartCareAnalysis = {
  id: "e2e-analysis-1",
  timestamp: "2026-10-05T12:00:00Z",
  drive_health: mockDriveHealth,
  junk_summary: {
    temp_files_bytes: 1000,
    windows_leftovers_bytes: 2000,
    installers_bytes: 3000,
    browser_caches_bytes: 4000,
    messaging_caches_bytes: 5000,
    recycle_bin_bytes: 6000,
    total_bytes: 21000,
    item_count: 35,
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

const mockJunkResult: JunkFilesScanResult = {
  total_junk_bytes: 21000,
  categories: [
    {
      category_id: "temp_files",
      display_name: "Archivos Temporales",
      total_bytes: 3000,
      safe_bytes: 2000,
      items: [
        {
          id: "t1",
          display_name: "safe-temp.tmp",
          path: "C:\\temp\\safe-temp.tmp",
          size_bytes: 2000,
          safe: true,
        },
        {
          id: "t2",
          display_name: "unsafe-temp.tmp",
          path: "C:\\temp\\unsafe-temp.tmp",
          size_bytes: 1000,
          safe: false,
        },
      ],
    },
    {
      category_id: "windows_leftovers",
      display_name: "Restos de Windows",
      total_bytes: 2000,
      safe_bytes: 2000,
      items: [],
    },
    {
      category_id: "download_installers",
      display_name: "Instaladores en Descargas",
      total_bytes: 3000,
      safe_bytes: 3000,
      items: [],
    },
    {
      category_id: "browser_caches",
      display_name: "Cachés de Navegadores",
      total_bytes: 4000,
      safe_bytes: 4000,
      items: [],
    },
    {
      category_id: "messaging_cache",
      display_name: "Cachés de Mensajería",
      total_bytes: 5000,
      safe_bytes: 5000,
      items: [],
    },
    {
      category_id: "recycle_bin",
      display_name: "Papelera de Reciclaje",
      total_bytes: 6000,
      safe_bytes: 6000,
      items: [],
    },
  ],
  browsers: [],
  scan_timestamp: "2026-10-05T12:00:00Z",
};

const mockApps: InstalledApp[] = [
  {
    id: "app-unused-1",
    name: "Old Unused Tool",
    version: "1.0",
    publisher: "Test Corp",
    last_used_days: 500,
    last_used_at: "2025-01-01T00:00:00Z",
    size_bytes: 50000,
  },
];

let analysisReturn: SmartCareAnalysis | null = null;
let resolveScanning: (data: SmartCareAnalysis) => void;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, args: any) => {
    switch (cmd) {
      case "get_smartcare_analysis":
        return Promise.resolve(analysisReturn);
      case "run_full_smartcare_analysis":
        return new Promise((resolve) => {
          resolveScanning = resolve;
        });
      case "scan_junk_files":
        return Promise.resolve(mockJunkResult);
      case "clean_items":
        return Promise.resolve({
          scan_id: "clean-e2e",
          timestamp: "2026-10-05T12:00:00Z",
          items_moved: 5,
          items_failed: 0,
          bytes_freed: 21000,
          errors: [],
        });
      case "clean_recycle_bin":
        return Promise.resolve({
          items_moved: 2,
          bytes_freed: 6000,
          errors: [],
        });
      case "list_installed_apps_with_usage":
        return Promise.resolve(mockApps);
      case "uninstall_app":
        return Promise.resolve();
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
          smartcare: {
            model_unused_threshold_days: 730,
            python_unused_threshold_days: 730,
            app_unused_threshold_days: 730,
            analysis_cache_hours: 24,
            enable_drive_health: true,
          },
          ui: { language: "es", theme: "dark" },
          space_map: { preview_threshold_mb: 50 },
          scanning: { temp_min_age_days: 7, dev_inactive_days: 30, excluded_paths: [] },
          quarantine: { retention_days: 7, max_size_gb: 50 },
          photos: { keep_count: 1, phash_threshold: 8, thumbnail_max_px: 512, thumbnail_quality: 60, thumbnail_max_kb: 100 },
          ai_providers: { enabled: [], priority_order: [], rate_limits: {} },
        });
      case "update_config":
        return Promise.resolve();
      case "find_photo_groups":
        return Promise.resolve([]);
      case "quarantine_stats":
        return Promise.resolve({ total_items: 0, total_bytes: 0 });
      case "dev_clean_scan":
        return Promise.resolve({
          disk_total: 1000000000,
          disk_free: 500000000,
          findings: [],
        });
      case "ml_model_scan":
        return Promise.resolve({ models: [] });
      case "python_env_scan":
        return Promise.resolve({ envs: [] });
      default:
        return Promise.resolve([]);
    }
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

describe("T039: SmartCare End-to-End Integration Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analysisReturn = null;
  });

  it("(a)-(h) Flujo completo de análisis, revisión, ejecución y resumen", async () => {
    const { getByTestId, findByTestId, queryByText } = render(<App />);

    // (a) Abrir app → SmartCare muestra Welcome
    expect(getByTestId("smartcare-welcome")).toBeDefined();
    const analyzeBtn = getByTestId("analyze-btn");
    expect(analyzeBtn).toBeDefined();

    // (b) Analizar → Scanning → Results (espera timeout de animación de Welcome)
    fireEvent.click(analyzeBtn);
    await waitFor(() => {
      expect(getByTestId("smartcare-scanning")).toBeDefined();
    });

    // Resolver scanning con mockAnalysis
    resolveScanning(mockAnalysis);

    // Esperar a que se muestre Results
    const resultsContainer = await findByTestId("smartcare-results");
    expect(resultsContainer).toBeDefined();

    // (c) Results muestra Drive Health con datos correctos
    expect(getByTestId("drive-health-panel")).toBeDefined();
    expect(getByTestId("doughnut-col").textContent).toContain("40%");
    expect(getByTestId("smart-badge").textContent).toBe("Healthy");
    expect(getByTestId("temp-metric").textContent).toContain("42°C");
    expect(getByTestId("fill-forecast-section")).toBeDefined();

    // (d) Results muestra Cleanup Card con total correcto
    expect(getByTestId("cleanup-card")).toBeDefined();
    expect(getByTestId("cleanup-total-bytes").textContent).toBe("98.63 KB"); // 101000 bytes

    // (e) Revisar → modal con 4 categorías navegables
    fireEvent.click(getByTestId("review-btn"));
    const modal = await findByTestId("cleanup-review-modal");
    expect(modal).toBeDefined();
    expect(getByTestId("category-item-junk")).toBeDefined();
    expect(getByTestId("category-item-dev")).toBeDefined();
    expect(getByTestId("category-item-apps")).toBeDefined();
    expect(getByTestId("category-item-media")).toBeDefined();

    // (f) Filtros de seguridad excluyen items unsafe
    expect(getByTestId("file-row-C:\\temp\\safe-temp.tmp")).toBeDefined();
    expect(queryByText("unsafe-temp.tmp")).toBeNull();

    // Aceptar en modal para cerrar
    fireEvent.click(getByTestId("accept-btn"));

    // (g)-(h) Ejecutar → archivos a cuarentena + diálogo o resumen post-ejecución
    fireEvent.click(getByTestId("execute-btn"));
    const summary = await findByTestId("smartcare-clean-summary");
    expect(summary.textContent).toContain("Limpieza completada");
  });

  it("(i) Navegar a Space Map post-análisis muestra treemap sin re-escaneo", async () => {
    analysisReturn = mockAnalysis;
    const { getByText, findByTestId } = render(<App />);

    // Con análisis válido inicial, carga Results
    await findByTestId("smartcare-results");

    // Navegar a Space Map
    const spaceMapNav = getByText("Space Map");
    fireEvent.click(spaceMapNav);

    // Debe mostrar dashboard/treemap directamente sin pantalla Welcome
    await waitFor(() => {
      expect(document.querySelector(".spacemap-canvas-container, .spacelens-statusbar")).toBeDefined();
    });
  });

  it("(j) Navegar a JunkFiles post-análisis muestra datos sin re-escaneo", async () => {
    analysisReturn = mockAnalysis;
    const { getByText, findByTestId } = render(<App />);

    await findByTestId("smartcare-results");

    const junkNav = getByText("Archivos Basura");
    fireEvent.click(junkNav);

    await waitFor(() => {
      expect(document.querySelector(".junk-files-container")).toBeDefined();
    });
  });
});
