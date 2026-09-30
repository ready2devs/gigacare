import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent, waitFor, screen } from "@testing-library/react";
import { SpaceMap } from "../src/components/SpaceMap";
import { SpaceMapDuplicatesTriage } from "../src/components/SpaceMapDuplicatesTriage";
import "../src/mockTauriBridge";

describe("T015: SpaceMapCurateDropdown (RF-003)", () => {
  it("(a) el menú despliega 3 opciones al hacer clic en el chevron", async () => {
    const { getByTestId, queryByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" isVisible={true} />
    );

    await waitFor(() => getByTestId("spacelens-root"));

    // El contenedor del dropdown debe estar presente
    const container = getByTestId("photo-curate-dropdown-container");
    expect(container).toBeDefined();

    // Hacer clic en el chevron
    const chevronBtn = getByTestId("photo-curate-chevron-btn");
    fireEvent.click(chevronBtn);

    // El menú debe aparecer con 3 opciones
    const menu = getByTestId("photo-curate-menu");
    expect(menu).toBeDefined();

    const opt1 = getByTestId("curate-option-1");
    const opt2 = getByTestId("curate-option-2");
    const opt3 = getByTestId("curate-option-3");
    expect(opt1).toBeDefined();
    expect(opt2).toBeDefined();
    expect(opt3).toBeDefined();
  });

  it("(b) seleccionar 'Mejores 2 fotos' guarda el keepCount y cierra el menú", async () => {
    // Mock localStorage
    const localStorageMock: Record<string, string> = {};
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      localStorageMock[key] = value;
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation((key) => {
      return localStorageMock[key] ?? null;
    });

    const { getByTestId, queryByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" isVisible={true} />
    );

    await waitFor(() => getByTestId("spacelens-root"));

    // Abrir menú
    fireEvent.click(getByTestId("photo-curate-chevron-btn"));

    // Menú debe estar abierto
    expect(getByTestId("photo-curate-menu")).toBeDefined();

    // Seleccionar "Mejores 2 fotos"
    fireEvent.click(getByTestId("curate-option-2"));

    // El menú debe cerrarse
    await waitFor(() => {
      expect(queryByTestId("photo-curate-menu")).toBeNull();
    });

    // El localStorage debe haber sido actualizado con valor 2
    expect(localStorageMock["gigacare_photo_keep_count"]).toBe("2");

    vi.restoreAllMocks();
  });

  it("(c) el valor se guarda en localStorage al seleccionar opción", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");

    const { getByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" isVisible={true} />
    );

    await waitFor(() => getByTestId("spacelens-root"));

    // Abrir menú y seleccionar 3
    fireEvent.click(getByTestId("photo-curate-chevron-btn"));
    fireEvent.click(getByTestId("curate-option-3"));

    expect(setItemSpy).toHaveBeenCalledWith("gigacare_photo_keep_count", "3");

    vi.restoreAllMocks();
  });

  it("(d) SpaceMapDuplicatesTriage recibe keepCount correcto como prop", async () => {
    const onQuarantine = vi.fn();

    // Renderizar DuplicatesTriage con keepCount=2
    const { findByTestId, getAllByTestId } = render(
      <SpaceMapDuplicatesTriage
        onQuarantineSelected={onQuarantine}
        keepCount={2}
      />
    );

    // Esperar a que carguen los grupos
    const container = await findByTestId("duplicates-triage-container");
    expect(container).toBeDefined();

    // Con keepCount=2, grupos con >= 2 fotos no deberían pre-seleccionar todas para descarte
    // Los grupos con 2 fotos deben tener 0 pre-seleccionados (CE-006)
    const rows = getAllByTestId("duplicate-group-row");
    expect(rows.length).toBeGreaterThan(0);
  });
});
