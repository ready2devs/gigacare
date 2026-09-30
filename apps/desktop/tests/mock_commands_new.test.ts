import { describe, it, expect } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import "../src/mockTauriBridge";

describe("TASK-42: Mock Tauri Bridge New Commands", () => {
  it("verifies all new commands work in web browser mode", async () => {
    // 1. compute_treemap_layout
    const treemapRes: any = await invoke("compute_treemap_layout", {
      nodes: [
        { path: "C:\\file1", name: "file1", size_bytes: 1000, is_directory: false },
      ],
      viewport: { x: 0, y: 0, width: 800, height: 600 },
    });
    expect(treemapRes).toBeDefined();
    expect(Array.isArray(treemapRes)).toBe(true);

    // 2. compute_sunburst_layout
    const sunburstRes: any = await invoke("compute_sunburst_layout", {
      nodes: [
        { path: "C:\\file1", name: "file1", size_bytes: 1000, is_directory: false },
      ],
      center: { x: 400, y: 300 },
      inner_radius: 50,
      ring_width: 40,
      max_depth: 3,
    });
    expect(sunburstRes).toBeDefined();
    expect(Array.isArray(sunburstRes)).toBe(true);

    // 3. nl_query_files
    const nlRes: any = await invoke("nl_query_files", {
      query: "archivos grandes",
      nodes: [
        { path: "C:\\big.mp4", name: "big.mp4", size_bytes: 2000000000, is_directory: false, extension: "mp4" },
      ],
    });
    expect(nlRes).toBeDefined();
    expect(nlRes.matched_paths).toBeDefined();

    // 4. get_file_preview
    const previewRes: any = await invoke("get_file_preview", {
      path: "C:\\photo.jpg",
      max_width: 256,
    });
    expect(previewRes).toBeDefined();
    expect(previewRes.preview_base64).toBeDefined();

    // 5. compute_savings
    const savingsRes: any = await invoke("compute_savings", {
      selected_paths: ["C:\\f1.bin", "C:\\f2.bin"],
      disk_root: "C:\\",
    });
    expect(savingsRes).toBeDefined();
    expect(savingsRes.disk_savings_bytes).toBeGreaterThan(0);

    // 6. suggest_auto_rules
    const rulesRes: any = await invoke("suggest_auto_rules", {
      nodes: [],
    });
    expect(rulesRes).toBeDefined();
    expect(Array.isArray(rulesRes)).toBe(true);
  });
});
