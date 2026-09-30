import React, { useState, useEffect } from "react";
import { Button, Badge, Spinner } from "@fluentui/react-components";
import { CheckmarkRegular, DismissRegular, DeleteRegular, EyeRegular, ArrowSyncRegular } from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { PhotoGroup } from "../types/models";

export interface SpaceMapDuplicatesTriageProps {
  onQuarantineSelected?: (paths: string[]) => void;
  currentFolderPath?: string;
  /** Cuántas fotos conservar por grupo (RF-003, PA-004). Default: 1. */
  keepCount?: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export const SpaceMapDuplicatesTriage: React.FC<SpaceMapDuplicatesTriageProps> = ({
  onQuarantineSelected,
  currentFolderPath,
  keepCount = 1,
}) => {
  const [groups, setGroups] = useState<PhotoGroup[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedToDiscard, setSelectedToDiscard] = useState<Set<string>>(new Set());
  const [quarantining, setQuarantining] = useState<boolean>(false);
  const [isRecursiveCurating, setIsRecursiveCurating] = useState<boolean>(false);
  const [previewModalImg, setPreviewModalImg] = useState<string | null>(null);

  useEffect(() => {
    loadGroups(currentFolderPath);
  }, [currentFolderPath]);

  const loadGroups = async (folder?: string) => {
    setLoading(true);
    try {
      const res = await invoke<PhotoGroup[]>("find_photo_groups", {
        folder_path: folder || currentFolderPath,
        folderPath: folder || currentFolderPath,
      });

      if (res && res.length > 0) {
        setGroups(res);
        // T013: Pre-seleccionar fotos para descarte según keepCount (RF-003, CE-006)
        // Ordenar por total_score descendente, conservar las top-keepCount fotos, descartar el resto
        const initialDiscard = new Set<string>();
        for (const g of res) {
          // CE-006: si keepCount >= cantidad de fotos en el grupo, no descartar ninguna
          if (keepCount >= g.photos.length) continue;
          if (g.photos.length <= 1) continue;

          // Ordenar por score descendente (mejor primero)
          const sortedByQuality = [...g.photos].sort((a, b) => {
            const scoreA = a.ai_analysis?.total_score ?? (a.ai_analysis?.sharpness_score ?? 0.5);
            const scoreB = b.ai_analysis?.total_score ?? (b.ai_analysis?.sharpness_score ?? 0.5);
            return scoreB - scoreA; // mayor score primero
          });

          // Conservar las top-keepCount fotos; descartar el resto
          const keepPaths = new Set(sortedByQuality.slice(0, keepCount).map((p) => p.path));
          for (const p of g.photos) {
            if (!keepPaths.has(p.path)) {
              initialDiscard.add(p.path);
            }
          }
        }
        setSelectedToDiscard(initialDiscard);
      } else {
        // Mock demostrativo realista si no hay duplicados en el disco
        const mockGroups: PhotoGroup[] = [
          {
            group_id: "grp-dup-1",
            similarity_method: "phash",
            avg_hamming_distance: 2,
            photos: [
              {
                path: "C:\\Photos\\Vacation\\IMG_001_Best.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4.8 * 1024 * 1024,
                phash: "0x12345678",
                ai_analysis: { provider_used: "local", sharpness_score: 0.94, eyes_open_score: 0.9, composition_score: 0.8, noise_score: 0.9, total_score: 0.9, rank: 1, recommendation: "keep" },
              },
              {
                path: "C:\\Photos\\Vacation\\IMG_001_Burst1.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4.6 * 1024 * 1024,
                phash: "0x12345679",
                ai_analysis: { provider_used: "local", sharpness_score: 0.65, eyes_open_score: 0.7, composition_score: 0.6, noise_score: 0.8, total_score: 0.65, rank: 2, recommendation: "discard" },
              },
              {
                path: "C:\\Photos\\Vacation\\IMG_001_Burst2.jpg",
                original_resolution: "4032x3024",
                size_bytes: 4.5 * 1024 * 1024,
                phash: "0x1234567a",
                ai_analysis: { provider_used: "local", sharpness_score: 0.52, eyes_open_score: 0.5, composition_score: 0.5, noise_score: 0.7, total_score: 0.52, rank: 3, recommendation: "discard" },
              },
            ],
          },
        ];
        setGroups(mockGroups);
        const initialDiscard = new Set<string>();
        initialDiscard.add("C:\\Photos\\Vacation\\IMG_001_Burst1.jpg");
        initialDiscard.add("C:\\Photos\\Vacation\\IMG_001_Burst2.jpg");
        setSelectedToDiscard(initialDiscard);
      }
    } catch {
      // En caso de error, mantener lista vacía
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (path: string) => {
    setSelectedToDiscard((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleIsolateSelected = async () => {
    const paths = Array.from(selectedToDiscard);
    if (paths.length === 0) return;

    setQuarantining(true);
    try {
      if (onQuarantineSelected) {
        onQuarantineSelected(paths);
      }
      // Actualizar grupos locales quitando las fotos aisladas
      setGroups((prev) =>
        prev
          .map((g) => ({
            ...g,
            photos: g.photos.filter((p) => !selectedToDiscard.has(p.path)),
          }))
          .filter((g) => g.photos.length > 1)
      );
      setSelectedToDiscard(new Set());
    } finally {
      setQuarantining(false);
    }
  };

  // Curado recursivo automático en la carpeta actual
  const handleRecursiveCuration = async () => {
    setIsRecursiveCurating(true);
    let round = 1;
    let accumulatedQuarantined: string[] = [];

    try {
      while (groups.length > 0 && round <= 5) {
        const toDiscard = Array.from(selectedToDiscard);
        if (toDiscard.length === 0) break;

        await invoke("clean_items", { item_ids: toDiscard });
        accumulatedQuarantined = [...accumulatedQuarantined, ...toDiscard];

        round++;
        const nextRes = await invoke<PhotoGroup[]>("find_photo_groups", {
          folder_path: currentFolderPath,
          folderPath: currentFolderPath,
        });

        const nextFiltered = (nextRes || []).map((g) => ({
          ...g,
          photos: g.photos.filter((p) => !accumulatedQuarantined.includes(p.path)),
        })).filter((g) => g.photos.length > 1);

        setGroups(nextFiltered);

        const newDiscard = new Set<string>();
        for (const g of nextFiltered) {
          const sorted = [...g.photos].sort((a, b) => {
            const sA = a.ai_analysis?.total_score ?? 0.5;
            const sB = b.ai_analysis?.total_score ?? 0.5;
            return sA - sB;
          });
          const best = sorted[sorted.length - 1];
          for (const p of g.photos) {
            if (p.path !== best.path) {
              newDiscard.add(p.path);
            }
          }
        }
        setSelectedToDiscard(newDiscard);

        if (nextFiltered.length === 0 || newDiscard.size === 0) break;
      }

      if (onQuarantineSelected && accumulatedQuarantined.length > 0) {
        onQuarantineSelected(accumulatedQuarantined);
      }
    } catch (err) {
      console.error("Error en curado recursivo:", err);
    } finally {
      setIsRecursiveCurating(false);
    }
  };

  const totalDiscardBytes = groups.reduce((sum, g) => {
    return (
      sum +
      g.photos.reduce((pSum, p) => {
        return selectedToDiscard.has(p.path) ? pSum + p.size_bytes : pSum;
      }, 0)
    );
  }, 0);

  const getMediaUrl = (path: string, thumb?: string) => {
    if (thumb && thumb.startsWith("data:")) return thumb;
    return `/api/raw-file?path=${encodeURIComponent(path)}`;
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "300px",
          color: "#94A3B8",
          gap: "12px",
        }}
        data-testid="duplicates-loading"
      >
        <Spinner size="large" label="Buscando duplicados, ráfagas y evaluando nitidez..." />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "260px",
          color: "#94A3B8",
          gap: "8px",
          textAlign: "center",
        }}
        data-testid="duplicates-empty"
      >
        <span style={{ fontSize: "32px" }}>📸</span>
        <div style={{ fontSize: "15px", color: "#F8FAFC", fontWeight: 600 }}>
          No hay duplicados ni fotos desenfocadas detectadas
        </div>
        <div style={{ fontSize: "13px" }}>
          {currentFolderPath
            ? `La carpeta "${currentFolderPath}" está limpia o ya ha sido curada.`
            : "Ejecuta un escaneo de duplicados primero para encontrar fotos o videos similares."}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        padding: "16px",
        color: "#F8FAFC",
      }}
      data-testid="duplicates-triage-container"
    >
      {/* Barra superior de acciones */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(17, 24, 39, 0.8)",
          padding: "12px 16px",
          borderRadius: "10px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Badge appearance="filled" color="brand">
            {groups.length} grupos detectados
          </Badge>
          <span style={{ fontSize: "13px", color: "#94A3B8" }}>
            Aislar a cuarentena: <strong style={{ color: "#EF4444" }}>{selectedToDiscard.size} peores fotos</strong> (
            {formatBytes(totalDiscardBytes)})
          </span>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <Button
            appearance="secondary"
            icon={<ArrowSyncRegular />}
            onClick={handleRecursiveCuration}
            disabled={isRecursiveCurating || selectedToDiscard.size === 0}
            style={{ borderRadius: "6px" }}
          >
            {isRecursiveCurating ? "Curando recursivamente..." : "Curado Recursivo Automático"}
          </Button>

          <Button
            appearance="primary"
            icon={<DeleteRegular />}
            onClick={handleIsolateSelected}
            disabled={selectedToDiscard.size === 0 || quarantining || isRecursiveCurating}
            data-testid="btn-isolate-selected"
            style={{
              backgroundColor: "#EF4444",
              color: "#FFF",
              borderRadius: "6px",
              fontWeight: 600,
            }}
          >
            {quarantining ? "Aislando..." : `Aislar seleccionados (${selectedToDiscard.size})`}
          </Button>
        </div>
      </div>

      {/* Lista de grupos de duplicados en filas horizontales */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {groups.map((group, gIdx) => (
          <div
            key={group.group_id || gIdx}
            style={{
              background: "#111827",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
            data-testid="duplicate-group-row"
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#94A3B8" }}>
              <span>
                <strong>Grupo #{gIdx + 1}</strong> ({group.photos.length} fotos comparadas) • Se mantendrá la foto más nítida
              </span>
              <span>Distancia / Variación: {group.avg_hamming_distance}</span>
            </div>

            {/* Fila de fotos reales con vista previa e indicador de calidad */}
            <div style={{ display: "flex", gap: "14px", overflowX: "auto", paddingBottom: "6px" }}>
              {group.photos.map((photo) => {
                const isDiscard = selectedToDiscard.has(photo.path);
                const fileName = photo.path.split(/[\\/]/).pop() || photo.path;
                const mediaUrl = getMediaUrl(photo.path, (photo as any).thumbnail_path);
                const sharpness = photo.ai_analysis?.sharpness_score;

                return (
                  <div
                    key={photo.path}
                    onClick={() => toggleSelect(photo.path)}
                    style={{
                      position: "relative",
                      width: "180px",
                      flexShrink: 0,
                      cursor: "pointer",
                      background: "#0B0F19",
                      borderRadius: "10px",
                      padding: "8px",
                      border: isDiscard ? "2px solid #EF4444" : "2px solid #10B981",
                      boxShadow: !isDiscard ? "0 0 12px rgba(16, 185, 129, 0.2)" : "none",
                      transition: "all 150ms ease",
                    }}
                    data-testid="duplicate-card"
                    data-path={photo.path}
                    data-status={isDiscard ? "discard" : "keep"}
                  >
                    {/* Badge indicador ✓ MANTENER o ✗ A CUARENTENA */}
                    <div
                      style={{
                        position: "absolute",
                        top: "12px",
                        right: "12px",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        background: isDiscard ? "#EF4444" : "#10B981",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                        color: "#FFF",
                        fontWeight: 600,
                        fontSize: "11px",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
                        zIndex: 2,
                      }}
                      data-testid={isDiscard ? "mark-discard" : "mark-keep"}
                    >
                      {isDiscard ? <DismissRegular /> : <CheckmarkRegular />}
                      <span>{isDiscard ? "Descartar" : "Conservar"}</span>
                    </div>

                    {/* Foto real renderizada */}
                    <div
                      style={{
                        width: "100%",
                        height: "120px",
                        background: "#030712",
                        borderRadius: "6px",
                        overflow: "hidden",
                        position: "relative",
                        marginBottom: "6px",
                      }}
                    >
                      <img
                        src={mediaUrl}
                        alt={fileName}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewModalImg(mediaUrl);
                        }}
                        style={{
                          position: "absolute",
                          bottom: "6px",
                          right: "6px",
                          background: "rgba(0, 0, 0, 0.75)",
                          border: "none",
                          borderRadius: "4px",
                          color: "#FFF",
                          fontSize: "10px",
                          padding: "2px 6px",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                        title="Ver imagen grande en alta resolución"
                      >
                        <EyeRegular /> Ampliar
                      </button>
                    </div>

                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "#F8FAFC",
                      }}
                      title={fileName}
                    >
                      {fileName}
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#94A3B8", marginTop: "2px" }}>
                      <span>{formatBytes(photo.size_bytes)}</span>
                      {sharpness !== undefined && (
                        <span style={{ color: sharpness > 0.8 ? "#10B981" : "#EF4444" }}>
                          Nitidez: {Math.round(sharpness * 100)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Visor de Imagen Grande para inspeccionar fotos de duplicados */}
      {previewModalImg && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            backdropFilter: "blur(12px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999999,
            padding: "24px",
          }}
          onClick={() => setPreviewModalImg(null)}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "90vw",
              maxHeight: "85vh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={previewModalImg}
              alt="Detalle de foto ampliada"
              style={{
                maxWidth: "100%",
                maxHeight: "85vh",
                objectFit: "contain",
                borderRadius: "12px",
                border: "1px solid rgba(0, 229, 255, 0.4)",
                boxShadow: "0 0 50px rgba(0, 0, 0, 0.9)",
              }}
            />
            <button
              onClick={() => setPreviewModalImg(null)}
              style={{
                position: "absolute",
                top: "-16px",
                right: "-16px",
                background: "#EF4444",
                border: "none",
                color: "#FFF",
                borderRadius: "50%",
                width: "36px",
                height: "36px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "18px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
