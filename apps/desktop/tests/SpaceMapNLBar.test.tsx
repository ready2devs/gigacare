import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { SpaceMapNLBar } from "../src/components/SpaceMapNLBar";
import "../src/mockTauriBridge";

describe("TASK-30: SpaceMapNLBar Component", () => {
  it("allows entering natural language query, pressing Enter executes query and renders toast with summary", async () => {
    const onResults = vi.fn();

    const { getByTestId, findByTestId } = render(
      <SpaceMapNLBar
        onResults={onResults}
        nodes={[
          { path: "C:\\vid.mp4", name: "vid.mp4", size_bytes: 2500000000, is_directory: false, extension: "mp4" },
        ]}
      />
    );

    const input = document.getElementById("nl-query-input-element") as HTMLInputElement;
    expect(input).toBeDefined();

    // Escribir consulta
    fireEvent.change(input, { target: { value: "videos > 1GB" } });
    expect(input.value).toBe("videos > 1GB");

    // Presionar Enter
    fireEvent.keyDown(input, { key: "Enter" });

    // Toast visible con resumen
    const toast = await findByTestId("nl-results-toast");
    expect(toast).toBeDefined();
    expect(toast.textContent).toContain("Se identificaron");
    expect(onResults).toHaveBeenCalled();
  });
});
