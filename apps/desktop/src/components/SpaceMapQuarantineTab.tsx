import React, { useState, useEffect } from "react";
import { Button, ProgressBar, Spinner, Badge } from "@fluentui/react-components";
import { ArrowUndoRegular, DeleteRegular, EyeRegular } from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { QuarantineEntry, QuarantineStats } from "../types/models";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function calculateDaysRemaining(expiresAt?: string): number {
  if (!expiresAt) return 30;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export const SpaceMapQuarantineTab: React.FC = () => {
  const [entries, setEntries] = useState<QuarantineEntry[]>([]);
  const [stats, setStats] = useState<QuarantineStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [largeViewEntry, setLargeViewEntry] = useState<QuarantineEntry | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        invoke<QuarantineEntry[]>("list_quarantine"),
        invoke<QuarantineStats>("quarantine_stats"),
      ]);
      setEntries(listRes || []);
      setStats(statsRes || null);
    } catch {
      // Mock inicial si se invoca sin backend Tauri nativo
      const mockEntries: QuarantineEntry[] = [
        {
          id: "q-mock-1",
          original_path: "C:\\Album DJI Action 5 - Salvador 2026\\Fotos DJI\\DJI_20260116112227_0311_D.JPG",
          quarantine_path: "C:\\quarantine\\files\\DJI_20260116112227_0311_D.JPG",
          sha256: "abcdef1234567890",
          size_bytes: 2457600,
          quarantined_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          expires_at: new Date(Date.now() + 29 * 86400000).toISOString(),
          source_module: "photo_curator",
          status: "quarantined",
        },
        {
          id: "q-mock-2",
          original_path: "C:\\Users\\User\\Downloads\\old_installer.exe",
          quarantine_path: "C:\\quarantine\\files\\old_installer.exe",
          sha256: "1234567890abcdef",
          size_bytes: 450 * 1024 * 1024,
          quarantined_at: new Date(Date.now() - 5 * 86400000).toISOString(),
          expires_at: new Date(Date.now() + 25 * 86400000).toISOString(),
          source_module: "SmartCare",
          status: "quarantined",
        },
      ];
      setEntries(mockEntries);
      setStats({
        total_items: 2,
        total_bytes: 452457600,
        max_space_bytes: 50 * 1024 * 1024 * 1024,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (id: string) => {
    setProcessingId(id);
    try {
      await invoke("restore_from_quarantine", { id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (largeViewEntry?.id === id) setLargeViewEntry(null);
      if (stats) {
        const item = entries.find((e) => e.id === id);
        if (item) {
          const newBytes = Math.max(0, stats.total_bytes - item.size_bytes);
          setStats({
            ...stats,
            total_items: stats.total_items - 1,
            total_bytes: newBytes,
          });
        }
      }
    } catch {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (largeViewEntry?.id === id) setLargeViewEntry(null);
    } finally {
      setProcessingId(null);
    }
  };

  const handlePurge = async (id: string) => {
    setProcessingId(id);
    try {
      await invoke("purge_quarantine_entry", { id });
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (largeViewEntry?.id === id) setLargeViewEntry(null);
      if (stats) {
        const item = entries.find((e) => e.id === id);
        if (item) {
          const newBytes = Math.max(0, stats.total_bytes - item.size_bytes);
          setStats({
            ...stats,
            total_items: stats.total_items - 1,
            total_bytes: newBytes,
          });
        }
      }
    } catch {
      setEntries((prev) => prev.filter((e) => e.id !== id));
      if (largeViewEntry?.id === id) setLargeViewEntry(null);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "260px",
          color: "#94A3B8",
        }}
        data-testid="quarantine-tab-loading"
      >
        <Spinner size="large" label="Cargando cuarentena..." />
      </div>
    );
  }

  const maxBytes = stats?.max_space_bytes || 50 * 1024 * 1024 * 1024;
  const totalBytes = stats?.total_bytes || entries.reduce((acc, e) => acc + e.size_bytes, 0);
  const ratio = Math.min(1, maxBytes > 0 ? totalBytes / maxBytes : 0);

  const isImageFile = (path: string) => /\.(jpg|jpeg|png|webp|bmp|dng)$/i.test(path);
  const isVideoFile = (path: string) => /\.(mp4|mkv|mov|avi|webm)$/i.test(path);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        padding: "16px",
        color: "#F8FAFC",
      }}
      data-testid="space-map-quarantine-tab"
    >
      {/* Barra de espacio de cuarentena */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          background: "rgba(17, 24, 39, 0.8)",
          padding: "12px 16px",
          borderRadius: "8px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
        data-testid="quarantine-space-bar-container"
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
          <span>
            Espacio en cuarentena: <strong>{formatBytes(totalBytes)}</strong> / {formatBytes(maxBytes)} máximo
          </span>
          <span style={{ color: "#94A3B8" }}>{(ratio * 100).toFixed(1)}%</span>
        </div>
        <ProgressBar
          value={ratio}
          color={ratio > 0.8 ? "error" : "brand"}
          style={{ height: "6px", borderRadius: "3px" }}
          data-testid="quarantine-progress-bar"
        />
      </div>

      {/* Lista de entradas */}
      {entries.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "200px",
            color: "#94A3B8",
            gap: "8px",
          }}
          data-testid="quarantine-empty"
        >
          <span style={{ fontSize: "28px" }}>🛡️</span>
          <div>La cuarentena está vacía</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }} data-testid="quarantine-entries-list">
          {entries.map((entry) => {
            const fileName = entry.original_path.split(/[\\/]/).pop() || entry.original_path;
            const daysLeft = calculateDaysRemaining(entry.expires_at);
            const isImg = isImageFile(entry.original_path);
            const isVid = isVideoFile(entry.original_path);
            const mediaUrl = `/api/raw-file?path=${encodeURIComponent(entry.original_path)}`;

            return (
              <div
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  background: "#111827",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  gap: "16px",
                }}
                data-testid="quarantine-entry-row"
              >
                {/* Miniatura visual de la foto en cuarentena */}
                {isImg && (
                  <div
                    style={{
                      width: "64px",
                      height: "64px",
                      borderRadius: "8px",
                      background: "#030712",
                      overflow: "hidden",
                      flexShrink: 0,
                      cursor: "pointer",
                      border: "1px solid rgba(0, 229, 255, 0.3)",
                      position: "relative",
                    }}
                    onClick={() => setLargeViewEntry(entry)}
                    title="Haz clic para ver la imagen en tamaño grande y decidir"
                  >
                    <img
                      src={mediaUrl}
                      alt={fileName}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = "none";
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#FFF",
                        opacity: 0,
                        transition: "opacity 150ms",
                      }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = "1")}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = "0")}
                    >
                      <EyeRegular style={{ fontSize: "18px" }} />
                    </div>
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "#F8FAFC",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={entry.original_path}
                    >
                      {fileName}
                    </div>
                    {entry.source_module === "photo_curator" && (
                      <Badge size="small" appearance="tint" style={{ color: "#00E5FF", borderColor: "#00E5FF" }}>
                        Curador de Fotos
                      </Badge>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: "11px",
                      color: "#94A3B8",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.original_path}
                  </div>
                  <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "#64748B", marginTop: "2px" }}>
                    <span>{formatBytes(entry.size_bytes)}</span>
                    <span>Aislado: {new Date(entry.quarantined_at).toLocaleDateString()}</span>
                    <span style={{ color: daysLeft <= 3 ? "#EF4444" : "#F59E0B" }}>
                      ⏳ {daysLeft} días antes de purga automática
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                  {(isImg || isVid) && (
                    <Button
                      size="small"
                      appearance="subtle"
                      icon={<EyeRegular />}
                      onClick={() => setLargeViewEntry(entry)}
                      style={{ color: "#00E5FF", border: "1px solid rgba(0, 229, 255, 0.3)" }}
                    >
                      Ver en grande
                    </Button>
                  )}
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<ArrowUndoRegular />}
                    disabled={processingId === entry.id}
                    onClick={() => handleRestore(entry.id)}
                    data-testid="btn-restore"
                    title="Restaurar a ubicación original"
                    style={{ color: "#10B981" }}
                  >
                    Restaurar
                  </Button>
                  <Button
                    size="small"
                    appearance="subtle"
                    icon={<DeleteRegular style={{ color: "#EF4444" }} />}
                    disabled={processingId === entry.id}
                    onClick={() => handlePurge(entry.id)}
                    data-testid="btn-purge"
                    title="Purgar permanentemente"
                  >
                    Purgar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Visor de Pantalla Completa para Análisis e Inspección Detallada de Cuarentena */}
      {largeViewEntry && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.92)",
            backdropFilter: "blur(14px)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999999,
            padding: "24px",
          }}
          onClick={() => setLargeViewEntry(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1000px",
              maxHeight: "90vh",
              background: "#0B0F19",
              border: "1px solid #00E5FF",
              borderRadius: "16px",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 25px 60px rgba(0,0,0,0.9), 0 0 30px rgba(0, 229, 255, 0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header del modal */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: "16px", color: "#F8FAFC" }}>
                  {largeViewEntry.original_path.split(/[\\/]/).pop()}
                </h3>
                <span style={{ fontSize: "12px", color: "#94A3B8" }}>
                  {largeViewEntry.original_path} • {formatBytes(largeViewEntry.size_bytes)}
                </span>
              </div>
              <button
                onClick={() => setLargeViewEntry(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#94A3B8",
                  cursor: "pointer",
                  fontSize: "20px",
                }}
              >
                ✕
              </button>
            </div>

            {/* Imagen grande en alta resolución / Video */}
            <div
              style={{
                flex: 1,
                minHeight: "400px",
                maxHeight: "65vh",
                background: "#020617",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
                padding: "16px",
              }}
            >
              {isImageFile(largeViewEntry.original_path) ? (
                <img
                  src={`/api/raw-file?path=${encodeURIComponent(largeViewEntry.original_path)}`}
                  alt="Foto en cuarentena"
                  style={{
                    maxWidth: "100%",
                    maxHeight: "60vh",
                    objectFit: "contain",
                    borderRadius: "8px",
                  }}
                />
              ) : (
                <video
                  src={`/api/raw-file?path=${encodeURIComponent(largeViewEntry.original_path)}`}
                  controls
                  autoPlay
                  muted
                  style={{ maxWidth: "100%", maxHeight: "60vh", objectFit: "contain" }}
                />
              )}
            </div>

            {/* Footer con controles directos de decisión */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 20px",
                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                background: "#0B0F19",
              }}
            >
              <div style={{ fontSize: "13px", color: "#94A3B8" }}>
                ¿Deseas restaurar este archivo a su carpeta original o eliminarlo definitivamente?
              </div>

              <div style={{ display: "flex", gap: "12px" }}>
                <Button
                  appearance="secondary"
                  icon={<ArrowUndoRegular />}
                  onClick={() => handleRestore(largeViewEntry.id)}
                  style={{ color: "#10B981", borderColor: "#10B981", fontWeight: 600 }}
                >
                  Restaurar a su carpeta original
                </Button>
                <Button
                  appearance="primary"
                  icon={<DeleteRegular />}
                  onClick={() => handlePurge(largeViewEntry.id)}
                  style={{ backgroundColor: "#EF4444", color: "#FFF", fontWeight: 600 }}
                >
                  Purgar definitivamente
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
