import React, { useState, useEffect } from "react";
import {
  Button,
  Text,
  Badge,
  Spinner,
  Dropdown,
  Option,
} from "@fluentui/react-components";
import {
  CheckmarkRegular,
  DismissRegular,
  BrainCircuitRegular,
  SearchRegular,
  BroomRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { PhotoGroup } from "../types/models";
import "./photoCurator.css";

export interface PhotoCuratorProps {
  onCleanDiscarded?: (paths: string[]) => void;
}

export const PhotoCurator: React.FC<PhotoCuratorProps> = ({
  onCleanDiscarded,
}) => {
  const [groups, setGroups] = useState<PhotoGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [keepCount, setKeepCount] = useState<number>(1);

  useEffect(() => {
    handleScanGroups();
  }, []);

  const handleScanGroups = async () => {
    setLoading(true);
    try {
      const res = await invoke<PhotoGroup[]>("find_photo_groups");
      if (res.length === 0) {
        // Mock inicial demostrativo si no hay fotos en disco
        setGroups([
          {
            group_id: "demo-group-1",
            similarity_method: "phash",
            avg_hamming_distance: 3,
            photos: [
              {
                path: "C:\\Users\\Demo\\Pictures\\IMG_2024_01.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4194304,
                phash: "0xa1b2c3d4e5f60718",
                ai_analysis: {
                  provider_used: "google_ai_studio",
                  sharpness_score: 0.92,
                  eyes_open_score: 0.95,
                  composition_score: 0.85,
                  noise_score: 0.9,
                  total_score: 0.91,
                  rank: 1,
                  recommendation: "keep",
                },
              },
              {
                path: "C:\\Users\\Demo\\Pictures\\IMG_2024_02.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4054304,
                phash: "0xa1b2c3d4e5f60719",
                ai_analysis: {
                  provider_used: "google_ai_studio",
                  sharpness_score: 0.65,
                  eyes_open_score: 0.3,
                  composition_score: 0.8,
                  noise_score: 0.88,
                  total_score: 0.61,
                  rank: 2,
                  recommendation: "discard",
                },
              },
            ],
          },
        ]);
      } else {
        setGroups(res);
      }
      setLoading(false);
    } catch (err) {
      console.error("Error al buscar grupos de fotos:", err);
      setLoading(false);
    }
  };

  const handleAnalyzeAll = async () => {
    setAnalyzing(true);
    try {
      const res = await invoke<PhotoGroup[]>("analyze_all_groups_ai");
      if (res && res.length > 0) {
        setGroups(res);
      }
      setAnalyzing(false);
    } catch (err) {
      console.error("Error al analizar fotos:", err);
      setAnalyzing(false);
    }
  };

  const discardedPhotos = groups.flatMap((g) =>
    g.photos.filter((p) => p.ai_analysis?.recommendation === "discard").map((p) => p.path),
  );

  return (
    <div className="photo-curator-container">
      {/* Header y Controles */}
      <div className="photo-curator-header">
        <div>
          <Text weight="bold" size={500} style={{ color: "#F8FAFC", display: "block" }}>
            Curador de Fotos Inteligente
          </Text>
          <Text size={200} style={{ color: "#94A3B8" }}>
            Agrupación perceptual por pHash y ranking de calidad multimodal / nitidez local.
          </Text>
        </div>

        <div className="photo-curator-controls">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Text size={200} style={{ color: "#94A3B8" }}>Conservar por grupo:</Text>
            <Dropdown
              size="small"
              value={`${keepCount} mejor${keepCount > 1 ? "es" : ""}`}
              onOptionSelect={(_, data) => setKeepCount(Number(data.optionValue) || 1)}
            >
              <Option value="1">1 mejor</Option>
              <Option value="2">2 mejores</Option>
              <Option value="3">3 mejores</Option>
            </Dropdown>
          </div>

          <Button
            appearance="secondary"
            icon={<SearchRegular />}
            onClick={handleScanGroups}
            disabled={loading || analyzing}
          >
            Detectar Similares
          </Button>

          <Button
            appearance="primary"
            icon={<BrainCircuitRegular />}
            style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 600 }}
            onClick={handleAnalyzeAll}
            disabled={loading || analyzing || groups.length === 0}
          >
            {analyzing ? "Analizando..." : "Analizar con IA"}
          </Button>
        </div>
      </div>

      {/* Grid de Grupos Comparativos */}
      <div className="photo-groups-grid">
        {loading ? (
          <div style={{ margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <Spinner size="large" />
            <Text style={{ color: "#94A3B8" }}>Buscando fotos similares por pHash...</Text>
          </div>
        ) : groups.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: "#94A3B8" }}>
            No se detectaron grupos de fotos similares.
          </div>
        ) : (
          groups.map((group, gIdx) => {
            const isFallback = group.photos.some(
              (p) => p.ai_analysis?.provider_used === "local_fallback",
            );
            const providerUsed = group.photos[0]?.ai_analysis?.provider_used || "local";

            return (
              <div key={group.group_id || gIdx} className="photo-group-card">
                <div className="photo-group-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Text weight="semibold" style={{ color: "#F8FAFC" }}>
                      Grupo #{gIdx + 1} ({group.photos.length} fotos similares)
                    </Text>
                    <Badge size="small" appearance="tint">
                      Distancia media: {group.avg_hamming_distance}
                    </Badge>
                  </div>

                  <div>
                    {isFallback ? (
                      <span className="local-fallback-badge">
                        Análisis local (aproximado)
                      </span>
                    ) : (
                      <span className="provider-badge">
                        Proveedor: {providerUsed}
                      </span>
                    )}
                  </div>
                </div>

                <div className="photo-compare-row">
                  {group.photos.map((photo, pIdx) => {
                    const analysis = photo.ai_analysis;
                    const isKeep = analysis?.recommendation === "keep";

                    return (
                      <div
                        key={photo.path || pIdx}
                        className={`photo-card ${isKeep ? "recommended" : "discarded"}`}
                      >
                        {analysis && (
                          <div className={`photo-badge-status ${isKeep ? "keep" : "discard"}`}>
                            {isKeep ? <CheckmarkRegular /> : <DismissRegular />}
                            <span>{isKeep ? "Conservar" : "Descartar"}</span>
                          </div>
                        )}

                        <div className="photo-thumb-container">
                          <Text size={200} style={{ color: "#64748B" }}>
                            {photo.original_resolution}
                          </Text>
                        </div>

                        {analysis && (
                          <div className="photo-scores-panel">
                            <div className="score-bar-row">
                              <span>Nitidez:</span>
                              <div className="score-bar-bg">
                                <div
                                  className="score-bar-fill"
                                  style={{ width: `${Math.round(analysis.sharpness_score * 100)}%` }}
                                />
                              </div>
                              <span>{Math.round(analysis.sharpness_score * 100)}%</span>
                            </div>

                            <div className="score-bar-row">
                              <span>Ojos abiertos:</span>
                              <div className="score-bar-bg">
                                <div
                                  className="score-bar-fill"
                                  style={{
                                    width: `${Math.round(analysis.eyes_open_score * 100)}%`,
                                    background: "#7C3AED",
                                  }}
                                />
                              </div>
                              <span>{Math.round(analysis.eyes_open_score * 100)}%</span>
                            </div>

                            <div className="score-bar-row">
                              <span>Composición:</span>
                              <div className="score-bar-bg">
                                <div
                                  className="score-bar-fill"
                                  style={{ width: `${Math.round(analysis.composition_score * 100)}%` }}
                                />
                              </div>
                              <span>{Math.round(analysis.composition_score * 100)}%</span>
                            </div>

                            <div className="score-bar-row">
                              <span>Sin ruido:</span>
                              <div className="score-bar-bg">
                                <div
                                  className="score-bar-fill"
                                  style={{ width: `${Math.round(analysis.noise_score * 100)}%` }}
                                />
                              </div>
                              <span>{Math.round(analysis.noise_score * 100)}%</span>
                            </div>

                            <div style={{ marginTop: "4px", fontWeight: 600, color: isKeep ? "#00E5FF" : "#EF4444" }}>
                              Score Total: {Math.round(analysis.total_score * 100)}%
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Barra de Acción Inferior */}
      {discardedPhotos.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
          <Text style={{ color: "#94A3B8" }}>
            {discardedPhotos.length} fotos marcadas para descarte automático
          </Text>
          <Button
            appearance="primary"
            icon={<BroomRegular />}
            style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 600 }}
            onClick={() => onCleanDiscarded?.(discardedPhotos)}
          >
            Enviar Descartadas a Cuarentena
          </Button>
        </div>
      )}
    </div>
  );
};
