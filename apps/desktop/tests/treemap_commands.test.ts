import { describe, it, expect } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import "../src/mockTauriBridge";
import { LayoutNode, Rect, TreemapRect, SunburstArc } from "../src/types/treemap";

describe("TASK-13: Treemap & Sunburst Tauri IPC Commands", () => {
  it("compute_treemap_layout is invokable from frontend and returns serialized TreemapRect array", async () => {
    const nodes: LayoutNode[] = [
      { path: "/a", name: "a", size_bytes: 500, is_directory: false },
      { path: "/b", name: "b", size_bytes: 300, is_directory: false },
      { path: "/c", name: "c", size_bytes: 200, is_directory: false },
    ];
    const container: Rect = { x: 0, y: 0, w: 800, h: 600 };

    const rects = await invoke<TreemapRect[]>("compute_treemap_layout", { nodes, container });
    expect(rects).toBeDefined();
    expect(Array.isArray(rects)).toBe(true);
    expect(rects.length).toBe(3);
    expect(rects[0].name).toBe("a");
    expect(rects[0].rect.w).toBeGreaterThan(0);
    expect(rects[0].rect.h).toBeGreaterThan(0);
  });

  it("compute_sunburst_layout is invokable from frontend and returns serialized SunburstArc array", async () => {
    const root: LayoutNode = {
      path: "/root",
      name: "root",
      size_bytes: 1000,
      is_directory: true,
      children: [
        { path: "/root/c1", name: "c1", size_bytes: 600, is_directory: false },
        { path: "/root/c2", name: "c2", size_bytes: 400, is_directory: false },
      ],
    };

    const arcs = await invoke<SunburstArc[]>("compute_sunburst_layout", {
      root,
      center: { x: 400, y: 300 },
      inner_radius: 50,
      ring_width: 40,
      max_depth: 2,
    });

    expect(arcs).toBeDefined();
    expect(Array.isArray(arcs)).toBe(true);
    expect(arcs.length).toBe(3); // 1 root + 2 children
    expect(arcs[0].depth).toBe(0);
    expect(arcs[1].depth).toBe(1);
    expect(arcs[2].depth).toBe(1);
  });
});
