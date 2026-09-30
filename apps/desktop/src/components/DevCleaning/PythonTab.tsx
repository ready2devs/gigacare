import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, Text, Spinner } from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  FolderOpenRegular,
  DeleteRegular,
  ChevronRightRegular,
  ChevronDownRegular,
  WarningRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import {
  PyEnv,
  PyReport,
  ConfirmRequest,
} from "../../types/devcleaning";
import { ConfirmClean, formatBytes } from "./ConfirmClean";

interface PythonTabProps {
  onRecovered?: (bytes: number) => void;
}

export const PythonTab: React.FC<PythonTabProps> = ({ onRecovered }) => {
  const { t } = useTranslation();
  const [report, setReport] = useState<PyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedEnvs, setExpandedEnvs] = useState<Set<string>>(new Set());
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [openedPath, setOpenedPath] = useState<string | null>(null);

  const fetchScan = async (refresh: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<PyReport>("python_env_scan", { refresh });
      setReport(data);
    } catch (err: any) {
      console.error("Error running python_env_scan:", err);
      setError(err?.toString() || "Error al escanear entornos de Python.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScan();
  }, []);

  const toggleExpand = (path: string) => {
    setExpandedEnvs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
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

  const handleRemoveEnv = (env: PyEnv) => {
    setConfirmReq({
      kind: "environment",
      name: env.name,
      paths: [env.path],
      size_bytes: env.size_bytes,
      is_risky: true,
      onConfirm: async () => {
        try {
          await invoke("dev_clean_remove", { paths: [env.path] });
          if (onRecovered) {
            onRecovered(env.size_bytes);
          }
          setReport((prev) => {
            if (!prev) return null;
            const remainingEnvs = prev.envs.filter((e) => e.path !== env.path);
            const total_bytes = remainingEnvs.reduce((acc, e) => acc + e.size_bytes, 0);
            return {
              ...prev,
              envs: remainingEnvs,
              total_bytes,
            };
          });
        } catch (err) {
          console.error("Error removing Python env:", err);
        }
      },
    });
  };

  if (loading && !report) {
    return (
      <div className="devclean-loading">
        <Spinner
          size="large"
          label={t("dev_cleaning.python.loading", "Escaneando entornos virtuales y paquetes Conda...")}
        />
      </div>
    );
  }

  const envs = report?.envs || [];
  const duplicates = (report?.duplicates || []).slice(0, 12);
  const maxDupBytes = duplicates.length > 0 ? duplicates[0].total_bytes : 1;

  return (
    <div className="devclean-tab-content">
      {/* Top Header / Actions */}
      <div className="devclean-header-actions">
        <div>
          <Text size={200} style={{ color: "#94A3B8" }}>
            {t(
              "dev_cleaning.python.banner",
              "Audita entornos de Python, paquetes instalados y dependencias duplicadas entre proyectos."
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
        <div className="devclean-metric-card">
          <span className="devclean-metric-label">
            {t("dev_cleaning.python.allEnvs", "Todos los entornos")}
          </span>
          <span className="devclean-metric-value">
            {formatBytes(report?.total_bytes || 0)}
          </span>
          <span className="devclean-metric-sub">
            {t("dev_cleaning.python.allEnvsSub", "Tamaño total en virtualenvs y conda")}
          </span>
        </div>
        <div className="devclean-metric-card highlight">
          <span className="devclean-metric-label">
            {t("dev_cleaning.python.wastedDuplicates", "Desperdiciado en duplicados")}
          </span>
          <span className="devclean-metric-value accent">
            {formatBytes(report?.wasted_bytes || 0)}
          </span>
          <span className="devclean-metric-sub">
            {t("dev_cleaning.python.wastedSub", "Paquetes idénticos repetidos entre entornos")}
          </span>
        </div>
        <div className="devclean-metric-card">
          <span className="devclean-metric-label">
            {t("dev_cleaning.python.envsCount", "Entornos detectados")}
          </span>
          <span className="devclean-metric-value">{envs.length}</span>
          <span className="devclean-metric-sub">
            {t("dev_cleaning.python.envsCountSub", "Directorios activos de Conda y venv")}
          </span>
        </div>
      </div>

      {/* Cross-Env Duplicates Section */}
      {duplicates.length > 0 && (
        <div className="py-duplicates-card">
          <div className="py-duplicates-header">
            <Text weight="bold" size={300} style={{ color: "#F8FAFC" }}>
              {t("dev_cleaning.python.duplicatesTitle", "PAQUETES INSTALADOS EN MÁS DE UN ENTORNO")}
            </Text>
            <Text size={200} style={{ color: "#F87171", fontWeight: 600 }}>
              {t("dev_cleaning.python.wastedHeader", {
                size: formatBytes(report?.wasted_bytes || 0),
                defaultValue: `${formatBytes(report?.wasted_bytes || 0)} desperdiciados`,
              })}
            </Text>
          </div>

          <div className="py-duplicates-list">
            {duplicates.map((dup) => {
              const relPct = Math.min(100, Math.max(4, (dup.total_bytes / maxDupBytes) * 100));
              return (
                <div key={dup.name} className="py-duplicate-row">
                  <div className="py-dup-info">
                    <span className="py-dup-name">{dup.name}</span>
                    <span className="devclean-badge badge-copies">
                      {t("dev_cleaning.python.copiesBadge", {
                        count: dup.copies,
                        defaultValue: `${dup.copies} copias`,
                      })}
                    </span>
                  </div>

                  <div className="py-dup-bar-container">
                    <div
                      className="py-dup-bar-fill"
                      style={{ width: `${relPct}%` }}
                    />
                  </div>

                  <div className="py-dup-stats">
                    <span className="py-dup-total">
                      {t("dev_cleaning.python.totalLabel", {
                        size: formatBytes(dup.total_bytes),
                        defaultValue: `${formatBytes(dup.total_bytes)} total`,
                      })}
                    </span>
                    <span className="py-dup-wasted" style={{ color: "#F87171" }}>
                      {t("dev_cleaning.python.duplicatedLabel", {
                        size: formatBytes(dup.wasted_bytes),
                        defaultValue: `${formatBytes(dup.wasted_bytes)} duplicado`,
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="py-duplicates-footnote">
            <Text size={100} style={{ color: "#94A3B8" }}>
              {t(
                "dev_cleaning.python.duplicatesFootnote",
                "El tamaño duplicado es lo que ahorrarías si cada paquete existiera una sola vez. Eliminar un entorno que ya no usas es la forma segura de recuperarlo."
              )}
            </Text>
          </div>
        </div>
      )}

      {/* Environments List */}
      <div className="devclean-findings-section">
        <div className="devclean-findings-header">
          <Text weight="bold" size={300} style={{ color: "#F8FAFC" }}>
            {t("dev_cleaning.python.envsTitle", {
              count: envs.length,
              defaultValue: `ENTORNOS DESCUBIERTOS (${envs.length})`,
            })}
          </Text>
        </div>

        {envs.length === 0 ? (
          <div className="devclean-empty">
            <Text style={{ color: "#94A3B8" }}>
              {t(
                "dev_cleaning.python.empty",
                "No se encontraron entornos virtualenv ni Conda en tu carpeta de usuario."
              )}
            </Text>
          </div>
        ) : (
          <div className="devclean-findings-list">
            {envs.map((env) => {
              const isExpanded = expandedEnvs.has(env.path);
              const kindBadgeClass =
                env.kind === "conda" ? "cat-ml_models" : "cat-dev_cache";
              const staleText =
                env.stale_days === null
                  ? null
                  : env.stale_days === 0
                  ? t("dev_cleaning.caches.activeToday", "Activo hoy")
                  : t("dev_cleaning.caches.staleDays", {
                      days: env.stale_days,
                      defaultValue: `${env.stale_days}d inactivo`,
                    });

              const maxPkgSize =
                env.packages.length > 0 ? env.packages[0].size_bytes : 1;

              return (
                <div key={env.path} className="devclean-finding-row">
                  <div className="devclean-finding-main">
                    <button
                      className="devclean-expand-btn"
                      onClick={() => toggleExpand(env.path)}
                      aria-label="Alternar paquetes"
                    >
                      {isExpanded ? <ChevronDownRegular /> : <ChevronRightRegular />}
                    </button>

                    <div className="devclean-finding-info">
                      <div className="devclean-finding-title-row">
                        <span className="devclean-finding-name">{env.name}</span>
                        <span className={`devclean-badge ${kindBadgeClass}`}>
                          {env.kind}
                        </span>
                        {staleText && (
                          <span className="devclean-badge badge-stale">{staleText}</span>
                        )}
                      </div>
                      <span className="devclean-finding-path" title={env.path}>
                        {env.path}
                      </span>
                    </div>

                    <div className="devclean-finding-meta">
                      <span className="devclean-finding-size">
                        {formatBytes(env.size_bytes)}
                      </span>
                      <span className="devclean-finding-files">
                        {t("dev_cleaning.python.packagesCount", {
                          count: env.packages.length,
                          defaultValue: `${env.packages.length} paquetes`,
                        })}
                      </span>
                    </div>

                    <div className="devclean-finding-actions">
                      <Button
                        size="small"
                        appearance="secondary"
                        icon={<FolderOpenRegular />}
                        onClick={() => handleExplore(env.path)}
                      >
                        {t("dev_cleaning.common.explore", "Explorar")}
                      </Button>
                      <Button
                        size="small"
                        appearance="primary"
                        icon={<DeleteRegular />}
                        style={{
                          backgroundColor: "#EF4444",
                          color: "#FFFFFF",
                          fontWeight: 600,
                        }}
                        onClick={() => handleRemoveEnv(env)}
                      >
                        {t("dev_cleaning.common.remove", "Eliminar")}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Packages */}
                  {isExpanded && env.packages.length > 0 && (
                    <div className="devclean-children-container">
                      <div className="devclean-children-header">
                        <Text size={100} weight="semibold" style={{ color: "#94A3B8" }}>
                          {t("dev_cleaning.python.installedPackages", {
                            count: env.packages.length,
                            defaultValue: `Paquetes Instalados (Top ${env.packages.length})`,
                          })}
                        </Text>
                      </div>
                      {env.packages.map((pkg, pIdx) => {
                        const pkgPct = Math.min(100, Math.max(1, (pkg.size_bytes / maxPkgSize) * 100));
                        return (
                          <div key={pIdx} className="devclean-child-row">
                            <span className="devclean-child-name" title={pkg.path}>
                              {pkg.name}
                            </span>
                            <div className="devclean-child-bar-wrap">
                              <div
                                className="devclean-child-bar-fill"
                                style={{ width: `${pkgPct}%`, backgroundColor: "#38BDF8" }}
                              />
                            </div>
                            <span className="devclean-child-size">
                              {formatBytes(pkg.size_bytes)}
                            </span>
                            <Button
                              size="small"
                              appearance="subtle"
                              icon={<FolderOpenRegular />}
                              onClick={() => handleExplore(pkg.path)}
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
