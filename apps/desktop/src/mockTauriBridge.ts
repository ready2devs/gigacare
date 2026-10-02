/**
 * GigaCare Web Tauri IPC Bridge
 * Provee emulación 1:1 de todos los comandos Tauri y streaming de eventos
 * cuando la aplicación se ejecuta en navegador web (Edge/Chrome/Firefox).
 * Si se ejecuta dentro del runtime nativo de Tauri en Windows, se desactiva
 * automáticamente para permitir la comunicación Rust directa.
 */

import {
  ScanResult,
  CleanResult,
  QuarantineEntry,
  QuarantineStats,
  RestoreResult,
  PurgeResult,
  PhotoGroup,
  SpaceMapNode,
  StorageDevice,
  DiskInfo,
  SpaceLensScanProgress,
  AppConfig,
  ValidationResult,
  ActivationResult,
  StartupItem,
  InstalledApp,
  JunkFilesScanResult,
  SmartCareAnalysis,
  DriveHealthInfo,
  RecycleBinScanResult,
  AppUsageInfo,
} from "./types/models";
import { LayoutNode, Rect, Point, TreemapRect, SunburstArc } from "./types/treemap";
import {
  DevCleanReport,
  MlModelReport,
  PyReport,
  DevCleanOutcome,
} from "./types/devcleaning";

// Solo activar en navegador si window.__TAURI_INTERNALS__ no existe
if (typeof window !== "undefined" && !(window as any).__TAURI_INTERNALS__) {
  console.log("%c[GigaCare] Modo Navegador Web detectado. Activando Web Tauri Bridge 1:1.", "color: #00E5FF; font-weight: bold;");

  let callbackIdCounter = 1;
  const callbacks: Record<number, (res: any) => void> = {};
  const listeners: Record<string, Array<{ id: number; handler: (event: any) => void }>> = {};

  // Configuración predeterminada
  const DEFAULT_CONFIG: AppConfig = {
    version: 1,
    scanning: {
      temp_min_age_days: 7,
      dev_inactive_days: 30,
      whatsapp_cache_path: "C:\\Users\\Usuario\\AppData\\Roaming\\WhatsApp\\Cache",
      telegram_cache_path: "C:\\Users\\Usuario\\AppData\\Roaming\\Telegram Desktop\\tdata",
      excluded_paths: ["C:\\Windows\\System32", "C:\\Program Files"],
    },
    quarantine: {
      retention_days: 7,
      max_size_gb: 50,
    },
    photos: {
      keep_count: 1,
      phash_threshold: 8,
      thumbnail_max_px: 512,
      thumbnail_quality: 60,
      thumbnail_max_kb: 100,
    },
    ai_providers: {
      enabled: ["google_ai_studio", "freellmapi", "ollama"],
      priority_order: ["google_ai_studio", "freellmapi", "ollama"],
      rate_limits: { google_ai_studio: 10, freellmapi: 30, ollama: 0 },
    },
    byok: {
      google_ai_studio: "AIzaSy_demo_valid_key",
      ollama_endpoint: "http://localhost:11434",
      ollama_model: "qwen2.5:27b",
    },
    space_map: {
      preview_threshold_mb: 50,
    },
    theme: "obsidian_dark",
    language: "es",
  };

  // Cargar o inicializar estado persistente en localStorage
  const getStoredConfig = (): AppConfig => {
    try {
      const data = localStorage.getItem("gigacare_config");
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed?.quarantine && (parsed.quarantine.max_size_gb === 5 || !parsed.quarantine.max_size_gb)) {
          parsed.quarantine.max_size_gb = 50;
          try { localStorage.setItem("gigacare_config", JSON.stringify(parsed)); } catch {}
        }
        return {
          ...DEFAULT_CONFIG,
          ...parsed,
          quarantine: {
            ...DEFAULT_CONFIG.quarantine,
            ...(parsed.quarantine || {}),
          },
        };
      }
      return DEFAULT_CONFIG;
    } catch {
      return DEFAULT_CONFIG;
    }
  };

  const setStoredConfig = (cfg: AppConfig) => {
    try {
      localStorage.setItem("gigacare_config", JSON.stringify(cfg));
    } catch (e) {
      console.warn("No se pudo persistir config en localStorage", e);
    }
  };

  const getStoredQuarantine = (): QuarantineEntry[] => {
    try {
      const data = localStorage.getItem("gigacare_quarantine");
      if (data) return JSON.parse(data);
    } catch {}
    
    // Entradas iniciales de ejemplo
    const now = Date.now();
    const initial: QuarantineEntry[] = [
      {
        id: "quar-item-1",
        original_path: "C:\\Users\\Luciano\\AppData\\Local\\Temp\\dump_crash_2024.tmp",
        quarantine_path: "C:\\Users\\Luciano\\.gigacare\\quarantine\\files\\dump_crash_2024.tmp",
        sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
        size_bytes: 450 * 1024 * 1024,
        quarantined_at: new Date(now - 2 * 86400000).toISOString(),
        expires_at: new Date(now + 5 * 86400000).toISOString(),
        source_module: "system_temp",
        status: "quarantined",
      },
      {
        id: "quar-item-2",
        original_path: "C:\\Users\\Luciano\\AppData\\Roaming\\WhatsApp\\Cache\\video_cache_old.mp4",
        quarantine_path: "C:\\Users\\Luciano\\.gigacare\\quarantine\\files\\video_cache_old.mp4",
        sha256: "5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8",
        size_bytes: 280 * 1024 * 1024,
        quarantined_at: new Date(now - 4 * 86400000).toISOString(),
        expires_at: new Date(now + 3 * 86400000).toISOString(),
        source_module: "messaging_cache",
        status: "quarantined",
      }
    ];
    setStoredQuarantine(initial);
    return initial;
  };

  const setStoredQuarantine = (entries: QuarantineEntry[]) => {
    try {
      localStorage.setItem("gigacare_quarantine", JSON.stringify(entries));
    } catch (e) {
      console.warn("No se pudo persistir cuarentena en localStorage", e);
    }
  };

  // Helper para emitir eventos a los listeners registrados con listen()
  const emitEvent = (eventName: string, payload: any) => {
    const list = listeners[eventName];
    if (list && list.length > 0) {
      for (const item of list) {
        try {
          item.handler({ event: eventName, id: item.id, payload });
        } catch (err) {
          console.error(`Error al despachar evento ${eventName}:`, err);
        }
      }
    }
  };

  let scanCancelRequested = false;

  // Miniaturas SVG en base64 para el Curador de Fotos
  const svgPhoto1 = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><defs><linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#00E5FF"/><stop offset="100%" stop-color="#7C3AED"/></linearGradient></defs><rect width="400" height="300" fill="#0F172A"/><circle cx="200" cy="120" r="60" fill="url(#g1)"/><path d="M50 280 L180 180 L250 230 L350 150 L400 280 Z" fill="#1E293B"/><text x="200" y="260" font-family="sans-serif" font-size="16" fill="#F8FAFC" text-anchor="middle">IMG_20240915_142010.jpg (Nítida)</text></svg>`);
  const svgPhoto2 = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><defs><filter id="blur"><feGaussianBlur stdDeviation="3"/></filter><linearGradient id="g2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38BDF8"/><stop offset="100%" stop-color="#6366F1"/></linearGradient></defs><rect width="400" height="300" fill="#0F172A"/><g filter="url(#blur)"><circle cx="205" cy="122" r="60" fill="url(#g2)"/><path d="M50 280 L180 180 L250 230 L350 150 L400 280 Z" fill="#1E293B"/></g><text x="200" y="260" font-family="sans-serif" font-size="16" fill="#94A3B8" text-anchor="middle">IMG_20240915_142011.jpg (Ligero desenfoque)</text></svg>`);
  const svgPhoto3 = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><defs><linearGradient id="g3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#10B981"/><stop offset="100%" stop-color="#00E5FF"/></linearGradient></defs><rect width="400" height="300" fill="#0F172A"/><rect x="80" y="60" width="240" height="150" rx="10" fill="url(#g3)"/><text x="200" y="260" font-family="sans-serif" font-size="16" fill="#F8FAFC" text-anchor="middle">DSC_0089_PORTRAIT.jpg</text></svg>`);
  const svgPhoto4 = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><defs><linearGradient id="g4" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F59E0B"/><stop offset="100%" stop-color="#EF4444"/></linearGradient></defs><rect width="400" height="300" fill="#0F172A"/><rect x="85" y="65" width="240" height="150" rx="10" fill="url(#g4)" opacity="0.85"/><text x="200" y="260" font-family="sans-serif" font-size="16" fill="#94A3B8" text-anchor="middle">DSC_0090_PORTRAIT_BURST.jpg</text></svg>`);

  let currentPhotoGroups: PhotoGroup[] = [
    {
      group_id: "photo-group-burst-01",
      similarity_method: "phash_hamming",
      avg_hamming_distance: 3,
      photos: [
        {
          path: "C:\\Users\\Luciano\\Pictures\\Vacaciones\\IMG_20240915_142010.jpg",
          original_resolution: "4032x3024",
          size_bytes: 4200000,
          phash: "0xa1b2c3d4e5f60718",
          thumbnail_path: svgPhoto1,
          ai_analysis: {
            provider_used: "google_ai_studio",
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
          path: "C:\\Users\\Luciano\\Pictures\\Vacaciones\\IMG_20240915_142011.jpg",
          original_resolution: "4032x3024",
          size_bytes: 4150000,
          phash: "0xa1b2c3d4e5f60719",
          thumbnail_path: svgPhoto2,
          ai_analysis: {
            provider_used: "google_ai_studio",
            sharpness_score: 0.62,
            eyes_open_score: 0.85,
            composition_score: 0.82,
            noise_score: 0.70,
            total_score: 0.71,
            rank: 2,
            recommendation: "discard",
          },
        },
      ],
    },
    {
      group_id: "photo-group-burst-02",
      similarity_method: "phash_hamming",
      avg_hamming_distance: 2,
      photos: [
        {
          path: "C:\\Users\\Luciano\\Pictures\\Retratos\\DSC_0089_PORTRAIT.jpg",
          original_resolution: "6000x4000",
          size_bytes: 8900000,
          phash: "0x1122334455667788",
          thumbnail_path: svgPhoto3,
          ai_analysis: {
            provider_used: "freellmapi",
            sharpness_score: 0.96,
            eyes_open_score: 0.99,
            composition_score: 0.91,
            noise_score: 0.95,
            total_score: 0.95,
            rank: 1,
            recommendation: "keep",
          },
        },
        {
          path: "C:\\Users\\Luciano\\Pictures\\Retratos\\DSC_0090_PORTRAIT_BURST.jpg",
          original_resolution: "6000x4000",
          size_bytes: 8850000,
          phash: "0x1122334455667789",
          thumbnail_path: svgPhoto4,
          ai_analysis: {
            provider_used: "freellmapi",
            sharpness_score: 0.68,
            eyes_open_score: 0.40,
            composition_score: 0.86,
            noise_score: 0.85,
            total_score: 0.67,
            rank: 2,
            recommendation: "discard",
          },
        },
      ],
    },
  ];

  // Implementación del método invoke para el simulador de navegador
  const mockInvoke = async (cmd: string, args?: any): Promise<any> => {
    // 1. Manejo del plugin de eventos (escucha y desuscripción)
    if (cmd === "plugin:event|listen") {
      const eventName = args.event;
      const callbackId = args.handler;
      const eventId = callbackIdCounter++;
      if (!listeners[eventName]) {
        listeners[eventName] = [];
      }
      listeners[eventName].push({
        id: eventId,
        handler: (ev) => {
          const fn = callbacks[callbackId];
          if (fn) fn(ev);
        },
      });
      return eventId;
    }

    if (cmd === "plugin:event|unlisten") {
      const eventName = args.event;
      const eventId = args.eventId;
      if (listeners[eventName]) {
        listeners[eventName] = listeners[eventName].filter((l) => l.id !== eventId);
      }
      return true;
    }

    // Manejo de apertura de rutas en el Explorador de Windows (plugin:opener / open_path)
    if (
      cmd === "plugin:opener|open_path" ||
      cmd === "open_path" ||
      cmd === "plugin:opener|reveal_item_in_dir" ||
      cmd === "reveal_item_in_dir"
    ) {
      const targetPath = args?.path || args?.item;
      if (targetPath) {
        try {
          const resp = await fetch(`/api/reveal-path?path=${encodeURIComponent(targetPath)}`);
          if (resp.ok) {
            return await resp.json();
          }
        } catch (err) {
          console.warn("[Bridge] Fallback reveal-path error:", err);
        }
      }
      return { success: true };
    }

    // 2. Comandos de SmartCare y Escaneo
    const getRealOrFallbackDriveHealth = async (driveLetter: string = "C:"): Promise<DriveHealthInfo> => {
      try {
        if (typeof window !== "undefined" && typeof fetch !== "undefined") {
          const resp = await fetch("/api/real-drive-health");
          if (resp.ok) {
            const data: DriveHealthInfo = await resp.json();
            if (data && data.total_bytes > 0) {
              return data;
            }
          }
        }
      } catch (e) {
        console.warn("[Bridge] Fallback al leer /api/real-drive-health:", e);
      }

      const total = 1999372283904; // 2 TB nominal (1.82 TB NTFS Samsung SSD 980 PRO)
      const free = 1219098361856; // 1.11 TB libres reales
      const used = total - free; // 726.7 GB usados reales
      const usagePct = Math.round((used / total) * 100); // 39% real

      return {
        drive_letter: driveLetter,
        drive_label: `Samsung SSD 980 PRO 2TB (${driveLetter})`,
        drive_path: driveLetter,
        total_bytes: total,
        used_bytes: used,
        free_bytes: free,
        usage_percent: usagePct,
        disk_type: "SSD_NVMe",
        filesystem: "NTFS",
        smart_status: "Healthy",
        temperature_celsius: 38,
        drive_wear_percent: 4,
        reallocated_sectors: 0,
        power_on_hours: 1420,
        fill_forecast: {
          gb_per_day: 1.2,
          full_in_weeks: 48,
          readings_count: 5,
          readings_period_days: 30,
        },
      };
    };

    if (cmd === "get_drive_health") {
      const drive = (args?.drive || "C:").toUpperCase();
      const driveLetter = drive.endsWith(":") ? drive : `${drive}:`;
      return await getRealOrFallbackDriveHealth(driveLetter);
    }

    if (cmd === "get_smartcare_analysis") {
      try {
        const stored = localStorage.getItem("gigacare_last_smartcare_analysis");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.is_valid && parsed.drive_health) {
            // Actualizar siempre la salud del disco con la información de hardware real más reciente
            const freshHealth = await getRealOrFallbackDriveHealth(parsed.drive_health.drive_letter || "C:");
            parsed.drive_health = freshHealth;
            return parsed;
          }
        }
      } catch (err) {
        console.warn("[Bridge] Error leyendo last_smartcare_analysis:", err);
      }
      return null;
    }

    if (cmd === "save_smartcare_analysis") {
      try {
        if (args?.analysis) {
          localStorage.setItem("gigacare_last_smartcare_analysis", JSON.stringify(args.analysis));
        }
      } catch (err) {
        console.warn("[Bridge] Error guardando smartcare_analysis:", err);
      }
      return true;
    }

    if (cmd === "run_full_smartcare_analysis") {
      scanCancelRequested = false;

      const progressSteps = [
        { phase: "Analizando salud física de discos y telemetría SMART...", percent: 15 },
        { phase: "Escaneando archivos temporales y restos del sistema...", percent: 35 },
        { phase: "Analizando papelera de reciclaje y cachés de navegadores...", percent: 55 },
        { phase: "Analizando uso de aplicaciones e inactividad en registro...", percent: 75 },
        { phase: "Escaneando cachés de desarrollo y modelos de IA...", percent: 90 },
        { phase: "Consolidando resultados del análisis inteligente...", percent: 100 },
      ];

      for (const step of progressSteps) {
        if (scanCancelRequested) {
          throw new Error("Análisis cancelado por el usuario");
        }
        emitEvent("smartcare-analysis-progress", {
          phase: step.phase,
          percent: step.percent,
        });
        await new Promise((r) => setTimeout(r, 380));
      }

      const driveHealth: DriveHealthInfo = await getRealOrFallbackDriveHealth("C:");

      // Obtener datos reales de los módulos o calcular valores exactos consistentes
      let junkTotal = 6900000000; // 6.9 GB exactos de Archivos Basura
      let devTotal = 17500000000; // 17.5 GB exactos de Limpieza Dev
      let appsTotal = 6600000000; // 6.6 GB exactos de Aplicaciones sin uso

      try {
        const [realJunk, realDev, realApps] = await Promise.all([
          fetch("/api/real-junk-scan").then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch("/api/real-dev-clean-scan").then((r) => r.ok ? r.json() : null).catch(() => null),
          fetch("/api/real-installed-apps").then((r) => r.ok ? r.json() : null).catch(() => null),
        ]);

        if (realJunk?.total_junk_bytes) junkTotal = realJunk.total_junk_bytes;
        if (realDev?.findings) {
          devTotal = realDev.findings
            .filter((f: any) => f.safety === "safe" || f.safety === 0)
            .reduce((sum: number, f: any) => sum + (f.size_bytes || 0), 0) || devTotal;
        }
        if (Array.isArray(realApps)) {
          appsTotal = realApps
            .filter((a: any) => (typeof a.last_used_days === "number" && a.last_used_days >= 365) || a.usage_count === 0)
            .reduce((sum: number, a: any) => sum + (a.size_bytes || 0), 0) || appsTotal;
        }
      } catch {}

      const totalRec = junkTotal + devTotal + appsTotal; // 31.0 GB reales sincronizados

      const analysis: SmartCareAnalysis = {
        id: `smartcare-${Date.now()}`,
        timestamp: new Date().toISOString(),
        drive_health: driveHealth,
        junk_summary: {
          temp_files_bytes: 2300000000,
          windows_leftovers_bytes: 1700000000,
          installers_bytes: 715300000,
          browser_caches_bytes: 1700000000,
          messaging_caches_bytes: 572200000,
          recycle_bin_bytes: 4463,
          total_bytes: junkTotal,
          item_count: 64,
        },
        dev_summary: {
          safe_caches_bytes: 16800000000,
          unused_models_bytes: 0,
          stale_python_bytes: 700400000,
          total_bytes: devTotal,
          item_count: 14,
        },
        apps_summary: {
          unused_apps_count: 22,
          unused_apps_bytes: appsTotal,
        },
        total_recoverable_bytes: totalRec,
        is_valid: true,
      };

      try {
        localStorage.setItem("gigacare_last_smartcare_analysis", JSON.stringify(analysis));
      } catch (err) {
        console.warn("[Bridge] Error guardando análisis en localStorage:", err);
      }

      return analysis;
    }

    if (cmd === "scan_recycle_bin") {
      try {
        const resp = await fetch("/api/real-recycle-bin");
        if (resp.ok) {
          const realData = await resp.json();
          if (realData && Array.isArray(realData.items)) {
            const result: RecycleBinScanResult = {
              drives: [
                {
                  drive_letter: "C:",
                  drive_label: "Disco local (C:)",
                  item_count: realData.total_items || realData.items.length,
                  total_bytes: realData.total_bytes || 0,
                },
              ],
              items: realData.items.map((it: any) => ({
                original_path: it.original_path || it.path || it.name,
                name: it.name,
                size_bytes: it.size_bytes || 0,
                deleted_at: it.deleted_at || new Date().toISOString(),
                file_type: it.file_type || "",
                recycle_path: it.recycle_path || it.original_path,
                i_path: it.recycle_path || it.original_path,
              })),
              total_items: realData.total_items || realData.items.length,
              total_bytes: realData.total_bytes || 0,
            };
            return result;
          }
        }
      } catch (err) {
        console.warn("[Bridge] Fallback real-recycle-bin:", err);
      }

      const result: RecycleBinScanResult = {
        drives: [
          {
            drive_letter: "C:",
            drive_label: "Disco local (C:)",
            item_count: 4,
            total_bytes: 6591,
          },
        ],
        items: [
          {
            original_path: "C:\\Users\\Luciano\\OneDrive\\Escritorio\\Gemini",
            name: "Gemini",
            size_bytes: 2128,
            deleted_at: new Date(Date.now() - 2 * 86400000).toISOString(),
            file_type: "lnk",
            recycle_path: "C:\\$Recycle.Bin\\$RKZMC9S.lnk",
            i_path: "C:\\$Recycle.Bin\\$IKZMC9S.lnk",
          },
          {
            original_path: "C:\\Users\\Public\\Desktop\\GigaCare",
            name: "GigaCare",
            size_bytes: 1032,
            deleted_at: new Date(Date.now() - 11 * 86400000).toISOString(),
            file_type: "lnk",
            recycle_path: "C:\\$Recycle.Bin\\$R8YSO1M.lnk",
            i_path: "C:\\$Recycle.Bin\\$I8YSO1M.lnk",
          },
          {
            original_path: "C:\\Users\\Luciano\\Workspace\\antigravity\\subir.bat",
            name: "subir.bat",
            size_bytes: 1303,
            deleted_at: new Date(Date.now() - 10 * 86400000).toISOString(),
            file_type: "bat",
            recycle_path: "C:\\$Recycle.Bin\\$R4HX5XA.bat",
            i_path: "C:\\$Recycle.Bin\\$I4HX5XA.bat",
          },
        ],
        total_items: 3,
        total_bytes: 4463,
      };
      return result;
    }

    if (cmd === "clean_recycle_bin") {
      return {
        success: true,
        cleaned_count: 12,
        freed_bytes: 900000000,
        errors: [],
      };
    }

    if (cmd === "list_installed_apps_with_usage") {
      try {
        const resp = await fetch("/api/real-installed-apps");
        if (resp.ok) {
          const realApps: InstalledApp[] = await resp.json();
          if (Array.isArray(realApps) && realApps.length > 0) {
            return realApps;
          }
        }
      } catch (err) {
        console.warn("[Bridge] Fallback real installed apps:", err);
      }
      return [];
    }

    if (cmd === "get_app_usage") {
      const names: string[] = args?.app_names || [];
      const result: AppUsageInfo[] = names.map((name) => ({
        app_id: name,
        last_used_days: 30,
        last_used_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        usage_count: 10,
        source: "prefetch",
      }));
      return result;
    }

    if (cmd === "scan_junk_files") {
      let realTempItems: any[] = [];
      let realTempBytes = 2580000000;

      try {
        const resp = await fetch("/api/real-temp-files");
        if (resp.ok) {
          const tData = await resp.json();
          if (tData && Array.isArray(tData.items) && tData.items.length > 0) {
            realTempItems = tData.items;
            realTempBytes = tData.total_bytes || realTempBytes;
          }
        }
      } catch (err) {
        console.warn("[Bridge] Fallback real temp files:", err);
      }

      const tempCategoryItems = realTempItems.length > 0 ? realTempItems : [
        {
          id: "C:\\Users\\Luciano\\AppData\\Local\\Temp\\tmp_001.tmp",
          display_name: "tmp_001.tmp",
          path: "C:\\Users\\Luciano\\AppData\\Local\\Temp\\tmp_001.tmp",
          size_bytes: 1450000000,
          safe: true,
          age_days: 14,
          age_display: "2 semanas",
          source_type: "temp_user",
        },
        {
          id: "C:\\Windows\\Temp\\system_log.tmp",
          display_name: "system_log.tmp",
          path: "C:\\Windows\\Temp\\system_log.tmp",
          size_bytes: 1000000000,
          safe: true,
          age_days: 60,
          age_display: "2 meses",
          source_type: "temp_system",
        },
      ];

      const mockResult: JunkFilesScanResult = {
        total_junk_bytes: realTempItems.length > 0
          ? realTempBytes + 1800000000 + 750000000 + 2520000000 + 600000000 + 4463
          : 8520000000,
        scan_timestamp: new Date().toISOString(),
        categories: [
          {
            category_id: "temp_files",
            display_name: "Archivos Temporales",
            total_bytes: realTempItems.length > 0 ? realTempBytes : 2450000000,
            safe_bytes: realTempItems.length > 0 ? realTempBytes : 2450000000,
            items: tempCategoryItems,
          },
          {
            category_id: "windows_leftovers",
            display_name: "Restos de Windows",
            total_bytes: 1800000000,
            safe_bytes: 1800000000,
            items: [
              {
                id: "C:\\Windows\\SoftwareDistribution\\Download\\cab_update.cab",
                display_name: "cab_update.cab",
                path: "C:\\Windows\\SoftwareDistribution\\Download\\cab_update.cab",
                size_bytes: 1800000000,
                safe: true,
                age_days: 30,
                age_display: "1 mes",
                source_type: "windows_update",
              },
            ],
          },
          {
            category_id: "download_installers",
            display_name: "Instaladores en Descargas",
            total_bytes: 750000000,
            safe_bytes: 750000000,
            items: [
              {
                id: "C:\\Users\\Luciano\\Downloads\\Git-2.46.0-64-bit.exe",
                display_name: "Git-2.46.0-64-bit.exe",
                path: "C:\\Users\\Luciano\\Downloads\\Git-2.46.0-64-bit.exe",
                size_bytes: 750000000,
                safe: true,
                age_days: 90,
                age_display: "3 meses",
                source_type: "download_installer",
              },
            ],
          },
          {
            category_id: "browser_caches",
            display_name: "Cachés de Navegadores",
            total_bytes: 2520000000,
            safe_bytes: 2520000000,
            items: [
              {
                id: "C:\\Chrome\\Default\\Cache_Data",
                display_name: "Google Chrome (Caché principal)",
                path: "C:\\Chrome\\Default\\Cache_Data",
                size_bytes: 1800000000,
                safe: true,
                source_type: "browser_cache",
              },
            ],
          },
          {
            category_id: "messaging_cache",
            display_name: "Cachés de Mensajería",
            total_bytes: 600000000,
            safe_bytes: 600000000,
            items: [
              {
                id: "C:\\WhatsApp\\Cache\\media_1.mp4",
                display_name: "media_1.mp4",
                path: "C:\\WhatsApp\\Cache\\media_1.mp4",
                size_bytes: 600000000,
                safe: true,
                age_days: 45,
                age_display: "1 mes",
                source_type: "messaging_cache",
              },
            ],
          },
          {
            category_id: "app_residuals",
            display_name: "Residuales de Aplicaciones",
            total_bytes: 400000000,
            safe_bytes: 0,
            items: [
              {
                id: "C:\\Users\\Luciano\\AppData\\Local\\OldApp",
                display_name: "OldApp",
                path: "C:\\Users\\Luciano\\AppData\\Local\\OldApp",
                size_bytes: 400000000,
                safe: false,
                source_type: "app_residual",
              },
            ],
          },
          {
            category_id: "recycle_bin",
            display_name: "Papelera de Reciclaje",
            total_bytes: 4463,
            safe_bytes: 4463,
            items: [
              {
                id: "C:\\$Recycle.Bin\\$RKZMC9S.lnk",
                display_name: "Gemini",
                path: "C:\\$Recycle.Bin\\$RKZMC9S.lnk",
                size_bytes: 2128,
                safe: true,
                age_days: 2,
                age_display: "2 días",
                source_type: "recycle_bin",
              },
              {
                id: "C:\\$Recycle.Bin\\$R4HX5XA.bat",
                display_name: "subir.bat",
                path: "C:\\$Recycle.Bin\\$R4HX5XA.bat",
                size_bytes: 1303,
                safe: true,
                age_days: 10,
                age_display: "1 semana",
                source_type: "recycle_bin",
              },
              {
                id: "C:\\$Recycle.Bin\\$R8YSO1M.lnk",
                display_name: "GigaCare",
                path: "C:\\$Recycle.Bin\\$R8YSO1M.lnk",
                size_bytes: 1032,
                safe: true,
                age_days: 11,
                age_display: "1 semana",
                source_type: "recycle_bin",
              },
            ],
          },
          {
            category_id: "prefetch",
            display_name: "Prefetch",
            total_bytes: 120000000,
            safe_bytes: 0,
            informational: true,
            items: [
              {
                id: "C:\\Windows\\Prefetch\\APP.EXE-12345.pf",
                display_name: "APP.EXE-12345.pf",
                path: "C:\\Windows\\Prefetch\\APP.EXE-12345.pf",
                size_bytes: 120000000,
                safe: false,
                source_type: "prefetch",
              },
            ],
          },
        ],
        browsers: [
          {
            browser_name: "Google Chrome",
            browser_id: "chrome",
            installed: true,
            total_all_profiles_bytes: 1800000000,
            profiles: [
              {
                profile_name: "Default",
                profile_path: "C:\\Users\\Luciano\\AppData\\Local\\Google\\Chrome\\User Data\\Default",
                total_size_bytes: 1800000000,
                cache_entries: [
                  {
                    cache_type: "cache",
                    display_name: "Caché principal",
                    path: "C:\\Users\\Luciano\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache_Data",
                    size_bytes: 1200000000,
                    safe: true,
                  },
                  {
                    cache_type: "code_cache",
                    display_name: "Caché de código",
                    path: "C:\\Users\\Luciano\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Code Cache",
                    size_bytes: 400000000,
                    safe: true,
                  },
                  {
                    cache_type: "gpu_cache",
                    display_name: "GPUCache",
                    path: "C:\\Users\\Luciano\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\GPUCache",
                    size_bytes: 200000000,
                    safe: true,
                  },
                ],
              },
            ],
          },
          {
            browser_name: "Microsoft Edge",
            browser_id: "edge",
            installed: true,
            total_all_profiles_bytes: 720000000,
            profiles: [
              {
                profile_name: "Default",
                profile_path: "C:\\Users\\Luciano\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default",
                total_size_bytes: 720000000,
                cache_entries: [
                  {
                    cache_type: "cache",
                    display_name: "Caché principal",
                    path: "C:\\Users\\Luciano\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\Cache_Data",
                    size_bytes: 500000000,
                    safe: true,
                  },
                  {
                    cache_type: "gpu_cache",
                    display_name: "GPUCache",
                    path: "C:\\Users\\Luciano\\AppData\\Local\\Microsoft\\Edge\\User Data\\Default\\GPUCache",
                    size_bytes: 220000000,
                    safe: true,
                  },
                ],
              },
            ],
          },
        ],
      };
      return mockResult;
    }

    if (cmd === "scan_browser_caches") {
      return [
        {
          browser_name: "Google Chrome",
          browser_id: "chrome",
          installed: true,
          total_all_profiles_bytes: 1800000000,
          profiles: [],
        },
      ];
    }

    if (cmd === "clean_browser_cache") {
      return {
        scan_id: "browser-clean-" + args?.browser_id,
        timestamp: new Date().toISOString(),
        items_moved: 142,
        items_failed: 0,
        bytes_freed: 1800000000,
        errors: [],
      };
    }

    if (cmd === "scan_smart_care" || cmd === "scan_module") {
      scanCancelRequested = false;

      const steps = [
        { module: "system_temp", name: "Archivos Temporales del Sistema", items: 18, bytes: 1450000000 },
        { module: "messaging_cache", name: "Caché de WhatsApp y Telegram", items: 12, bytes: 820000000 },
        { module: "dev_dependencies", name: "Dependencias node_modules huérfanas", items: 8, bytes: 1125000000 },
        { module: "installers", name: "Instaladores residuales en Descargas", items: 6, bytes: 450000000 },
        { module: "similar_videos", name: "Videos duplicados o tomas similares", items: 4, bytes: 850000000 },
      ];

      for (let i = 0; i < steps.length; i++) {
        if (scanCancelRequested) {
          throw new Error("Escaneo cancelado por el usuario");
        }
        const s = steps[i];
        emitEvent("scan-progress", {
          module: s.module,
          items_scanned: (i + 1) * 250,
          items_found: s.items,
          bytes_found: s.bytes,
          percent: Math.round(((i + 1) / steps.length) * 100),
          eta_seconds: (steps.length - i - 1) * 0.4,
        });
        await new Promise((r) => setTimeout(r, 260));
      }

      const scanResult: ScanResult = {
        id: "scan-" + Date.now(),
        timestamp: new Date().toISOString(),
        platform: "windows",
        total_items: 44,
        total_recoverable_bytes: 3845000000,
        modules: [
          {
            module_id: "system_temp",
            status: "completed",
            duration_ms: 240,
            items_found: 18,
            total_size_bytes: 1450000000,
            items: [
              {
                path: "C:\\Users\\Luciano\\AppData\\Local\\Temp\\dmp_crash_dump_2024.dmp",
                size_bytes: 450000000,
                modified_at: new Date(Date.now() - 5 * 86400000).toISOString(),
                category: "temp",
                metadata: { app_source: "Windows Error Reporting" },
              },
              {
                path: "C:\\Windows\\Temp\\Cab_98234_update.tmp",
                size_bytes: 380000000,
                modified_at: new Date(Date.now() - 12 * 86400000).toISOString(),
                category: "temp",
                metadata: { app_source: "Windows Update Service" },
              },
              {
                path: "C:\\Users\\Luciano\\AppData\\Local\\Temp\\vscode-update-user-x64.tmp",
                size_bytes: 220000000,
                modified_at: new Date(Date.now() - 8 * 86400000).toISOString(),
                category: "temp",
                metadata: { app_source: "Code" },
              },
              {
                path: "C:\\Users\\Luciano\\AppData\\Local\\Microsoft\\Windows\\Explorer\\thumbcache_256.db.bak",
                size_bytes: 400000000,
                modified_at: new Date(Date.now() - 15 * 86400000).toISOString(),
                category: "temp",
                metadata: { app_source: "Windows Explorer" },
              },
            ],
          },
          {
            module_id: "messaging_cache",
            status: "completed",
            duration_ms: 310,
            items_found: 12,
            total_size_bytes: 820000000,
            items: [
              {
                path: "C:\\Users\\Luciano\\AppData\\Roaming\\WhatsApp\\Cache\\media_cache_video_491.mp4",
                size_bytes: 350000000,
                modified_at: new Date(Date.now() - 20 * 86400000).toISOString(),
                category: "cache",
                metadata: { app_source: "WhatsApp Desktop" },
              },
              {
                path: "C:\\Users\\Luciano\\AppData\\Roaming\\Telegram Desktop\\tdata\\user_data\\cache\\temp_audio_01.ogg",
                size_bytes: 280000000,
                modified_at: new Date(Date.now() - 14 * 86400000).toISOString(),
                category: "cache",
                metadata: { app_source: "Telegram Desktop" },
              },
              {
                path: "C:\\Users\\Luciano\\AppData\\Roaming\\WhatsApp\\Cache\\stickers_cache_pack.zip",
                size_bytes: 190000000,
                modified_at: new Date(Date.now() - 30 * 86400000).toISOString(),
                category: "cache",
                metadata: { app_source: "WhatsApp Desktop" },
              },
            ],
          },
          {
            module_id: "dev_dependencies",
            status: "completed",
            duration_ms: 450,
            items_found: 8,
            total_size_bytes: 1125000000,
            items: [
              {
                path: "C:\\Users\\Luciano\\Workspace\\legacy-project\\node_modules",
                size_bytes: 650000000,
                modified_at: new Date(Date.now() - 120 * 86400000).toISOString(),
                category: "dependency",
                metadata: { project_name: "legacy-project", days_inactive: 120 },
              },
              {
                path: "C:\\Users\\Luciano\\.gradle\\caches\\modules-2\\files-2.1\\unused-legacy-android-sdk",
                size_bytes: 475000000,
                modified_at: new Date(Date.now() - 95 * 86400000).toISOString(),
                category: "dependency",
                metadata: { project_name: "Gradle Cache", days_inactive: 95 },
              },
            ],
          },
          {
            module_id: "installers",
            status: "completed",
            duration_ms: 120,
            items_found: 6,
            total_size_bytes: 450000000,
            items: [
              {
                path: "C:\\Users\\Luciano\\Downloads\\ChromeStandaloneSetup64.exe",
                size_bytes: 110000000,
                modified_at: new Date(Date.now() - 45 * 86400000).toISOString(),
                category: "installer",
                metadata: { app_source: "Google Chrome" },
              },
              {
                path: "C:\\Users\\Luciano\\Downloads\\Git-2.45.2-64-bit.exe",
                size_bytes: 65000000,
                modified_at: new Date(Date.now() - 60 * 86400000).toISOString(),
                category: "installer",
                metadata: { app_source: "Git SCM" },
              },
              {
                path: "C:\\Users\\Luciano\\Downloads\\node-v20.14.0-x64.msi",
                size_bytes: 275000000,
                modified_at: new Date(Date.now() - 40 * 86400000).toISOString(),
                category: "installer",
                metadata: { app_source: "Node.js" },
              },
            ],
          },
          {
            module_id: "similar_videos",
            status: "completed",
            duration_ms: 320,
            items_found: 4,
            total_size_bytes: 850000000,
            items: [
              {
                path: "C:\\Videos\\Vacation_Take1.mp4",
                size_bytes: 450000000,
                modified_at: new Date(Date.now() - 15 * 86400000).toISOString(),
                category: "video",
                metadata: { app_source: "Camera", group_id: "video-grp-1" },
              },
              {
                path: "C:\\Videos\\Vacation_Take2.mp4",
                size_bytes: 400000000,
                modified_at: new Date(Date.now() - 15 * 86400000).toISOString(),
                category: "video",
                metadata: { app_source: "Camera", group_id: "video-grp-1" },
              },
            ],
          },
        ],
      };

      return scanResult;
    }

    if (cmd === "cancel_scan") {
      scanCancelRequested = true;
      return true;
    }

    // 3. Comandos de Limpieza y Cuarentena
    if (cmd === "clean_items") {
      const itemIds: string[] = args?.item_ids || (args?.items ? args.items.map((it: any) => it.path || it.id) : []);
      const currentQ = getStoredQuarantine();
      let bytesFreed = 0;

      for (let i = 0; i < itemIds.length; i++) {
        const path = itemIds[i];
        const fileName = path.split(/[\\/]/).pop() || "item";
        // Asignar tamaño realista proporcional al volumen del análisis completo (~16.78 GB distribuidos)
        const size = Math.floor(16780000000 / Math.max(1, itemIds.length));
        bytesFreed += size;

        const newEntry: QuarantineEntry = {
          id: "quar-" + Date.now() + "-" + i,
          original_path: path,
          quarantine_path: `C:\\Users\\Luciano\\.gigacare\\quarantine\\files\\${fileName}`,
          sha256: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
          size_bytes: size,
          quarantined_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          source_module: /\.(jpg|jpeg|png|webp|dng)$/i.test(path) ? "photo_curator" : path.toLowerCase().includes("temp") ? "system_temp" : path.toLowerCase().includes("whatsapp") ? "messaging_cache" : "system_cache",
          status: "quarantined",
        };
        currentQ.unshift(newEntry);

        emitEvent("clean-progress", {
          items_total: itemIds.length,
          items_moved: i + 1,
          bytes_freed: bytesFreed,
          current_file: path,
        });

        await new Promise((r) => setTimeout(r, 60));
      }

      setStoredQuarantine(currentQ);

      const cleanRes: CleanResult = {
        scan_id: "scan-" + Date.now(),
        timestamp: new Date().toISOString(),
        items_moved: itemIds.length,
        items_failed: 0,
        bytes_freed: bytesFreed,
        errors: [],
      };
      return cleanRes;
    }

    if (cmd === "list_quarantine") {
      const entries = getStoredQuarantine();
      const filters = args?.filters;
      if (filters?.source_module && filters.source_module !== "all") {
        return entries.filter((e) => e.source_module === filters.source_module);
      }
      return entries;
    }

    if (cmd === "quarantine_stats") {
      const entries = getStoredQuarantine();
      const totalBytes = entries.reduce((acc, e) => acc + (e.size_bytes || 0), 0);
      const cfg = getStoredConfig();
      const maxGb = cfg?.quarantine?.max_size_gb || 50;
      const stats: QuarantineStats = {
        total_items: entries.length,
        total_bytes: totalBytes,
        max_space_bytes: Math.round(maxGb * 1024 * 1024 * 1024),
        oldest_quarantined_at: entries.length > 0 ? entries[entries.length - 1].quarantined_at : undefined,
      };
      return stats;
    }

    if (cmd === "restore_items") {
      const entryIds: string[] = args?.entry_ids || [];
      const current = getStoredQuarantine();
      const filtered = current.filter((e) => !entryIds.includes(e.id));
      setStoredQuarantine(filtered);
      const res: RestoreResult = {
        restored_count: entryIds.length,
        errors: [],
      };
      return res;
    }

    if (cmd === "purge_expired") {
      setStoredQuarantine([]);
      const res: PurgeResult = {
        purged_count: 5,
      };
      return res;
    }

    if (cmd === "plugin:dialog|open") {
      if (typeof fetch !== "undefined") {
        try {
          const resp = await fetch("/api/pick-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              initialDir: args?.options?.defaultPath || "",
              title: args?.options?.title || "Selecciona la carpeta para analizar en GigaCare",
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data && data.path) {
              return data.path;
            }
            return null;
          }
        } catch {}
      }
      return null;
    }

    // 4. Curador de Fotos IA
    if (cmd === "find_photo_groups") {
      const folderPath = args?.folder_path || args?.folderPath;
      const keepCount = Number(args?.keep_count || args?.keepCount) || 1;
      if (folderPath && typeof fetch !== "undefined") {
        try {
          const resp = await fetch("/api/photo-curate-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderPath, keepCount, recursive: true }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data && Array.isArray(data.groups)) {
              currentPhotoGroups = data.groups;
              return data.groups;
            }
          }
        } catch {}
      }
      return currentPhotoGroups;
    }

    if (cmd === "find_photo_groups_recursive") {
      const folderPath = args?.folder_path || args?.folderPath || "C:\\Photos";
      const keepCount = Number(args?.keep_count || args?.keepCount) || 1;
      if (folderPath && typeof fetch !== "undefined") {
        try {
          const resp = await fetch("/api/photo-curate-folder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderPath, keepCount, recursive: true }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data && Array.isArray(data.groups)) {
              currentPhotoGroups = data.groups;
              return {
                groups: data.groups,
                total_photos_found: data.total_photos_found ?? data.total_photos ?? 0,
                photos_processed: data.photos_processed ?? data.total_photos ?? 0,
                truncated: Boolean(data.truncated),
                scan_path: folderPath,
              };
            }
          }
        } catch {}
      }
      return {
        groups: currentPhotoGroups,
        total_photos_found: currentPhotoGroups.reduce((acc, g) => acc + g.photos.length, 0),
        photos_processed: currentPhotoGroups.reduce((acc, g) => acc + g.photos.length, 0),
        truncated: false,
        scan_path: folderPath,
      };
    }

    if (cmd === "analyze_all_groups_ai" || cmd === "analyze_group_ai") {
      const kc = Math.max(1, Math.min(3, Number(args?.keep_count || args?.keepCount) || 1));
      emitEvent("ai-analysis-progress", {
        groups_analyzed: 1,
        groups_total: 2,
        current_provider: "google_ai_studio (Gemini Multimodal)",
        current_group_id: "photo-group-burst-01",
      });
      await new Promise((r) => setTimeout(r, 200));
      emitEvent("ai-analysis-progress", {
        groups_analyzed: 2,
        groups_total: 2,
        current_provider: "freellmapi (DeepSeek Vision)",
        current_group_id: "photo-group-burst-02",
      });
      await new Promise((r) => setTimeout(r, 200));

      const updatedGroups = currentPhotoGroups.map((g) => {
        const rankedByScore = [...g.photos].sort(
          (a, b) => (b.ai_analysis?.total_score ?? b.size_bytes ?? 0) - (a.ai_analysis?.total_score ?? a.size_bytes ?? 0)
        );
        return {
          ...g,
          photos: g.photos.map((p) => {
            const rank = rankedByScore.findIndex((r) => r.path === p.path) + 1;
            const isKeep = g.photos.length <= kc ? true : rank <= kc;
            return {
              ...p,
              ai_analysis: p.ai_analysis
                ? {
                    ...p.ai_analysis,
                    recommendation: isKeep ? "keep" : "discard",
                    rank,
                    discard_reason: isKeep
                      ? undefined
                      : p.ai_analysis.discard_reason || "Toma similar / ráfaga descartada (menor calidad)",
                  }
                : p.ai_analysis,
            };
          }),
        };
      });
      currentPhotoGroups = updatedGroups;
      return currentPhotoGroups;
    }

    // 5. SpaceLens & Storage Devices (Reforma Visual y Multi-dispositivo)
    if (cmd === "list_storage_devices") {
      // Intentar consultar discos reales del sistema Windows mediante el backend local /api/real-devices
      try {
        if (typeof window !== "undefined" && typeof fetch !== "undefined") {
          const resp = await fetch("/api/real-devices");
          if (resp.ok) {
            const realDevices: StorageDevice[] = await resp.json();
            if (Array.isArray(realDevices) && realDevices.length > 0) {
              // Agregar también el mock MTP si no hay dispositivos móviles detectados
              const hasMtp = realDevices.some(d => d.device_type === "mtp_device");
              if (!hasMtp) {
                // No inyectar dispositivos MTP simulados cuando hay discos reales detectados
              }
              return realDevices;
            }
          }
        }
      } catch {
        // Fallback a simulación
      }

      const devices: StorageDevice[] = [
        {
          id: "C:",
          label: "Disco local (C:)",
          device_type: "local_disk",
          root_path: "C:\\",
          total_bytes: Math.round(1.81 * 1024 * 1024 * 1024 * 1024), // 1.81 TB exacto como en Windows
          used_bytes: Math.round(0.68 * 1024 * 1024 * 1024 * 1024),  // 696 GB usado
          free_bytes: Math.round(1.13 * 1024 * 1024 * 1024 * 1024),  // 1.13 TB disponible
          is_removable: false,
          icon_hint: "hard_drive",
          is_ready: true,
        },
        {
          id: "D:",
          label: "Datos (D:)",
          device_type: "local_disk",
          root_path: "D:\\",
          total_bytes: 1024 * 1024 * 1024 * 1024,
          used_bytes: 890 * 1024 * 1024 * 1024,
          free_bytes: 134 * 1024 * 1024 * 1024,
          is_removable: false,
          icon_hint: "hard_drive",
          is_ready: true,
        },
        {
          id: "E:",
          label: "Kingston DataTraveler 64GB",
          device_type: "usb_drive",
          root_path: "E:\\",
          total_bytes: 64 * 1024 * 1024 * 1024,
          used_bytes: 48 * 1024 * 1024 * 1024,
          free_bytes: 16 * 1024 * 1024 * 1024,
          is_removable: true,
          icon_hint: "usb",
          is_ready: true,
        },
        {
          id: "mtp://Samsung-Galaxy-S24",
          label: "Samsung Galaxy S24",
          device_type: "mtp_device",
          root_path: "mtp://Samsung-Galaxy-S24",
          total_bytes: 128 * 1024 * 1024 * 1024,
          used_bytes: 98 * 1024 * 1024 * 1024,
          free_bytes: 30 * 1024 * 1024 * 1024,
          is_removable: true,
          icon_hint: "phone",
          is_ready: true,
        },
      ];
      return devices;
    }

    if (cmd === "get_disk_info") {
      const drive = (args?.drive || "").toLowerCase();
      if (drive.includes("mtp") || drive.includes("galaxy") || drive.includes("samsung")) {
        const info: DiskInfo = {
          total_bytes: 128 * 1024 * 1024 * 1024,
          used_bytes: 98 * 1024 * 1024 * 1024,
          free_bytes: 30 * 1024 * 1024 * 1024,
          drive_label: "Samsung Galaxy S24",
        };
        return info;
      }
      if (drive.includes("e:") || drive.includes("kingston") || drive.includes("usb")) {
        const info: DiskInfo = {
          total_bytes: 64 * 1024 * 1024 * 1024,
          used_bytes: 48 * 1024 * 1024 * 1024,
          free_bytes: 16 * 1024 * 1024 * 1024,
          drive_label: "Kingston DataTraveler 64GB",
        };
        return info;
      }
      if (drive.includes("d:")) {
        const info: DiskInfo = {
          total_bytes: 1024 * 1024 * 1024 * 1024,
          used_bytes: 890 * 1024 * 1024 * 1024,
          free_bytes: 134 * 1024 * 1024 * 1024,
          drive_label: "Datos (D:)",
        };
        return info;
      }
      // C: por defecto (1.81 TB como en Windows Explorer)
      const info: DiskInfo = {
        total_bytes: Math.round(1.81 * 1024 * 1024 * 1024 * 1024),
        used_bytes: Math.round(0.68 * 1024 * 1024 * 1024 * 1024),
        free_bytes: Math.round(1.13 * 1024 * 1024 * 1024 * 1024),
        drive_label: "Disco local (C:)",
      };
      return info;
    }

    if (cmd === "build_space_map") {
      const root = args?.root_path || "C:\\";
      const norm = root.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

      // Si es una ruta local de disco de Windows (no MTP), consultar escaneo real del filesystem al servidor
      const isMtpTarget = norm.includes("mtp") || norm.includes("galaxy") || norm.includes("samsung");
      if (!isMtpTarget) {
        try {
          if (typeof window !== "undefined" && typeof fetch !== "undefined") {
            const encoded = encodeURIComponent(root);
            const depth = args?.max_depth || 2;
            const resp = await fetch(`/api/real-scan?path=${encoded}&depth=${depth}`);
            if (resp.ok) {
              const realNode: SpaceMapNode = await resp.json();
              if (realNode && realNode.children && realNode.children.length > 0) {
                // Emitir progreso completado
                emitEvent("spacelens-scan-progress", {
                  scanned_dirs: realNode.children.length,
                  total_size: realNode.size_bytes,
                  current_path: root,
                });
                return realNode;
              }
            }
          }
        } catch (e) {
          console.warn("Fallo al escanear filesystem real vía /api/real-scan, usando árbol simulado:", e);
        }
      }

      // T014: Emisión de 5 eventos de progreso espaciados por 200ms
      const progressSteps = [
        { dirs: 120, size: 25 * 1024 * 1024 * 1024, path: `${root}\\Analizando cabeceras...` },
        { dirs: 480, size: 180 * 1024 * 1024 * 1024, path: `${root}\\Estructura de directorios` },
        { dirs: 1250, size: 540 * 1024 * 1024 * 1024, path: `${root}\\Calculando tamaños acumulados` },
        { dirs: 2900, size: 980 * 1024 * 1024 * 1024, path: `${root}\\Indexando metadatos` },
        { dirs: 4850, size: 1400 * 1024 * 1024 * 1024, path: `${root}\\Generando mapa visual` },
      ];
      for (const step of progressSteps) {
        const payload: SpaceLensScanProgress = {
          scanned_dirs: step.dirs,
          total_size: step.size,
          current_path: step.path,
        };
        emitEvent("spacelens-scan-progress", payload);
        await new Promise((r) => setTimeout(r, 200));
      }

      // T011: Generador de árbol del smartphone Samsung Galaxy S24 (MTP)
      if (norm.includes("mtp") || norm.includes("galaxy") || norm.includes("samsung")) {
        if (norm.endsWith("camera")) {
          const photos: SpaceMapNode[] = [
            {
              name: "VID_20241020_183052.mp4",
              path: `${root}\\VID_20241020_183052.mp4`,
              size_bytes: 2400 * 1024 * 1024,
              is_directory: false,
              extension: "mp4",
              modified_at: "2024-10-20T18:30:52Z",
              children: [],
            },
            {
              name: "VID_20241018_210415.mp4",
              path: `${root}\\VID_20241018_210415.mp4`,
              size_bytes: 1800 * 1024 * 1024,
              is_directory: false,
              extension: "mp4",
              modified_at: "2024-10-18T21:04:15Z",
              children: [],
            },
            {
              name: "VID_20240930_121500.mp4",
              path: `${root}\\VID_20240930_121500.mp4`,
              size_bytes: 1500 * 1024 * 1024,
              is_directory: false,
              extension: "mp4",
              modified_at: "2024-09-30T12:15:00Z",
              children: [],
            },
            {
              name: "IMG_20240915_142010.jpg",
              path: `${root}\\IMG_20240915_142010.jpg`,
              size_bytes: 24 * 1024 * 1024,
              is_directory: false,
              extension: "jpg",
              modified_at: "2024-09-15T14:20:10Z",
              children: [],
            },
            {
              name: "IMG_20240915_142011.jpg",
              path: `${root}\\IMG_20240915_142011.jpg`,
              size_bytes: 22 * 1024 * 1024,
              is_directory: false,
              extension: "jpg",
              modified_at: "2024-09-15T14:20:11Z",
              children: [],
            },
          ];
          for (let i = 1; i <= 200; i++) {
            const isVid = i % 8 === 0;
            const ext = isVid ? "mp4" : "jpg";
            const prefix = isVid ? "VID" : "IMG";
            const size = isVid
              ? (150 + (i % 250)) * 1024 * 1024
              : (8 + (i % 18)) * 1024 * 1024;
            photos.push({
              name: `${prefix}_202408${(i % 28 + 1).toString().padStart(2, "0")}_${i.toString().padStart(4, "0")}.${ext}`,
              path: `${root}\\${prefix}_202408${(i % 28 + 1).toString().padStart(2, "0")}_${i.toString().padStart(4, "0")}.${ext}`,
              size_bytes: size,
              is_directory: false,
              extension: ext,
              modified_at: "2024-08-20T12:00:00Z",
              children: [],
            });
          }
          return {
            name: "Camera",
            path: root,
            size_bytes: 38 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: photos.length,
            modified_at: "2025-02-18T14:20:00Z",
            children: photos,
          };
        }

        if (norm.endsWith("dcim")) {
          return {
            name: "DCIM",
            path: root,
            size_bytes: 45 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 850,
            modified_at: "2025-02-18T14:20:00Z",
            children: [
              {
                name: "Camera",
                path: `${root}\\Camera`,
                size_bytes: 38 * 1024 * 1024 * 1024,
                is_directory: true,
                item_count: 205,
                modified_at: "2025-02-18T14:20:00Z",
                children: [],
              },
              {
                name: "Screenshots",
                path: `${root}\\Screenshots`,
                size_bytes: 4 * 1024 * 1024 * 1024,
                is_directory: true,
                item_count: 350,
                modified_at: "2025-02-16T18:00:00Z",
                children: [],
              },
              {
                name: "WhatsApp Images",
                path: `${root}\\WhatsApp Images`,
                size_bytes: 3 * 1024 * 1024 * 1024,
                is_directory: true,
                item_count: 280,
                modified_at: "2025-02-18T11:00:00Z",
                children: [],
              },
            ],
          };
        }

        if (norm.endsWith("whatsapp")) {
          return {
            name: "WhatsApp",
            path: root,
            size_bytes: 22 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 1240,
            modified_at: "2025-02-18T16:10:00Z",
            children: [
              {
                name: "Media",
                path: `${root}\\Media`,
                size_bytes: 18 * 1024 * 1024 * 1024,
                is_directory: true,
                item_count: 1100,
                modified_at: "2025-02-18T16:10:00Z",
                children: [
                  {
                    name: "WhatsApp Video",
                    path: `${root}\\Media\\WhatsApp Video`,
                    size_bytes: 12 * 1024 * 1024 * 1024,
                    is_directory: true,
                    item_count: 120,
                    modified_at: "2025-02-18T16:10:00Z",
                    children: [],
                  },
                  {
                    name: "WhatsApp Voice Notes",
                    path: `${root}\\Media\\WhatsApp Voice Notes`,
                    size_bytes: Math.round(3.5 * 1024 * 1024 * 1024),
                    is_directory: true,
                    item_count: 650,
                    modified_at: "2025-02-17T22:00:00Z",
                    children: [],
                  },
                  {
                    name: "WhatsApp Documents",
                    path: `${root}\\Media\\WhatsApp Documents`,
                    size_bytes: Math.round(2.5 * 1024 * 1024 * 1024),
                    is_directory: true,
                    item_count: 330,
                    modified_at: "2025-02-18T15:00:00Z",
                    children: [],
                  },
                ],
              },
              {
                name: "Databases",
                path: `${root}\\Databases`,
                size_bytes: 4 * 1024 * 1024 * 1024,
                is_directory: true,
                item_count: 8,
                modified_at: "2025-02-18T04:00:00Z",
                children: [
                  {
                    name: "msgstore.db.crypt14",
                    path: `${root}\\Databases\\msgstore.db.crypt14`,
                    size_bytes: 850 * 1024 * 1024,
                    is_directory: false,
                    extension: "crypt14",
                    modified_at: "2025-02-18T04:00:00Z",
                    children: [],
                  },
                  {
                    name: "msgstore-2025-02-17.1.db.crypt14",
                    path: `${root}\\Databases\\msgstore-2025-02-17.1.db.crypt14`,
                    size_bytes: 840 * 1024 * 1024,
                    is_directory: false,
                    extension: "crypt14",
                    modified_at: "2025-02-17T04:00:00Z",
                    children: [],
                  },
                ],
              },
            ],
          };
        }

        if (norm.endsWith("download")) {
          return {
            name: "Download",
            path: root,
            size_bytes: 15 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 85,
            modified_at: "2025-02-17T19:40:00Z",
            children: [
              {
                name: "Backup_Chats_Telegram.tar",
                path: `${root}\\Backup_Chats_Telegram.tar`,
                size_bytes: Math.round(10.7 * 1024 * 1024 * 1024),
                is_directory: false,
                extension: "tar",
                modified_at: "2025-02-10T11:00:00Z",
                children: [],
              },
              {
                name: "Audios_Conferencia_2024.zip",
                path: `${root}\\Audios_Conferencia_2024.zip`,
                size_bytes: Math.round(4.2 * 1024 * 1024 * 1024),
                is_directory: false,
                extension: "zip",
                modified_at: "2025-02-05T14:30:00Z",
                children: [],
              },
              {
                name: "GigaCare-v1.0.apk",
                path: `${root}\\GigaCare-v1.0.apk`,
                size_bytes: 45 * 1024 * 1024,
                is_directory: false,
                extension: "apk",
                modified_at: "2025-02-15T09:20:00Z",
                children: [],
              },
              {
                name: "Manual_Tecnico_S24.pdf",
                path: `${root}\\Manual_Tecnico_S24.pdf`,
                size_bytes: 28 * 1024 * 1024,
                is_directory: false,
                extension: "pdf",
                modified_at: "2025-01-20T16:00:00Z",
                children: [],
              },
              {
                name: "Documento_Identidad_Escaneado.pdf",
                path: `${root}\\Documento_Identidad_Escaneado.pdf`,
                size_bytes: 12 * 1024 * 1024,
                is_directory: false,
                extension: "pdf",
                modified_at: "2025-02-17T18:00:00Z",
                children: [],
              },
            ],
          };
        }

        // Raíz smartphone S24
        return {
          name: "Almacenamiento interno",
          path: "mtp://Samsung-Galaxy-S24/Almacenamiento interno",
          size_bytes: 128 * 1024 * 1024 * 1024,
          is_directory: true,
          item_count: 7850,
          modified_at: "2025-02-18T16:10:00Z",
          children: [
            {
              name: "DCIM",
              path: "mtp://Samsung-Galaxy-S24/Almacenamiento interno/DCIM",
              size_bytes: 45 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 850,
              modified_at: "2025-02-18T14:20:00Z",
              children: [],
            },
            {
              name: "WhatsApp",
              path: "mtp://Samsung-Galaxy-S24/Almacenamiento interno/WhatsApp",
              size_bytes: 22 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 1240,
              modified_at: "2025-02-18T16:10:00Z",
              children: [],
            },
            {
              name: "Download",
              path: "mtp://Samsung-Galaxy-S24/Almacenamiento interno/Download",
              size_bytes: 15 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 85,
              modified_at: "2025-02-17T19:40:00Z",
              children: [],
            },
            {
              name: "Android/data",
              path: "mtp://Samsung-Galaxy-S24/Almacenamiento interno/Android/data",
              size_bytes: 10 * 1024 * 1024 * 1024,
              is_directory: true,
              is_system: true,
              item_count: 5400,
              modified_at: "2025-02-18T10:00:00Z",
              children: [],
            },
            {
              name: "Music",
              path: "mtp://Samsung-Galaxy-S24/Almacenamiento interno/Music",
              size_bytes: 6 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 240,
              modified_at: "2025-01-10T12:00:00Z",
              children: [],
            },
          ],
        };
      }

      // T012: Generador de árbol del USB Kingston 64GB
      if (norm.startsWith("e:") || norm.includes("kingston")) {
        if (norm.includes("backup")) {
          return {
            name: "Backups",
            path: root,
            size_bytes: 25 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 14,
            modified_at: "2025-02-10T15:00:00Z",
            children: [
              {
                name: "backup_sistema_2024.zip",
                path: `${root}\\backup_sistema_2024.zip`,
                size_bytes: 18 * 1024 * 1024 * 1024,
                is_directory: false,
                extension: "zip",
                modified_at: "2025-02-10T15:00:00Z",
                children: [],
              },
              {
                name: "workspace_archive.tar.gz",
                path: `${root}\\workspace_archive.tar.gz`,
                size_bytes: 7 * 1024 * 1024 * 1024,
                is_directory: false,
                extension: "gz",
                modified_at: "2025-01-15T18:20:00Z",
                children: [],
              },
            ],
          };
        }
        if (norm.includes("película") || norm.includes("pelicula") || norm.includes("movie")) {
          return {
            name: "Películas",
            path: root,
            size_bytes: 15 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 4,
            modified_at: "2025-01-20T22:30:00Z",
            children: [
              {
                name: "Dune_Part_Two_2024_1080p.mkv",
                path: `${root}\\Dune_Part_Two_2024_1080p.mkv`,
                size_bytes: Math.round(8.5 * 1024 * 1024 * 1024),
                is_directory: false,
                extension: "mkv",
                modified_at: "2025-01-20T22:30:00Z",
                children: [],
              },
              {
                name: "Interstellar_IMAX_Remaster.mp4",
                path: `${root}\\Interstellar_IMAX_Remaster.mp4`,
                size_bytes: Math.round(6.5 * 1024 * 1024 * 1024),
                is_directory: false,
                extension: "mp4",
                modified_at: "2025-01-18T19:00:00Z",
                children: [],
              },
            ],
          };
        }
        if (norm.includes("documento")) {
          return {
            name: "Documentos",
            path: root,
            size_bytes: 5 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 180,
            modified_at: "2025-02-15T09:00:00Z",
            children: [
              {
                name: "Contratos_Firmados_2024.zip",
                path: `${root}\\Contratos_Firmados_2024.zip`,
                size_bytes: Math.round(2.8 * 1024 * 1024 * 1024),
                is_directory: false,
                extension: "zip",
                modified_at: "2025-02-15T09:00:00Z",
                children: [],
              },
              {
                name: "Tesis_Final_Version_Aprobada.pdf",
                path: `${root}\\Tesis_Final_Version_Aprobada.pdf`,
                size_bytes: Math.round(1.2 * 1024 * 1024 * 1024),
                is_directory: false,
                extension: "pdf",
                modified_at: "2025-01-10T12:00:00Z",
                children: [],
              },
              {
                name: "Balance_General_2024.xlsx",
                path: `${root}\\Balance_General_2024.xlsx`,
                size_bytes: 1024 * 1024 * 1024,
                is_directory: false,
                extension: "xlsx",
                modified_at: "2025-02-01T15:30:00Z",
                children: [],
              },
            ],
          };
        }
        if (norm.includes("foto")) {
          return {
            name: "Fotos Viaje 2024",
            path: root,
            size_bytes: 3 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 450,
            modified_at: "2025-01-18T17:00:00Z",
            children: [
              {
                name: "Fotos_Japon_Dia_1_a_5.zip",
                path: `${root}\\Fotos_Japon_Dia_1_a_5.zip`,
                size_bytes: Math.round(1.8 * 1024 * 1024 * 1024),
                is_directory: false,
                extension: "zip",
                modified_at: "2025-01-18T17:00:00Z",
                children: [],
              },
              {
                name: "Fotos_Japon_Dia_6_a_10.zip",
                path: `${root}\\Fotos_Japon_Dia_6_a_10.zip`,
                size_bytes: Math.round(1.2 * 1024 * 1024 * 1024),
                is_directory: false,
                extension: "zip",
                modified_at: "2025-01-18T17:00:00Z",
                children: [],
              },
            ],
          };
        }
        return {
          name: "Kingston DataTraveler 64GB",
          path: "E:\\",
          size_bytes: 64 * 1024 * 1024 * 1024,
          is_directory: true,
          item_count: 648,
          modified_at: "2025-02-15T09:00:00Z",
          children: [
            {
              name: "Backups",
              path: "E:\\Backups",
              size_bytes: 25 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 14,
              modified_at: "2025-02-10T15:00:00Z",
              children: [],
            },
            {
              name: "Películas",
              path: "E:\\Películas",
              size_bytes: 15 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 4,
              modified_at: "2025-01-20T22:30:00Z",
              children: [],
            },
            {
              name: "Documentos",
              path: "E:\\Documentos",
              size_bytes: 5 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 180,
              modified_at: "2025-02-15T09:00:00Z",
              children: [],
            },
            {
              name: "Fotos Viaje 2024",
              path: "E:\\Fotos Viaje 2024",
              size_bytes: 3 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 450,
              modified_at: "2025-01-18T17:00:00Z",
              children: [],
            },
          ],
        };
      }

      // T010: Generador de árbol dinámico del disco C: (2 TB)
      if (norm.endsWith("downloads")) {
        return {
          name: "Downloads",
          path: root,
          size_bytes: 120 * 1024 * 1024 * 1024,
          is_directory: true,
          item_count: 142,
          modified_at: "2025-02-18T15:20:00Z",
          children: [
            {
              name: "Torrents",
              path: `${root}\\Torrents`,
              size_bytes: Math.round(69.5 * 1024 * 1024 * 1024),
              is_directory: true,
              item_count: 18,
              modified_at: "2025-02-14T10:00:00Z",
              children: [],
            },
            {
              name: "dataset-ml-backup-2024.zip",
              path: `${root}\\dataset-ml-backup-2024.zip`,
              size_bytes: Math.round(18.5 * 1024 * 1024 * 1024),
              is_directory: false,
              extension: "zip",
              modified_at: "2025-02-10T11:20:00Z",
              children: [],
            },
            {
              name: "large_archive_project_assets.rar",
              path: `${root}\\large_archive_project_assets.rar`,
              size_bytes: Math.round(14.2 * 1024 * 1024 * 1024),
              is_directory: false,
              extension: "rar",
              modified_at: "2025-02-08T15:40:00Z",
              children: [],
            },
            {
              name: "Windows11_InsiderPreview_Client_x64_es-es.iso",
              path: `${root}\\Windows11_InsiderPreview_Client_x64_es-es.iso`,
              size_bytes: Math.round(6.2 * 1024 * 1024 * 1024),
              is_directory: false,
              extension: "iso",
              modified_at: "2025-01-15T09:12:00Z",
              children: [],
            },
            {
              name: "ubuntu-24.04-desktop-amd64.iso",
              path: `${root}\\ubuntu-24.04-desktop-amd64.iso`,
              size_bytes: Math.round(5.8 * 1024 * 1024 * 1024),
              is_directory: false,
              extension: "iso",
              modified_at: "2025-01-12T14:30:00Z",
              children: [],
            },
            {
              name: "DaVinci_Resolve_Studio_19.0_Windows.zip",
              path: `${root}\\DaVinci_Resolve_Studio_19.0_Windows.zip`,
              size_bytes: Math.round(4.8 * 1024 * 1024 * 1024),
              is_directory: false,
              extension: "zip",
              modified_at: "2025-02-01T20:10:00Z",
              children: [],
            },
            {
              name: "docker-desktop-installer.exe",
              path: `${root}\\docker-desktop-installer.exe`,
              size_bytes: 650 * 1024 * 1024,
              is_directory: false,
              extension: "exe",
              modified_at: "2025-02-15T08:05:00Z",
              children: [],
            },
            {
              name: "blender-4.3.0-windows-x64.zip",
              path: `${root}\\blender-4.3.0-windows-x64.zip`,
              size_bytes: 340 * 1024 * 1024,
              is_directory: false,
              extension: "zip",
              modified_at: "2025-01-30T17:22:00Z",
              children: [],
            },
            {
              name: "VSCodeUserSetup-x64-1.95.exe",
              path: `${root}\\VSCodeUserSetup-x64-1.95.exe`,
              size_bytes: 98 * 1024 * 1024,
              is_directory: false,
              extension: "exe",
              modified_at: "2025-02-12T13:45:00Z",
              children: [],
            },
            {
              name: "node-v22.12.0-x64.msi",
              path: `${root}\\node-v22.12.0-x64.msi`,
              size_bytes: 32 * 1024 * 1024,
              is_directory: false,
              extension: "msi",
              modified_at: "2025-02-16T19:00:00Z",
              children: [],
            },
            {
              name: "Reporte_Trimestral_Q4_2024.pdf",
              path: `${root}\\Reporte_Trimestral_Q4_2024.pdf`,
              size_bytes: 15 * 1024 * 1024,
              is_directory: false,
              extension: "pdf",
              modified_at: "2025-02-18T14:00:00Z",
              children: [],
            },
          ],
        };
      }

      if (norm.endsWith("videos")) {
        return {
          name: "Videos",
          path: root,
          size_bytes: 180 * 1024 * 1024 * 1024,
          is_directory: true,
          item_count: 85,
          modified_at: "2025-02-16T21:10:00Z",
          children: [
            {
              name: "grabaciones_obs",
              path: `${root}\\grabaciones_obs`,
              size_bytes: 72 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 40,
              modified_at: "2025-02-17T22:00:00Z",
              children: [],
            },
            {
              name: "vacaciones_japon_4k.mp4",
              path: `${root}\\vacaciones_japon_4k.mp4`,
              size_bytes: 42 * 1024 * 1024 * 1024,
              is_directory: false,
              extension: "mp4",
              modified_at: "2025-01-20T18:00:00Z",
              children: [],
            },
            {
              name: "concierto_en_vivo_1080p.mkv",
              path: `${root}\\concierto_en_vivo_1080p.mkv`,
              size_bytes: 28 * 1024 * 1024 * 1024,
              is_directory: false,
              extension: "mkv",
              modified_at: "2025-01-25T20:30:00Z",
              children: [],
            },
            {
              name: "screencast_masterclass_01.mp4",
              path: `${root}\\screencast_masterclass_01.mp4`,
              size_bytes: 18 * 1024 * 1024 * 1024,
              is_directory: false,
              extension: "mp4",
              modified_at: "2025-02-05T14:10:00Z",
              children: [],
            },
            {
              name: "podcast_episodio_final.mov",
              path: `${root}\\podcast_episodio_final.mov`,
              size_bytes: 12 * 1024 * 1024 * 1024,
              is_directory: false,
              extension: "mov",
              modified_at: "2025-02-11T16:45:00Z",
              children: [],
            },
            {
              name: "render_3d_animacion_v03.mp4",
              path: `${root}\\render_3d_animacion_v03.mp4`,
              size_bytes: 8 * 1024 * 1024 * 1024,
              is_directory: false,
              extension: "mp4",
              modified_at: "2025-02-14T19:20:00Z",
              children: [],
            },
          ],
        };
      }

      if (norm.endsWith("workspace")) {
        return {
          name: "Workspace",
          path: root,
          size_bytes: 198 * 1024 * 1024 * 1024,
          is_directory: true,
          item_count: 24500,
          modified_at: "2025-02-18T17:50:00Z",
          children: [
            {
              name: "ai_experiments",
              path: `${root}\\ai_experiments`,
              size_bytes: 80 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 8500,
              modified_at: "2025-02-18T16:00:00Z",
              children: [],
            },
            {
              name: "node_monorepo",
              path: `${root}\\node_monorepo`,
              size_bytes: 65 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 12000,
              modified_at: "2025-02-17T11:20:00Z",
              children: [],
            },
            {
              name: "rust_engine",
              path: `${root}\\rust_engine`,
              size_bytes: 35 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 3200,
              modified_at: "2025-02-15T09:40:00Z",
              children: [],
            },
            {
              name: "gigacare",
              path: `${root}\\gigacare`,
              size_bytes: 18 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 800,
              modified_at: "2025-02-18T17:50:00Z",
              children: [],
            },
          ],
        };
      }

      if (norm.endsWith("luciano")) {
        return {
          name: "Luciano",
          path: root,
          size_bytes: 780 * 1024 * 1024 * 1024,
          is_directory: true,
          item_count: 48500,
          modified_at: "2025-02-18T18:20:00Z",
          children: [
            {
              name: "Workspace",
              path: `${root}\\Workspace`,
              size_bytes: 198 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 24500,
              modified_at: "2025-02-18T17:50:00Z",
              children: [],
            },
            {
              name: "Videos",
              path: `${root}\\Videos`,
              size_bytes: 180 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 85,
              modified_at: "2025-02-16T21:10:00Z",
              children: [],
            },
            {
              name: "Downloads",
              path: `${root}\\Downloads`,
              size_bytes: 120 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 142,
              modified_at: "2025-02-18T15:20:00Z",
              children: [],
            },
            {
              name: "AppData",
              path: `${root}\\AppData`,
              size_bytes: 95 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 15200,
              modified_at: "2025-02-18T14:00:00Z",
              children: [],
            },
            {
              name: "Documents",
              path: `${root}\\Documents`,
              size_bytes: 85 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 4200,
              modified_at: "2025-02-17T11:45:00Z",
              children: [],
            },
            {
              name: "Pictures",
              path: `${root}\\Pictures`,
              size_bytes: 65 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 3600,
              modified_at: "2025-02-15T19:30:00Z",
              children: [],
            },
            {
              name: "Music",
              path: `${root}\\Music`,
              size_bytes: 25 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 1200,
              modified_at: "2025-01-28T16:15:00Z",
              children: [],
            },
            {
              name: "Desktop",
              path: `${root}\\Desktop`,
              size_bytes: 12 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 28,
              modified_at: "2025-02-18T12:00:00Z",
              children: [],
            },
          ],
        };
      }

      if (norm.endsWith("users") || norm.endsWith("usuarios")) {
        return {
          name: "Users",
          path: root,
          size_bytes: 780 * 1024 * 1024 * 1024,
          is_directory: true,
          item_count: 48500,
          modified_at: "2025-02-18T18:20:00Z",
          children: [
            {
              name: "Luciano",
              path: `${root}\\Luciano`,
              size_bytes: 752 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 48450,
              modified_at: "2025-02-18T18:20:00Z",
              children: [],
            },
            {
              name: "Acceso público",
              path: `${root}\\Public`,
              size_bytes: 18 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 32,
              modified_at: "2025-01-10T10:00:00Z",
              children: [],
            },
            {
              name: "Default",
              path: `${root}\\Default`,
              size_bytes: 10 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 18,
              modified_at: "2024-11-20T09:00:00Z",
              children: [],
            },
          ],
        };
      }

      if (norm.endsWith("program files") || norm.endsWith("archivos de programa")) {
        return {
          name: "Program Files",
          path: root,
          size_bytes: 145 * 1024 * 1024 * 1024,
          is_directory: true,
          item_count: 12400,
          modified_at: "2025-02-10T12:00:00Z",
          children: [
            {
              name: "Docker",
              path: `${root}\\Docker`,
              size_bytes: 45 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 4500,
              modified_at: "2025-02-14T08:30:00Z",
              children: [],
            },
            {
              name: "Adobe",
              path: `${root}\\Adobe`,
              size_bytes: 38 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 1800,
              modified_at: "2025-01-25T14:00:00Z",
              children: [],
            },
            {
              name: "Google",
              path: `${root}\\Google`,
              size_bytes: 22 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 2100,
              modified_at: "2025-02-08T11:00:00Z",
              children: [],
            },
            {
              name: "Microsoft VS Code",
              path: `${root}\\Microsoft VS Code`,
              size_bytes: 18 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 3200,
              modified_at: "2025-02-10T12:00:00Z",
              children: [],
            },
            {
              name: "Git",
              path: `${root}\\Git`,
              size_bytes: 2 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 500,
              modified_at: "2025-01-10T10:00:00Z",
              children: [],
            },
            {
              name: "nodejs",
              path: `${root}\\nodejs`,
              size_bytes: Math.round(1.2 * 1024 * 1024 * 1024),
              is_directory: true,
              item_count: 300,
              modified_at: "2025-02-16T19:00:00Z",
              children: [],
            },
          ],
        };
      }

      if (norm.endsWith("windows")) {
        return {
          name: "Windows",
          path: root,
          size_bytes: 42 * 1024 * 1024 * 1024,
          is_directory: true,
          is_system: true,
          item_count: 36000,
          modified_at: "2025-02-12T09:00:00Z",
          children: [
            {
              name: "System32",
              path: `${root}\\System32`,
              size_bytes: 24 * 1024 * 1024 * 1024,
              is_directory: true,
              is_system: true,
              item_count: 14500,
              modified_at: "2025-02-12T09:00:00Z",
              children: [],
            },
            {
              name: "SysWOW64",
              path: `${root}\\SysWOW64`,
              size_bytes: 8 * 1024 * 1024 * 1024,
              is_directory: true,
              is_system: true,
              item_count: 6200,
              modified_at: "2025-02-12T09:00:00Z",
              children: [],
            },
            {
              name: "WinSxS",
              path: `${root}\\WinSxS`,
              size_bytes: 7 * 1024 * 1024 * 1024,
              is_directory: true,
              is_system: true,
              item_count: 12000,
              modified_at: "2025-02-12T09:00:00Z",
              children: [],
            },
            {
              name: "SoftwareDistribution",
              path: `${root}\\SoftwareDistribution`,
              size_bytes: 3 * 1024 * 1024 * 1024,
              is_directory: true,
              is_system: true,
              item_count: 3300,
              modified_at: "2025-02-12T09:00:00Z",
              children: [],
            },
          ],
        };
      }

      // Disco D:
      if (norm.startsWith("d:")) {
        return {
          name: "Datos (D:)",
          path: "D:\\",
          size_bytes: 1024 * 1024 * 1024 * 1024,
          is_directory: true,
          item_count: 42000,
          modified_at: "2025-02-15T10:00:00Z",
          children: [
            {
              name: "Games",
              path: "D:\\Games",
              size_bytes: 620 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 18,
              modified_at: "2025-02-10T14:00:00Z",
              children: [],
            },
            {
              name: "Media_Library",
              path: "D:\\Media_Library",
              size_bytes: 220 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 154,
              modified_at: "2025-02-12T19:30:00Z",
              children: [],
            },
            {
              name: "Virtual_Machines",
              path: "D:\\Virtual_Machines",
              size_bytes: 50 * 1024 * 1024 * 1024,
              is_directory: true,
              item_count: 6,
              modified_at: "2025-01-28T11:00:00Z",
              children: [],
            },
          ],
        };
      }

      // Raíz por defecto Disco C: (2 TB)
      return {
        name: "Disco Local (C:)",
        path: "C:\\",
        size_bytes: 2 * 1024 * 1024 * 1024 * 1024,
        is_directory: true,
        item_count: 104500,
        modified_at: "2025-02-18T18:20:00Z",
        children: [
          {
            name: "Users",
            path: "C:\\Users",
            size_bytes: 780 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 48500,
            modified_at: "2025-02-18T18:20:00Z",
            children: [],
          },
          {
            name: "Program Files",
            path: "C:\\Program Files",
            size_bytes: 145 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 12400,
            modified_at: "2025-02-10T12:00:00Z",
            children: [],
          },
          {
            name: "Program Files (x86)",
            path: "C:\\Program Files (x86)",
            size_bytes: 35 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 5200,
            modified_at: "2025-01-20T10:15:00Z",
            children: [],
          },
          {
            name: "Windows",
            path: "C:\\Windows",
            size_bytes: 42 * 1024 * 1024 * 1024,
            is_directory: true,
            is_system: true,
            item_count: 36000,
            modified_at: "2025-02-12T09:00:00Z",
            children: [],
          },
          {
            name: "ProgramData",
            path: "C:\\ProgramData",
            size_bytes: 28 * 1024 * 1024 * 1024,
            is_directory: true,
            is_system: true,
            item_count: 8900,
            modified_at: "2025-02-15T08:30:00Z",
            children: [],
          },
          {
            name: "$Recycle.Bin",
            path: "C:\\$Recycle.Bin",
            size_bytes: 15 * 1024 * 1024 * 1024,
            is_directory: true,
            item_count: 145,
            modified_at: "2025-02-18T16:40:00Z",
            children: [],
          },
          {
            name: "pagefile.sys",
            path: "C:\\pagefile.sys",
            size_bytes: 16 * 1024 * 1024 * 1024,
            is_directory: false,
            extension: "sys",
            is_system: true,
            modified_at: "2025-02-18T00:00:00Z",
            children: [],
          },
          {
            name: "hiberfil.sys",
            path: "C:\\hiberfil.sys",
            size_bytes: 8 * 1024 * 1024 * 1024,
            is_directory: false,
            extension: "sys",
            is_system: true,
            modified_at: "2025-02-18T00:00:00Z",
            children: [],
          },
        ],
      };
    }

    // 6. Configuración de la App
    if (cmd === "get_config") {
      return getStoredConfig();
    }

    if (cmd === "update_config") {
      const updated = args?.config || {};
      const current = getStoredConfig();
      const merged: AppConfig = {
        ...current,
        ...updated,
        scanning: {
          ...current.scanning,
          ...(updated.scanning || {}),
        },
        quarantine: {
          ...current.quarantine,
          ...(updated.quarantine || {}),
        },
        photos: {
          ...current.photos,
          ...(updated.photos || {}),
        },
        ai_providers: {
          ...current.ai_providers,
          ...(updated.ai_providers || {}),
        },
        byok: {
          ...current.byok,
          ...(updated.byok || {}),
        },
        space_map: {
          ...current.space_map,
          ...(updated.space_map || {}),
        },
      };
      setStoredConfig(merged);
      return merged;
    }

    if (cmd === "export_config") {
      return JSON.stringify(getStoredConfig(), null, 2);
    }

    if (cmd === "import_config") {
      const parsed = JSON.parse(args?.json || "{}");
      setStoredConfig(parsed);
      return parsed;
    }

    if (cmd === "validate_api_key") {
      const key = args?.key || "";
      const valid = key.trim().length > 5;
      const res: ValidationResult = {
        valid,
        message: valid ? `Clave de API válida para ${args?.provider || "proveedor IA"}` : "Clave vacía o inválida",
      };
      return res;
    }

    // 7. Licencia
    if (cmd === "get_license_tier") {
      return "pro";
    }

    if (cmd === "activate_pro") {
      const res: ActivationResult = {
        success: true,
        tier: "pro",
        message: "Licencia Pro activada satisfactoriamente con acceso multimodal ilimitado.",
      };
      return res;
    }

    // 8. Elementos de Inicio & Apps
    if (cmd === "list_startup_items") {
      try {
        const resp = await fetch("/api/real-startup-items");
        if (resp.ok) {
          const realItems: StartupItem[] = await resp.json();
          if (Array.isArray(realItems) && realItems.length > 0) {
            return realItems;
          }
        }
      } catch (err) {
        console.warn("[Bridge] Fallback real startup items:", err);
      }

      const items: StartupItem[] = [
        { id: "st-1", name: "Microsoft OneDrive", path: "C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe", source: "registry_hkcu", impact: "high", enabled: true, protected: false },
        { id: "st-2", name: "Docker Desktop", path: "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe -Autostart", source: "registry_hkcu", impact: "high", enabled: true, protected: false },
        { id: "st-3", name: "Discord", path: "C:\\Users\\Luciano\\AppData\\Local\\Discord\\app-1.0.9142\\Discord.exe", source: "registry_hkcu", impact: "medium", enabled: true, protected: false },
        { id: "st-4", name: "Spotify", path: "C:\\Users\\Luciano\\AppData\\Roaming\\Spotify\\Spotify.exe", source: "registry_hkcu", impact: "low", enabled: false, protected: false },
        { id: "st-5", name: "Steam Client Bootstrapper", path: "C:\\Program Files (x86)\\Steam\\steam.exe -silent", source: "registry_hkcu", impact: "medium", enabled: false, protected: false },
        { id: "st-6", name: "Epic Games Launcher", path: "C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe -silent", source: "registry_hkcu", impact: "medium", enabled: false, protected: false },
        { id: "st-7", name: "Ollama", path: "C:\\Users\\Luciano\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\Ollama.lnk", source: "startup_folder", impact: "medium", enabled: true, protected: false },
        { id: "st-8", name: "Google Chrome Auto Launch", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe --no-startup-window", source: "registry_hkcu", impact: "low", enabled: true, protected: false },
        { id: "st-9", name: "Seguridad de Windows", path: "C:\\Windows\\System32\\SecurityHealthSystray.exe", source: "registry_hklm", impact: "high", enabled: true, protected: true },
        { id: "st-10", name: "AMD Software Notification", path: "C:\\Program Files\\AMD\\CNext\\CNext\\RadeonSoftware.exe", source: "registry_hklm", impact: "low", enabled: true, protected: false },
      ];
      return items;
    }

    if (cmd === "toggle_startup_item") {
      if (args?.item_id === "st-4" || String(args?.item_id).toLowerCase().includes("securityhealth")) {
        throw new Error("El servicio de Seguridad de Windows está protegido y no se puede desactivar.");
      }
      return { success: true };
    }

    if (cmd === "compute_savings") {
      const selectedPaths: string[] = args?.selected_paths || [];
      const diskRoot: string = args?.disk_root || "C:\\";
      const totalBytes = selectedPaths.length * 500 * 1024 * 1024;
      const diskTotal = 2 * 1024 * 1024 * 1024 * 1024; // 2 TB

      return {
        folder_savings_bytes: totalBytes,
        folder_name: "Descargas",
        disk_savings_bytes: totalBytes,
        disk_label: diskRoot.startsWith("C") ? "Disco C:" : `Disco ${diskRoot}`,
        disk_total_bytes: diskTotal,
        percentage: parseFloat(((totalBytes / diskTotal) * 100).toFixed(2)),
      };
    }

    if (cmd === "suggest_auto_rules") {
      let nodes = args?.nodes || [];
      const now = Date.now();
      const ninetyDaysMs = 90 * 86400 * 1000;

      const screenshotMatches = nodes.filter((n: any) => {
        const name = (n.name || "").toLowerCase();
        const ext = (n.extension || "").toLowerCase();
        const isImg = ["png", "jpg", "jpeg"].includes(ext);
        const isSs = name.includes("screenshot") || name.includes("captura");
        const mod = n.modified_at ? n.modified_at * 1000 : (now - 100 * 86400 * 1000);
        return isImg && isSs && (now - mod >= ninetyDaysMs);
      });

      const rules = [];
      if (screenshotMatches.length > 0) {
        rules.push({
          id: "rule-screenshots-90d",
          description: "Capturas de pantalla con más de 90 días de antigüedad",
          condition: {
            conditions: [
              { field: "category", operator: "eq", value: "image" },
              { field: "name", operator: "contains", value: "screenshot" },
              { field: "modified_at", operator: "older_than_days", value: 90 }
            ],
            logical_operator: "AND",
          },
          matched_count: screenshotMatches.length,
          matched_bytes: screenshotMatches.reduce((acc: number, n: any) => acc + (n.size_bytes || 0), 0),
          user_approved: false,
        });
      } else {
        // Mock demostrativo inicial
        rules.push({
          id: "rule-screenshots-90d",
          description: "Capturas de pantalla con más de 90 días de antigüedad",
          condition: { conditions: [], logical_operator: "AND" },
          matched_count: 8,
          matched_bytes: 18 * 1024 * 1024,
          user_approved: false,
        });
      }
      return rules;
    }

    if (cmd === "nl_query_files") {
      const query: string = args?.query || "";
      const qLower = query.toLowerCase();

      // Nodos simulados si no se proporcionan
      let nodes = args?.nodes;
      if (!nodes || !nodes.length) {
        nodes = [
          { path: "C:\\Downloads\\large_video.mp4", name: "large_video.mp4", size_bytes: 2500000000, is_directory: false, extension: "mp4" },
          { path: "C:\\Downloads\\movie_4k.mkv", name: "movie_4k.mkv", size_bytes: 4800000000, is_directory: false, extension: "mkv" },
          { path: "C:\\Downloads\\notes.txt", name: "notes.txt", size_bytes: 2048, is_directory: false, extension: "txt" },
        ];
      }

      const isVideoQuery = qLower.includes("video") || qLower.includes("pelicula") || qLower.includes("película");
      const matched = nodes.filter((n: any) => {
        if (isVideoQuery) {
          const ext = (n.extension || "").toLowerCase();
          return ["mp4", "mkv", "avi", "mov"].includes(ext);
        }
        return n.size_bytes > 100 * 1024 * 1024;
      });

      const totalBytes = matched.reduce((acc: number, item: any) => acc + (item.size_bytes || 0), 0);
      const gb = (totalBytes / (1024 * 1024 * 1024)).toFixed(1);

      return {
        query_parsed: {
          conditions: [
            { field: isVideoQuery ? "category" : "size_bytes", operator: isVideoQuery ? "eq" : "gt", value: isVideoQuery ? "video" : 104857600 }
          ],
          logical_operator: "AND",
        },
        matched_paths: matched.map((m: any) => m.path),
        total_matched: matched.length,
        total_bytes: totalBytes,
        summary: `Se identificaron ${matched.length} archivos (${gb} GB recuperables)`,
        answer: `### 📂 Análisis Inteligente de Archivos\n\nSe analizaron **${nodes.length} archivos** en esta carpeta:\n\n- **Identificación:** Son grabaciones de video de cámara de acción (formato DJI Action) en alta resolución.\n- **Significado:** El nombre de la carpeta indica tomas originales pesadas reservadas para transcodificación o edición.\n- **Espacio ocupado:** Representan **${gb} GB** acumulados.\n- **Recomendación:** Si ya cuentas con copias o versiones convertidas, puedes enviarlos a Cuarentena de forma segura.`,
        provider: "GigaCare Local Engine",
      };
    }

    if (cmd === "get_file_preview") {
      const filePath: string = args?.path || "";
      const lower = filePath.toLowerCase();
      const isVideo = lower.endsWith(".mp4") || lower.endsWith(".mkv") || lower.endsWith(".avi") || lower.endsWith(".mov") || lower.endsWith(".webm");
      const isImage = lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp") || lower.endsWith(".bmp") || lower.endsWith(".gif");

      const rawUrl = `/api/raw-file?path=${encodeURIComponent(filePath)}`;

      if (isImage) {
        return {
          preview_url: rawUrl,
          preview_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEfQHzRgyQpwAAAABJRU5ErkJggg==",
          media_type: "image/jpeg",
          metadata: {
            dimensions: "1920x1080",
            codec: "jpeg",
            modified_at: "2025-02-18T12:00:00Z",
            size_bytes: 2450000,
          },
        };
      }

      if (isVideo) {
        return {
          preview_url: rawUrl,
          preview_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkWPjfDwAEfQHzRgyQpwAAAABJRU5ErkJggg==",
          media_type: "video/mp4",
          metadata: {
            dimensions: "3840x2160",
            codec: "h264",
            modified_at: "2025-02-18T14:30:00Z",
            size_bytes: 650000000,
          },
        };
      }

      return {
        preview_base64: "",
        media_type: "application/octet-stream",
        metadata: {
          dimensions: null,
          codec: null,
          modified_at: "2025-02-18T10:00:00Z",
          size_bytes: 1024,
        },
      };
    }

    if (cmd === "compute_treemap_layout") {
      const nodes: LayoutNode[] = args?.nodes || [];
      const container: Rect = args?.container || { x: 0, y: 0, w: 800, h: 600 };
      if (!nodes.length || container.w <= 0 || container.h <= 0) return [];

      const sorted = [...nodes].filter(n => n.size_bytes > 0).sort((a, b) => b.size_bytes - a.size_bytes);
      const totalSize = sorted.reduce((sum, n) => sum + n.size_bytes, 0);
      const totalArea = container.w * container.h;
      if (totalSize <= 0 || totalArea <= 0) return [];

      const scale = totalArea / totalSize;
      const normalized = sorted.map((n, idx) => ({ idx, node: n, area: n.size_bytes * scale }));

      const worstAspect = (row: number[], side: number) => {
        if (!row.length || side <= 0) return Infinity;
        const sum = row.reduce((a, b) => a + b, 0);
        if (sum <= 0) return Infinity;
        const s2 = side * side;
        const sum2 = sum * sum;
        return row.reduce((max, r) => Math.max(max, (s2 * r) / sum2, sum2 / (s2 * r)), 0);
      };

      const rects: TreemapRect[] = [];
      let rem = { ...container };
      let currentRow: { idx: number; node: LayoutNode; area: number }[] = [];

      const flushRow = (row: typeof currentRow) => {
        if (!row.length) return;
        const rowSum = row.reduce((s, item) => s + item.area, 0);
        if (rem.w < rem.h) {
          const rowH = rowSum / rem.w;
          let curX = rem.x;
          for (const item of row) {
            const itemW = item.area / rowH;
            rects.push({
              path: item.node.path,
              name: item.node.name,
              rect: { x: curX, y: rem.y, w: itemW, h: rowH },
              size_bytes: item.node.size_bytes,
              depth: 1,
              is_directory: item.node.is_directory,
              extension: item.node.extension,
              is_system: item.node.is_system,
            });
            curX += itemW;
          }
          rem.y += rowH;
          rem.h -= rowH;
        } else {
          const rowW = rowSum / rem.h;
          let curY = rem.y;
          for (const item of row) {
            const itemH = item.area / rowW;
            rects.push({
              path: item.node.path,
              name: item.node.name,
              rect: { x: rem.x, y: curY, w: rowW, h: itemH },
              size_bytes: item.node.size_bytes,
              depth: 1,
              is_directory: item.node.is_directory,
              extension: item.node.extension,
              is_system: item.node.is_system,
            });
            curY += itemH;
          }
          rem.x += rowW;
          rem.w -= rowW;
        }
      };

      for (const item of normalized) {
        const side = Math.min(rem.w, rem.h);
        if (side <= 0) break;
        if (!currentRow.length) {
          currentRow.push(item);
        } else {
          const areasWithout = currentRow.map(i => i.area);
          const areasWith = [...areasWithout, item.area];
          if (worstAspect(areasWith, side) <= worstAspect(areasWithout, side)) {
            currentRow.push(item);
          } else {
            flushRow(currentRow);
            currentRow = [item];
          }
        }
      }
      if (currentRow.length) flushRow(currentRow);
      return rects;
    }

    if (cmd === "compute_sunburst_layout") {
      const root: LayoutNode = args?.root;
      const center: Point = args?.center || { x: 400, y: 300 };
      const innerRadius: number = args?.inner_radius || 40;
      const ringWidth: number = args?.ring_width || 30;
      const maxDepth: number = args?.max_depth || 3;
      if (!root || root.size_bytes <= 0 || maxDepth <= 0) return [];

      const arcs: SunburstArc[] = [];
      arcs.push({
        path: root.path,
        name: root.name,
        center,
        r_inner: innerRadius,
        r_outer: innerRadius + ringWidth,
        start_angle: 0,
        end_angle: 2 * Math.PI,
        depth: 0,
        size_bytes: root.size_bytes,
        is_directory: root.is_directory,
      });

      const recurse = (
        children: LayoutNode[],
        parentSize: number,
        parentStart: number,
        parentEnd: number,
        curDepth: number
      ) => {
        if (curDepth >= maxDepth || !children || !children.length || parentSize <= 0) return;
        const parentSweep = parentEnd - parentStart;
        if (parentSweep < 0.001) return;

        const totalChildrenSize = children.reduce((s, c) => s + c.size_bytes, 0);
        if (totalChildrenSize <= 0) return;
        const baseSize = Math.max(parentSize, totalChildrenSize);
        let curAngle = parentStart;
        const rInner = innerRadius + curDepth * ringWidth;
        const rOuter = rInner + ringWidth;

        for (const child of children) {
          if (child.size_bytes <= 0) continue;
          const sweep = (child.size_bytes / baseSize) * parentSweep;
          if (sweep < 0.001) {
            curAngle += sweep;
            continue;
          }
          const startAngle = curAngle;
          const endAngle = curAngle + sweep;
          arcs.push({
            path: child.path,
            name: child.name,
            center,
            r_inner: rInner,
            r_outer: rOuter,
            start_angle: startAngle,
            end_angle: endAngle,
            depth: curDepth,
            size_bytes: child.size_bytes,
            is_directory: child.is_directory,
          });

          if (child.children && child.children.length && curDepth + 1 < maxDepth) {
            recurse(child.children, child.size_bytes, startAngle, endAngle, curDepth + 1);
          }
          curAngle = endAngle;
        }
      };

      if (maxDepth > 1 && root.children && root.children.length) {
        recurse(root.children, root.size_bytes, 0, 2 * Math.PI, 1);
      }
      return arcs;
    }

    if (cmd === "list_installed_apps" || cmd === "list_installed_apps_with_usage") {
      try {
        const resp = await fetch("/api/real-installed-apps");
        if (resp.ok) {
          const realApps: InstalledApp[] = await resp.json();
          if (Array.isArray(realApps) && realApps.length > 0) {
            return realApps;
          }
        }
      } catch (err) {
        console.warn("[Bridge] Fallback real installed apps:", err);
      }

      const nowMs = Date.now();
      const apps: InstalledApp[] = [
        { id: "app-1", name: "Visual Studio Code", version: "1.92.2", publisher: "Microsoft Corporation", size_bytes: 480 * 1024 * 1024, source: "registry", last_used_days: 1, last_used_at: new Date(nowMs - 86400000).toISOString(), usage_count: 140 },
        { id: "app-2", name: "Google Chrome", version: "128.0.6613.120", publisher: "Google LLC", size_bytes: 650 * 1024 * 1024, source: "registry", last_used_days: 0, last_used_at: new Date(nowMs).toISOString(), usage_count: 420 },
        { id: "app-3", name: "Node.js (LTS)", version: "20.17.0", publisher: "OpenJS Foundation", size_bytes: 280 * 1024 * 1024, source: "registry", last_used_days: 2, last_used_at: new Date(nowMs - 2 * 86400000).toISOString(), usage_count: 55 },
        { id: "app-4", name: "Git for Windows", version: "2.46.0", publisher: "The Git Development Community", size_bytes: 310 * 1024 * 1024, source: "registry", last_used_days: 5, last_used_at: new Date(nowMs - 5 * 86400000).toISOString(), usage_count: 80 },
        { id: "app-5", name: "Steam", version: "2.10.91.91", publisher: "Valve Corporation", size_bytes: 2500 * 1024 * 1024, source: "registry_wow64", last_used_days: 410, last_used_at: new Date(nowMs - 410 * 86400000).toISOString(), usage_count: 4 },
        { id: "app-6", name: "Spotify Music", version: "1.2.45.454", publisher: "Spotify AB", size_bytes: 320 * 1024 * 1024, source: "store", last_used_days: 95, last_used_at: new Date(nowMs - 95 * 86400000).toISOString(), usage_count: 15 },
        { id: "app-7", name: "Discord", version: "1.0.9142", publisher: "Discord Inc.", size_bytes: 290 * 1024 * 1024, source: "registry", last_used_days: 12, last_used_at: new Date(nowMs - 12 * 86400000).toISOString(), usage_count: 32 },
        { id: "app-8", name: "Docker Desktop", version: "4.34.2", publisher: "Docker Inc.", size_bytes: 1400 * 1024 * 1024, source: "registry", last_used_days: 380, last_used_at: new Date(nowMs - 380 * 86400000).toISOString(), usage_count: 2 },
        { id: "app-9", name: "Windows Terminal", version: "1.21.2361.0", publisher: "Microsoft Corporation", size_bytes: 85 * 1024 * 1024, source: "uwp", last_used_days: 0, last_used_at: new Date(nowMs).toISOString(), usage_count: 95 },
        { id: "app-10", name: "Microsoft Teams", version: "24215.1007.3073.3323", publisher: "Microsoft Corporation", size_bytes: 410 * 1024 * 1024, source: "uwp", last_used_days: 180, last_used_at: new Date(nowMs - 180 * 86400000).toISOString(), usage_count: 6 },
        { id: "app-11", name: "7-Zip 24.08 (x64)", version: "24.08", publisher: "Igor Pavlov", size_bytes: 15 * 1024 * 1024, source: "registry", last_used_days: 20, last_used_at: new Date(nowMs - 20 * 86400000).toISOString(), usage_count: 11 },
        { id: "app-12", name: "VLC Media Player", version: "3.0.21", publisher: "VideoLAN", size_bytes: 180 * 1024 * 1024, source: "registry", last_used_days: 450, last_used_at: new Date(nowMs - 450 * 86400000).toISOString(), usage_count: 1 },
        { id: "app-13", name: "PowerToys (Preview) x64", version: "0.84.1", publisher: "Microsoft Corporation", size_bytes: 520 * 1024 * 1024, source: "registry", last_used_days: 4, last_used_at: new Date(nowMs - 4 * 86400000).toISOString(), usage_count: 45 },
        { id: "app-14", name: "Postman", version: "11.10.0", publisher: "Postman, Inc.", size_bytes: 490 * 1024 * 1024, source: "registry", last_used_days: 395, last_used_at: new Date(nowMs - 395 * 86400000).toISOString(), usage_count: 3 },
        { id: "app-15", name: "Obsidian", version: "1.6.7", publisher: "Dynalist Inc.", size_bytes: 260 * 1024 * 1024, source: "registry", last_used_days: 3, last_used_at: new Date(nowMs - 3 * 86400000).toISOString(), usage_count: 88 },
        { id: "app-16", name: "Blender 4.2 LTS", version: "4.2.1", publisher: "Blender Foundation", size_bytes: 980 * 1024 * 1024, source: "registry", last_used_days: 740, last_used_at: new Date(nowMs - 740 * 86400000).toISOString(), usage_count: 1 },
        { id: "app-17", name: "Figma Agent", version: "0.4.0", publisher: "Figma, Inc.", size_bytes: 110 * 1024 * 1024, source: "registry", last_used_days: 7, last_used_at: new Date(nowMs - 7 * 86400000).toISOString(), usage_count: 24 },
        { id: "app-18", name: "Notepad++ (64-bit x64)", version: "8.6.9", publisher: "Don HO", size_bytes: 25 * 1024 * 1024, source: "registry", last_used_days: 8, last_used_at: new Date(nowMs - 8 * 86400000).toISOString(), usage_count: 19 },
        { id: "app-19", name: "WhatsApp Desktop", version: "2.2435.6.0", publisher: "Meta Platforms, Inc.", size_bytes: 350 * 1024 * 1024, source: "uwp", last_used_days: 0, last_used_at: new Date(nowMs).toISOString(), usage_count: 110 },
        { id: "app-20", name: "Telegram Desktop", version: "5.4.1", publisher: "Telegram FZ-LLC", size_bytes: 145 * 1024 * 1024, source: "registry", last_used_days: 2, last_used_at: new Date(nowMs - 2 * 86400000).toISOString(), usage_count: 60 },
      ];
      return apps;
    }
    if (cmd === "uninstall_app") {
      try {
        const resp = await fetch("/api/real-uninstall-app", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ app_id: args?.app_id }),
        });
        if (resp.ok) {
          const res = await resp.json();
          return res;
        }
      } catch (err) {
        console.warn("[Bridge] Fallback real-uninstall-app:", err);
      }
      return { success: true, message: `Desinstalador iniciado para ${args?.app_id}` };
    }

    if (cmd === "scan_residuals") {
      const appName = args?.app_name || "App";
      return {
        app_name: appName,
        residual_paths: [
          `C:\\Users\\Luciano\\AppData\\Local\\${appName}`,
          `C:\\Users\\Luciano\\AppData\\Roaming\\${appName}`,
        ],
        total_residual_bytes: 45 * 1024 * 1024,
      };
    }

    // 9. Comandos Dev Cleaning (Conectados al motor Rust real vía /api/real-*-scan)
    if (cmd === "dev_clean_scan") {
      try {
        const url = "/api/real-dev-clean-scan" + (args?.refresh ? "?refresh=1" : "");
        const resp = await fetch(url);
        if (resp.ok) {
          const realData: DevCleanReport = await resp.json();
          return realData;
        }
      } catch (err) {
        console.warn("[Bridge] Fallback dev_clean_scan:", err);
      }
      return { disk_total: 2000000000000, disk_free: 1250000000000, findings: [] };
    }

    if (cmd === "ml_model_scan") {
      try {
        const url = "/api/real-ml-model-scan" + (args?.refresh ? "?refresh=1" : "");
        const resp = await fetch(url);
        if (resp.ok) {
          const realData: MlModelReport = await resp.json();
          return realData;
        }
      } catch (err) {
        console.warn("[Bridge] Fallback ml_model_scan:", err);
      }
      return { total_bytes: 0, unused_bytes: 0, usage_tracking_reliable: true, models: [] };
    }

    if (cmd === "python_env_scan") {
      try {
        const url = "/api/real-python-env-scan" + (args?.refresh ? "?refresh=1" : "");
        const resp = await fetch(url);
        if (resp.ok) {
          const realData: PyReport = await resp.json();
          return realData;
        }
      } catch (err) {
        console.warn("[Bridge] Fallback python_env_scan:", err);
      }
      return { total_bytes: 0, wasted_bytes: 0, envs: [], duplicates: [] };
    }
    if (cmd === "dev_clean_remove") {
      const paths: string[] = args?.paths || [];
      const currentQ = getStoredQuarantine();
      let freedBytes = 0;

      for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        const name = p.split(/[/\\]/).pop() || "dev-item";
        const size = 150000000;
        freedBytes += size;

        currentQ.unshift({
          id: "quar-dev-" + Date.now() + "-" + i,
          original_path: p,
          quarantine_path: `C:\\Users\\Luciano\\.gigacare\\quarantine\\files\\${name}`,
          sha256: Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
          size_bytes: size,
          quarantined_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          source_module: "dev_cleaning",
          status: "quarantined",
        });
      }

      setStoredQuarantine(currentQ);
      const outcome: DevCleanOutcome = {
        freed_bytes: freedBytes,
        quarantined_count: paths.length,
        errors: [],
      };
      return outcome;
    }

    if (cmd === "dev_clean_reveal") {
      try {
        const resp = await fetch("/api/reveal-path?path=" + encodeURIComponent(args?.path || ""));
        if (resp.ok) {
          return await resp.json();
        }
      } catch (err) {
        console.warn("[Mock Bridge] Error calling /api/reveal-path:", err);
      }
      return null;
    }

    // Fallback por defecto
    console.warn(`[GigaCare Bridge] Comando IPC '${cmd}' invocado sin manejador explícito. Retornando objeto vacío.`, args);
    return {};
  };

  // Montar window.__TAURI_INTERNALS__ para emular el WebView de Tauri
  (window as any).__TAURI_INTERNALS__ = {
    invoke: mockInvoke,
    transformCallback: (callback: (res: any) => void, once?: boolean) => {
      const id = callbackIdCounter++;
      callbacks[id] = (res: any) => {
        if (once) delete callbacks[id];
        callback(res);
      };
      return id;
    },
    unregisterCallback: (id: number) => {
      delete callbacks[id];
    },
    convertFileSrc: (filePath: string) => filePath,
  };

  // Montar window.__TAURI_EVENT_PLUGIN_INTERNALS__
  (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: (event: string, eventId: number) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter((l) => l.id !== eventId);
      }
    },
  };
}
