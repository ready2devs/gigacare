import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SmartCareScanning } from "../src/components/SmartCareScanning";
import { SmartCareAnalysis } from "../src/types/models";

const mockAnalysis: SmartCareAnalysis = {
  id: "test-scan-123",
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
    temperature_celsius: 42,
    drive_wear_percent: 1,
    reallocated_sectors: 0,
    power_on_hours: 1200,
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
    unused_apps_count: 3,
    unused_apps_bytes: 50000,
  },
  total_recoverable_bytes: 101000,
  is_valid: true,
};

let analysisPromiseResolve: (data: SmartCareAnalysis) => void;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "run_full_smartcare_analysis") {
      return new Promise((resolve) => {
        analysisPromiseResolve = resolve;
      });
    }
    if (cmd === "cancel_scan") {
      return Promise.resolve();
    }
    return Promise.resolve(null);
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(vi.fn())),
}));

describe("T022: SmartCareScanning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza texto 'Recopilando información del sistema...'", () => {
    const { getByRole } = render(
      <SmartCareScanning onComplete={vi.fn()} onCancel={vi.fn()} />
    );
    const heading = getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("Recopilando información del sistema...");
  });

  it("renderiza botón 'Detener'", () => {
    const { getByTestId } = render(
      <SmartCareScanning onComplete={vi.fn()} onCancel={vi.fn()} />
    );
    const stopBtn = getByTestId("stop-btn");
    expect(stopBtn).toBeDefined();
    expect(stopBtn.textContent).toBe("Detener");
  });

  it("clic en Detener llama onCancel", () => {
    const onCancel = vi.fn();
    const { getByTestId } = render(
      <SmartCareScanning onComplete={vi.fn()} onCancel={onCancel} />
    );
    const stopBtn = getByTestId("stop-btn");
    fireEvent.click(stopBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("al completar análisis llama onComplete con datos", async () => {
    const onComplete = vi.fn();
    render(<SmartCareScanning onComplete={onComplete} onCancel={vi.fn()} />);

    // Resolve analysis
    analysisPromiseResolve(mockAnalysis);

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith(mockAnalysis);
    });
  });
});
