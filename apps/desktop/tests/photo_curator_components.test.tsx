import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MetricBar } from "../src/components/MetricBar";
import { QualityRing } from "../src/components/QualityRing";
import { SkeletonPhotoCard } from "../src/components/SkeletonPhotoCard";
import { EmptyStateCurator } from "../src/components/EmptyStateCurator";

describe("Phase 4 Base Components", () => {
  it("MetricBar renders label, percentage and applies semantic colors", () => {
    const { rerender } = render(<MetricBar label="Nitidez" value={0.9} />);
    expect(screen.getByText("Nitidez")).toBeDefined();
    expect(screen.getByText("90%")).toBeDefined();
    expect(screen.getByTestId("metric-bar-fill").className).toContain("green");

    rerender(<MetricBar label="Claridad facial" value={0.65} />);
    expect(screen.getByText("65%")).toBeDefined();
    expect(screen.getByTestId("metric-bar-fill").className).toContain("amber");

    rerender(<MetricBar label="Calidad Total" value={0.3} size="lg" />);
    expect(screen.getByText("30%")).toBeDefined();
    expect(screen.getByTestId("metric-bar-fill").className).toContain("red");
  });

  it("MetricBar clamps extreme values (0% and 100%)", () => {
    const { rerender } = render(<MetricBar label="Extremo Bajo" value={-0.5} />);
    expect(screen.getByText("0%")).toBeDefined();

    rerender(<MetricBar label="Extremo Alto" value={1.5} />);
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("QualityRing renders SVG with 0%, 50%, 75%, 100%", () => {
    const { rerender } = render(<QualityRing score={0} />);
    expect(screen.getByText("0%")).toBeDefined();

    rerender(<QualityRing score={0.5} />);
    expect(screen.getByText("50%")).toBeDefined();

    rerender(<QualityRing score={0.75} />);
    expect(screen.getByText("75%")).toBeDefined();

    rerender(<QualityRing score={1} />);
    expect(screen.getByText("100%")).toBeDefined();
  });

  it("SkeletonPhotoCard renders shimmer placeholder", () => {
    render(<SkeletonPhotoCard />);
    expect(screen.getByTestId("skeleton-photo-card")).toBeDefined();
  });

  it("EmptyStateCurator renders SVG illustration, title, subtitle and optional button", () => {
    const onScan = vi.fn();
    render(<EmptyStateCurator onScanAnotherFolder={onScan} />);
    expect(screen.getByTestId("empty-state-camera-svg")).toBeDefined();
    expect(screen.getByText("¡Todas tus fotos están en orden!")).toBeDefined();
    expect(screen.getByText("No se detectaron duplicados ni fotos desenfocadas.")).toBeDefined();

    const btn = screen.getByText("Escanear otra carpeta");
    fireEvent.click(btn);
    expect(onScan).toHaveBeenCalledTimes(1);
  });
});
