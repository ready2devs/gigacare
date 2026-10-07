import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../src/App";
import "../src/mockTauriBridge";

describe("T025: Junk Files Full E2E Flow in App", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "Test", "/");
  });

  it("flujo completo: abrir módulo, escanear, inspeccionar categorías y limpiar elementos seguros", async () => {
    render(<App />);

    // (a) Abrir módulo Junk Files -> clic en barra lateral
    const junkBtn = screen.getByText("Archivos Basura");
    fireEvent.click(junkBtn);

    // Esperar a que renderice JunkFilesPanel y ejecute el escaneo
    await waitFor(() => {
      expect(screen.getByText("No cachés — archivos olvidados que ocupan espacio silenciosamente")).toBeDefined();
    });

    // (b) Resumen total muestra tamaño y total de elementos encontrados
    await waitFor(() => {
      expect(screen.getByText("Basura encontrada")).toBeDefined();
      expect(screen.getByText(/Espacio recuperable/)).toBeDefined();
    });

    // (c) Verificar categoría "Archivos Temporales" (expandida por defecto) y sus items y badges
    await waitFor(() => {
      expect(screen.getByText("tmp_001.tmp")).toBeDefined();
      expect(screen.getAllByText("Seguro").length).toBeGreaterThan(0);
    });

    // (g) Categoría "Cachés de Navegadores" (expandida por defecto) muestra navegadores
    await waitFor(() => {
      expect(screen.getByText("Google Chrome")).toBeDefined();
      expect(screen.getByText("Microsoft Edge")).toBeDefined();
    });

    // (h) Categoría Prefetch (colapsada por defecto): expandirla y verificar badge "Revisar" y texto
    const prefetchCategory = screen.getByText("Prefetch");
    expect(prefetchCategory).toBeDefined();
    fireEvent.click(prefetchCategory);

    await waitFor(() => {
      expect(screen.getByText(/Windows usa estos datos para acelerar el inicio de tus programas/)).toBeDefined();
      expect(screen.getAllByText("Revisar").length).toBeGreaterThan(0);
    });

    // (d) Clic en "Limpiar elementos seguros" -> abre PreviewPanel con ítems filtrados
    expect(screen.getAllByText(/Limpiar elementos seguros/).length).toBeGreaterThan(0);
    const cleanSafeBtn = screen.getAllByText(/Limpiar elementos seguros/)[0];
    fireEvent.click(cleanSafeBtn);

    // Abre PreviewPanel vista previa
    await waitFor(() => {
      expect(screen.getByText("Vista Previa de Limpieza")).toBeDefined();
    });

    // Clic en "Confirmar Limpieza" dentro de PreviewPanel
    const previewCleanBtn = screen.getByText(/Confirmar Limpieza/);
    fireEvent.click(previewCleanBtn);

    // (e) Diálogo de doble confirmación aparece
    await waitFor(() => {
      expect(screen.getByText("Confirmar y Mover")).toBeDefined();
    });

    const confirmMoverBtn = screen.getByText("Confirmar y Mover");
    fireEvent.click(confirmMoverBtn);

    // (f) Se cierra PreviewPanel y se regresa a JunkFilesPanel con feedback de éxito
    await waitFor(() => {
      expect(screen.getByText(/Limpieza completada/)).toBeDefined();
      expect(screen.getByText("No cachés — archivos olvidados que ocupan espacio silenciosamente")).toBeDefined();
    });
  });
});
