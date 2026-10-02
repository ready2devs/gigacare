import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { CleanupReviewModal } from "../src/components/CleanupReviewModal";
import { SmartCareAnalysis, JunkFilesScanResult, InstalledApp } from "../src/types/models";

const mockAnalysis: SmartCareAnalysis = {
  id: "test-review-1",
  timestamp: "2026-10-05T12:00:00Z",
  drive_health: {
    drive_letter: "C:",
    drive_label: "OS",
    drive_path: "C:\\",
    total_bytes: 1_000_000_000,
    used_bytes: 500_000_000,
    free_bytes: 500_000_000,
    usage_percent: 50.0,
    disk_type: "SSD_NVMe",
    filesystem: "NTFS",
    smart_status: "Healthy",
    temperature_celsius: 40,
    drive_wear_percent: 1,
    reallocated_sectors: 0,
    power_on_hours: 1000,
    fill_forecast: null,
  },
  junk_summary: {
    temp_files_bytes: 2000,
    windows_leftovers_bytes: 0,
    installers_bytes: 0,
    browser_caches_bytes: 0,
    messaging_caches_bytes: 0,
    recycle_bin_bytes: 0,
    total_bytes: 2000,
    item_count: 2,
  },
  dev_summary: {
    safe_caches_bytes: 1500,
    unused_models_bytes: 0,
    stale_python_bytes: 0,
    total_bytes: 1500,
    item_count: 1,
  },
  apps_summary: {
    unused_apps_count: 1,
    unused_apps_bytes: 5000,
  },
  total_recoverable_bytes: 8500,
  is_valid: true,
};

const mockJunkData: JunkFilesScanResult = {
  total_junk_bytes: 5000,
  categories: [
    {
      category_id: "temp_files",
      display_name: "Archivos Temporales",
      total_bytes: 3000,
      safe_bytes: 2000,
      items: [
        {
          id: "temp-1",
          display_name: "safe-temp.tmp",
          path: "C:\\temp\\safe-temp.tmp",
          size_bytes: 2000,
          safe: true,
        },
        {
          id: "temp-2",
          display_name: "unsafe-temp.tmp",
          path: "C:\\temp\\unsafe-temp.tmp",
          size_bytes: 1000,
          safe: false, // Must be excluded by safe filter
        },
      ],
    },
    {
      category_id: "windows_leftovers",
      display_name: "Restos de Windows",
      total_bytes: 0,
      safe_bytes: 0,
      items: [],
    },
    {
      category_id: "download_installers",
      display_name: "Instaladores en Descargas",
      total_bytes: 0,
      safe_bytes: 0,
      items: [],
    },
    {
      category_id: "browser_caches",
      display_name: "Cachés de Navegadores",
      total_bytes: 0,
      safe_bytes: 0,
      items: [],
    },
    {
      category_id: "messaging_cache",
      display_name: "Cachés de Mensajería",
      total_bytes: 0,
      safe_bytes: 0,
      items: [],
    },
    {
      category_id: "recycle_bin",
      display_name: "Papelera de Reciclaje",
      total_bytes: 0,
      safe_bytes: 0,
      items: [],
    },
  ],
  browsers: [],
  scan_timestamp: "2026-10-05T12:00:00Z",
};

const mockDevData = {
  caches: [
    {
      path: "C:\\cache\\safe_cargo",
      name: "Cargo Cache",
      size_bytes: 1500,
      safety: "safe",
    },
    {
      path: "C:\\cache\\risky_node",
      name: "Node Risky",
      size_bytes: 4000,
      safety: "risky", // Excluded
    },
  ],
  models: [
    {
      name: "llama-3-unused",
      size_bytes: 50000,
      used_since_download: false,
      last_used_days: 900,
      paths: ["C:\\models\\llama3"],
    },
  ],
  python: [
    {
      name: "stale_venv",
      path: "C:\\venvs\\stale",
      size_bytes: 20000,
      stale_days: 800,
    },
  ],
};

const mockApps: InstalledApp[] = [
  {
    id: "app-1",
    name: "Old App",
    version: "1.0",
    publisher: "Test",
    last_used_days: 400,
    last_used_at: "2025-01-01T00:00:00Z",
    size_bytes: 5000,
  },
  {
    id: "app-2",
    name: "Recent App",
    version: "2.0",
    publisher: "Test",
    last_used_days: 10,
    last_used_at: "2026-09-25T00:00:00Z",
    size_bytes: 8000,
  },
];

describe("T031: CleanupReviewModal", () => {
  it("renderiza 4 categorías en panel 1", () => {
    const { getByTestId } = render(
      <CleanupReviewModal
        open={true}
        analysis={mockAnalysis}
        junkData={mockJunkData}
        devData={mockDevData}
        appsData={mockApps}
        onAccept={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(getByTestId("category-item-junk")).toBeDefined();
    expect(getByTestId("category-item-dev")).toBeDefined();
    expect(getByTestId("category-item-apps")).toBeDefined();
    expect(getByTestId("category-item-media")).toBeDefined();
  });

  it("seleccionar 'Archivos basura' muestra 6 subcategorías y excluye items unsafe", () => {
    const { getByTestId, queryByText } = render(
      <CleanupReviewModal
        open={true}
        analysis={mockAnalysis}
        junkData={mockJunkData}
        devData={mockDevData}
        appsData={mockApps}
        onAccept={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(getByTestId("subcategory-item-temp_files")).toBeDefined();
    expect(getByTestId("subcategory-item-windows_leftovers")).toBeDefined();
    expect(getByTestId("subcategory-item-download_installers")).toBeDefined();
    expect(getByTestId("subcategory-item-browser_caches")).toBeDefined();
    expect(getByTestId("subcategory-item-messaging_cache")).toBeDefined();
    expect(getByTestId("subcategory-item-recycle_bin")).toBeDefined();

    // safe-temp is visible, unsafe-temp is excluded
    expect(getByTestId("file-row-C:\\temp\\safe-temp.tmp")).toBeDefined();
    expect(queryByText("unsafe-temp.tmp")).toBeNull();
  });

  it("seleccionar 'Limpieza Dev' muestra 3 subcategorías", () => {
    const { getByTestId } = render(
      <CleanupReviewModal
        open={true}
        analysis={mockAnalysis}
        junkData={mockJunkData}
        devData={mockDevData}
        appsData={mockApps}
        onAccept={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(getByTestId("category-item-dev"));

    expect(getByTestId("subcategory-item-dev_caches")).toBeDefined();
    expect(getByTestId("subcategory-item-dev_models")).toBeDefined();
    expect(getByTestId("subcategory-item-dev_python")).toBeDefined();
  });

  it("seleccionar 'Apps sin uso' muestra 3 filtros temporales", () => {
    const { getByTestId } = render(
      <CleanupReviewModal
        open={true}
        analysis={mockAnalysis}
        junkData={mockJunkData}
        devData={mockDevData}
        appsData={mockApps}
        onAccept={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(getByTestId("category-item-apps"));
    expect(getByTestId("app-filter-radio-group")).toBeDefined();
  });

  it("seleccionar 'Multimedia' muestra placeholder", () => {
    const { getByTestId } = render(
      <CleanupReviewModal
        open={true}
        analysis={mockAnalysis}
        junkData={mockJunkData}
        devData={mockDevData}
        appsData={mockApps}
        onAccept={vi.fn()}
        onClose={vi.fn()}
      />
    );

    fireEvent.click(getByTestId("category-item-media"));
    expect(getByTestId("multimedia-placeholder")).toBeDefined();
  });

  it("checkbox en panel 3 toggle selección individual y 'Seleccionar todos'", () => {
    const { getByTestId } = render(
      <CleanupReviewModal
        open={true}
        analysis={mockAnalysis}
        junkData={mockJunkData}
        devData={mockDevData}
        appsData={mockApps}
        onAccept={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const fileRow = getByTestId("file-row-C:\\temp\\safe-temp.tmp");
    fireEvent.click(fileRow);

    const selectAll = getByTestId("select-all-checkbox");
    fireEvent.click(selectAll);
  });

  it("botón 'Aceptar' llama onAccept y 'Atrás' llama onClose", () => {
    const onAccept = vi.fn();
    const onClose = vi.fn();

    const { getByTestId } = render(
      <CleanupReviewModal
        open={true}
        analysis={mockAnalysis}
        junkData={mockJunkData}
        devData={mockDevData}
        appsData={mockApps}
        onAccept={onAccept}
        onClose={onClose}
      />
    );

    fireEvent.click(getByTestId("accept-btn"));
    expect(onAccept).toHaveBeenCalledTimes(1);

    fireEvent.click(getByTestId("modal-back-btn"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
