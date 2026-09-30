import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { SpaceMapInspector } from "../src/components/SpaceMapInspector";

describe("TASK-22: SpaceMapInspector component", () => {
  it("renders preview, metadata, and handles action buttons", () => {
    const onOpen = vi.fn();
    const onQuarantine = vi.fn();
    const onExclude = vi.fn();

    const samplePath = "C:/Photos/sample.jpg";

    const { getByTestId, getByText } = render(
      <SpaceMapInspector
        path={samplePath}
        name="sample.jpg"
        isDirectory={false}
        previewUrl="blob:http://localhost/dummy-blob"
        mediaType="image/jpeg"
        metadata={{
          dimensions: "1920x1080",
          codec: "jpeg",
          size_bytes: 2048576,
        }}
        onOpen={onOpen}
        onQuarantine={onQuarantine}
        onExclude={onExclude}
      />
    );

    expect(getByTestId("space-map-inspector")).toBeDefined();
    expect(getByText("sample.jpg")).toBeDefined();
    expect(getByText("1920x1080")).toBeDefined();
    expect(getByText("jpeg")).toBeDefined();

    // Imagen cargada
    const img = getByTestId("inspector-preview-img") as HTMLImageElement;
    expect(img.src).toContain("dummy-blob");

    // Probar botones
    fireEvent.click(getByTestId("inspector-btn-open"));
    expect(onOpen).toHaveBeenCalledWith(samplePath);

    fireEvent.click(getByTestId("inspector-btn-quarantine"));
    expect(onQuarantine).toHaveBeenCalledWith(samplePath);

    fireEvent.click(getByTestId("inspector-btn-exclude"));
    expect(onExclude).toHaveBeenCalledWith(samplePath);
  });
});
