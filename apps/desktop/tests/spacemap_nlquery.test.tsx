import { describe, it, expect } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SpaceMap } from "../src/components/SpaceMap";
import "../src/mockTauriBridge";

describe("TASK-45: SpaceMap NL Query Integration", () => {
  it("enters query in NLBar, mock returns results, and toast displays matched results", async () => {
    const { findByTestId, getByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" />
    );

    // Esperar a que el contenedor principal esté listo
    const root = await findByTestId("spacelens-root");
    expect(root).toBeDefined();

    // Encontrar el input de la barra de lenguaje natural
    const inputElement = document.getElementById("nl-query-input-element") as HTMLInputElement;
    expect(inputElement).toBeDefined();

    // Ingresar consulta
    fireEvent.change(inputElement, { target: { value: "videos mayores a 1GB" } });
    expect(inputElement.value).toBe("videos mayores a 1GB");

    // Presionar Enter para ejecutar la consulta
    fireEvent.keyDown(inputElement, { key: "Enter" });

    // Toast de resultados de NL visible con resumen
    const toast = await findByTestId("nl-results-toast");
    expect(toast).toBeDefined();
    expect(toast.textContent).toContain("Se identificaron");
  });
});
