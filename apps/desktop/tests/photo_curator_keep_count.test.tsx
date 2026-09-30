import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import React from "react";
import { PhotoCurator } from "../src/components/PhotoCurator";

// Mock de @tauri-apps/api/core con invoke configurable
const invokeCallLog: Array<{ cmd: string; args?: any }> = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    invokeCallLog.push({ cmd, args });
    switch (cmd) {
      case "find_photo_groups":
        return [
          {
            group_id: "test-group-01",
            similarity_method: "phash_hamming",
            avg_hamming_distance: 3,
            photos: [
              {
                path: "C:\\Photos\\IMG_001.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4200000,
                phash: "0xaabbccdd",
                ai_analysis: {
                  provider_used: "mock",
                  sharpness_score: 0.94,
                  eyes_open_score: 0.98,
                  composition_score: 0.88,
                  noise_score: 0.92,
                  total_score: 0.93,
                  rank: 1,
                  recommendation: "keep",
                },
              },
              {
                path: "C:\\Photos\\IMG_002.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4150000,
                phash: "0xaabbccde",
                ai_analysis: {
                  provider_used: "mock",
                  sharpness_score: 0.62,
                  eyes_open_score: 0.85,
                  composition_score: 0.82,
                  noise_score: 0.70,
                  total_score: 0.71,
                  rank: 2,
                  recommendation: "discard",
                },
              },
              {
                path: "C:\\Photos\\IMG_003.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4100000,
                phash: "0xaabbccdf",
                ai_analysis: {
                  provider_used: "mock",
                  sharpness_score: 0.55,
                  eyes_open_score: 0.80,
                  composition_score: 0.75,
                  noise_score: 0.60,
                  total_score: 0.65,
                  rank: 3,
                  recommendation: "discard",
                },
              },
            ],
          },
        ];
      case "analyze_all_groups_ai": {
        const kc = Number(args?.keep_count) || 1;
        return [
          {
            group_id: "test-group-01",
            similarity_method: "phash_hamming",
            avg_hamming_distance: 3,
            photos: [
              {
                path: "C:\\Photos\\IMG_001.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4200000,
                phash: "0xaabbccdd",
                ai_analysis: {
                  provider_used: "mock",
                  sharpness_score: 0.94,
                  eyes_open_score: 0.98,
                  composition_score: 0.88,
                  noise_score: 0.92,
                  total_score: 0.93,
                  rank: 1,
                  recommendation: "keep",
                },
              },
              {
                path: "C:\\Photos\\IMG_002.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4150000,
                phash: "0xaabbccde",
                ai_analysis: {
                  provider_used: "mock",
                  sharpness_score: 0.62,
                  eyes_open_score: 0.85,
                  composition_score: 0.82,
                  noise_score: 0.70,
                  total_score: 0.71,
                  rank: 2,
                  recommendation: kc >= 2 ? "keep" : "discard",
                },
              },
              {
                path: "C:\\Photos\\IMG_003.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4100000,
                phash: "0xaabbccdf",
                ai_analysis: {
                  provider_used: "mock",
                  sharpness_score: 0.55,
                  eyes_open_score: 0.80,
                  composition_score: 0.75,
                  noise_score: 0.60,
                  total_score: 0.65,
                  rank: 3,
                  recommendation: kc >= 3 ? "keep" : "discard",
                },
              },
            ],
          },
        ];
      }
      case "update_config":
        return {};
      default:
        return {};
    }
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

describe("T011: PhotoCurator keep_count persistence y opciones", () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    localStorageMock = {};
    invokeCallLog.length = 0;

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(
      (key) => localStorageMock[key] ?? null
    );
    vi.spyOn(Storage.prototype, "setItem").mockImplementation((key, value) => {
      localStorageMock[key] = String(value);
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation((key) => {
      delete localStorageMock[key];
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("(a) lee keepCount desde localStorage si está seteado", async () => {
    // Pre-setear localStorage con valor 2
    localStorageMock["gigacare_photo_keep_count"] = "2";

    const { container } = render(<PhotoCurator />);

    // El dropdown debe mostrar "2 mejores"
    await waitFor(() => {
      const dropdown = container.querySelector("[role='combobox']") ||
        Array.from(container.querySelectorAll("button")).find(b =>
          b.textContent?.includes("mejor")
        );
      expect(dropdown).toBeTruthy();
      expect(dropdown?.textContent).toContain("2");
    });
  });

  it("(b) el dropdown contiene las 3 opciones (1, 2, 3 mejores)", async () => {
    const { container } = render(<PhotoCurator />);

    // Esperar a que renderice
    await waitFor(() => {
      expect(container.querySelector(".photo-curator-container")).toBeTruthy();
    });

    // Hacer clic en el dropdown para abrirlo
    const dropdownBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("mejor")
    ) || container.querySelector("[role='combobox']");

    if (dropdownBtn) {
      await act(async () => {
        fireEvent.click(dropdownBtn as Element);
      });
    }

    // Verificar que existen las 3 opciones en el DOM o en el listbox
    await waitFor(() => {
      const allText = document.body.textContent || "";
      expect(allText).toContain("1 mejor");
      expect(allText).toContain("2 mejores");
      expect(allText).toContain("3 mejores");
    }, { timeout: 3000 });
  });

  it("(c) al seleccionar '2 mejores', actualiza localStorage e invoca update_config", async () => {
    const { container } = render(<PhotoCurator />);

    await waitFor(() => {
      expect(container.querySelector(".photo-curator-container")).toBeTruthy();
    });

    // Abrir el dropdown
    const dropdownBtn = Array.from(container.querySelectorAll("button")).find(b =>
      b.textContent?.includes("mejor")
    ) || container.querySelector("[role='combobox']");

    if (dropdownBtn) {
      await act(async () => {
        fireEvent.click(dropdownBtn as Element);
      });
    }

    // Buscar y hacer clic en la opción "2 mejores"
    await waitFor(() => {
      const opt2 = Array.from(document.querySelectorAll("[role='option']")).find(el =>
        el.textContent?.includes("2 mejores")
      );
      expect(opt2).toBeTruthy();
    }, { timeout: 3000 });

    const opt2 = Array.from(document.querySelectorAll("[role='option']")).find(el =>
      el.textContent?.includes("2 mejores")
    );
    if (opt2) {
      await act(async () => {
        fireEvent.click(opt2 as Element);
      });
    }

    // Verificar localStorage actualizado
    await waitFor(() => {
      expect(localStorageMock["gigacare_photo_keep_count"]).toBe("2");
    });

    // Verificar que se invocó update_config
    const updateConfigCall = invokeCallLog.find(c => c.cmd === "update_config");
    expect(updateConfigCall).toBeTruthy();
    expect(updateConfigCall?.args?.config?.photos?.keep_count).toBe(2);
  });

  it("(d) al hacer clic en 'Re-analizar con IA', invoca analyze_all_groups_ai con keep_count correcto", async () => {
    // Pre-setear keepCount = 2 en localStorage
    localStorageMock["gigacare_photo_keep_count"] = "2";

    const { getByText } = render(<PhotoCurator />);

    // Esperar a que los grupos carguen (para habilitar el botón)
    await waitFor(() => {
      expect(invokeCallLog.some(c => c.cmd === "find_photo_groups")).toBe(true);
    });

    // Esperar a que el botón sea visible y clickeable
    const analyzeBtn = await waitFor(() => getByText("Re-analizar con IA"));
    expect(analyzeBtn).toBeTruthy();

    // Limpiar el log de invocaciones para la verificación
    invokeCallLog.length = 0;

    await act(async () => {
      fireEvent.click(analyzeBtn);
    });

    // Verificar que se invocó analyze_all_groups_ai con keep_count: 2
    await waitFor(() => {
      const analyzeCall = invokeCallLog.find(c => c.cmd === "analyze_all_groups_ai");
      expect(analyzeCall).toBeTruthy();
      expect(analyzeCall?.args?.keep_count).toBe(2);
    });
  });
});
