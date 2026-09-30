import { describe, it, expect } from "vitest";
import es from "../src/locales/es.json";
import en from "../src/locales/en.json";

describe("TASK-47: i18n Locales for SpaceMap and Smart Features", () => {
  it("verifies both es.json and en.json contain all new keys for modes, tabs, inspector, nlbar, savings, and autoRules", () => {
    const requiredSections = ["modes", "tabs", "inspector", "nlbar", "savings", "autoRules"];

    for (const section of requiredSections) {
      expect((es as any).spacemap[section]).toBeDefined();
      expect((en as any).spacemap[section]).toBeDefined();
    }

    // Comprobar claves específicas
    expect((es as any).spacemap.modes.treemap).toBe("Treemap");
    expect((en as any).spacemap.modes.treemap).toBe("Treemap");

    expect((es as any).spacemap.tabs.map).toBe("Mapa de Espacio");
    expect((en as any).spacemap.tabs.map).toBe("Space Map");

    expect((es as any).spacemap.nlbar.placeholder).toContain("Dile a GigaCare");
    expect((en as any).spacemap.nlbar.placeholder).toContain("Tell GigaCare");

    expect((es as any).spacemap.autoRules.badgeLabel).toBe("sugerencias");
    expect((en as any).spacemap.autoRules.badgeLabel).toBe("suggestions");
  });
});
