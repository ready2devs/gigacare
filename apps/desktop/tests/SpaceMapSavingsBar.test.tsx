import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { SpaceMapSavingsBar } from "../src/components/SpaceMapSavingsBar";

describe("TASK-23: SpaceMapSavingsBar component", () => {
  it("displays correct formatted savings for folder and disk with real-time updates", () => {
    const { getByTestId, getAllByText, getByText, rerender } = render(
      <SpaceMapSavingsBar
        selectedBytes={4.2 * 1024 * 1024 * 1024}
        folderTotalBytes={10 * 1024 * 1024 * 1024}
        diskTotalBytes={2 * 1024 * 1024 * 1024 * 1024}
        diskName="Disco C:"
      />
    );

    expect(getByTestId("space-map-savings-bar")).toBeDefined();
    expect(getAllByText("4.2 GB").length).toBe(2);
    expect(getByText("2 TB")).toBeDefined();
    expect(getByText("+0.21% libre")).toBeDefined();

    // Rerender simulando cambio en la selección
    rerender(
      <SpaceMapSavingsBar
        selectedBytes={10 * 1024 * 1024 * 1024}
        folderTotalBytes={10 * 1024 * 1024 * 1024}
        diskTotalBytes={2 * 1024 * 1024 * 1024 * 1024}
        diskName="Disco C:"
      />
    );

    expect(getAllByText("10 GB").length).toBe(2);
    expect(getByText("100%")).toBeDefined();
    expect(getByText("+0.49% libre")).toBeDefined();
  });
});
