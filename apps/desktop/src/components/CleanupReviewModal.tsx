import React, { useState, useMemo } from "react";
import { Button } from "@fluentui/react-components";
import { ArrowLeftRegular } from "@fluentui/react-icons";
import {
  SmartCareAnalysis,
  JunkFilesScanResult,
  InstalledApp,
} from "../types/models";
import { ReviewCategoryList } from "./ReviewCategoryList";
import { ReviewSubcategoryList } from "./ReviewSubcategoryList";
import { ReviewFileList, ReviewFileItem } from "./ReviewFileList";
import "./cleanupReviewModal.css";

export interface CleanupReviewModalProps {
  open: boolean;
  analysis: SmartCareAnalysis;
  junkData?: JunkFilesScanResult | null;
  devData?: {
    caches?: any[];
    models?: any[];
    python?: any[];
  } | null;
  appsData?: InstalledApp[] | null;
  onAccept: (selectedPaths: string[], appsToUninstall: string[]) => void;
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const CleanupReviewModal: React.FC<CleanupReviewModalProps> = ({
  open,
  analysis: _analysis,
  junkData,
  devData,
  appsData,
  onAccept,
  onClose,
}) => {
  if (!open) return null;

  const [selectedCategory, setSelectedCategory] = useState<string>("junk");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("temp_files");
  const [appFilter, setAppFilter] = useState<string>("1_year");
  const [sortBy, setSortBy] = useState<"size" | "name" | "date">("size");

  // Filter Safe Junk Items
  const safeJunkBySubcat = useMemo(() => {
    const map: Record<string, ReviewFileItem[]> = {
      temp_files: [],
      windows_leftovers: [],
      download_installers: [],
      browser_caches: [],
      messaging_cache: [],
      recycle_bin: [],
    };

    if (junkData) {
      for (const cat of junkData.categories) {
        if (!map[cat.category_id]) map[cat.category_id] = [];
        for (const item of cat.items) {
          if (item.safe) {
            map[cat.category_id].push({
              path: item.path,
              name: item.display_name,
              sizeBytes: item.size_bytes,
              date: item.age_display,
            });
          }
        }
      }
    }

    return map;
  }, [junkData]);

  // Filter Dev Items
  const devItemsBySubcat = useMemo(() => {
    const map: Record<string, ReviewFileItem[]> = {
      dev_caches: [],
      dev_models: [],
      dev_python: [],
    };

    if (devData?.caches) {
      for (const finding of devData.caches) {
        if (finding.safety === "safe" || finding.safety === 0) {
          map.dev_caches.push({
            path: finding.path,
            name: finding.name,
            sizeBytes: finding.size_bytes,
            isDirectory: true,
          });
        }
      }
    }

    if (devData?.models) {
      for (const model of devData.models) {
        const isUnused =
          !model.used_since_download ||
          (model.last_used_days !== null && model.last_used_days !== undefined && model.last_used_days > 730);
        if (isUnused) {
          const p = model.paths?.[0] || model.name;
          map.dev_models.push({
            path: p,
            name: model.name,
            sizeBytes: model.size_bytes,
          });
        }
      }
    }

    if (devData?.python) {
      for (const env of devData.python) {
        const isStale =
          env.stale_days !== null && env.stale_days !== undefined && env.stale_days > 730;
        if (isStale) {
          map.dev_python.push({
            path: env.path,
            name: env.name,
            sizeBytes: env.size_bytes,
            isDirectory: true,
          });
        }
      }
    }

    return map;
  }, [devData]);

  // Filter Apps by temporal filter
  const filteredApps = useMemo(() => {
    if (!appsData) return [];
    return appsData
      .filter((app) => {
        if (appFilter === "1_year") {
          return (
            (app.last_used_days !== undefined && app.last_used_days > 365) ||
            app.last_used_at === null ||
            app.last_used_at === undefined
          );
        }
        if (appFilter === "2_years") {
          return (
            (app.last_used_days !== undefined && app.last_used_days > 730) ||
            app.last_used_at === null ||
            app.last_used_at === undefined
          );
        }
        if (appFilter === "never") {
          return (
            app.last_used_at === null ||
            app.last_used_at === undefined ||
            (app.usage_count !== undefined && app.usage_count !== null && app.usage_count <= 1)
          );
        }
        return false;
      })
      .map((app) => {
        let dateDisplay = "";
        if (typeof app.last_used_days === "number") {
          if (app.last_used_days === 0) dateDisplay = "Usado hoy";
          else if (app.last_used_days === 1) dateDisplay = "Usado ayer";
          else if (app.last_used_at) {
            try {
              dateDisplay = `${new Date(app.last_used_at).toLocaleDateString()} (hace ${app.last_used_days} días)`;
            } catch {
              dateDisplay = `Hace ${app.last_used_days} días`;
            }
          } else {
            dateDisplay = `Hace ${app.last_used_days} días`;
          }
        } else if (app.install_date) {
          dateDisplay = `Instalado: ${app.install_date}`;
        }

        return {
          path: app.id || app.name,
          name: app.name,
          sizeBytes: app.size_bytes || 0,
          date: dateDisplay || app.last_used_at || app.install_date,
        };
      });
  }, [appsData, appFilter]);

  // All safe file items to preselect
  const allInitialPaths = useMemo(() => {
    const set = new Set<string>();
    Object.values(safeJunkBySubcat).forEach((items) =>
      items.forEach((i) => set.add(i.path))
    );
    Object.values(devItemsBySubcat).forEach((items) =>
      items.forEach((i) => set.add(i.path))
    );
    return set;
  }, [safeJunkBySubcat, devItemsBySubcat]);

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() => allInitialPaths);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());

  // Current file list items based on selected category & subcategory
  const currentFiles: ReviewFileItem[] = useMemo(() => {
    if (selectedCategory === "junk") {
      return safeJunkBySubcat[selectedSubcategory] || [];
    }
    if (selectedCategory === "dev") {
      return devItemsBySubcat[selectedSubcategory] || [];
    }
    if (selectedCategory === "apps") {
      return filteredApps;
    }
    return [];
  }, [selectedCategory, selectedSubcategory, safeJunkBySubcat, devItemsBySubcat, filteredApps]);

  const handleTogglePath = (path: string) => {
    if (selectedCategory === "apps") {
      setSelectedApps((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      return;
    }

    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleToggleAll = (selectAll: boolean) => {
    if (selectedCategory === "apps") {
      setSelectedApps((prev) => {
        const next = new Set(prev);
        for (const f of currentFiles) {
          if (selectAll) next.add(f.path);
          else next.delete(f.path);
        }
        return next;
      });
      return;
    }

    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const f of currentFiles) {
        if (selectAll) next.add(f.path);
        else next.delete(f.path);
      }
      return next;
    });
  };

  const handleToggleSubcategory = (subId: string, checked: boolean) => {
    const items =
      selectedCategory === "junk"
        ? safeJunkBySubcat[subId] || []
        : devItemsBySubcat[subId] || [];

    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const item of items) {
        if (checked) next.add(item.path);
        else next.delete(item.path);
      }
      return next;
    });
  };

  // Build category totals
  const junkTotal = Object.values(safeJunkBySubcat)
    .flat()
    .reduce((sum, i) => sum + i.sizeBytes, 0);

  const devTotal = Object.values(devItemsBySubcat)
    .flat()
    .reduce((sum, i) => sum + i.sizeBytes, 0);

  const appsTotal = filteredApps.reduce((sum, i) => sum + i.sizeBytes, 0);

  const categories = [
    { id: "junk", name: "Archivos basura", totalBytes: junkTotal },
    { id: "dev", name: "Limpieza Dev", totalBytes: devTotal },
    { id: "apps", name: "Aplicaciones sin uso", totalBytes: appsTotal },
    { id: "media", name: "Multimedia sin sentido", totalBytes: 0 },
  ];

  // Build subcategories
  const junkSubcategories = [
    {
      id: "temp_files",
      name: "Archivos Temporales",
      sizeBytes: safeJunkBySubcat.temp_files.reduce((s, i) => s + i.sizeBytes, 0),
      checked: safeJunkBySubcat.temp_files.length > 0 && safeJunkBySubcat.temp_files.every((i) => selectedPaths.has(i.path)),
    },
    {
      id: "windows_leftovers",
      name: "Restos de Windows",
      sizeBytes: safeJunkBySubcat.windows_leftovers.reduce((s, i) => s + i.sizeBytes, 0),
      checked: safeJunkBySubcat.windows_leftovers.length > 0 && safeJunkBySubcat.windows_leftovers.every((i) => selectedPaths.has(i.path)),
    },
    {
      id: "download_installers",
      name: "Instaladores en Descargas",
      sizeBytes: safeJunkBySubcat.download_installers.reduce((s, i) => s + i.sizeBytes, 0),
      checked: safeJunkBySubcat.download_installers.length > 0 && safeJunkBySubcat.download_installers.every((i) => selectedPaths.has(i.path)),
    },
    {
      id: "browser_caches",
      name: "Cachés de Navegadores",
      sizeBytes: safeJunkBySubcat.browser_caches.reduce((s, i) => s + i.sizeBytes, 0),
      checked: safeJunkBySubcat.browser_caches.length > 0 && safeJunkBySubcat.browser_caches.every((i) => selectedPaths.has(i.path)),
    },
    {
      id: "messaging_cache",
      name: "Cachés de Mensajería",
      sizeBytes: safeJunkBySubcat.messaging_cache.reduce((s, i) => s + i.sizeBytes, 0),
      checked: safeJunkBySubcat.messaging_cache.length > 0 && safeJunkBySubcat.messaging_cache.every((i) => selectedPaths.has(i.path)),
    },
    {
      id: "recycle_bin",
      name: "Papelera de Reciclaje",
      sizeBytes: safeJunkBySubcat.recycle_bin.reduce((s, i) => s + i.sizeBytes, 0),
      checked: safeJunkBySubcat.recycle_bin.length > 0 && safeJunkBySubcat.recycle_bin.every((i) => selectedPaths.has(i.path)),
    },
  ];

  const devSubcategories = [
    {
      id: "dev_caches",
      name: "Cachés Dev",
      sizeBytes: devItemsBySubcat.dev_caches.reduce((s, i) => s + i.sizeBytes, 0),
      checked: devItemsBySubcat.dev_caches.length > 0 && devItemsBySubcat.dev_caches.every((i) => selectedPaths.has(i.path)),
    },
    {
      id: "dev_models",
      name: "Modelos IA",
      sizeBytes: devItemsBySubcat.dev_models.reduce((s, i) => s + i.sizeBytes, 0),
      checked: devItemsBySubcat.dev_models.length > 0 && devItemsBySubcat.dev_models.every((i) => selectedPaths.has(i.path)),
    },
    {
      id: "dev_python",
      name: "Entornos Python",
      sizeBytes: devItemsBySubcat.dev_python.reduce((s, i) => s + i.sizeBytes, 0),
      checked: devItemsBySubcat.dev_python.length > 0 && devItemsBySubcat.dev_python.every((i) => selectedPaths.has(i.path)),
    },
  ];

  // Footer totals
  let totalSelectedBytes = 0;
  for (const items of Object.values(safeJunkBySubcat)) {
    for (const item of items) {
      if (selectedPaths.has(item.path)) totalSelectedBytes += item.sizeBytes;
    }
  }
  for (const items of Object.values(devItemsBySubcat)) {
    for (const item of items) {
      if (selectedPaths.has(item.path)) totalSelectedBytes += item.sizeBytes;
    }
  }
  for (const app of filteredApps) {
    if (selectedApps.has(app.path)) totalSelectedBytes += app.sizeBytes;
  }
  const totalSelectedCount = selectedPaths.size + selectedApps.size;

  return (
    <div className="cleanup-review-overlay" data-testid="cleanup-review-modal">
      <div className="cleanup-review-modal">
        {/* Header */}
        <div className="cleanup-review-header">
          <button
            className="cleanup-review-back-btn"
            data-testid="modal-back-btn"
            onClick={onClose}
          >
            <ArrowLeftRegular /> Atrás
          </button>
          <h2 className="cleanup-review-title">Gestor de Limpieza</h2>
          <div className="cleanup-review-sort">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              data-testid="sort-by-select"
            >
              <option value="size">Ordenar por: Tamaño ↓</option>
              <option value="name">Ordenar por: Nombre</option>
              <option value="date">Ordenar por: Fecha</option>
            </select>
          </div>
        </div>

        {/* Body (3 Panels) */}
        <div className="cleanup-review-body">
          {/* Panel 1: Categorías */}
          <ReviewCategoryList
            categories={categories}
            selected={selectedCategory}
            onSelect={(id) => {
              setSelectedCategory(id);
              if (id === "junk") setSelectedSubcategory("temp_files");
              if (id === "dev") setSelectedSubcategory("dev_caches");
            }}
          />

          {/* Panel 2: Subcategorías / Filtro */}
          <ReviewSubcategoryList
            subcategories={
              selectedCategory === "junk"
                ? junkSubcategories
                : selectedCategory === "dev"
                ? devSubcategories
                : []
            }
            selected={selectedSubcategory}
            onSelect={(id) => setSelectedSubcategory(id)}
            onToggleSubcategory={handleToggleSubcategory}
            isAppFilter={selectedCategory === "apps"}
            selectedAppFilter={appFilter}
            onSelectAppFilter={(f) => setAppFilter(f)}
            isPlaceholder={selectedCategory === "media"}
          />

          {/* Panel 3: Lista de Archivos */}
          {selectedCategory === "media" ? (
            <div
              className="review-panel-right"
              style={{
                alignItems: "center",
                justifyContent: "center",
                color: "#64748B",
              }}
            >
              Sin elementos que mostrar
            </div>
          ) : (
            <ReviewFileList
              items={currentFiles}
              selectedPaths={selectedCategory === "apps" ? selectedApps : selectedPaths}
              onToggle={handleTogglePath}
              onToggleAll={handleToggleAll}
              sortBy={sortBy}
            />
          )}
        </div>

        {/* Footer */}
        <div className="cleanup-review-footer">
          <div className="cleanup-review-footer-info" data-testid="footer-info">
            {totalSelectedCount} elementos seleccionados | {formatBytes(totalSelectedBytes)}
          </div>
          <Button
            appearance="primary"
            data-testid="accept-btn"
            onClick={() => onAccept(Array.from(selectedPaths), Array.from(selectedApps))}
          >
            Aceptar
          </Button>
        </div>
      </div>
    </div>
  );
};
