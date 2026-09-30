import { describe, it, expect } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SpaceMap } from "../src/components/SpaceMap";
import "../src/mockTauriBridge";

describe("TASK-44: SpaceMap in Sunburst mode", () => {
  it("renders SpaceMap in sunburst mode, switches mode from treemap to sunburst and populates arcs", async () => {
    localStorage.setItem("gigacare_spacemap_mode", "sunburst");

    const { findByTestId, getByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" />
    );

    const root = await findByTestId("spacelens-root");
    expect(root).toBeDefined();

    // Esperar a que la lista cargue
    await findByTestId("filelist-row-Users", {}, { timeout: 8000 });

    const canvas = getByTestId("space-map-canvas");
    expect(canvas).toBeDefined();

    // Verificar arcos poblados (> 0)
    await waitFor(() => {
      const count = Number(canvas.getAttribute("data-arcs-count") || "0");
      expect(count).toBeGreaterThan(0);
    });

    const btnSunburst = getByTestId("mode-btn-sunburst");
    const btnTreemap = getByTestId("mode-btn-treemap");
    expect(btnSunburst.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(btnTreemap);
    expect(btnTreemap.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(btnSunburst);
    expect(btnSunburst.getAttribute("aria-pressed")).toBe("true");
  });
});
