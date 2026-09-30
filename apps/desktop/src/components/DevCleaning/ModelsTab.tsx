import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Text,
  Checkbox,
  Spinner,
} from "@fluentui/react-components";
import {
  ArrowClockwiseRegular,
  FolderOpenRegular,
  DeleteRegular,
  InfoRegular,
  WarningRegular,
  CheckmarkRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import {
  MlModelReport,
  ConfirmRequest,
} from "../../types/devcleaning";
import { ConfirmClean, formatBytes } from "./ConfirmClean";

interface ModelsTabProps {
  onRecovered?: (bytes: number) => void;
}

export const ModelsTab: React.FC<ModelsTabProps> = ({ onRecovered }) => {
  const { t } = useTranslation();
  const [report, setReport] = useState<MlModelReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<"all" | "never_loaded">("all");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null);
  const [openedPath, setOpenedPath] = useState<string | null>(null);

  const fetchScan = async (refresh: boolean = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<MlModelReport>("ml_model_scan", { refresh });
      setReport(data);
      setSelectedNames(new Set());
    } catch (err: any) {
      console.error("Error running ml_model_scan:", err);
      setError(err?.toString() || "Error al escanear modelos de aprendizaje automático.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScan();
  }, []);

  const handleToggleSelect = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleSelectAllNeverLoaded = () => {
    if (!report) return;
    const neverLoaded = report.models.filter((m) => !m.used_since_download);
    setSelectedNames(new Set(neverLoaded.map((m) => m.name)));
  };

  const handleShow = async (path: string) => {
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

  const handleRemoveSelected = () => {
    if (!report || selectedNames.size === 0) return;
    const selectedModels = report.models.filter((m) => selectedNames.has(m.name));
    const allPaths = selectedModels.flatMap((m) => m.paths);
    const totalReclaimable = selectedModels.reduce((acc, m) => acc + m.exclusive_bytes, 0);

    setConfirmReq({
      kind: "model",
      name: `${selectedModels.length} modelo${selectedModels.length > 1 ? "s" : ""} IA`,
      paths: allPaths,
      size_bytes: totalReclaimable,
      items: selectedModels.map((m) => ({
        name: m.name,
        path: m.paths[0] || m.name,
        size_bytes: m.exclusive_bytes,
      })),
      onConfirm: async () => {
        try {
          await invoke("dev_clean_remove", { paths: allPaths });
          if (onRecovered) {
            onRecovered(totalReclaimable);
          }
          setReport((prev) => {
            if (!prev) return null;
            const remaining = prev.models.filter((m) => !selectedNames.has(m.name));
            const total_bytes = remaining.reduce((acc, m) => acc + m.size_bytes, 0);
            const unused_bytes = remaining
              .filter((m) => !m.used_since_download)
              .reduce((acc, m) => acc + m.size_bytes, 0);
            return {
              ...prev,
              models: remaining,
              total_bytes,
              unused_bytes,
            };
          });
          setSelectedNames(new Set());
        } catch (err) {
          console.error("Error removing models:", err);
        }
      },
    });
  };

  if (loading && !report) {
    return (
      <div className="devclean-loading">
        <Spinner
          size="large"
          label={t("dev_cleaning.models.loading", "Descubriendo modelos locales de IA y pesos...")}
        />
      </div>
    );
  }

  const allModels = report?.models || [];
  const neverLoadedCount = allModels.filter((m) => !m.used_since_download).length;
  const filteredModels =
    activeFilter === "never_loaded"
      ? allModels.filter((m) => !m.used_since_download)
      : allModels;

  const selectedModels = allModels.filter((m) => selectedNames.has(m.name));
  const selectedReclaimable = selectedModels.reduce((acc, m) => acc + m.exclusive_bytes, 0);

  const getProviderClass = (provider: string) => {
    switch (provider.toLowerCase()) {
      case "ollama":
        return "prov-ollama";
      case "hugging face":
        return "prov-hf";
      case "pytorch":
        return "prov-torch";
      case "whisper":
        return "prov-whisper";
      case "keras":
        return "prov-keras";
      default:
        return "prov-default";
    }
  };

  return (
    <div className="devclean-tab-content">
      {/* Top Header / Rescan */}
      <div className="devclean-header-actions">
        <div>
          <Text size={200} style={{ color: "#94A3B8" }}>
            {t(
              "dev_cleaning.models.banner",
              "Inspecciona pesos locales de LLMs, checkpoints de difusión y capas compartidas."
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
            {t("dev_cleaning.models.allModels", "Todos los modelos")}
          </span>
          <span className="devclean-metric-value">
            {formatBytes(report?.total_bytes || 0)}
          </span>
          <span className="devclean-metric-sub">
            {t("dev_cleaning.models.allModelsSub", "En Ollama, Hugging Face y cachés")}
          </span>
        </div>
        <div className="devclean-metric-card highlight">
          <span className="devclean-metric-label">
            {t("dev_cleaning.models.neverLoaded", "Descargados pero nunca cargados")}
          </span>
          <span className="devclean-metric-value accent">
            {report?.usage_tracking_reliable
              ? formatBytes(report?.unused_bytes || 0)
              : "—"}
          </span>
          <span className="devclean-metric-sub">
            {report?.usage_tracking_reliable
              ? t("dev_cleaning.models.unusedCount", {
                  count: neverLoadedCount,
                  defaultValue: `${neverLoadedCount} modelo(s) sin uso`,
                })
              : t(
                  "dev_cleaning.models.atimeUnsupported",
                  "Tiempo de acceso no soportado en el sistema de archivos"
                )}
          </span>
        </div>
        <div className="devclean-metric-card">
          <span className="devclean-metric-label">
            {t("dev_cleaning.models.modelsFound", "Modelos encontrados")}
          </span>
          <span className="devclean-metric-value">{allModels.length}</span>
          <span className="devclean-metric-sub">
            {t("dev_cleaning.models.modelsFoundSub", "Indexados en manifiestos y cachés de hub")}
          </span>
        </div>
      </div>

      {/* Info Notice */}
      <div className="models-info-banner">
        <InfoRegular />
        <span>
          {t(
            "dev_cleaning.models.ollamaInfo",
            "Los modelos de Ollama almacenan pesos como capas deduplicadas. Eliminar un modelo de Ollama solo libera las capas exclusivas de él; las capas base compartidas se conservan de forma segura."
          )}
        </span>
      </div>

      {/* Filter and Bulk Actions Bar */}
      <div className="models-toolbar">
        <div className="models-filter-pills">
          <button
            className={`models-pill ${activeFilter === "all" ? "active" : ""}`}
            onClick={() => setActiveFilter("all")}
          >
            {t("dev_cleaning.models.filterAll", {
              count: allModels.length,
              defaultValue: `Todos (${allModels.length})`,
            })}
          </button>
          <button
            className={`models-pill ${activeFilter === "never_loaded" ? "active" : ""}`}
            onClick={() => setActiveFilter("never_loaded")}
          >
            {t("dev_cleaning.models.filterNeverLoaded", {
              count: neverLoadedCount,
              defaultValue: `Nunca cargados (${neverLoadedCount})`,
            })}
          </button>
        </div>

        <div className="models-actions-group">
          {report?.usage_tracking_reliable && neverLoadedCount > 0 && (
            <Button
              size="small"
              appearance="secondary"
              icon={<CheckmarkRegular />}
              onClick={handleSelectAllNeverLoaded}
            >
              {t("dev_cleaning.models.selectAllNeverLoaded", "Seleccionar nunca cargados")}
            </Button>
          )}

          {selectedNames.size > 0 && (
            <Button
              size="small"
              appearance="primary"
              icon={<DeleteRegular />}
              style={{
                backgroundColor: "#EF4444",
                color: "#FFFFFF",
                fontWeight: 600,
              }}
              onClick={handleRemoveSelected}
            >
              {t("dev_cleaning.models.removeSelected", {
                count: selectedNames.size,
                size: formatBytes(selectedReclaimable),
                defaultValue: `Eliminar ${selectedNames.size} seleccionados (${formatBytes(selectedReclaimable)})`,
              })}
            </Button>
          )}
        </div>
      </div>

      {/* Models List */}
      <div className="models-list-container">
        {filteredModels.length === 0 ? (
          <div className="devclean-empty">
            <Text style={{ color: "#94A3B8" }}>
              {activeFilter === "never_loaded"
                ? t(
                    "dev_cleaning.models.emptyNeverLoaded",
                    "No se encontraron modelos sin uso. Todos los modelos detectados han sido cargados."
                  )
                : t("dev_cleaning.models.emptyAll", "No se encontraron modelos de IA en este sistema.")}
            </Text>
          </div>
        ) : (
          <div className="models-items-list">
            {filteredModels.map((m) => {
              const isSelected = selectedNames.has(m.name);
              const provClass = getProviderClass(m.provider);

              return (
                <div
                  key={m.provider + m.name}
                  className={`model-row ${isSelected ? "selected" : ""}`}
                >
                  <Checkbox
                    checked={isSelected}
                    onChange={() => handleToggleSelect(m.name)}
                    aria-label={`Seleccionar ${m.name}`}
                  />

                  <div className="model-main-info">
                    <div className="model-title-line">
                      <span className="model-name">{m.name}</span>
                      <span className={`devclean-badge ${provClass}`}>
                        {m.provider}
                      </span>
                      {report?.usage_tracking_reliable && (
                        <span
                          className={`devclean-badge ${
                            m.used_since_download ? "safety-safe" : "badge-stale"
                          }`}
                        >
                          {m.used_since_download
                            ? t("dev_cleaning.models.statusLoaded", "Cargado")
                            : t("dev_cleaning.models.statusNeverLoaded", "Nunca cargado")}
                        </span>
                      )}
                    </div>

                    <div className="model-meta-line">
                      {m.downloaded_days !== null && (
                        <span>
                          {m.downloaded_days === 0
                            ? t("dev_cleaning.models.downloadedToday", "Descargado hoy")
                            : t("dev_cleaning.models.downloadedDays", {
                                days: m.downloaded_days,
                                defaultValue: `Descargado hace ${m.downloaded_days}d`,
                              })}
                        </span>
                      )}
                      {report?.usage_tracking_reliable &&
                        m.used_since_download &&
                        m.last_used_days !== null && (
                          <span>
                            {" "}
                            {m.last_used_days === 0
                              ? t("dev_cleaning.models.lastUsedToday", "• Último uso hoy")
                              : t("dev_cleaning.models.lastUsedDays", {
                                  days: m.last_used_days,
                                  defaultValue: `• Último uso hace ${m.last_used_days}d`,
                                })}
                          </span>
                        )}
                    </div>

                    {m.note && (
                      <div className="model-note-line">
                        <InfoRegular />
                        <span>{m.note}</span>
                      </div>
                    )}
                  </div>

                  <div className="model-size-block">
                    <span className="model-total-size">
                      {formatBytes(m.size_bytes)}
                    </span>
                    {m.exclusive_bytes < m.size_bytes && (
                      <span className="model-exclusive-size">
                        {t("dev_cleaning.models.reclaimable", {
                          size: formatBytes(m.exclusive_bytes),
                          defaultValue: `(${formatBytes(m.exclusive_bytes)} recuperables)`,
                        })}
                      </span>
                    )}
                  </div>

                  <div className="model-actions-block">
                    <Button
                      size="small"
                      appearance="secondary"
                      icon={<FolderOpenRegular />}
                      onClick={() => handleShow(m.paths[0] || m.name)}
                    >
                      {t("dev_cleaning.common.show", "Mostrar")}
                    </Button>
                  </div>
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
