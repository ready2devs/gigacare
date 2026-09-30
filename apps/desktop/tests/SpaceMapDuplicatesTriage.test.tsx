import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SpaceMapDuplicatesTriage } from "../src/components/SpaceMapDuplicatesTriage";
import "../src/mockTauriBridge";

describe("TASK-32: SpaceMapDuplicatesTriage Component", () => {
  it("renders duplicate groups, allows toggling discard status on click, and triggers isolate button", async () => {
    const onQuarantine = vi.fn();

    const { getAllByTestId, getByTestId, findByTestId } = render(
      <SpaceMapDuplicatesTriage onQuarantineSelected={onQuarantine} />
    );

    // Esperar a que carguen los grupos
    const container = await findByTestId("duplicates-triage-container");
    expect(container).toBeDefined();

    const rows = getAllByTestId("duplicate-group-row");
    expect(rows.length).toBeGreaterThan(0);

    const cards = getAllByTestId("duplicate-card");
    expect(cards.length).toBeGreaterThan(0);

    // Click en la primera tarjeta para alternar su estado
    const firstCard = cards[0];
    const initialStatus = firstCard.getAttribute("data-status");
    fireEvent.click(firstCard);
    expect(firstCard.getAttribute("data-status")).not.toBe(initialStatus);

    // Click en el botón Aislar seleccionados
    const isolateBtn = getByTestId("btn-isolate-selected");
    expect(isolateBtn).toBeDefined();
    fireEvent.click(isolateBtn);

    expect(onQuarantine).toHaveBeenCalled();
  });
});
