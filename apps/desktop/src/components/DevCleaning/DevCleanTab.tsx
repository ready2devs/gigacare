import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text, Spinner } from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  FolderOpenRegular,
  BroomRegular,
  ChevronRightRegular,
  ChevronDownRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import {
  DevCleanReport,
  DevFinding,
  ConfirmRequest,
} from "../../types/devcleaning";
import { ConfirmClean, formatBytes } from "./ConfirmClean";

import { SmartCareAnalysis } from "../../types/models";

interface DevCleanTabProps {
  onRecovered?: (bytes: number) => void;
  smartCareAnalysis?: SmartCareAnalysis | null;
}

export const DevCleanTab: React.FC<DevCleanTabProps> = ({ onRecovered }) => {
  const { t } = useTranslation();
  const [report, setReport] = useState<DevCleanReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [openedPath, setOpenedPath] = useState<string | null>(null);

  const fetchScan = async (refresh: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<DevCleanReport>("dev_clean_scan", { refresh });
      setReport(data);
    } catch (err: any) {
      console.error("Error running dev_clean_scan:", err);
      setError(err?.toString() || "Error al escanear cachés de desarrollo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Escanear siempre en profundidad para obtener todos los hallazgos reales de desarrollo (npm, pip, cargo, etc.)
    fetchScan();
  }, []);

  const toggleExpand = (ruleId: string) => {
    setExpandedRules((prev) => {
      const next = new Set(prev);
      if (next.has(ruleId)) {
        next.delete(ruleId);
      } else {
        next.add(ruleId);
      }
      return next;
    });
  };

  const handleExplore = async (path: string) => {
    try {
      const res: any = await invoke("dev_clean_reveal", { path });
      const shownPath = res?.opened || path;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(path).catch(() => {});
      }
      setOpenedPath(shownPath);
      setTimeout(() => setOpenedPath(null), 3500);
    } catch {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(path).catch(() => {});
      }
      setOpenedPath(path);
      setTimeout(() => setOpenedPath(null), 3500);
    }
  };

  const handleCleanFinding = (finding: DevFinding) => {
    setConfirmReq({
      kind: "cache",
      name: finding.name,
      paths: [finding.path],
      size_bytes: finding.size_bytes,
      is_risky: finding.safety === "risky",
      items: finding.children.length > 0 ? finding.children : undefined,
      onConfirm: async () => {
        try {
          await invoke("dev_clean_remove", { paths: [finding.path] });
          if (onRecovered) {
            onRecovered(finding.size_bytes);
          }
          setReport((prev) => {
            if (!prev) return null;
            return {
              ...prev,
              findings: prev.findings.filter((f) => f.path !== finding.path),
            };
          });
        } catch (err) {
          console.error("Error removing finding:", err);
        }
      },
    });
  };

  if (loading && !report) {
    return (
      <div className="devclean-loading">
        <Spinner
          size="large"
          label={t("dev_cleaning.caches.loading", "Escaneando cachés de desarrollo...")}
        />
      </div>
    );
  }

  const findings = report?.findings || [];
  const reclaimableBytes = findings
    .filter((f) => f.safety !== "risky")
    .reduce((acc, f) => acc + f.size_bytes, 0);
  const mlBytes = findings
    .filter((f) => f.category === "ml_models")
    .reduce((acc, f) => acc + f.size_bytes, 0);
  const devCacheBytes = findings
    .filter((f) => f.category === "dev_cache")
    .reduce((acc, f) => acc + f.size_bytes, 0);
  const appDataBytes = findings
    .filter((f) => f.category === "app_data")
    .reduce((acc, f) => acc + f.size_bytes, 0);

  const diskTotal = report?.disk_total || 1;
  const diskFree = report?.disk_free || 0;
  const diskUsed = Math.max(0, diskTotal - diskFree);
  const realOtherBytes = Math.max(0, diskUsed - (mlBytes + devCacheBytes + appDataBytes));

  const pct = (bytes: number) => Math.min(100, Math.max(0, (bytes / diskTotal) * 100));

  return (
    <div className="devclean-tab-content">
      {/* Top Banner / Actions */}
      <div className="devclean-header-actions">
        <div>
          <Text size={200} style={{ color: "#94A3B8" }}>
            {t(
              "dev_cleaning.caches.banner",
              "Recupera espacio de cachés de paquetes, artefactos de compilación y herramientas de desarrollo de forma segura."
            )}
          </Text>
        </div>
        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={() => fetchScan(true)}
          disabled={loading}
        >
          {loading
            ? t("dev_cleaning.common.scanning", "Escaneando...")
            : t("dev_cleaning.common.rescan", "Reescanear")}
        </Button>
      </div>

      {openedPath && (
        <div className="devclean-copied-banner">
          <FolderOpenRegular />
          <span>
            {t("dev_cleaning.common.openedExplorer", {
              path: openedPath,
              defaultValue: `Abierto en el Explorador de Windows (y ruta copiada): ${openedPath}`,
            })}
          </span>
        </div>
      )}

      {error && (
        <div className="devclean-error-banner">
          <WarningRegular />
          <span>{error}</span>
          <Button size="small" appearance="subtle" onClick={() => setError(null)}>
            {t("dev_cleaning.common.dismiss", "Cerrar")}
          </Button>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="devclean-metrics-grid">
        <div className="devclean-metric-card highlight">
          <span className="devclean-metric-label">
            {t("dev_cleaning.caches.reclaimableNow", "Recuperable ahora")}
          </span>
          <span className="devclean-metric-value accent">
            {formatBytes(reclaimableBytes)}
          </span>
          <span className="devclean-metric-sub">
            {t("dev_cleaning.caches.reclaimableSub", "Seguro de limpiar sin romper compilaciones")}
          </span>
        </div>
        <div className="devclean-metric-card">
          <span className="devclean-metric-label">
            {t("dev_cleaning.caches.mlModelData", "Datos de modelos IA")}
          </span>
          <span className="devclean-metric-value">{formatBytes(mlBytes)}</span>
          <span className="devclean-metric-sub">
            {t("dev_cleaning.caches.mlModelSub", "Ollama, Hugging Face, Torch y Keras")}
          </span>
        </div>
        <div className="devclean-metric-card">
          <span className="devclean-metric-label">
            {t("dev_cleaning.caches.devCaches", "Cachés de desarrollo")}
          </span>
          <span className="devclean-metric-value">{formatBytes(devCacheBytes)}</span>
          <span className="devclean-metric-sub">
            {t("dev_cleaning.caches.devCachesSub", "npm, pip, cargo, gradle y gestores")}
          </span>
        </div>
        <div className="devclean-metric-card">
          <span className="devclean-metric-label">
            {t("dev_cleaning.caches.diskUsedTotal", "Disco usado / total")}
          </span>
          <span className="devclean-metric-value">
            {formatBytes(diskUsed)}
          </span>
          <span className="devclean-metric-sub">
            {t("dev_cleaning.caches.diskUsedSub", {
              total: formatBytes(diskTotal),
              defaultValue: `de ${formatBytes(diskTotal)} disponibles`,
            })}
          </span>
        </div>
      </div>

      {/* Storage Breakdown */}
      <div className="devclean-breakdown-card">
        <div className="devclean-breakdown-title">
          <Text weight="bold" size={300} style={{ color: "#F8FAFC" }}>
            {t("dev_cleaning.caches.storageBreakdown", "Desglose de Almacenamiento")}
          </Text>
          <Text size={200} style={{ color: "#94A3B8" }}>
            {t("dev_cleaning.caches.freeSpace", {
              free: formatBytes(diskFree),
              defaultValue: `${formatBytes(diskFree)} de espacio libre`,
            })}
          </Text>
        </div>

        <div className="devclean-breakdown-bar">
          <div
            className="devclean-bar-segment seg-real"
            style={{ width: `${pct(realOtherBytes)}%` }}
            title={formatBytes(realOtherBytes)}
          />
          <div
            className="devclean-bar-segment seg-ml"
            style={{ width: `${pct(mlBytes)}%` }}
            title={formatBytes(mlBytes)}
          />
          <div
            className="devclean-bar-segment seg-dev"
            style={{ width: `${pct(devCacheBytes)}%` }}
            title={formatBytes(devCacheBytes)}
          />
          <div
            className="devclean-bar-segment seg-app"
            style={{ width: `${pct(appDataBytes)}%` }}
            title={formatBytes(appDataBytes)}
          />
          <div
            className="devclean-bar-segment seg-free"
            style={{ width: `${pct(diskFree)}%` }}
            title={formatBytes(diskFree)}
          />
        </div>

        <div className="devclean-breakdown-legend">
          <div className="legend-item">
            <span className="legend-dot seg-real" />
            <span className="legend-label">
              {t("dev_cleaning.caches.legendOther", {
                size: formatBytes(realOtherBytes),
                defaultValue: `Otros (${formatBytes(realOtherBytes)})`,
              })}
            </span>
          </div>
          <div className="legend-item">
            <span className="legend-dot seg-ml" />
            <span className="legend-label">
              {t("dev_cleaning.caches.legendMl", {
                size: formatBytes(mlBytes),
                defaultValue: `Modelos IA (${formatBytes(mlBytes)})`,
              })}
            </span>
          </div>
          <div className="legend-item">
            <span className="legend-dot seg-dev" />
            <span className="legend-label">
              {t("dev_cleaning.caches.legendDev", {
                size: formatBytes(devCacheBytes),
                defaultValue: `Cachés Dev (${formatBytes(devCacheBytes)})`,
              })}
            </span>
          </div>
          <div className="legend-item">
            <span className="legend-dot seg-app" />
            <span className="legend-label">
              {t("dev_cleaning.caches.legendApp", {
                size: formatBytes(appDataBytes),
                defaultValue: `Datos Apps (${formatBytes(appDataBytes)})`,
              })}
            </span>
          </div>
          <div className="legend-item">
            <span className="legend-dot seg-free" />
            <span className="legend-label">
              {t("dev_cleaning.caches.legendFree", {
                size: formatBytes(diskFree),
                defaultValue: `Libre (${formatBytes(diskFree)})`,
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Findings List */}
      <div className="devclean-findings-section">
        <div className="devclean-findings-header">
          <Text weight="bold" size={300} style={{ color: "#F8FAFC" }}>
            {t("dev_cleaning.caches.findingsTitle", {
              count: findings.length,
              defaultValue: `Hallazgos de Desarrollo Detectados (${findings.length})`,
            })}
          </Text>
        </div>

        {findings.length === 0 ? (
          <div className="devclean-empty">
            <Text style={{ color: "#94A3B8" }}>
              {t(
                "dev_cleaning.caches.empty",
                "No se detectaron cachés ni modelos de desarrollo en este sistema."
              )}
            </Text>
          </div>
        ) : (
          <div className="devclean-findings-list">
            {findings.map((f) => {
              const isExpanded = expandedRules.has(f.rule_id);
              const categoryBadge =
                f.category === "ml_models"
                  ? { label: t("dev_cleaning.caches.catMl", "Modelos IA"), cls: "cat-ml_models" }
                  : f.category === "dev_cache"
                  ? { label: t("dev_cleaning.caches.catDev", "Caché Dev"), cls: "cat-dev_cache" }
                  : { label: t("dev_cleaning.caches.catApp", "Datos App"), cls: "cat-app_data" };

              const safetyBadge =
                f.safety === "safe"
                  ? { label: t("dev_cleaning.caches.safetySafe", "Seguro"), cls: "safety-safe" }
                  : f.safety === "caution"
                  ? { label: t("dev_cleaning.caches.safetyCaution", "Precaución"), cls: "safety-caution" }
                  : { label: t("dev_cleaning.caches.safetyRisky", "Riesgoso"), cls: "safety-risky" };

              const staleText =
                f.stale_days === null
                  ? null
                  : f.stale_days === 0
                  ? t("dev_cleaning.caches.activeToday", "Activo hoy")
                  : t("dev_cleaning.caches.staleDays", {
                      days: f.stale_days,
                      defaultValue: `${f.stale_days}d inactivo`,
                    });

              return (
                <div key={f.rule_id + f.path} className="devclean-finding-row">
                  <div className="devclean-finding-main">
                    <button
                      className="devclean-expand-btn"
                      onClick={() => toggleExpand(f.rule_id)}
                      aria-label="Alternar detalles"
                    >
                      {isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
                    </button>

                    <div className="devclean-finding-info">
                      <div className="devclean-finding-title-row">
                        <span className="devclean-finding-name">{f.name}</span>
                        <span className={`devclean-badge ${categoryBadge.cls}`}>
                          {categoryBadge.label}
                        </span>
                        <span className={`devclean-badge ${safetyBadge.cls}`}>
                          {safetyBadge.label}
                        </span>
                        {staleText && (
                          <span className="devclean-badge badge-stale">{staleText}</span>
                        )}
                      </div>
                      <span className="devclean-finding-path" title={f.path}>
                        {f.path}
                      </span>
                    </div>

                    <div className="devclean-finding-meta">
                      <span className="devclean-finding-size">
                        {formatBytes(f.size_bytes)}
                      </span>
                      <span className="devclean-finding-files">
                        {t("dev_cleaning.caches.filesCount", {
                          count: f.file_count,
                          defaultValue: `${f.file_count.toLocaleString()} archivos`,
                        })}
                      </span>
                    </div>

                    <div className="devclean-finding-actions">
                      <Button
                        size="small"
                        appearance="secondary"
                        icon={<FolderOpenRegular />}
                        onClick={() => handleExplore(f.path)}
                      >
                        {t("dev_cleaning.common.explore", "Explorar")}
                      </Button>
                      <Button
                        size="small"
                        appearance="primary"
                        icon={<BroomRegular />}
                        style={{
                          backgroundColor: f.safety === "risky" ? "#EF4444" : "#00E5FF",
                          color: f.safety === "risky" ? "#FFFFFF" : "#0B0F19",
                          fontWeight: 600,
                        }}
                        onClick={() => handleCleanFinding(f)}
                      >
                        {t("dev_cleaning.common.clean", "Limpiar")}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Children */}
                  {isExpanded && f.children && f.children.length > 0 && (
                    <div className="devclean-children-container">
                      <div className="devclean-children-header">
                        <Text size={100} weight="semibold" style={{ color: "#94A3B8" }}>
                          {t("dev_cleaning.caches.topSubdirs", "Subdirectorios Principales")}
                        </Text>
                      </div>
                      {f.children.map((child, cIdx) => {
                        const childPct = Math.min(100, Math.max(1, (child.size_bytes / f.size_bytes) * 100));
                        return (
                          <div key={cIdx} className="devclean-child-row">
                            <span className="devclean-child-name" title={child.path}>
                              {child.name}
                            </span>
                            <div className="devclean-child-bar-wrap">
                              <div
                                className="devclean-child-bar-fill"
                                style={{ width: `${childPct}%` }}
                              />
                            </div>
                            <span className="devclean-child-size">
                              {formatBytes(child.size_bytes)}
                            </span>
                            <Button
                              size="small"
                              appearance="subtle"
                              icon={<FolderOpenRegular />}
                              onClick={() => handleExplore(child.path)}
                            >
                              {t("dev_cleaning.common.show", "Mostrar")}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmClean
        request={confirmReq}
        onClose={() => setConfirmReq(null)}
      />
    </div>
  );
};
