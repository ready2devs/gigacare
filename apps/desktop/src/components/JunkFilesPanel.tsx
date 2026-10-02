import React, { useState, useEffect, useCallback } from "react";
import { Text, Button, Spinner } from "@fluentui/react-components";
import {
  BroomRegular,
  WindowRegular,
  ArrowDownloadRegular,
  GlobeRegular,
  ChatRegular,
  AppsListDetailRegular,
  TimerRegular,
  ArrowClockwiseRegular,
  DeleteRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import {
  JunkCategory,
  JunkFilesScanResult,
  JunkItem,
  ScanItem,
  ItemCategory,
  CleanResult,
  SmartCareAnalysis,
} from "../types/models";
import { JunkCategorySection } from "./JunkCategorySection";
import { BrowserCacheSection } from "./BrowserCacheSection";
import { PrefetchSection } from "./PrefetchSection";
import { PreviewPanel } from "./PreviewPanel";

export interface JunkFilesPanelProps {
  focusCategory?: string;
  smartCareAnalysis?: SmartCareAnalysis | null;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export const JunkFilesPanel: React.FC<JunkFilesPanelProps> = ({
  focusCategory,
  smartCareAnalysis,
}) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [scanResult, setScanResult] = useState<JunkFilesScanResult | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(focusCategory ? [focusCategory] : ["temp_files", "browser_caches"])
  );
  const [itemsToPreview, setItemsToPreview] = useState<ScanItem[] | null>(null);
  const [cleanFeedback, setCleanFeedback] = useState<string | null>(null);

  const fetchScan = useCallback(async () => {
    setLoading(true);
    setCleanFeedback(null);
    try {
      const data = await invoke<JunkFilesScanResult>("scan_junk_files");
      setScanResult(data);
    } catch (err) {
      console.error("Error al escanear archivos basura:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (smartCareAnalysis && smartCareAnalysis.is_valid && smartCareAnalysis.junk_summary) {
      const summary = smartCareAnalysis.junk_summary;
      const cachedResult: JunkFilesScanResult = {
        total_junk_bytes: summary.total_bytes,
        categories: [
          {
            category_id: "temp_files",
            display_name: "Archivos Temporales",
            total_bytes: summary.temp_files_bytes,
            safe_bytes: summary.temp_files_bytes,
            items: [],
          },
          {
            category_id: "windows_leftovers",
            display_name: "Restos de Windows",
            total_bytes: summary.windows_leftovers_bytes,
            safe_bytes: summary.windows_leftovers_bytes,
            items: [],
          },
          {
            category_id: "download_installers",
            display_name: "Instaladores en Descargas",
            total_bytes: summary.installers_bytes,
            safe_bytes: summary.installers_bytes,
            items: [],
          },
          {
            category_id: "browser_caches",
            display_name: "Cachés de Navegadores",
            total_bytes: summary.browser_caches_bytes,
            safe_bytes: summary.browser_caches_bytes,
            items: [],
          },
          {
            category_id: "messaging_cache",
            display_name: "Cachés de Mensajería",
            total_bytes: summary.messaging_caches_bytes,
            safe_bytes: summary.messaging_caches_bytes,
            items: [],
          },
          {
            category_id: "recycle_bin",
            display_name: "Papelera de Reciclaje",
            total_bytes: summary.recycle_bin_bytes,
            safe_bytes: summary.recycle_bin_bytes,
            items: [],
          },
        ],
        browsers: [],
        scan_timestamp: smartCareAnalysis.timestamp,
      };
      setScanResult(cachedResult);
      setLoading(false);
    } else {
      fetchScan();
    }
  }, [smartCareAnalysis, fetchScan]);

  useEffect(() => {
    if (focusCategory) {
      setExpandedCategories((prev) => new Set([...prev, focusCategory]));
    }
  }, [focusCategory]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const handleCleanSafeCategory = (category: JunkCategory) => {
    const safeItems: ScanItem[] = category.items
      .filter((i) => i.safe)
      .map((item) => ({
        path: item.path,
        size_bytes: item.size_bytes,
        modified_at: new Date().toISOString(),
        category: "temp" as ItemCategory,
        metadata: {
          app_source: item.source_type || category.category_id,
          safe: true,
        },
      }));

    if (safeItems.length > 0) {
      setItemsToPreview(safeItems);
    }
  };

  const handleCleanIndividualItem = (item: JunkItem) => {
    const scanItem: ScanItem = {
      path: item.path,
      size_bytes: item.size_bytes,
      modified_at: new Date().toISOString(),
      category: "temp" as ItemCategory,
      metadata: {
        app_source: item.source_type,
        safe: item.safe,
      },
    };
    setItemsToPreview([scanItem]);
  };

  const handleConfirmClean = async (selectedPaths: string[]) => {
    try {
      const res = await invoke<CleanResult>("clean_items", {
        item_ids: selectedPaths,
      });
      setItemsToPreview(null);
      setCleanFeedback(
        `Limpieza completada: ${res.items_moved} elementos aislados (${formatBytes(res.bytes_freed)} liberados).`
      );

      // Actualizar resumen de resultados restando lo liberado sin reescaneo completo inmediato
      if (scanResult) {
        const cleanedSet = new Set(selectedPaths);
        const updatedCategories = scanResult.categories.map((cat) => {
          const remainingItems = cat.items.filter((i) => !cleanedSet.has(i.path));
          const total = remainingItems.reduce((acc, i) => acc + i.size_bytes, 0);
          const safe = remainingItems
            .filter((i) => i.safe)
            .reduce((acc, i) => acc + i.size_bytes, 0);
          return {
            ...cat,
            items: remainingItems,
            total_bytes: total,
            safe_bytes: safe,
          };
        });

        const newTotal = updatedCategories.reduce((acc, c) => acc + c.total_bytes, 0);
        setScanResult({
          ...scanResult,
          categories: updatedCategories,
          total_junk_bytes: newTotal,
        });
      }
    } catch (err) {
      console.error("Error al ejecutar limpieza:", err);
    }
  };

  const getCategoryIcon = (categoryId: string) => {
    switch (categoryId) {
      case "temp_files":
        return <BroomRegular />;
      case "windows_leftovers":
        return <WindowRegular />;
      case "download_installers":
        return <ArrowDownloadRegular />;
      case "browser_caches":
        return <GlobeRegular />;
      case "messaging_cache":
        return <ChatRegular />;
      case "app_residuals":
        return <AppsListDetailRegular />;
      case "prefetch":
        return <TimerRegular />;
      case "recycle_bin":
        return <DeleteRegular />;
      default:
        return <BroomRegular />;
    }
  };

  if (itemsToPreview && itemsToPreview.length > 0) {
    return (
      <PreviewPanel
        items={itemsToPreview}
        onConfirmClean={handleConfirmClean}
        onCancel={() => setItemsToPreview(null)}
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "960px",
        margin: "0 auto",
        gap: "20px",
        padding: "0 10px 40px",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <Text weight="bold" size={600} style={{ color: "#F8FAFC", display: "block" }}>
            Archivos Basura
          </Text>
          <Text size={300} style={{ color: "#94A3B8" }}>
            No cachés — archivos olvidados que ocupan espacio silenciosamente
          </Text>
        </div>

        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={fetchScan}
          disabled={loading}
          style={{ color: "#00E5FF" }}
        >
          Re-escanear
        </Button>
      </div>

      {/* Card de Resumen Total */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(30, 41, 59, 0.5) 100%)",
          border: "1px solid rgba(0, 229, 255, 0.2)",
          borderRadius: "16px",
          padding: "24px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          boxShadow: "0 12px 32px rgba(0, 0, 0, 0.35)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div>
          <span style={{ fontSize: "12px", color: "#64748B", textTransform: "uppercase", letterSpacing: "1px" }}>
            Basura encontrada
          </span>
          <div style={{ marginTop: "4px" }}>
            <Text
              weight="bold"
              style={{
                fontSize: "36px",
                color: "#00E5FF",
                textShadow: "0 0 20px rgba(0, 229, 255, 0.3)",
                lineHeight: "1.1",
              }}
            >
              {loading ? "Calculando..." : formatBytes(scanResult?.total_junk_bytes || 0)}
            </Text>
          </div>
          <Text size={200} style={{ color: "#94A3B8", marginTop: "4px", display: "block" }}>
            Espacio recuperable en archivos temporales, cachés de navegadores e instaladores
          </Text>
        </div>

        {loading && <Spinner label="Escaneando el sistema..." size="medium" />}
      </div>

      {/* Mensaje de feedback de limpieza */}
      {cleanFeedback && (
        <div
          style={{
            padding: "12px 20px",
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "10px",
            color: "#34D399",
            fontSize: "13px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>{cleanFeedback}</span>
          <Button
            size="small"
            appearance="subtle"
            style={{ color: "#34D399" }}
            onClick={() => setCleanFeedback(null)}
          >
            Cerrar
          </Button>
        </div>
      )}

      {/* Acordeón de Categorías */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {scanResult?.categories.map((cat) => {
          const isExpanded = expandedCategories.has(cat.category_id);
          const icon = getCategoryIcon(cat.category_id);

          if (cat.category_id === "browser_caches" && scanResult.browsers) {
            return (
              <JunkCategorySection
                key={cat.category_id}
                category={cat}
                icon={icon}
                isExpanded={isExpanded}
                onToggleExpand={() => toggleCategory(cat.category_id)}
                onCleanSafe={handleCleanSafeCategory}
              >
                <BrowserCacheSection
                  browsers={scanResult.browsers}
                  onCleanComplete={fetchScan}
                />
              </JunkCategorySection>
            );
          }

          if (cat.category_id === "prefetch") {
            return (
              <JunkCategorySection
                key={cat.category_id}
                category={cat}
                icon={icon}
                isExpanded={isExpanded}
                onToggleExpand={() => toggleCategory(cat.category_id)}
                onCleanSafe={handleCleanSafeCategory}
              >
                <PrefetchSection
                  category={cat}
                  onCleanItems={(paths) => {
                    const scanItems: ScanItem[] = paths.map((p) => ({
                      path: p,
                      size_bytes: 0,
                      modified_at: new Date().toISOString(),
                      category: "temp" as ItemCategory,
                      metadata: { app_source: "prefetch", safe: false },
                    }));
                    setItemsToPreview(scanItems);
                  }}
                />
              </JunkCategorySection>
            );
          }

          return (
            <JunkCategorySection
              key={cat.category_id}
              category={cat}
              icon={icon}
              isExpanded={isExpanded}
              onToggleExpand={() => toggleCategory(cat.category_id)}
              onCleanSafe={handleCleanSafeCategory}
              onCleanIndividual={handleCleanIndividualItem}
            />
          );
        })}
      </div>
    </div>
  );
};
