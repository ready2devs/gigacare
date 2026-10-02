import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BrowserCacheSection } from "../src/components/BrowserCacheSection";
import { PrefetchSection } from "../src/components/PrefetchSection";
import { BrowserCacheProfile, JunkCategory } from "../src/types/models";
import "../src/mockTauriBridge";

describe("T025: Browser and Prefetch Cleanup Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("(a) clean_browser_cache envía todas las cachés a cuarentena y actualiza UI", async () => {
    const mockBrowsers: BrowserCacheProfile[] = [
      {
        browser_name: "Google Chrome",
        browser_id: "chrome",
        installed: true,
        total_all_profiles_bytes: 1800000000,
        profiles: [
          {
            profile_name: "Default",
            profile_path: "C:\\Chrome",
            total_size_bytes: 1800000000,
            cache_entries: [
              {
                cache_type: "cache",
                display_name: "Caché principal",
                path: "C:\\Chrome\\Cache_Data",
                size_bytes: 1800000000,
                safe: true,
              },
            ],
          },
        ],
      },
    ];

    const onCleanComplete = vi.fn();
    render(<BrowserCacheSection browsers={mockBrowsers} onCleanComplete={onCleanComplete} />);

    expect(screen.getByText("Google Chrome")).toBeDefined();
    const cleanBtn = screen.getByText(/Limpiar todo de forma segura/);
    fireEvent.click(cleanBtn);

    await waitFor(() => {
      expect(screen.getByText(/Caché de Google Chrome limpiada con éxito/)).toBeDefined();
      expect(onCleanComplete).toHaveBeenCalled();
    });
  });

  it("(b) banner de advertencia para cerrar navegadores se muestra de forma visible", () => {
    const mockBrowsers: BrowserCacheProfile[] = [
      {
        browser_name: "Microsoft Edge",
        browser_id: "edge",
        installed: true,
        total_all_profiles_bytes: 500000000,
        profiles: [],
      },
    ];

    render(<BrowserCacheSection browsers={mockBrowsers} />);
    expect(
      screen.getByText(/Cierra el navegador antes de borrar su caché; los navegadores abiertos pueden recrear o bloquear archivos/)
    ).toBeDefined();
  });

  it("(c) prefetch muestra advertencia explicativa sobre ralentización del sistema", () => {
    const mockPrefetch: JunkCategory = {
      category_id: "prefetch",
      display_name: "Prefetch",
      total_bytes: 150000000,
      safe_bytes: 0,
      informational: true,
      items: [
        {
          id: "pf-1",
          display_name: "APP.EXE-12345.pf",
          path: "C:\\Windows\\Prefetch\\APP.EXE-12345.pf",
          size_bytes: 150000000,
          safe: false,
        },
      ],
    };

    render(<PrefetchSection category={mockPrefetch} />);
    expect(
      screen.getByText(/Windows usa estos datos para acelerar el inicio de tus programas/)
    ).toBeDefined();
    expect(screen.getAllByText("Revisar").length).toBeGreaterThan(0);
  });

  it("(d) confirmación preventiva para limpieza manual de Prefetch", async () => {
    const mockPrefetch: JunkCategory = {
      category_id: "prefetch",
      display_name: "Prefetch",
      total_bytes: 150000000,
      safe_bytes: 0,
      informational: true,
      items: [],
    };

    const onCleanItems = vi.fn();
    render(<PrefetchSection category={mockPrefetch} onCleanItems={onCleanItems} />);

    const cleanPrefetchBtn = screen.getByText("Limpiar con precaución");
    fireEvent.click(cleanPrefetchBtn);

    await waitFor(() => {
      expect(screen.getByText("Confirmar y Mover")).toBeDefined();
    });

    const confirmBtn = screen.getByText("Confirmar y Mover");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(onCleanItems).toHaveBeenCalled();
    });
  });
});
