import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import React, { useState } from "react";
import { PhotoCurator } from "../src/components/PhotoCurator";

// Mock de Tauri invoke para evitar errores de IPC en jsdom
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue([]),
}));

// Mock de Fluent UI para simplificar el árbol de componentes en tests
vi.mock("@fluentui/react-components", () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement("button", { onClick, disabled, "data-testid": "fluent-button" }, children),
  Text: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", { "data-testid": "fluent-text" }, children),
  Badge: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", { "data-testid": "fluent-badge" }, children),
  Spinner: () => React.createElement("div", { "data-testid": "fluent-spinner" }, "Loading..."),
  Dropdown: ({ children, value }: { children: React.ReactNode; value?: string }) =>
    React.createElement("div", { "data-testid": "fluent-dropdown", "data-value": value }, children),
  Option: ({ children }: { children: React.ReactNode }) =>
    React.createElement("option", {}, children),
  FluentProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "fluent-provider" }, children),
}));

// Mock de CSS para evitar errores de importación
vi.mock("../src/components/photoCurator.css", () => ({}));

/**
 * Componente auxiliar que simula la lógica de App.tsx:
 * - PhotoCurator montado permanentemente (oculto con display:none cuando no activo)
 * - Permite cambiar módulo activo
 */
function PersistenceTestHost() {
  const [activeModule, setActiveModule] = useState<string>("photos");

  return React.createElement(
    "div",
    { "data-testid": "host" },
    // PhotoCurator siempre montado, visible solo cuando activeModule === "photos"
    React.createElement(
      "div",
      {
        "data-testid": "photo-curator-wrapper",
        style: { display: activeModule === "photos" ? "contents" : "none" },
      },
      React.createElement(PhotoCurator, {
        folderPath: "C:\\TestFolder",
      })
    ),
    // Botón para cambiar a otro módulo
    React.createElement(
      "button",
      {
        "data-testid": "switch-to-smartcare",
        onClick: () => setActiveModule("smartcare"),
      },
      "SmartCare"
    ),
    // Botón para volver a photos
    React.createElement(
      "button",
      {
        "data-testid": "switch-to-photos",
        onClick: () => setActiveModule("photos"),
      },
      "Photos"
    ),
    // Botón para cambiar a space_map
    React.createElement(
      "button",
      {
        "data-testid": "switch-to-space-map",
        onClick: () => setActiveModule("space_map"),
      },
      "Space Map"
    )
  );
}

describe("T014 - Persistencia de PhotoCurator al cambiar de módulo", () => {
  beforeEach(() => {
    // Resetear localStorage antes de cada test
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("PhotoCurator permanece montado en el DOM al cambiar de 'photos' a 'smartcare'", async () => {
    render(React.createElement(PersistenceTestHost));

    // Verificar que el wrapper de PhotoCurator existe en el DOM
    const wrapper = screen.getByTestId("photo-curator-wrapper");
    expect(wrapper).toBeInTheDocument();

    // Cambiar a smartcare
    const switchButton = screen.getByTestId("switch-to-smartcare");
    await act(async () => {
      switchButton.click();
    });

    // El wrapper (y por tanto PhotoCurator) DEBE seguir en el DOM
    expect(screen.getByTestId("photo-curator-wrapper")).toBeInTheDocument();

    // El contenido del PhotoCurator (encabezado) debe seguir presente en el DOM
    // aunque esté oculto por CSS (display:none en el wrapper)
    const curatorContainers = document.querySelectorAll(".photo-curator-container");
    expect(curatorContainers.length).toBeGreaterThan(0);
  });

  it("PhotoCurator permanece montado al cambiar de 'photos' a 'space_map'", async () => {
    render(React.createElement(PersistenceTestHost));

    const wrapper = screen.getByTestId("photo-curator-wrapper");
    expect(wrapper).toBeInTheDocument();

    // Cambiar a space_map
    const switchButton = screen.getByTestId("switch-to-space-map");
    await act(async () => {
      switchButton.click();
    });

    // El wrapper debe seguir en el DOM (PhotoCurator NO se desmonta)
    expect(screen.getByTestId("photo-curator-wrapper")).toBeInTheDocument();
  });

  it("keepCount se conserva en localStorage al alternar entre módulos", async () => {
    // Simular keepCount previo de 2 en localStorage
    localStorage.setItem("gigacare_photo_keep_count", "2");

    render(React.createElement(PersistenceTestHost));

    // Cambiar a smartcare y volver a photos
    const toSmartcare = screen.getByTestId("switch-to-smartcare");
    const toPhotos = screen.getByTestId("switch-to-photos");

    await act(async () => {
      toSmartcare.click();
    });

    await act(async () => {
      toPhotos.click();
    });

    // El valor en localStorage debe mantenerse
    expect(localStorage.getItem("gigacare_photo_keep_count")).toBe("2");
  });

  it("PhotoCurator funciona standalone sin props overrides/onOverridesChange", async () => {
    // Verificar que el componente renderiza sin props opcionales (modo standalone)
    render(
      React.createElement(PhotoCurator, {
        folderPath: "C:\\TestFolder",
      })
    );

    // El contenedor principal debe existir
    const container = document.querySelector(".photo-curator-container");
    expect(container).toBeInTheDocument();
  });

  it("PhotoCurator acepta props overrides y onOverridesChange (modo elevado)", async () => {
    const mockOverrides = {};
    const mockOnChange = vi.fn();

    // No debe lanzar error al recibir props de overrides elevados
    expect(() => {
      render(
        React.createElement(PhotoCurator, {
          folderPath: "C:\\TestFolder",
          overrides: mockOverrides,
          onOverridesChange: mockOnChange,
        })
      );
    }).not.toThrow();

    const container = document.querySelector(".photo-curator-container");
    expect(container).toBeInTheDocument();
  });
});
