import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { DriveHealthPanel } from "../src/components/DriveHealthPanel";
import { CleanupCard } from "../src/components/CleanupCard";
import { SpaceRecoveryBar } from "../src/components/SpaceRecoveryBar";
import { SmartCareResults } from "../src/components/SmartCareResults";
import { DriveHealthInfo, SmartCareAnalysis } from "../src/types/models";

const mockDriveInfo: DriveHealthInfo = {
  drive_letter: "C:",
  drive_label: "Disco Local",
  drive_path: "C:\\",
  total_bytes: 1_000_000_000_000, // 1000 GB
  used_bytes: 400_000_000_000,    // 400 GB
  free_bytes: 600_000_000_000,    // 600 GB
  usage_percent: 40.0,
  disk_type: "SSD_NVMe",
  filesystem: "NTFS",
  smart_status: "Healthy",
  temperature_celsius: 41,
  drive_wear_percent: 2,
  reallocated_sectors: 0,
  power_on_hours: 1500,
  fill_forecast: {
    gb_per_day: 1.2,
    full_in_weeks: 71.4,
    readings_count: 5,
    readings_period_days: 14.0,
  },
};

const mockAnalysis: SmartCareAnalysis = {
  id: "test-results-123",
  timestamp: "2026-10-05T12:00:00Z",
  drive_health: mockDriveInfo,
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

describe("T027: Componentes de Resultados SmartCare", () => {
  it("DriveHealthPanel renderiza doughnut y métricas con datos mock", () => {
    const onRefresh = vi.fn();
    const { getByTestId, getByText } = render(
      <DriveHealthPanel data={mockDriveInfo} onRefresh={onRefresh} />
    );

    expect(getByTestId("doughnut-col")).toBeDefined();
    expect(getByTestId("doughnut-col").textContent).toContain("40%");
    expect(getByTestId("smart-badge").textContent).toBe("Healthy");
    expect(getByTestId("temp-metric")).toBeDefined();
    expect(getByTestId("wear-metric")).toBeDefined();
    expect(getByTestId("fill-forecast-section")).toBeDefined();

    fireEvent.click(getByTestId("refresh-drive-btn"));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("DriveHealthPanel maneja campos null (temperatura, desgaste, forecast)", () => {
    const dataWithNulls: DriveHealthInfo = {
      ...mockDriveInfo,
      temperature_celsius: null,
      drive_wear_percent: null,
      reallocated_sectors: null,
      power_on_hours: null,
      fill_forecast: null,
    };
    const { queryByTestId } = render(
      <DriveHealthPanel data={dataWithNulls} onRefresh={vi.fn()} />
    );

    expect(queryByTestId("temp-metric")).toBeNull();
    expect(queryByTestId("wear-metric")).toBeNull();
    expect(queryByTestId("fill-forecast-section")).toBeNull();
  });

  it("CleanupCard muestra tamaño formateado y botón Revisar", () => {
    const onReview = vi.fn();
    const { getByTestId } = render(
      <CleanupCard totalBytes={1073741824} onReview={onReview} />
    );

    expect(getByTestId("cleanup-total-bytes").textContent).toBe("1 GB");
    fireEvent.click(getByTestId("review-btn"));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("SpaceRecoveryBar renderiza 3 segmentos", () => {
    const { getByTestId } = render(
      <SpaceRecoveryBar
        totalBytes={1000}
        usedBytes={400}
        recoverableBytes={100}
      />
    );

    expect(getByTestId("segment-permanent")).toBeDefined();
    expect(getByTestId("segment-recoverable")).toBeDefined();
    expect(getByTestId("segment-free")).toBeDefined();
  });

  it("SmartCareResults ensambla todos los componentes y botón 'Volver a empezar'", () => {
    const onReview = vi.fn();
    const onExecute = vi.fn();
    const onRestart = vi.fn();
    const onRefreshDrive = vi.fn();

    const { getByTestId } = render(
      <SmartCareResults
        analysis={mockAnalysis}
        onReview={onReview}
        onExecute={onExecute}
        onRestart={onRestart}
        onRefreshDrive={onRefreshDrive}
      />
    );

    expect(getByTestId("drive-health-panel")).toBeDefined();
    expect(getByTestId("cleanup-card")).toBeDefined();
    expect(getByTestId("execute-btn")).toBeDefined();
    expect(getByTestId("space-recovery-bar")).toBeDefined();

    fireEvent.click(getByTestId("execute-btn"));
    expect(onExecute).toHaveBeenCalledTimes(1);

    fireEvent.click(getByTestId("restart-btn"));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });
});
