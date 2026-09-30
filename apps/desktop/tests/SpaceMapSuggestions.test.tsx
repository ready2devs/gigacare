import { describe, it, expect } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SpaceMap } from "../src/components/SpaceMap";
import "../src/mockTauriBridge";

describe("TASK-36: SpaceMap Smart Adaptive Suggestions Integration", () => {
  it("displays suggestions badge, and clicking opens toast with automatic isolation prompt", async () => {
    const { findByTestId, getByTestId, queryByTestId } = render(
      <SpaceMap initialMode="explored" initialTab="map" />
    );

    // Esperar a que build_space_map y suggest_auto_rules se resuelvan (el mock de build_space_map tiene delay)
    const badge = await findByTestId("badge-auto-rules", {}, { timeout: 6000 });
    expect(badge).toBeDefined();
    expect(badge.textContent).toContain("sugerencias");

    // Click en el badge
    fireEvent.click(badge);

    // Toast visible con prompt "¿Deseas aislar automáticamente los N archivos identificados?"
    const toast = await findByTestId("toast-auto-suggest");
    expect(toast).toBeDefined();
    expect(toast.textContent).toContain("¿Deseas aislar automáticamente los");

    // Click en Aislar automáticamente
    const btnIsolate = getByTestId("btn-confirm-auto-isolate");
    fireEvent.click(btnIsolate);

    // Toast de sugerencias cerrado
    await waitFor(() => {
      expect(queryByTestId("toast-auto-suggest")).toBeNull();
    });
  });
});
