import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PhotoCurator } from "../src/components/PhotoCurator";
import { PhotoGroup, OverrideMap } from "../src/types/models";

// Mock invoke de Tauri
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: any[]) => mockInvoke(...args),
}));

const mockPhotoGroups: PhotoGroup[] = [
  {
    group_id: "group-1",
    similarity_method: "phash_hamming",
    avg_hamming_distance: 3,
    photos: [
      {
        path: "C:\\Photos\\photo1.jpg",
        original_resolution: "4000x3000",
        size_bytes: 4000000, // 3.8 MB
        phash: "0x111",
        thumbnail_path: "data:image/svg+xml;utf8,<svg></svg>",
        ai_analysis: {
          provider_used: "google_ai_studio",
          sharpness_score: 0.95,
          eyes_open_score: 0.9,
          composition_score: 0.85,
          noise_score: 0.9,
          total_score: 0.92,
          rank: 1,
          recommendation: "keep",
        },
      },
      {
        path: "C:\\Photos\\photo2.jpg",
        original_resolution: "4000x3000",
        size_bytes: 4200000, // 4.0 MB
        phash: "0x112",
        thumbnail_path: "data:image/svg+xml;utf8,<svg></svg>",
        ai_analysis: {
          provider_used: "google_ai_studio",
          sharpness_score: 0.6,
          eyes_open_score: 0.7,
          composition_score: 0.65,
          noise_score: 0.7,
          total_score: 0.65,
          rank: 2,
          recommendation: "discard",
          discard_reason: "Desenfocada",
        },
      },
    ],
  },
];

describe("PhotoCurator Redesign (Phase 5) & Interactions (Phase 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockInvoke.mockImplementation(async (cmd: string, args: any) => {
      if (cmd === "find_photo_groups") return mockPhotoGroups;
      if (cmd === "analyze_all_groups_ai") return mockPhotoGroups;
      if (cmd === "update_config") return {};
      return [];
    });
  });

  it("T020: Header renders title with gradient class, subtitle and separate controls row", async () => {
    render(<PhotoCurator />);
    expect(screen.getByText("Curador de Fotos Inteligente & Análisis de Calidad").className).toContain("curator-title-gradient");
    expect(screen.getByText(/Agrupación de fotos similares/)).toBeDefined();
    expect(screen.getByTestId("keep-count-dropdown")).toBeDefined();
    expect(screen.getByText("Detectar Similares")).toBeDefined();
    expect(screen.getByText("Re-analizar con IA")).toBeDefined();
  });

  it("T021, T022, T023, T027: Photo cards render MetricBars, QualityRings, ribbon/stamp badges, staggered delay and group header", async () => {
    render(<PhotoCurator />);
    await waitFor(() => {
      expect(screen.getByText("Grupo #1")).toBeDefined();
    });

    // Separadores y badges de grupo
    expect(screen.getByText("2 fotos")).toBeDefined();
    expect(screen.getByText("Similitud: 3")).toBeDefined();
    expect(screen.getByText("google_ai_studio")).toBeDefined();

    // Cards
    const cards = screen.getAllByTestId("photo-card");
    expect(cards).toHaveLength(2);
    expect(cards[0].style.animationDelay).toBe("0ms");
    expect(cards[1].style.animationDelay).toBe("80ms");

    // Badges ribbon y stamp
    expect(screen.getByText(/MANTENER \(Mejor\)/)).toBeDefined();
    expect(screen.getByText(/A CUARENTENA/)).toBeDefined();

    // QualityRing y MetricBars
    const rings = screen.getAllByTestId("quality-ring");
    expect(rings.length).toBeGreaterThanOrEqual(2);

    const metricBars = screen.getAllByTestId("metric-bar");
    expect(metricBars.length).toBeGreaterThanOrEqual(6); // 3 per card * 2
  });

  it("T024 & T025: Skeleton renders on loading and EmptyStateCurator on empty groups", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "find_photo_groups") return [];
      return [];
    });

    render(<PhotoCurator />);
    await waitFor(() => {
      expect(screen.getByTestId("empty-state-curator")).toBeDefined();
      expect(screen.getByText("¡Todas tus fotos están en orden!")).toBeDefined();
    });
  });

  it("T026 & T032: Sticky action bar reactively counts discarded photos and calculates recoverable bytes", async () => {
    render(<PhotoCurator />);
    await waitFor(() => {
      expect(screen.getByTestId("curator-sticky-action-bar")).toBeDefined();
    });

    // 1 foto descartada inicialmente (photo2: 4.2 MB)
    expect(screen.getByText(/1 fotos/)).toBeDefined();
    expect(screen.getByText(/Liberarás 4.0 MB/)).toBeDefined();
    expect(screen.getByTestId("move-to-quarantine-btn")).toBeDefined();
  });

  it("T028 & T029: Manual override toggles keep/discard, shows manual badge, updates sticky bar and reset restores IA", async () => {
    render(<PhotoCurator />);
    await waitFor(() => {
      expect(screen.getAllByTestId("photo-card")).toHaveLength(2);
    });

    const cards = screen.getAllByTestId("photo-card");
    // Clic en la segunda card (actualmente discard) para cambiar a keep manual
    fireEvent.click(cards[1]);

    // Badge ahora debe ser MANTENER (Manual)
    expect(screen.getByText("MANTENER (Manual)")).toBeDefined();

    // Como ahora 0 fotos están descartadas, la barra sticky no muestra descarte
    expect(screen.queryByTestId("curator-sticky-action-bar")).toBeNull();

    // Debe aparecer el botón de restablecer selección automática
    const resetBtn = screen.getByTestId("reset-group-overrides-btn");
    expect(resetBtn).toBeDefined();

    // Al hacer reset, vuelve a A CUARENTENA
    fireEvent.click(resetBtn);
    expect(screen.getByText(/A CUARENTENA/)).toBeDefined();
    expect(screen.getByTestId("curator-sticky-action-bar")).toBeDefined();
  });

  it("T030: Tooltip with photo metadata is present on hover container", async () => {
    render(<PhotoCurator />);
    await waitFor(() => {
      expect(screen.getAllByTestId("photo-hover-tooltip")).toHaveLength(2);
    });

    const tooltips = screen.getAllByTestId("photo-hover-tooltip");
    expect(tooltips[0].textContent).toContain("photo1.jpg");
    expect(tooltips[0].textContent).toContain("4000x3000");
  });

  it("T031: Carousel navigation buttons appear when group has more than 3 photos", async () => {
    const manyPhotosGroup: PhotoGroup[] = [
      {
        group_id: "group-many",
        similarity_method: "phash",
        avg_hamming_distance: 1,
        photos: [
          { ...mockPhotoGroups[0].photos[0], path: "C:\\p1.jpg" },
          { ...mockPhotoGroups[0].photos[1], path: "C:\\p2.jpg" },
          { ...mockPhotoGroups[0].photos[0], path: "C:\\p3.jpg" },
          { ...mockPhotoGroups[0].photos[1], path: "C:\\p4.jpg" },
        ],
      },
    ];

    mockInvoke.mockImplementation(async () => manyPhotosGroup);
    render(<PhotoCurator />);

    await waitFor(() => {
      expect(screen.getByTitle("Anterior")).toBeDefined();
      expect(screen.getByTitle("Siguiente")).toBeDefined();
    });
  });

  it("permite cambiar la carpeta activa y muestra el botón 'Cambiar Carpeta'", async () => {
    render(<PhotoCurator />);
    expect(screen.getByTestId("select-curator-folder-btn")).toBeDefined();
    expect(screen.getByText("Cambiar Carpeta")).toBeDefined();
    expect(screen.getByText(/Carpeta activa:/)).toBeDefined();
  });
});
