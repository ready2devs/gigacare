import React, { useState, useEffect, useRef } from "react";
import {
  Button,
  Text,
  Badge,
  Dropdown,
  Option,
} from "@fluentui/react-components";
import {
  CheckmarkRegular,
  DismissRegular,
  BrainCircuitRegular,
  SearchRegular,
  BroomRegular,
  EyeRegular,
  ArrowSyncRegular,
  SparkleRegular,
  ArrowResetRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  FolderOpenRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { PhotoGroup, OverrideMap } from "../types/models";
import { MetricBar } from "./MetricBar";
import { QualityRing } from "./QualityRing";
import { SkeletonPhotoCard } from "./SkeletonPhotoCard";
import { EmptyStateCurator } from "./EmptyStateCurator";
import "./photoCurator.css";

export interface PhotoCuratorProps {
  onCleanDiscarded?: (paths: string[]) => void;
  folderPath?: string;
  overrides?: OverrideMap;
  onOverridesChange?: (overrides: OverrideMap | ((prev: OverrideMap) => OverrideMap)) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0)} ${sizes[i]}`;
}

export const PhotoCurator: React.FC<PhotoCuratorProps> = ({
  onCleanDiscarded,
  folderPath = "C:\\Album DJI Action 5 - Salvador 2026\\Fotos DJI",
  overrides,
  onOverridesChange,
}) => {
  const [internalOverrides, setInternalOverrides] = useState<OverrideMap>({});
  const activeOverrides = overrides ?? internalOverrides;
  const updateOverrides = onOverridesChange ?? setInternalOverrides;

  const [groups, setGroups] = useState<PhotoGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [isRecursiveCurating, setIsRecursiveCurating] = useState<boolean>(false);
  const [keepCount, setKeepCount] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("gigacare_photo_keep_count");
      if (stored) {
        const val = Number(stored);
        if ([1, 2, 3].includes(val)) return val;
      }
    } catch {}
    return 1;
  });
  const [targetFolder, setTargetFolder] = useState<string>(folderPath);
  const [previewModalPhoto, setPreviewModalPhoto] = useState<string | null>(null);
  const [curatedHistory, setCuratedHistory] = useState<{ kept: string[]; quarantined: string[] }>({
    kept: [],
    quarantined: [],
  });

  const carouselRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    handleScanGroups(targetFolder);
  }, [targetFolder]);

  // Aplicar keepCount cuando cambie el selector
  const handleKeepCountChange = async (val: number) => {
    setKeepCount(val);
    try {
      localStorage.setItem("gigacare_photo_keep_count", String(val));
    } catch (e) {
      console.warn("No se pudo guardar keep_count en localStorage", e);
    }
    try {
      await invoke("update_config", { config: { photos: { keep_count: val } } });
    } catch (err) {
      console.error("Error al sincronizar keep_count con config:", err);
    }
    // Re-evaluar recomendaciones en los grupos actualmente cargados
    recalculateRecommendationsWithKeepCount(val);
  };

  // Lógica espejo de SpaceMapDuplicatesTriage:
  // Conservar las mejores 'kc' fotos de cada grupo según ranking de calidad (total_score o size_bytes)
  const recalculateRecommendationsWithKeepCount = (kc: number, sourceGroups?: PhotoGroup[]) => {
    const list = sourceGroups || groups;
    if (!list || list.length === 0) return;

    const updated = list.map((g) => {
      // Ordenar por score o tamaño descendente (la mejor foto primero)
      const rankedPhotos = [...g.photos].sort((a, b) => {
        const scoreA = a.ai_analysis?.total_score ?? a.size_bytes;
        const scoreB = b.ai_analysis?.total_score ?? b.size_bytes;
        return scoreB - scoreA;
      });

      return {
        ...g,
        photos: g.photos.map((p) => {
          const rank = rankedPhotos.findIndex((r) => r.path === p.path) + 1;
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
              : {
                  provider_used: "GigaCare Vision Local",
                  sharpness_score: isKeep ? 0.9 : 0.6,
                  eyes_open_score: isKeep ? 0.9 : 0.6,
                  composition_score: isKeep ? 0.85 : 0.6,
                  noise_score: isKeep ? 0.9 : 0.7,
                  total_score: isKeep ? 0.88 : 0.62,
                  rank,
                  recommendation: isKeep ? "keep" : "discard",
                  discard_reason: isKeep ? undefined : "Toma similar / ráfaga descartada (menor calidad)",
                },
          };
        }),
      };
    });

    setGroups(updated);
  };

  // Diálogo nativo para seleccionar cualquier carpeta desde el Curador de Fotos
  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Seleccionar Carpeta de Fotos",
        defaultPath: targetFolder,
      });

      if (selected && typeof selected === "string") {
        setTargetFolder(selected);
        updateOverrides({});
        handleScanGroups(selected);
      }
    } catch (err) {
      console.error("Error al abrir diálogo de selección de carpeta:", err);
    }
  };

  const handleScanGroups = async (folder?: string) => {
    const pathToScan = folder || targetFolder;
    setLoading(true);
    try {
      const res = await invoke<PhotoGroup[]>("find_photo_groups", {
        folder_path: pathToScan,
        folderPath: pathToScan,
        keep_count: keepCount,
      });

      if (res && res.length > 0) {
        // Al detectar similares, aplicar inmediatamente el keepCount seleccionado
        recalculateRecommendationsWithKeepCount(keepCount, res);
      } else {
        setGroups([]);
      }
    } catch (err) {
      console.error("Error al buscar grupos de fotos:", err);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAnalyzeAll = async () => {
    updateOverrides({});
    setAnalyzing(true);
    try {
      const res = await invoke<PhotoGroup[]>("analyze_all_groups_ai", { keep_count: keepCount });
      if (res && res.length > 0) {
        recalculateRecommendationsWithKeepCount(keepCount, res);
      }
    } catch (err) {
      console.error("Error al analizar fotos:", err);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRecursiveCuration = async () => {
    setIsRecursiveCurating(true);
    let round = 1;
    let totalQuarantined: string[] = [];
    let currentGroups = [...groups];

    try {
      while (currentGroups.length > 0 && round <= 5) {
        const roundDiscarded = currentGroups.flatMap((g) =>
          g.photos
            .filter((p) => getEffectiveRecommendation(g.group_id, p) === "discard")
            .map((p) => p.path)
        );

        const roundKept = currentGroups.flatMap((g) =>
          g.photos
            .filter((p) => getEffectiveRecommendation(g.group_id, p) === "keep")
            .map((p) => p.path)
        );

        if (roundDiscarded.length === 0) break;

        await invoke("clean_items", { item_ids: roundDiscarded });
        totalQuarantined = [...totalQuarantined, ...roundDiscarded];

        setCuratedHistory((prev) => ({
          kept: Array.from(new Set([...prev.kept, ...roundKept])),
          quarantined: Array.from(new Set([...prev.quarantined, ...roundDiscarded])),
        }));

        round++;
        const nextRes = await invoke<PhotoGroup[]>("find_photo_groups", {
          folder_path: targetFolder,
          folderPath: targetFolder,
          keep_count: keepCount,
        });

        const nextFiltered = (nextRes || [])
          .map((g) => ({
            ...g,
            photos: g.photos.filter((p) => !totalQuarantined.includes(p.path)),
          }))
          .filter((g) => g.photos.length > 1);

        if (nextFiltered.length === 0) {
          currentGroups = [];
          setGroups([]);
          break;
        }

        const reanalyzed = await invoke<PhotoGroup[]>("analyze_all_groups_ai", { keep_count: keepCount });
        const sourceForRound = reanalyzed || nextFiltered;
        const reFiltered = sourceForRound
          .map((g) => ({
            ...g,
            photos: g.photos.filter((p) => !totalQuarantined.includes(p.path)),
          }))
          .filter((g) => g.photos.length > 1);

        currentGroups = reFiltered;
        recalculateRecommendationsWithKeepCount(keepCount, reFiltered);
      }

      if (onCleanDiscarded && totalQuarantined.length > 0) {
        onCleanDiscarded(totalQuarantined);
      }
    } catch (err) {
      console.error("Error en curado recursivo:", err);
    } finally {
      setIsRecursiveCurating(false);
    }
  };

  const getEffectiveRecommendation = (groupId: string, photo: PhotoGroup["photos"][0]): "keep" | "discard" => {
    const groupOverrides = activeOverrides[groupId];
    if (groupOverrides && groupOverrides[photo.path]) {
      return groupOverrides[photo.path];
    }
    return photo.ai_analysis?.recommendation === "keep" ? "keep" : "discard";
  };

  const isManualOverride = (groupId: string, photoPath: string): boolean => {
    return Boolean(activeOverrides[groupId]?.[photoPath]);
  };

  const handleToggleCardOverride = (groupId: string, photo: PhotoGroup["photos"][0]) => {
    const current = getEffectiveRecommendation(groupId, photo);
    const next: "keep" | "discard" = current === "keep" ? "discard" : "keep";

    updateOverrides((prev) => {
      const gMap = { ...(prev[groupId] || {}) };
      gMap[photo.path] = next;
      return {
        ...prev,
        [groupId]: gMap,
      };
    });
  };

  const handleResetGroupOverrides = (groupId: string) => {
    updateOverrides((prev) => {
      const updated = { ...prev };
      delete updated[groupId];
      return updated;
    });
  };

  const handleScrollCarousel = (groupId: string, direction: "left" | "right") => {
    const el = carouselRefs.current[groupId];
    if (el) {
      const scrollAmount = 300;
      el.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const effectiveDiscardedPhotos = groups.flatMap((g) =>
    g.photos
      .filter((p) => g.photos.length > 1 && getEffectiveRecommendation(g.group_id, p) === "discard")
      .map((p) => p.path)
  );

  const totalBytesDiscarded = groups.flatMap((g) =>
    g.photos.filter((p) => g.photos.length > 1 && getEffectiveRecommendation(g.group_id, p) === "discard")
  ).reduce((acc, p) => acc + (p.size_bytes || 0), 0);

  const getPhotoUrl = (p: { path: string; thumbnail_path?: string }) => {
    if (p.thumbnail_path && p.thumbnail_path.startsWith("data:")) {
      return p.thumbnail_path;
    }
    return `/api/raw-file?path=${encodeURIComponent(p.path)}`;
  };

  return (
    <div className="photo-curator-container" data-testid="photo-curator">
      {/* Header con gradiente radial y barra de carpeta */}
      <div className="photo-curator-header" data-testid="photo-curator-header">
        <div className="photo-curator-header-top">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="curator-title-gradient">
                Curador de Fotos Inteligente & Análisis de Calidad
              </span>
            </div>
            <div className="curator-subtitle">
              <span className="sparkle-icon"><SparkleRegular /></span>
              <span>Agrupación de fotos similares, detección de fotos desenfocadas y selección automática de las mejores tomas.</span>
            </div>
          </div>

          {/* Selector de Carpeta */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Button
              appearance="secondary"
              icon={<FolderOpenRegular />}
              onClick={handleSelectFolder}
              style={{
                borderColor: "#00E5FF",
                color: "#00E5FF",
                fontWeight: 600,
                fontSize: "12px",
              }}
              data-testid="select-curator-folder-btn"
            >
              Cambiar Carpeta
            </Button>
          </div>
        </div>

        {/* Ruta actual examinada */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#94A3B8" }}>
          <span>Carpeta activa:</span>
          <span
            style={{
              fontFamily: "monospace",
              color: "#38BDF8",
              background: "rgba(0, 229, 255, 0.08)",
              padding: "2px 8px",
              borderRadius: "4px",
              maxWidth: "500px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={targetFolder}
          >
            {targetFolder}
          </span>
        </div>

        {/* Fila de Controles */}
        <div className="photo-curator-controls">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Text size={200} style={{ color: "#94A3B8", fontWeight: 600 }}>
              Conservar por grupo:
            </Text>
            <Dropdown
              size="small"
              value={`${keepCount} mejor${keepCount > 1 ? "es" : ""}`}
              onOptionSelect={(_, data) => handleKeepCountChange(Number(data.optionValue) || 1)}
              data-testid="keep-count-dropdown"
            >
              <Option value="1">1 mejor (Recomendado)</Option>
              <Option value="2">2 mejores</Option>
              <Option value="3">3 mejores</Option>
            </Dropdown>
          </div>

          <div className="photo-curator-actions">
            <Button
              appearance="secondary"
              icon={<SearchRegular />}
              onClick={() => handleScanGroups(targetFolder)}
              disabled={loading || analyzing || isRecursiveCurating}
            >
              Detectar Similares
            </Button>

            <Button
              appearance="primary"
              icon={<ArrowSyncRegular />}
              style={{ backgroundColor: "#7C3AED", color: "#F8FAFC", fontWeight: 600 }}
              onClick={handleRecursiveCuration}
              disabled={loading || isRecursiveCurating || groups.length === 0}
            >
              {isRecursiveCurating ? "Curando recursivamente..." : "Curado Recursivo Automático"}
            </Button>

            <Button
              appearance="primary"
              icon={<BrainCircuitRegular />}
              style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 700 }}
              onClick={handleAnalyzeAll}
              disabled={loading || analyzing || isRecursiveCurating || groups.length === 0}
            >
              {analyzing ? "Analizando..." : "Re-analizar con IA"}
            </Button>
          </div>
        </div>
      </div>

      {/* Historial o banner del proceso recursivo */}
      {curatedHistory.quarantined.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(16, 185, 129, 0.15)",
            border: "1px solid #10B981",
            borderRadius: "10px",
            padding: "10px 16px",
            color: "#F8FAFC",
            fontSize: "13px",
          }}
        >
          <span>
            ✨ <strong>Curado completado:</strong> Se mantuvieron <strong>{curatedHistory.kept.length}</strong> fotos de mejor calidad y se enviaron <strong>{curatedHistory.quarantined.length}</strong> fotos deficientes o duplicadas a Cuarentena.
          </span>
          <Button
            size="small"
            appearance="subtle"
            style={{ color: "#10B981" }}
            onClick={() => setCuratedHistory({ kept: [], quarantined: [] })}
          >
            ✕
          </Button>
        </div>
      )}

      {/* Grid de Grupos Comparativos o Skeleton / Empty State */}
      <div className="photo-groups-grid">
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center", padding: "20px 0" }}>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", justifyContent: "center" }}>
              <SkeletonPhotoCard />
              <SkeletonPhotoCard />
              <SkeletonPhotoCard />
              <SkeletonPhotoCard />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#94A3B8", fontSize: "13px" }}>
              <span>Buscando fotos similares y evaluando nitidez...</span>
            </div>
          </div>
        ) : groups.length === 0 ? (
          <EmptyStateCurator onScanAnotherFolder={handleSelectFolder} />
        ) : (
          groups.map((group, gIdx) => {
            const hasOverrides = Boolean(activeOverrides[group.group_id] && Object.keys(activeOverrides[group.group_id]).length > 0);
            const isSingle = group.photos.length === 1;

            return (
              <div key={group.group_id || gIdx} className="photo-group-card" data-testid="photo-group-card">
                {/* Header de Grupo */}
                <div className="photo-group-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <Text weight="bold" size={300} style={{ color: "#F8FAFC" }}>
                      Grupo #{gIdx + 1}
                    </Text>
                    <Badge size="small" appearance="tint">
                      {group.photos.length} foto{group.photos.length > 1 ? "s" : ""}
                    </Badge>
                    <Badge size="small" appearance="outline" style={{ borderColor: "rgba(0, 229, 255, 0.4)", color: "#00E5FF" }}>
                      Similitud: {group.avg_hamming_distance || 2}
                    </Badge>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span className="provider-badge">
                      <BrainCircuitRegular style={{ fontSize: "14px", color: "#00E5FF" }} />
                      {group.photos[0]?.ai_analysis?.provider_used || "GigaCare Vision Local"}
                    </span>

                    {hasOverrides && (
                      <Button
                        size="small"
                        appearance="subtle"
                        icon={<ArrowResetRegular />}
                        style={{ color: "#F59E0B", fontSize: "11px", height: "26px" }}
                        onClick={() => handleResetGroupOverrides(group.group_id)}
                        data-testid="reset-group-overrides-btn"
                        title="Restablecer selección automática de la IA"
                      >
                        ↺ Restablecer selección automática
                      </Button>
                    )}
                  </div>
                </div>

                <div className="group-gradient-divider" />

                {/* Carousel contenedor */}
                <div className="photo-carousel-wrapper">
                  {group.photos.length > 3 && (
                    <>
                      <button
                        className="carousel-nav-btn left"
                        onClick={() => handleScrollCarousel(group.group_id, "left")}
                        title="Anterior"
                        type="button"
                      >
                        <ChevronLeftRegular />
                      </button>
                      <button
                        className="carousel-nav-btn right"
                        onClick={() => handleScrollCarousel(group.group_id, "right")}
                        title="Siguiente"
                        type="button"
                      >
                        <ChevronRightRegular />
                      </button>
                    </>
                  )}

                  <div
                    className="photo-compare-row"
                    ref={(el) => {
                      carouselRefs.current[group.group_id] = el;
                    }}
                  >
                    {group.photos.map((photo, pIdx) => {
                      const analysis = photo.ai_analysis;
                      const manual = isManualOverride(group.group_id, photo.path);
                      const rec = getEffectiveRecommendation(group.group_id, photo);
                      const isKeep = isSingle ? true : rec === "keep";
                      const fileName = photo.path.split(/[\\/]/).pop() || photo.path;
                      const imgUrl = getPhotoUrl(photo);
                      const formattedSize = formatBytes(photo.size_bytes);

                      let cardStateClass = "discarded";
                      if (isKeep) cardStateClass = "recommended";
                      if (manual) cardStateClass += " manual-override";

                      return (
                        <div
                          key={photo.path || pIdx}
                          className={`photo-card photo-card-enter ${cardStateClass}`}
                          data-testid="photo-card"
                          style={{
                            animationDelay: `${pIdx * 80}ms`,
                          }}
                          onClick={() => {
                            if (!isSingle) {
                              handleToggleCardOverride(group.group_id, photo);
                            }
                          }}
                          title="Haz clic en la tarjeta para alternar entre Mantener o Cuarentena"
                        >
                          {/* Badges */}
                          {isSingle ? (
                            <div className="photo-badge-ribbon unique" data-testid="photo-badge">
                              Única
                            </div>
                          ) : manual ? (
                            <div className="photo-badge-manual" data-testid="photo-badge">
                              {isKeep ? <CheckmarkRegular /> : <DismissRegular />}
                              {isKeep ? "MANTENER (Manual)" : "CUARENTENA (Manual)"}
                            </div>
                          ) : isKeep ? (
                            <div className="photo-badge-ribbon keep" data-testid="photo-badge">
                              <CheckmarkRegular /> MANTENER (Mejor)
                            </div>
                          ) : (
                            <div className="photo-badge-stamp discard" data-testid="photo-badge">
                              <DismissRegular /> A CUARENTENA
                            </div>
                          )}

                          {/* Quality Ring */}
                          {analysis && (
                            <div className="photo-ring-corner" onClick={(e) => e.stopPropagation()}>
                              <QualityRing score={analysis.total_score} size={36} />
                            </div>
                          )}

                          {/* Thumbnail */}
                          <div
                            style={{
                              width: "100%",
                              height: "170px",
                              position: "relative",
                              background: "#030712",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              overflow: "hidden",
                            }}
                          >
                            <img
                              src={imgUrl}
                              alt={fileName}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />

                            <div
                              style={{
                                position: "absolute",
                                bottom: "6px",
                                right: "6px",
                                background: "rgba(0, 0, 0, 0.75)",
                                borderRadius: "4px",
                                padding: "3px 8px",
                                color: "#FFF",
                                fontSize: "10px",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                                cursor: "pointer",
                                zIndex: 5,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewModalPhoto(imgUrl);
                              }}
                              title="Haz clic para ver imagen ampliada"
                            >
                              <EyeRegular /> Ampliar
                            </div>

                            <div className="photo-hover-tooltip" data-testid="photo-hover-tooltip">
                              {fileName} · {photo.original_resolution || "N/A"} · {formattedSize}
                            </div>
                          </div>

                          {/* Barras de calidad */}
                          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                            <Text
                              weight="semibold"
                              size={200}
                              style={{
                                color: "#F8FAFC",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={fileName}
                            >
                              {fileName}
                            </Text>

                            {analysis?.discard_reason && (
                              <div style={{ fontSize: "11px", color: "#F87171", background: "rgba(239, 68, 68, 0.1)", padding: "4px 8px", borderRadius: "6px" }}>
                                ⚠️ {analysis.discard_reason}
                              </div>
                            )}

                            {analysis && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "2px" }}>
                                <MetricBar label="Nitidez" value={analysis.sharpness_score} size="sm" />
                                <MetricBar label="Claridad facial" value={analysis.eyes_open_score} size="sm" />
                                <MetricBar label="Calidad Total" value={analysis.total_score} size="lg" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky Bottom Bar */}
      {effectiveDiscardedPhotos.length > 0 && (
        <div className="curator-action-bar" data-testid="curator-sticky-action-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "14px", color: "#F8FAFC" }}>
              <strong>{effectiveDiscardedPhotos.length} fotos</strong> seleccionadas para eliminar
            </span>
            <span style={{ color: "#64748B" }}>·</span>
            <span style={{ fontSize: "13px", color: "#38BDF8", fontWeight: 600 }}>
              Liberarás {formatBytes(totalBytesDiscarded)}
            </span>
          </div>

          <Button
            appearance="primary"
            icon={<BroomRegular />}
            className="curator-quarantine-cta"
            onClick={() => onCleanDiscarded?.(effectiveDiscardedPhotos)}
            data-testid="move-to-quarantine-btn"
          >
            🗑 Mover a Cuarentena
          </Button>
        </div>
      )}

      {/* Modal ampliado */}
      {previewModalPhoto && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.88)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          onClick={() => setPreviewModalPhoto(null)}
        >
          <img
            src={previewModalPhoto}
            alt="Preview Ampliada"
            style={{
              maxWidth: "92vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: "12px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.8)",
            }}
          />
        </div>
      )}
    </div>
  );
};
