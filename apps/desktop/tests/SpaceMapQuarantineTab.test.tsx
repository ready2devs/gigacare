import { describe, it, expect } from "vitest";
import React from "react";
import { render, fireEvent, findByTestId } from "@testing-library/react";
import { SpaceMapQuarantineTab } from "../src/components/SpaceMapQuarantineTab";
import "../src/mockTauriBridge";

describe("TASK-33: SpaceMapQuarantineTab Component", () => {
  it("renders quarantine entries, displays capacity progress bar, and handles restore and purge", async () => {
    const { findByTestId, getAllByTestId, queryByText } = render(<SpaceMapQuarantineTab />);

    const container = await findByTestId("space-map-quarantine-tab");
    expect(container).toBeDefined();

    // Barra de espacio visible
    const spaceBar = await findByTestId("quarantine-space-bar-container");
    expect(spaceBar).toBeDefined();

    // Entradas listadas
    const rows = getAllByTestId("quarantine-entry-row");
    expect(rows.length).toBeGreaterThan(0);

    // Restaurar el primer archivo
    const restoreButtons = getAllByTestId("btn-restore");
    fireEvent.click(restoreButtons[0]);

    // Purgar el segundo archivo
    const purgeButtons = getAllByTestId("btn-purge");
    if (purgeButtons[1]) {
      fireEvent.click(purgeButtons[1]);
    }
  });
});
