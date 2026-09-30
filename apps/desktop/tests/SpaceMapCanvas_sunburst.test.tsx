import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { SpaceMapCanvas } from "../src/components/SpaceMapCanvas";
import { SunburstArc, TreemapRect } from "../src/types/treemap";

describe("TASK-17: SpaceMapCanvas Sunburst Mode & Mode Switch", () => {
  it("renders 3-level concentric arcs and handles click in sunburst mode", () => {
    const onSelect = vi.fn();
    const onNavigate = vi.fn();

    const arcs: SunburstArc[] = [
      // Nivel 0 (root)
      {
        path: "/root",
        name: "root",
        center: { x: 400, y: 300 },
        r_inner: 40,
        r_outer: 80,
        start_angle: 0,
        end_angle: 2 * Math.PI,
        depth: 0,
        size_bytes: 1000,
        is_directory: true,
      },
      // Nivel 1 (hijo 1)
      {
        path: "/root/dir1",
        name: "dir1",
        center: { x: 400, y: 300 },
        r_inner: 80,
        r_outer: 120,
        start_angle: 0,
        end_angle: Math.PI,
        depth: 1,
        size_bytes: 500,
        is_directory: true,
      },
      // Nivel 2 (nieto 1)
      {
        path: "/root/dir1/file1.dat",
        name: "file1.dat",
        center: { x: 400, y: 300 },
        r_inner: 120,
        r_outer: 160,
        start_angle: 0,
        end_angle: Math.PI,
        depth: 2,
        size_bytes: 500,
        is_directory: false,
      },
    ];

    const { getByTestId, rerender } = render(
      <SpaceMapCanvas
        arcs={arcs}
        mode="sunburst"
        width={800}
        height={600}
        onSelect={onSelect}
        onNavigate={onNavigate}
      />
    );

    const canvas = getByTestId("space-map-canvas") as HTMLCanvasElement;
    expect(canvas).toBeDefined();

    // Simular click en la zona del arco del nieto (distancia = 140, ángulo ~ 0 rad -> x = 400 + 140 = 540, y = 300)
    fireEvent.click(canvas, { clientX: 540, clientY: 300 });
    expect(onSelect).toHaveBeenCalledWith("/root/dir1/file1.dat", false);

    // Switch a modo treemap
    const rects: TreemapRect[] = [
      {
        path: "/root/dir1",
        name: "dir1",
        rect: { x: 0, y: 0, w: 400, h: 600 },
        size_bytes: 500,
        depth: 1,
        is_directory: true,
      },
    ];

    rerender(
      <SpaceMapCanvas
        rects={rects}
        arcs={arcs}
        mode="treemap"
        width={800}
        height={600}
        onSelect={onSelect}
        onNavigate={onNavigate}
      />
    );

    fireEvent.click(canvas, { clientX: 50, clientY: 50 });
    expect(onSelect).toHaveBeenCalledWith("/root/dir1", true);
  });
});
