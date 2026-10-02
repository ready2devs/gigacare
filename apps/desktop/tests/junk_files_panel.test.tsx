import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JunkFilesPanel } from "../src/components/JunkFilesPanel";
import "../src/mockTauriBridge";

describe("T014: JunkFilesPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) renderiza header con título 'Archivos Basura' y botón 'Re-escanear'", async () => {
    render(<JunkFilesPanel />);
    expect(screen.getByText("Archivos Basura")).toBeDefined();
    expect(screen.getByText("Re-escanear")).toBeDefined();
  });

  it("(b) renderiza el área de escaneo y resumen de estado", async () => {
    render(<JunkFilesPanel />);
    expect(screen.getByText("Basura encontrada")).toBeDefined();
    await waitFor(() => {
      expect(screen.getByText("Archivos Temporales")).toBeDefined();
    });
  });

  it("(c) muestra resumen total de basura encontrada tras escaneo", async () => {
    render(<JunkFilesPanel />);
    await waitFor(() => {
      // 8520000000 bytes = 7.93 GB
      expect(screen.getByText("7.93 GB")).toBeDefined();
    });
  });

  it("(d) renderiza todas las categorías como acordeón", async () => {
    render(<JunkFilesPanel />);
    await waitFor(() => {
      expect(screen.getByText("Archivos Temporales")).toBeDefined();
      expect(screen.getByText("Restos de Windows")).toBeDefined();
      expect(screen.getByText("Instaladores en Descargas")).toBeDefined();
      expect(screen.getByText("Cachés de Navegadores")).toBeDefined();
      expect(screen.getByText("Cachés de Mensajería")).toBeDefined();
      expect(screen.getByText("Residuales de Aplicaciones")).toBeDefined();
      expect(screen.getByText("Prefetch")).toBeDefined();
    });
  });

  it("(e) expandir y colapsar categoría funciona", async () => {
    render(<JunkFilesPanel />);
    await waitFor(() => {
      expect(screen.getByText("Instaladores en Descargas")).toBeDefined();
    });

    const categoryHeader = screen.getByText("Instaladores en Descargas");
    // Hacer clic para expandir
    fireEvent.click(categoryHeader);

    await waitFor(() => {
      expect(screen.getByText("Git-2.46.0-64-bit.exe")).toBeDefined();
    });

    // Hacer clic para colapsar
    fireEvent.click(categoryHeader);
    await waitFor(() => {
      expect(screen.queryByText("Git-2.46.0-64-bit.exe")).toBeNull();
    });
  });

  it("(f) badges 'Seguro' vs 'Revisar' se muestran correctamente", async () => {
    render(<JunkFilesPanel focusCategory="temp_files" />);
    await waitFor(() => {
      expect(screen.getByText("tmp_001.tmp")).toBeDefined();
    });
    // Los elementos seguros tienen badge "Seguro"
    const safeBadges = screen.getAllByText("Seguro");
    expect(safeBadges.length).toBeGreaterThan(0);
  });

  it("(g) botón 'Limpiar elementos seguros' abre PreviewPanel con ítems filtrados", async () => {
    render(<JunkFilesPanel focusCategory="temp_files" />);
    await waitFor(() => {
      expect(screen.getAllByText(/Limpiar elementos seguros/).length).toBeGreaterThan(0);
    });

    const cleanSafeBtn = screen.getAllByText(/Limpiar elementos seguros/)[0];
    fireEvent.click(cleanSafeBtn);

    // Debe abrir PreviewPanel con los botones Confirmar / Cancelar
    await waitFor(() => {
      expect(screen.getAllByText(/Confirmar|Aislar en Cuarentena|Cancelar/).length).toBeGreaterThan(0);
    });
  });

  it("(h) botón 'Re-escanear' refresca datos", async () => {
    render(<JunkFilesPanel />);
    await waitFor(() => {
      expect(screen.getByText("Re-escanear")).toBeDefined();
    });

    const rescanBtn = screen.getByText("Re-escanear");
    fireEvent.click(rescanBtn);

    await waitFor(() => {
      expect(screen.getByText("Archivos Temporales")).toBeDefined();
    });
  });

  it("(i) prop focusCategory auto-expande la categoría correcta", async () => {
    render(<JunkFilesPanel focusCategory="messaging_cache" />);
    await waitFor(() => {
      expect(screen.getByText("media_1.mp4")).toBeDefined();
    });
  });
});
