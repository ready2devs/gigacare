import { describe, it, expect } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSunburstLayout } from "../src/hooks/useSunburstLayout";
import "../src/mockTauriBridge";
import { LayoutNode, Point } from "../src/types/treemap";

describe("TASK-15: useSunburstLayout Hook", () => {
  it("computes sunburst layout and maintains arcs, loading, error in state", async () => {
    const root: LayoutNode = {
      path: "/root",
      name: "root",
      size_bytes: 2000,
      is_directory: true,
      children: [
        { path: "/root/dir1", name: "dir1", size_bytes: 1200, is_directory: true },
        { path: "/root/dir2", name: "dir2", size_bytes: 800, is_directory: true },
      ],
    };
    const center: Point = { x: 500, y: 500 };

    const { result } = renderHook(() => useSunburstLayout(root, center, 40, 30, 2));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBeNull();
    expect(result.current.arcs.length).toBe(3); // root + 2 children
    expect(result.current.arcs[0].depth).toBe(0);
    expect(result.current.arcs[1].depth).toBe(1);
    expect(result.current.arcs[2].depth).toBe(1);
  });
});
