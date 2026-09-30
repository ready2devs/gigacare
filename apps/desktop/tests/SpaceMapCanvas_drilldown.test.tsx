import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { SpaceMapCanvas } from "../src/components/SpaceMapCanvas";
import { TreemapRect } from "../src/types/treemap";

describe("TASK-19: Drill-down & Back in SpaceMapCanvas", () => {
  it("triggers drill-down navigation and supports back button and Escape key", () => {
    const onNavigate = vi.fn();
    const onBack = vi.fn();
    const onSelect = vi.fn();

    const rects: TreemapRect[] = [
      {
        path: "C:\\Users",
        name: "Users",
        rect: { x: 0, y: 0, w: 400, h: 600 },
        size_bytes: 5000,
        depth: 1,
        is_directory: true,
      },
      {
        path: "C:\\pagefile.sys",
        name: "pagefile.sys",
        rect: { x: 400, y: 0, w: 400, h: 600 },
        size_bytes: 4000,
        depth: 1,
        is_directory: false,
      },
    ];

    const { getByTestId } = render(
      <SpaceMapCanvas
        rects={rects}
        currentPath="C:\\Users"
        animationDuration={0} // Sin delay para testing síncrono
        onNavigate={onNavigate}
        onBack={onBack}
        onSelect={onSelect}
      />
    );

    // Verificar presencia de breadcrumb y botón Atrás
    const backBtn = getByTestId("drilldown-back-btn");
    expect(backBtn).toBeDefined();

    // Click en botón Atrás
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalled();

    // Presionar Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onBack).toHaveBeenCalledTimes(2);

    // Click en carpeta para drill-down
    const canvas = getByTestId("space-map-canvas");
    fireEvent.click(canvas, { clientX: 100, clientY: 100 });
    expect(onSelect).toHaveBeenCalledWith("C:\\Users", true);
    expect(onNavigate).toHaveBeenCalledWith("C:\\Users");
  });
});
