import { describe, it, expect } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useNLQuery } from "../src/hooks/useNLQuery";
import "../src/mockTauriBridge";

describe("TASK-31: useNLQuery Hook", () => {
  it("transitions across states: idle -> loading -> results and clears state", async () => {
    const { result } = renderHook(() => useNLQuery());

    // 1. Estado inicial idle
    expect(result.current.loading).toBe(false);
    expect(result.current.result).toBeNull();
    expect(result.current.highlightedPaths.length).toBe(0);
    expect(result.current.error).toBeNull();

    // 2. Modificar query string
    act(() => {
      result.current.setQuery("videos mayores a 1GB");
    });
    expect(result.current.query).toBe("videos mayores a 1GB");

    // 3. Ejecutar consulta asíncrona
    await act(async () => {
      await result.current.executeQuery();
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.result).toBeDefined();
    expect(result.current.highlightedPaths.length).toBeGreaterThan(0);
    expect(result.current.error).toBeNull();

    // 4. Limpiar consulta
    act(() => {
      result.current.clearQuery();
    });

    expect(result.current.query).toBe("");
    expect(result.current.result).toBeNull();
    expect(result.current.highlightedPaths.length).toBe(0);
  });
});
