import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useInspector } from "../src/hooks/useInspector";
import "../src/mockTauriBridge";

describe("TASK-21: useInspector hook", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates state upon selecting a file, manages Blob URL, and handles directories", async () => {
    const { result } = renderHook(() => useInspector());

    expect(result.current.path).toBeNull();

    // 1. Seleccionar un archivo de imagen
    await act(async () => {
      await result.current.selectItem("C:\\Photos\\cat.jpg", false, 50000);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.path).toBe("C:\\Photos\\cat.jpg");
    expect(result.current.name).toBe("cat.jpg");
    expect(result.current.isDirectory).toBe(false);
    expect(result.current.previewUrl).toBeTruthy();
    expect(result.current.metadata).toBeDefined();
    expect(result.current.metadata?.dimensions).toBe("1920x1080");

    // 2. Seleccionar un directorio
    await act(async () => {
      await result.current.selectItem("C:\\Photos", true, 100000);
    });

    expect(result.current.path).toBe("C:\\Photos");
    expect(result.current.isDirectory).toBe(true);
    expect(result.current.previewUrl).toBeNull();
    expect(result.current.metadata?.size_bytes).toBe(100000);

    // 3. Limpiar selección
    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.path).toBeNull();
    expect(result.current.previewUrl).toBeNull();
  });
});
