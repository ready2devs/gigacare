import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { SpaceMapCanvas } from "../src/components/SpaceMapCanvas";
import { TreemapRect } from "../src/types/treemap";

describe("TASK-16: SpaceMapCanvas", () => {
  it("renders 100 rects without crash, handles hover and click emits path", () => {
    const onSelect = vi.fn();
    const onNavigate = vi.fn();

    // Crear 100 rectángulos
    const rects: TreemapRect[] = Array.from({ length: 100 }, (_, i) => ({
      path: `/root/file_${i}.dat`,
      name: `file_${i}.dat`,
      rect: {
        x: (i % 10) * 80,
        y: Math.floor(i / 10) * 60,
        w: 78,
        h: 58,
      },
      size_bytes: (i + 1) * 1024 * 1024,
      depth: 1,
      is_directory: i % 5 === 0,
    }));

    const { getByTestId } = render(
      <SpaceMapCanvas
        rects={rects}
        width={800}
        height={600}
        animationDuration={0}
        onSelect={onSelect}
        onNavigate={onNavigate}
      />
    );

    const canvas = getByTestId("space-map-canvas") as HTMLCanvasElement;
    expect(canvas).toBeDefined();
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);

    // Simular click en la posición del primer rectángulo (x=10, y=10 -> file_0.dat)
    fireEvent.click(canvas, { clientX: 10, clientY: 10 });
    expect(onSelect).toHaveBeenCalledWith("/root/file_0.dat", true);
    expect(onNavigate).toHaveBeenCalledWith("/root/file_0.dat");

    // Simular click en file_1 (x=90, y=10)
    fireEvent.click(canvas, { clientX: 90, clientY: 10 });
    expect(onSelect).toHaveBeenCalledWith("/root/file_1.dat", false);
  });
});
