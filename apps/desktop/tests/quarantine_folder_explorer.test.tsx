import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QuarantinePanel } from "../src/components/QuarantinePanel";
import { RecursivePhotoScanResult } from "../src/types/models";

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

const mockOpen = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: any[]) => mockOpen(...args),
}));

const mockScanResult: RecursivePhotoScanResult = {
  scan_path: "D:\\FotosVacaciones",
  total_photos_found: 4,
  photos_processed: 4,
  truncated: false,
  groups: [
    {
      group_id: "g-q-1",
      similarity_method: "phash",
      avg_hamming_distance: 2,
      photos: [
        {
          path: "D:\\FotosVacaciones\\img1.jpg",
          original_resolution: "1920x1080",
          size_bytes: 2048000,
          phash: "0x111",
          ai_analysis: {
            provider_used: "local_fallback",
            sharpness_score: 0.9,
            eyes_open_score: 0.9,
            composition_score: 0.9,
            noise_score: 0.9,
            total_score: 0.9,
            rank: 1,
            recommendation: "keep",
          },
        },
        {
          path: "D:\\FotosVacaciones\\img2.jpg",
          original_resolution: "1920x1080",
          size_bytes: 2048000,
          phash: "0x112",
          ai_analysis: {
            provider_used: "local_fallback",
            sharpness_score: 0.5,
            eyes_open_score: 0.5,
            composition_score: 0.5,
            noise_score: 0.5,
            total_score: 0.5,
            rank: 2,
            recommendation: "discard",
          },
        },
      ],
    },
  ],
};

describe("QuarantinePanel Folder Explorer (Phase 7b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "list_quarantine") return [];
      if (cmd === "quarantine_stats") return { total_items: 0, total_bytes: 0, max_space_bytes: 5000000000 };
      if (cmd === "find_photo_groups_recursive") return mockScanResult;
      if (cmd === "analyze_all_groups_ai") return mockScanResult.groups;
      if (cmd === "clean_items") return { items_moved: 1, bytes_freed: 2048000 };
      return {};
    });
  });

  it("T039: Renders internal tabs and switches between 'Archivos en Cuarentena' and 'Analizar Nueva Carpeta'", async () => {
    render(<QuarantinePanel />);

    const tabQuarantine = screen.getByTestId("tab-quarantine-files");
    const tabAnalyze = screen.getByTestId("tab-analyze-folder");
    expect(tabQuarantine).toBeDefined();
    expect(tabAnalyze).toBeDefined();

    fireEvent.click(tabAnalyze);
    expect(screen.getByTestId("analyze-folder-view")).toBeDefined();
    expect(screen.getByTestId("select-folder-btn")).toBeDefined();
  });

  it("T040: Selecting a folder scans recursively, shows photo groups, keepCount dropdown and root drive warning when applicable", async () => {
    mockOpen.mockResolvedValueOnce("D:\\");

    render(<QuarantinePanel />);
    fireEvent.click(screen.getByTestId("tab-analyze-folder"));

    fireEvent.click(screen.getByTestId("select-folder-btn"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("find_photo_groups_recursive", {
        folder_path: "D:\\",
      });
    });

    // Root drive warning should appear for "D:\"
    expect(screen.getByTestId("root-drive-warning")).toBeDefined();
    expect(screen.getByText("Grupo #1")).toBeDefined();
    expect(screen.getByTestId("quarantine-keep-count-dropdown")).toBeDefined();
  });

  it("T041: Moving discarded photos to quarantine switches back to quarantine tab and reloads quarantine data", async () => {
    mockOpen.mockResolvedValueOnce("D:\\FotosVacaciones");

    render(<QuarantinePanel />);
    fireEvent.click(screen.getByTestId("tab-analyze-folder"));
    fireEvent.click(screen.getByTestId("select-folder-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("quarantine-move-btn")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("quarantine-move-btn"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("clean_items", {
        item_ids: ["D:\\FotosVacaciones\\img2.jpg"],
      });
      // Tab switched back to quarantine
      expect(screen.queryByTestId("analyze-folder-view")).toBeNull();
    });
  });
});
