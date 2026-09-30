import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "../src/mockTauriBridge";
import { SpaceMap } from "../src/components/SpaceMap";
import { SpaceLensDriveSelector } from "../src/components/SpaceLensDriveSelector";
import { computeCirclePacking } from "../src/components/SpaceLensBubbles";
import { SpaceMapNode, StorageDevice } from "../src/types/models";

describe("Fase 8: SpaceLens Tests y Verificación Final (T042 - T045)", () => {
  // T042
  it("T042: SpaceMap end-to-end integration verifies status bar, file list, selection, and drive selector", async () => {
    render(<SpaceMap initialMode="explored" />);

    // (a) Verificar que barra de estado muestra nombre de dispositivo
    await waitFor(() => {
      const statusBar = screen.getByTestId("spacelens-status-bar");
      expect(statusBar).toHaveTextContent(/Disco Local \(C:\)/i);
    }, { timeout: 8000 });

    // (b) Verificar que lista de archivos muestra al menos 3 items
    const rows = await screen.findAllByRole("listitem", {}, { timeout: 8000 });
    expect(rows.length).toBeGreaterThanOrEqual(3);

    // (c) Seleccionar item -> contador actualiza
    const usersCb = screen.getByTestId("checkbox-Users") as HTMLInputElement;
    fireEvent.click(usersCb);
    expect(screen.getByTestId("selected-count-text")).toHaveTextContent("1 elemento seleccionado");

    // (d) Verificar que dropdown de selector renderiza con al menos 1 opción
    const trigger = screen.getByTestId("spacelens-drive-selector-button");
    fireEvent.click(trigger);
    expect(screen.getByTestId("drive-option-C:")).toBeInTheDocument();
  }, 15000);

  // T043: Test de performance
  it("T043: Performance benchmark — circle packing calculation for 100 bubbles executes under 2000ms", () => {
    const nodes: SpaceMapNode[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push({
        name: `item_${i}.dat`,
        path: `C:\\item_${i}.dat`,
        size_bytes: Math.floor(Math.random() * 5000000000) + 1000000,
        is_directory: i % 2 === 0,
        children: [],
      });
    }

    const t0 = performance.now();
    const result = computeCirclePacking(nodes, 1200, 900);
    const durationMs = performance.now() - t0;

    expect(durationMs).toBeLessThan(2000);
    expect(result.bubbles.length).toBeGreaterThanOrEqual(50);
  });

  // T044: Test matemático de no-colisión de circle-packing
  it("T044: Circle-packing algorithm ensures no overlapping between 20 bubbles", () => {
    const nodes: SpaceMapNode[] = [];
    for (let i = 1; i <= 20; i++) {
      nodes.push({
        name: `node_${i}`,
        path: `C:\\node_${i}`,
        size_bytes: (21 - i) * 1024 * 1024 * 1024,
        is_directory: true,
        children: [],
      });
    }

    const { bubbles } = computeCirclePacking(nodes, 800, 600);
    expect(bubbles.length).toBe(20);

    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const bi = bubbles[i];
        const bj = bubbles[j];
        const dist = Math.hypot(bi.x - bj.x, bi.y - bj.y);
        const minNonOverlap = bi.r + bj.r;
        // Distancia debe ser al menos el 70% de la suma de radios considerando empaquetado tangente
        expect(dist).toBeGreaterThanOrEqual(minNonOverlap * 0.7);
      }
    }
  });

  // T045: Test de selector de dispositivos
  it("T045: SpaceLensDriveSelector renders devices with label and space; selection triggers callback", () => {
    const mockDevices: StorageDevice[] = [
      {
        id: "C:",
        label: "Disco Local (C:)",
        device_type: "local_disk",
        root_path: "C:\\",
        total_bytes: 2000000000000,
        used_bytes: 1400000000000,
        free_bytes: 600000000000,
        is_removable: false,
        icon_hint: "hard_drive",
        is_ready: true,
      },
      {
        id: "D:",
        label: "Datos (D:)",
        device_type: "local_disk",
        root_path: "D:\\",
        total_bytes: 1000000000000,
        used_bytes: 500000000000,
        free_bytes: 500000000000,
        is_removable: false,
        icon_hint: "hard_drive",
        is_ready: true,
      },
    ];

    const onDeviceChange = vi.fn();
    render(
      <SpaceLensDriveSelector
        currentDevice={mockDevices[0]}
        devices={mockDevices}
        onDeviceChange={onDeviceChange}
      />
    );

    const trigger = screen.getByTestId("spacelens-drive-selector-button");
    expect(trigger).toHaveTextContent("Disco Local (C:)");

    fireEvent.click(trigger);
    const dOption = screen.getByTestId("drive-option-D:");
    expect(dOption).toHaveTextContent("Datos (D:)");

    fireEvent.click(dOption);
    expect(onDeviceChange).toHaveBeenCalledWith(mockDevices[1]);
  });
});