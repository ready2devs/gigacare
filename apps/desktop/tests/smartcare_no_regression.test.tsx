import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { JunkFilesPanel } from "../src/components/JunkFilesPanel";
import { DevCleaning } from "../src/components/DevCleaning/DevCleaning";
import { SpaceMap } from "../src/components/SpaceMap";
import { QuarantinePanel } from "../src/components/QuarantinePanel";
import { UninstallerPanel } from "../src/components/UninstallerPanel";
import "../src/i18n";
import { JunkFilesScanResult, InstalledApp } from "../src/types/models";

const mockJunkResult: JunkFilesScanResult = {
  total_junk_bytes: 15000,
  categories: [
    {
      category_id: "temp_files",
      display_name: "Archivos Temporales",
      total_bytes: 10000,
      safe_bytes: 8000,
      items: [
        {
          id: "item-1",
          display_name: "test.tmp",
          path: "C:\\temp\\test.tmp",
          size_bytes: 8000,
          safe: true,
        },
      ],
    },
  ],
  browsers: [],
  scan_timestamp: "2026-10-05T12:00:00Z",
};

const mockQuarantineItems = [
  {
    id: "quar-1",
    original_path: "C:\\temp\\junk.tmp",
    quarantine_path: "C:\\quarantine\\junk.tmp",
    size_bytes: 5000,
    timestamp: "2026-10-05T12:00:00Z",
    source_module: "smartcare_recycle_bin",
    sha256: "abcdef123456",
  },
];

const mockAppsWithUsage: InstalledApp[] = [
  {
    id: "app-1",
    name: "Enriched App",
    version: "1.2.0",
    publisher: "Usage Corp",
    install_date: "2025-01-01",
    estimated_size_bytes: 120000000,
    size_bytes: 120000000,
    last_used_days: 12,
    last_used_at: "2026-09-20T10:00:00Z",
    usage_count: 55,
  },
];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    switch (cmd) {
      case "scan_junk_files":
        return Promise.resolve(mockJunkResult);
      case "dev_clean_scan":
        return Promise.resolve({
          disk_total: 1000000000,
          disk_free: 500000000,
          findings: [
            {
              name: "Npm Cache",
              rule_id: "npm-cache",
              description: "Cache de npm",
              category: "dev_cache",
              safety: "safe",
              path: "C:\\Users\\Test\\AppData\\Local\\npm-cache",
              size_bytes: 20000000,
              file_count: 100,
              stale_days: 15,
              children: [],
              read_error: null,
            },
          ],
        });
      case "list_quarantine":
      case "list_quarantine_items":
        return Promise.resolve(mockQuarantineItems);
      case "quarantine_stats":
        return Promise.resolve({ total_items: 1, total_bytes: 5000 });
      case "list_storage_devices":
        return Promise.resolve([
          {
            id: "C:",
            label: "Disco local (C:)",
            device_type: "local_disk",
            root_path: "C:\\",
            total_bytes: 1000000000,
            used_bytes: 400000000,
            free_bytes: 600000000,
            is_removable: false,
            icon_hint: "hard_drive",
            is_ready: true,
          },
        ]);
      case "get_config":
        return Promise.resolve({
          version: 2,
          smartcare: { analysis_cache_hours: 1 },
          ui: { language: "es", theme: "dark" },
          space_map: { preview_threshold_mb: 50 },
          quarantine: { retention_days: 7, max_size_gb: 50 },
        });
      case "list_installed_apps":
      case "list_installed_apps_with_usage":
        return Promise.resolve(mockAppsWithUsage);
      default:
        return Promise.resolve([]);
    }
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

describe("T040: Tests de No-Regresión de Módulos Existentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) JunkFiles sigue funcionando independientemente sin análisis SmartCare previo", async () => {
    const { findByText } = render(<JunkFilesPanel />);

    expect(await findByText("Archivos Basura")).toBeDefined();
    expect(await findByText("Archivos Temporales")).toBeDefined();
    expect(await findByText("test.tmp")).toBeDefined();
  });

  it("(b) DevCleaning sigue funcionando independientemente sin análisis previo", async () => {
    const { findByText } = render(<DevCleaning />);

    expect(await findByText("Dev Cleaning")).toBeDefined();
    expect(await findByText("Cachés Dev")).toBeDefined();
  });

  it("(c) SpaceMap sigue funcionando independientemente con su flujo Welcome sin análisis", async () => {
    const { findByText } = render(<SpaceMap isVisible={true} />);

    expect(await findByText(/Visualizando tu espacio/)).toBeDefined();
  });

  it("(d) Cuarentena muestra correctamente items con source_module 'smartcare_*'", async () => {
    const { findByText } = render(<QuarantinePanel />);

    expect(await findByText(/Cuarentena Reversible/)).toBeDefined();
    await waitFor(() => {
      expect(document.body.textContent).toContain("smartcare_recycle_bin");
    });
  });

  it("(e) Desinstalador profundo funciona con apps enriquecidas con datos de uso", async () => {
    const { findByText } = render(<UninstallerPanel />);

    expect(await findByText("Enriched App")).toBeDefined();
    expect(await findByText(/Usage Corp/)).toBeDefined();
  });
});
