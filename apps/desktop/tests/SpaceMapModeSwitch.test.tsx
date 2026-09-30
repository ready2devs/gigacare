import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { SpaceMapModeSwitch, DEFAULT_MODE_STORAGE_KEY } from "../src/components/SpaceMapModeSwitch";

describe("TASK-18: SpaceMapModeSwitch", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("toggles mode on click and persists state across reload in localStorage", () => {
    const onChange = vi.fn();

    const { getByTestId, unmount } = render(<SpaceMapModeSwitch onChange={onChange} />);

    const treemapBtn = getByTestId("mode-btn-treemap");
    const sunburstBtn = getByTestId("mode-btn-sunburst");

    expect(treemapBtn.getAttribute("aria-pressed")).toBe("true");
    expect(sunburstBtn.getAttribute("aria-pressed")).toBe("false");

    // Click en Sunburst
    fireEvent.click(sunburstBtn);
    expect(onChange).toHaveBeenCalledWith("sunburst");
    expect(localStorage.getItem(DEFAULT_MODE_STORAGE_KEY)).toBe("sunburst");

    unmount();

    // Simular reload montando de nuevo sin prop controlada
    const { getByTestId: getByTestIdAfterReload } = render(<SpaceMapModeSwitch />);
    const sunburstBtnReloaded = getByTestIdAfterReload("mode-btn-sunburst");
    expect(sunburstBtnReloaded.getAttribute("aria-pressed")).toBe("true");
  });
});
