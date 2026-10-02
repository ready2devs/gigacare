import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DriveHealthPanel } from "../src/components/DriveHealthPanel";
import { SpaceRecoveryBar } from "../src/components/SpaceRecoveryBar";
import { SmartCareResults } from "../src/components/SmartCareResults";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

describe("SmartCare Resilience & Null Safety", () => {
  it("DriveHealthPanel renders fallback when data is undefined without throwing", () => {
    const onRefresh = vi.fn();
    const { container } = render(<DriveHealthPanel data={undefined} onRefresh={onRefresh} />);
    expect(container).toBeDefined();
    expect(screen.getByText("Información de salud del disco no disponible.")).toBeDefined();
  });

  it("DriveHealthPanel handles partial data safely", () => {
    const onRefresh = vi.fn();
    const partialData: any = {
      drive_label: "Disco C:",
      drive_path: "C:",
      // missing total_bytes, free_bytes, usage_percent, etc.
    };
    const { container } = render(<DriveHealthPanel data={partialData} onRefresh={onRefresh} />);
    expect(container).toBeDefined();
    expect(screen.getByText("Disco C:")).toBeDefined();
  });

  it("SpaceRecoveryBar handles undefined/NaN props without throwing", () => {
    const { container } = render(
      <SpaceRecoveryBar
        totalBytes={undefined as any}
        usedBytes={undefined as any}
        recoverableBytes={undefined as any}
      />
    );
    expect(container).toBeDefined();
    expect(screen.getByTestId("space-recovery-bar")).toBeDefined();
  });

  it("SmartCareResults handles empty/undefined analysis gracefully", () => {
    const { container } = render(
      <SmartCareResults
        analysis={null as any}
        onReview={vi.fn()}
        onExecute={vi.fn()}
        onRestart={vi.fn()}
        onRefreshDrive={vi.fn()}
      />
    );
    expect(container).toBeDefined();
    expect(screen.getByText("No hay datos de análisis disponibles.")).toBeDefined();
  });

  it("ErrorBoundary catches errors and displays fallback UI instead of blank screen", () => {
    const ThrowingComponent = () => {
      throw new Error("Simulated rendering failure");
    };

    // Prevent React from logging to console for this test
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>
    );

    expect(screen.getByTestId("error-boundary-fallback")).toBeDefined();
    expect(screen.getByText("Algo no salió como esperábamos")).toBeDefined();
    expect(screen.getByText("Reiniciar aplicación")).toBeDefined();

    consoleError.mockRestore();
  });
});
