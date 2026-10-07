import { describe, it, expect } from "vitest";
import es from "../src/locales/es.json";
import en from "../src/locales/en.json";

describe("T038: i18n SmartCare localization", () => {
  it("contiene todas las claves de SmartCare en español", () => {
    expect(es.modules.smartcare.title).toBe("Cuidado Inteligente");
    expect(es.modules.smartcare.subtitle).toBe("Análisis y limpieza del sistema");
    expect(es.smartcare.welcome.title).toBe("Cuidado Inteligente");
    expect(es.smartcare.welcome.analyze).toBe("Analizar");
    expect(es.smartcare.scanning.title).toBe("Recopilando información del sistema...");
    expect(es.smartcare.results.driveHealth).toBe("Salud del Disco");
    expect(es.smartcare.results.cleanup.title).toBe("Limpieza");
    expect(es.smartcare.results.execute).toBe("Ejecutar");
    expect(es.smartcare.results.review).toBe("Revisar");
    expect(es.smartcare.review.title).toBe("Gestor de Limpieza");
    expect(es.smartcare.review.categories.junk).toBe("Archivos basura");
    expect(es.smartcare.review.categories.dev).toBe("Limpieza Dev");
    expect(es.smartcare.review.categories.apps).toBe("Aplicaciones sin uso");
    expect(es.smartcare.settings.sectionTitle).toBe("Cuidado Inteligente");
  });

  it("contiene todas las claves de SmartCare en inglés", () => {
    expect(en.modules.smartcare.title).toBe("SmartCare");
    expect(en.modules.smartcare.subtitle).toBe("System analysis and cleanup");
    expect(en.smartcare.welcome.title).toBe("SmartCare");
    expect(en.smartcare.welcome.analyze).toBe("Analyze");
    expect(en.smartcare.scanning.title).toBe("Gathering system information...");
    expect(en.smartcare.results.driveHealth).toBe("Drive Health");
    expect(en.smartcare.results.cleanup.title).toBe("Cleanup");
    expect(en.smartcare.results.execute).toBe("Execute");
    expect(en.smartcare.results.review).toBe("Review");
    expect(en.smartcare.review.title).toBe("Cleanup Manager");
    expect(en.smartcare.review.categories.junk).toBe("Junk files");
    expect(en.smartcare.review.categories.dev).toBe("Dev Cleaning");
    expect(en.smartcare.review.categories.apps).toBe("Unused applications");
    expect(en.smartcare.settings.sectionTitle).toBe("SmartCare");
  });
});
