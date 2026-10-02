import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { SmartCareWelcome } from "../src/components/SmartCareWelcome";

describe("T020: SmartCareWelcome", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renderiza título '¡Bienvenido!'", () => {
    const { getByRole } = render(<SmartCareWelcome onAnalyze={vi.fn()} />);
    const heading = getByRole("heading", { level: 1 });
    expect(heading).toBeDefined();
    expect(heading.textContent).toBe("¡Bienvenido!");
  });

  it("renderiza subtítulo completo", () => {
    const { getByText } = render(<SmartCareWelcome onAnalyze={vi.fn()} />);
    const sub = getByText("¿Quieres analizar tu sistema a fondo? Será rápido.");
    expect(sub).toBeDefined();
  });

  it("renderiza botón 'Analizar' sin análisis previo", () => {
    const { getByTestId } = render(<SmartCareWelcome onAnalyze={vi.fn()} />);
    const btn = getByTestId("analyze-btn");
    expect(btn.textContent).toBe("Analizar");
  });

  it("clic en botón llama onAnalyze después de la transición de 400ms", () => {
    const onAnalyze = vi.fn();
    const { getByTestId } = render(<SmartCareWelcome onAnalyze={onAnalyze} />);
    const btn = getByTestId("analyze-btn");

    fireEvent.click(btn);
    expect(onAnalyze).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it("si lastAnalysisHours > 0, muestra texto de último análisis y botón 'Analizar de nuevo'", () => {
    const { getByTestId, getByText } = render(
      <SmartCareWelcome onAnalyze={vi.fn()} lastAnalysisHours={5} />
    );
    const info = getByTestId("last-analysis-info");
    expect(info.textContent).toContain("Último análisis hace 5 horas");

    const btn = getByText("Analizar de nuevo");
    expect(btn).toBeDefined();
  });
});
