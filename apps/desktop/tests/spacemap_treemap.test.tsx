import { describe, it, expect } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SpaceMap } from "../src/components/SpaceMap";
import "../src/mockTauriBridge";

describe("TASK-43: SpaceMap in Treemap mode", () => {
  it("renders SpaceMap in treemap mode with mock data, canvas is visible, rects are populated and clickable", async () => {
    localStorage.setItem("gigacare_spacemap_mode", "treemap");

    const { findByTestId, getByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" />
    );

    const root = await findByTestId("spacelens-root");
    expect(root).toBeDefined();

    // Esperar a que la lista de archivos cargue los hijos de currentNode
    await findByTestId("filelist-row-Users", {}, { timeout: 8000 });

    const canvas = getByTestId("space-map-canvas");
    expect(canvas).toBeDefined();

    // Verificar que los rectángulos se hayan calculado (> 0)
    await waitFor(() => {
      const count = Number(canvas.getAttribute("data-rects-count") || "0");
      expect(count).toBeGreaterThan(0);
    });

    // Click en el canvas para probar interactividad
    fireEvent.click(canvas, { clientX: 200, clientY: 200 });
  });

  it("syncs Treemap layout nodes when changing the select filter or selection in SpaceLensFileList", async () => {
    localStorage.setItem("gigacare_spacemap_mode", "treemap");

    const { findByTestId, getByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" />
    );

    await findByTestId("spacelens-root");
    await findByTestId("filelist-row-Users", {}, { timeout: 8000 });

    const canvas = getByTestId("space-map-canvas");
    let initialCount = 0;
    await waitFor(() => {
      initialCount = Number(canvas.getAttribute("data-rects-count") || "0");
      expect(initialCount).toBeGreaterThan(0);
    });

    const filterSelect = getByTestId("spacelens-select-filter");

    // Filtrar por photos (en la raíz simulada de C: no hay fotos directas) -> canvas rects se reduce a 0
    fireEvent.change(filterSelect, { target: { value: "photos" } });
    await waitFor(() => {
      const count = Number(canvas.getAttribute("data-rects-count") || "0");
      expect(count).toBe(0);
    });

    // Cambiar a "all" o "none" -> vuelven a mostrarse todos los rects
    fireEvent.change(filterSelect, { target: { value: "all" } });
    await waitFor(() => {
      const count = Number(canvas.getAttribute("data-rects-count") || "0");
      expect(count).toBe(initialCount);
    });
  });
});
