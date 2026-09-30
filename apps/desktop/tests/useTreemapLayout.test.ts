import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTreemapLayout } from "../src/hooks/useTreemapLayout";
import "../src/mockTauriBridge";
import { LayoutNode, Rect } from "../src/types/treemap";

describe("TASK-14: useTreemapLayout Hook", () => {
  it("computes treemap layout and maintains rects, loading, error in state", async () => {
    const nodes: LayoutNode[] = [
      { path: "/dir1", name: "dir1", size_bytes: 1000, is_directory: true },
      { path: "/dir2", name: "dir2", size_bytes: 500, is_directory: true },
    ];
    const container: Rect = { x: 0, y: 0, w: 1000, h: 500 };

    const { result } = renderHook(() => useTreemapLayout(nodes, container));

    // Esperar a que termine de cargar
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.rects.length).toBe(2);
    expect(result.current.rects[0].name).toBe("dir1");
    expect(result.current.rects[1].name).toBe("dir2");
  });
});
