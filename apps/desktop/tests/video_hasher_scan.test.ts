import { describe, it, expect } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { ScanResult } from "../src/types/models";
import "../src/mockTauriBridge";

describe("TASK-40: scan_smart_care with similar_videos module", () => {
  it("includes similar_videos module in scan results", async () => {
    const res = await invoke<ScanResult>("scan_smart_care");
    expect(res).toBeDefined();
    expect(res.modules).toBeDefined();

    const videoMod = res.modules.find((m) => m.module_id === "similar_videos");
    expect(videoMod).toBeDefined();
    expect(videoMod?.status).toBe("completed");
    expect(videoMod?.items_found).toBeGreaterThan(0);
    expect(videoMod?.items.some((i) => i.category === "video")).toBe(true);
  });
});
