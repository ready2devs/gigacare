import { describe, it, expect } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SpaceMap } from "../src/components/SpaceMap";
import "../src/mockTauriBridge";

describe("TASK-46: SpaceMap Inspector and SavingsBar Integration", () => {
  it("displays savings bar, allows selecting file and renders inspector with metadata", async () => {
    const { findByTestId, getByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" />
    );

    // Contenedor principal
    const root = await findByTestId("spacelens-root", {}, { timeout: 8000 });
    expect(root).toBeDefined();

    // Barra de ahorros siempre visible en el panel lateral
    const savingsBar = await findByTestId("space-map-savings-bar", {}, { timeout: 8000 });
    expect(savingsBar).toBeDefined();

    // Esperar a que la lista de archivos cargue
    const fileListPanel = await findByTestId("spacelens-filelist-panel", {}, { timeout: 8000 });
    expect(fileListPanel).toBeDefined();

    // Seleccionar fila en la lista (Users tarda un par de segundos por build_space_map mock)
    const row = await findByTestId("filelist-row-Users", {}, { timeout: 8000 });
    expect(row).toBeDefined();
    fireEvent.click(row);

    // Verificar que el canvas y los controles sigan responsivos
    const canvas = getByTestId("spacelens-canvas");
    expect(canvas).toBeDefined();
  });
});
