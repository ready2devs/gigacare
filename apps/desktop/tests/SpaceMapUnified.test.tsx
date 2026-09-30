import { describe, it, expect } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SpaceMap } from "../src/components/SpaceMap";
import "../src/mockTauriBridge";

describe("TASK-34: SpaceMap Unified Layout with Inline Tabs", () => {
  it("renders unified layout, switches tabs smoothly without unmounting canvas", async () => {
    const { getByTestId, findByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" />
    );

    // Root de SpaceMap cargado
    const root = await findByTestId("spacelens-root");
    expect(root).toBeDefined();

    // Tabs inline visibles
    const tabMap = getByTestId("tab-spacemap");
    const tabDuplicates = getByTestId("tab-duplicates");
    const tabQuarantine = getByTestId("tab-quarantine");
    expect(tabMap).toBeDefined();
    expect(tabDuplicates).toBeDefined();
    expect(tabQuarantine).toBeDefined();

    // Contenido inicial: mapa de espacio visible
    const contentMap = getByTestId("tab-content-map");
    const contentDuplicates = getByTestId("tab-content-duplicates");
    const contentQuarantine = getByTestId("tab-content-quarantine");

    expect(contentMap.style.display).toBe("flex");
    expect(contentDuplicates.style.display).toBe("none");
    expect(contentQuarantine.style.display).toBe("none");

    // Cambiar a tab de Duplicados
    fireEvent.click(tabDuplicates);
    expect(contentMap.style.display).toBe("none");
    expect(contentDuplicates.style.display).toBe("block");

    // Cambiar a tab de Cuarentena
    fireEvent.click(tabQuarantine);
    expect(contentDuplicates.style.display).toBe("none");
    expect(contentQuarantine.style.display).toBe("block");

    // Volver al mapa sin recargar
    fireEvent.click(tabMap);
    expect(contentMap.style.display).toBe("flex");
  });
});
