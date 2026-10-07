import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  Checkbox,
  Text,
  Badge,
  Input,
  Spinner,
  Dropdown,
  Option,
  ProgressBar,
} from "@fluentui/react-components";
import {
  ArrowUndoRegular,
  DeleteRegular,
  SearchRegular,
  WarningRegular,
  ShieldCheckmarkRegular,
  FolderOpenRegular,
  BrainCircuitRegular,
  BroomRegular,
  EyeRegular,
  CopyRegular,
  CheckmarkRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import {
  QuarantineEntry,
  QuarantineStats,
  RestoreResult,
  PurgeResult,
  PhotoGroup,
  RecursivePhotoScanResult,
} from "../types/models";
import { MetricBar } from "./MetricBar";
import { QualityRing } from "./QualityRing";
import { EmptyStateCurator } from "./EmptyStateCurator";
import "./quarantinePanel.css";
import "./photoCurator.css";

export const QuarantinePanel: React.FC = () => {
  // Pestaña activa (T039): "quarantine" | "analyze"
  const [activeTab, setActiveTab] = useState<"quarantine" | "analyze">("quarantine");

  // Estado pestaña Cuarentena
  const [entries, setEntries] = useState<QuarantineEntry[]>([]);
  const [stats, setStats] = useState<QuarantineStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedModule, setSelectedModule] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState<boolean>(false);

  // Estado pestaña Analizar Nueva Carpeta (T040)
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [isRootDriveWarning, setIsRootDriveWarning] = useState<boolean>(false);
  const [scanningFolder, setScanningFolder] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<RecursivePhotoScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [analyzingAi, setAnalyzingAi] = useState<boolean>(false);
  const [keepCount, setKeepCount] = useState<number>(1);
  const [movingToQuarantine, setMovingToQuarantine] = useState<boolean>(false);

  // Estado para modal de visualización de origen
  const [selectedOriginEntry, setSelectedOriginEntry] = useState<QuarantineEntry | null>(null);
  const [copiedOriginalPath, setCopiedOriginalPath] = useState<boolean>(false);
  const [copiedSha, setCopiedSha] = useState<boolean>(false);

  // Ayudante para extraer nombre de archivo y carpeta contenedora original
  const getFileOriginInfo = (pathStr: string) => {
    const normalized = pathStr.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    const fileName = parts.pop() || pathStr;
    const parentDir = parts.length > 0 ? (pathStr.includes("\\") ? parts.join("\\") : parts.join("/")) : "Raíz del sistema";
    return { fileName, parentDir };
  };

  // Mapeo amigable de módulos de procedencia
  const getSourceModuleLabel = (mod: string) => {
    switch (mod) {
      case "system_temp":
        return "Archivos Temporales del Sistema";
      case "system_cache":
        return "Caché del Sistema";
      case "browser_cache":
        return "Caché de Navegadores Web";
      case "messaging_cache":
        return "Caché de Aplicaciones de Mensajería (WhatsApp/Telegram)";
      case "installers":
        return "Instaladores Residuales Antiguos";
      case "photo_curator":
        return "Curador de Fotos (Tomas duplicadas o descartadas)";
      case "dev_cleaning":
        return "Dev Cleaning (Dependencias/Entornos inactivos)";
      case "app_residuals":
        return "Archivos Residuales de Desinstalación";
      default:
        return mod || "Limpieza SmartCare";
    }
  };

  useEffect(() => {
    loadQuarantineData();
  }, []);

  const loadQuarantineData = async () => {
    setLoading(true);
    try {
      const [entriesRes, statsRes] = await Promise.all([
        invoke<QuarantineEntry[]>("list_quarantine"),
        invoke<QuarantineStats>("quarantine_stats"),
      ]);
      setEntries(entriesRes);
      setStats(statsRes);
    } catch (err) {
      console.error("Error al cargar cuarentena:", err);
      setEntries([
        {
          id: "demo-q-1",
          original_path: "C:\\Users\\Demo\\AppData\\Local\\Temp\\cache_01.tmp",
          quarantine_path: "C:\\Users\\Demo\\.gigacare\\quarantine\\files\\demo-q-1\\cache_01.tmp",
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          size_bytes: 1024 * 1024 * 25,
          quarantined_at: new Date(Date.now() - 3 * 86400000).toISOString(),
          expires_at: new Date(Date.now() + 4 * 86400000).toISOString(),
          source_module: "system_temp",
          status: "quarantined",
        },
        {
          id: "demo-q-2",
          original_path: "C:\\Users\\Demo\\Downloads\\old_installer.msi",
          quarantine_path: "C:\\Users\\Demo\\.gigacare\\quarantine\\files\\demo-q-2\\old_installer.msi",
          sha256: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
          size_bytes: 1024 * 1024 * 140,
          quarantined_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          expires_at: new Date(Date.now() + 6 * 86400000).toISOString(),
          source_module: "installers",
          status: "quarantined",
        },
      ]);
      setStats({
        total_items: 2,
        total_bytes: 1024 * 1024 * 165,
        max_space_bytes: 1024 * 1024 * 1024 * 50,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreSelected = async () => {
    if (selectedIds.size === 0) return;
    setRestoring(true);
    try {
      await invoke<RestoreResult>("restore_items", {
        entry_ids: Array.from(selectedIds),
      });
      setSelectedIds(new Set());
      await loadQuarantineData();
    } catch (err) {
      console.error("Error al restaurar archivos:", err);
    }
    setRestoring(false);
  };

  const handlePurgeExpired = async () => {
    try {
      await invoke<PurgeResult>("purge_expired");
      await loadQuarantineData();
    } catch (err) {
      console.error("Error al purgar expirados:", err);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const modules = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((e) => set.add(e.source_module));
    return ["all", ...Array.from(set)];
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (selectedModule !== "all" && e.source_module !== selectedModule) {
        return false;
      }
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase();
        return (
          e.original_path.toLowerCase().includes(q) ||
          e.source_module.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [entries, selectedModule, searchQuery]);

  const allSelected = useMemo(() => {
    if (filteredEntries.length === 0) return false;
    return filteredEntries.every((e) => selectedIds.has(e.id));
  }, [filteredEntries, selectedIds]);

  const handleToggleAll = () => {
    const next = new Set(selectedIds);
    if (allSelected) {
      filteredEntries.forEach((e) => next.delete(e.id));
    } else {
      filteredEntries.forEach((e) => next.add(e.id));
    }
    setSelectedIds(next);
  };

  const handleToggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // T040: Diálogo nativo para seleccionar carpeta
  const handleSelectFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Seleccionar Carpeta para Análisis de Fotos",
      });

      if (selected && typeof selected === "string") {
        setSelectedFolder(selected);
        // Si se selecciona la raíz de una unidad (ej: "C:\", "D:\", "E:/")
        const isRoot = /^[a-zA-Z]:[\\/]?$/.test(selected);
        setIsRootDriveWarning(isRoot);
        // Iniciar escaneo automático
        triggerRecursiveScan(selected);
      }
    } catch (err) {
      console.error("Error al abrir diálogo de selección de carpeta:", err);
      // Fallback para testing o entorno web
      const fallbackFolder = "C:\\Fotos";
      setSelectedFolder(fallbackFolder);
      triggerRecursiveScan(fallbackFolder);
    }
  };

  const triggerRecursiveScan = async (folder: string) => {
    setScanningFolder(true);
    setScanError(null);
    try {
      const res = await invoke<RecursivePhotoScanResult>("find_photo_groups_recursive", {
        folder_path: folder,
      });
      setScanResult(res);
    } catch (err: any) {
      setScanError(String(err));
    } finally {
      setScanningFolder(false);
    }
  };

  const handleAnalyzeInQuarantine = async () => {
    if (!scanResult) return;
    setAnalyzingAi(true);
    try {
      const res = await invoke<PhotoGroup[]>("analyze_all_groups_ai", {
        keep_count: keepCount,
      });
      if (res) {
        setScanResult((prev) => (prev ? { ...prev, groups: res } : null));
      }
    } catch (err) {
      console.error("Error al analizar fotos en cuarentena:", err);
    } finally {
      setAnalyzingAi(false);
    }
  };

  // T041: Mover fotos a cuarentena y refrescar pestaña automáticamente
  const handleMoveToQuarantineFromScan = async () => {
    if (!scanResult) return;
    const discarded = scanResult.groups.flatMap((g) =>
      g.photos.filter((p) => p.ai_analysis?.recommendation === "discard").map((p) => p.path)
    );
    if (discarded.length === 0) return;

    setMovingToQuarantine(true);
    try {
      await invoke("clean_items", { item_ids: discarded });
      // Limpiar resultado de escaneo
      setScanResult(null);
      setSelectedFolder("");
      // Cambiar automáticamente a la pestaña de cuarentena y refrescar
      setActiveTab("quarantine");
      await loadQuarantineData();
    } catch (err) {
      console.error("Error al mover fotos a cuarentena:", err);
    } finally {
      setMovingToQuarantine(false);
    }
  };

  const percentSpace = stats
    ? Math.min(100, (stats.total_bytes / stats.max_space_bytes) * 100)
    : 0;

  const isSpaceWarning = percentSpace > 80;

  const discardedInScan = scanResult
    ? scanResult.groups.flatMap((g) =>
        g.photos.filter((p) => p.ai_analysis?.recommendation === "discard").map((p) => p.path)
      )
    : [];

  return (
    <div className="quarantine-panel-container" data-testid="quarantine-panel">
      {/* Header con pestañas internas (T039) */}
      <div className="quarantine-header-card">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <ShieldCheckmarkRegular style={{ color: "#00E5FF", fontSize: "24px" }} />
            <Text weight="bold" size={500} style={{ color: "#F8FAFC" }}>
              Panel de Cuarentena Reversible
            </Text>
          </div>
          <Text size={200} style={{ color: "#94A3B8" }}>
            Aislamiento seguro con verificación criptográfica SHA-256 y explorador de fotos integrado.
          </Text>
        </div>

        {/* Sistema de Pestañas Internas (T039) */}
        <div style={{ display: "flex", gap: "8px", background: "rgba(11, 15, 25, 0.6)", padding: "4px", borderRadius: "10px", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <Button
            size="small"
            appearance={activeTab === "quarantine" ? "primary" : "subtle"}
            style={
              activeTab === "quarantine"
                ? { backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 700 }
                : { color: "#94A3B8" }
            }
            onClick={() => setActiveTab("quarantine")}
            data-testid="tab-quarantine-files"
          >
            Archivos en Cuarentena
          </Button>

          <Button
            size="small"
            appearance={activeTab === "analyze" ? "primary" : "subtle"}
            icon={<FolderOpenRegular />}
            style={
              activeTab === "analyze"
                ? { backgroundColor: "#7C3AED", color: "#F8FAFC", fontWeight: 700 }
                : { color: "#94A3B8" }
            }
            onClick={() => setActiveTab("analyze")}
            data-testid="tab-analyze-folder"
          >
            Analizar Nueva Carpeta
          </Button>
        </div>
      </div>

      {/* PESTAÑA 1: ARCHIVOS EN CUARENTENA */}
      {activeTab === "quarantine" && (
        <>
          {stats && (
            <div style={{ background: "rgba(15, 23, 42, 0.55)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "12px", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1, maxWidth: "420px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                  <span style={{ color: "#94A3B8" }}>Espacio ocupado por cuarentena:</span>
                  <span style={{ color: isSpaceWarning ? "#F59E0B" : "#00E5FF", fontWeight: 600 }}>
                    {formatBytes(stats.total_bytes)} / {formatBytes(stats.max_space_bytes)} ({Math.round(percentSpace)}%)
                  </span>
                </div>
                <div className="quarantine-space-bar-bg">
                  <div
                    className={`quarantine-space-bar-fill ${isSpaceWarning ? "warning" : ""}`}
                    style={{ width: `${percentSpace}%` }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "8px" }}>
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  onClick={handlePurgeExpired}
                >
                  Purgar Expirados
                </Button>
                <Button
                  appearance="primary"
                  icon={<ArrowUndoRegular />}
                  disabled={selectedIds.size === 0 || restoring}
                  style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 600 }}
                  onClick={handleRestoreSelected}
                >
                  {restoring ? "Restaurando..." : `Restaurar (${selectedIds.size})`}
                </Button>
              </div>
            </div>
          )}

          {isSpaceWarning && (
            <div className="quarantine-space-alert">
              <WarningRegular style={{ fontSize: "18px" }} />
              <span>
                La cuarentena está superando el 80% de su límite asignado ({formatBytes(stats?.max_space_bytes || 0)}). Purga elementos antiguos para evitar bloqueos.
              </span>
            </div>
          )}

          {/* Toolbar */}
          <div className="quarantine-toolbar">
            <div style={{ display: "flex", gap: "8px", flex: 1, alignItems: "center" }}>
              <Input
                className="quarantine-search-box"
                placeholder="Buscar por nombre o ruta..."
                contentBefore={<SearchRegular />}
                value={searchQuery}
                onChange={(_, data) => setSearchQuery(data.value)}
              />

              <div style={{ display: "flex", gap: "6px" }}>
                {modules.map((mod) => (
                  <Button
                    key={mod}
                    size="small"
                    appearance={selectedModule === mod ? "primary" : "subtle"}
                    style={
                      selectedModule === mod
                        ? { backgroundColor: "rgba(0, 229, 255, 0.2)", borderColor: "#00E5FF", color: "#00E5FF" }
                        : {}
                    }
                    onClick={() => setSelectedModule(mod)}
                  >
                    {mod === "all" ? "Todos los módulos" : mod}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Lista de archivos */}
          <div className="quarantine-list-card">
            <div className="quarantine-list-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Checkbox
                  checked={allSelected}
                  onChange={handleToggleAll}
                  label="Seleccionar todo"
                />
              </div>
              <span>{filteredEntries.length} archivos en cuarentena</span>
            </div>

            <div className="quarantine-list-items">
              {loading ? (
                <div style={{ margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "40px" }}>
                  <Spinner size="large" />
                  <Text style={{ color: "#94A3B8" }}>Cargando manifiesto de cuarentena...</Text>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: "#94A3B8" }}>
                  No hay archivos en cuarentena que coincidan con los filtros.
                </div>
              ) : (
                filteredEntries.map((entry) => {
                  const isChecked = selectedIds.has(entry.id);
                  const { fileName } = getFileOriginInfo(entry.original_path);
                  return (
                    <div key={entry.id} className="quarantine-item-row" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <Checkbox
                        checked={isChecked}
                        onChange={() => handleToggleOne(entry.id)}
                      />

                      <div className="quarantine-item-info" style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span className="quarantine-item-name" title={fileName}>
                            {fileName}
                          </span>
                          <Badge size="small" appearance="tint">
                            {entry.source_module}
                          </Badge>
                          <Text weight="semibold" style={{ color: "#38BDF8", fontSize: "12px" }}>
                            {formatBytes(entry.size_bytes)}
                          </Text>
                        </div>

                        {/* Indicador visible de origen original del archivo */}
                        <div className="quarantine-item-origin-row" title={`Ubicación original: ${entry.original_path}`}>
                          <span className="quarantine-origin-tag">Origen:</span>
                          <span className="quarantine-origin-path-text">{entry.original_path}</span>
                        </div>

                        <div className="quarantine-item-meta">
                          <span>Ingreso: {new Date(entry.quarantined_at).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>Expira: {new Date(entry.expires_at).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "12px" }}>
                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<EyeRegular />}
                          onClick={() => {
                            setSelectedOriginEntry(entry);
                            setCopiedOriginalPath(false);
                            setCopiedSha(false);
                          }}
                          title="Visualizar detalles completos de origen y procedencia de este archivo"
                          data-testid={`view-origin-btn-${entry.id}`}
                          style={{ color: "#00E5FF", borderColor: "rgba(0, 229, 255, 0.3)" }}
                        >
                          Ver origen
                        </Button>

                        <Button
                          size="small"
                          appearance="subtle"
                          icon={<ArrowUndoRegular />}
                          onClick={async () => {
                            try {
                              await invoke("restore_items", { entry_ids: [entry.id] });
                              await loadQuarantineData();
                            } catch (err) {
                              console.error("Error al restaurar:", err);
                            }
                          }}
                          title="Restaurar a su ubicación original"
                        >
                          Restaurar
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* PESTAÑA 2: ANALIZAR NUEVA CARPETA (T040, RF-004) */}
      {activeTab === "analyze" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }} data-testid="analyze-folder-view">
          {/* Barra de selección de carpeta */}
          <div style={{ background: "rgba(15, 23, 42, 0.6)", border: "1px solid rgba(255, 255, 255, 0.09)", borderRadius: "14px", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
              <Button
                appearance="primary"
                icon={<FolderOpenRegular />}
                onClick={handleSelectFolder}
                style={{ backgroundColor: "#7C3AED", color: "#F8FAFC", fontWeight: 700 }}
                data-testid="select-folder-btn"
              >
                📂 Seleccionar Carpeta
              </Button>
              {selectedFolder && (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "13px", color: "#F8FAFC", fontFamily: "monospace" }}>
                    {selectedFolder}
                  </span>
                  {scanResult && (
                    <span style={{ fontSize: "11px", color: "#94A3B8" }}>
                      {scanResult.total_photos_found} fotos encontradas · {scanResult.groups.length} grupos similares
                    </span>
                  )}
                </div>
              )}
            </div>

            {scanResult && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Text size={200} style={{ color: "#94A3B8", fontWeight: 600 }}>
                  Conservar por grupo:
                </Text>
                <Dropdown
                  size="small"
                  value={`${keepCount} mejor${keepCount > 1 ? "es" : ""}`}
                  onOptionSelect={(_, data) => setKeepCount(Number(data.optionValue) || 1)}
                  data-testid="quarantine-keep-count-dropdown"
                >
                  <Option value="1">1 mejor (Recomendado)</Option>
                  <Option value="2">2 mejores</Option>
                  <Option value="3">3 mejores</Option>
                </Dropdown>

                <Button
                  appearance="primary"
                  icon={<BrainCircuitRegular />}
                  onClick={handleAnalyzeInQuarantine}
                  disabled={analyzingAi}
                  style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 700 }}
                  data-testid="analyze-ai-in-quarantine-btn"
                >
                  {analyzingAi ? "Analizando..." : "Analizar con IA"}
                </Button>
              </div>
            )}
          </div>

          {/* Aviso de seguridad si se selecciona la raíz de una unidad */}
          {isRootDriveWarning && (
            <div style={{ background: "rgba(245, 158, 11, 0.15)", border: "1px solid #F59E0B", borderRadius: "10px", padding: "10px 16px", color: "#FCD34D", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }} data-testid="root-drive-warning">
              <WarningRegular style={{ fontSize: "18px" }} />
              <span>
                <strong>Aviso de seguridad:</strong> Se seleccionó una unidad completa. Las carpetas del sistema ($Recycle.Bin, Windows, System Volume Information, node_modules) han sido excluidas automáticamente.
              </span>
            </div>
          )}

          {/* Banner de soft limit si fue truncado */}
          {scanResult?.truncated && (
            <div style={{ background: "rgba(0, 229, 255, 0.12)", border: "1px solid #00E5FF", borderRadius: "10px", padding: "10px 16px", color: "#00E5FF", fontSize: "13px" }}>
              ℹ️ Mostrando las primeras 5.000 fotos encontradas. Selecciona una subcarpeta para resultados más específicos.
            </div>
          )}

          {/* Error de permisos o lectura */}
          {scanError && (
            <div style={{ background: "rgba(239, 68, 68, 0.15)", border: "1px solid #EF4444", borderRadius: "10px", padding: "12px 16px", color: "#FCA5A5", fontSize: "13px" }}>
              ⚠️ {scanError}
            </div>
          )}

          {/* Estado de escaneo con barra de progreso */}
          {scanningFolder && (
            <div style={{ background: "rgba(15, 23, 42, 0.6)", borderRadius: "14px", padding: "32px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
              <Spinner size="large" />
              <Text weight="semibold" style={{ color: "#F8FAFC" }}>
                Escaneando recursivamente fotos en {selectedFolder}...
              </Text>
              <div style={{ width: "100%", maxWidth: "400px" }}>
                <ProgressBar shape="rounded" />
              </div>
            </div>
          )}

          {/* Estado vacío o grupos de fotos encontrados */}
          {!scanningFolder && !scanResult && !scanError && (
            <div style={{ background: "rgba(15, 23, 42, 0.4)", borderRadius: "14px", padding: "48px 24px", textAlign: "center", color: "#94A3B8", border: "1px dashed rgba(255, 255, 255, 0.1)" }}>
              <span style={{ fontSize: "40px", display: "block", marginBottom: "12px" }}>📂</span>
              <Text weight="bold" size={400} style={{ color: "#F8FAFC", display: "block" }}>
                Ninguna carpeta seleccionada
              </Text>
              <Text size={200}>
                Haz clic en "Seleccionar Carpeta" para escanear y curar fotos similares en cualquier unidad o directorio.
              </Text>
            </div>
          )}

          {!scanningFolder && scanResult && scanResult.groups.length === 0 && (
            <EmptyStateCurator
              title="No se encontraron fotos duplicadas en esta carpeta"
              subtitle="Todas las imágenes analizadas son únicas o no superan el umbral de similitud."
              onScanAnotherFolder={handleSelectFolder}
            />
          )}

          {/* Grid de grupos encontrados en la carpeta */}
          {!scanningFolder && scanResult && scanResult.groups.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {scanResult.groups.map((group, gIdx) => (
                <div key={group.group_id || gIdx} className="photo-group-card">
                  <div className="photo-group-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Text weight="bold" size={300} style={{ color: "#F8FAFC" }}>
                        Grupo #{gIdx + 1}
                      </Text>
                      <Badge size="small" appearance="tint">
                        {group.photos.length} fotos
                      </Badge>
                      <Badge size="small" appearance="outline" style={{ borderColor: "rgba(0, 229, 255, 0.4)", color: "#00E5FF" }}>
                        Similitud: {group.avg_hamming_distance || 2}
                      </Badge>
                    </div>
                  </div>

                  <div className="group-gradient-divider" />

                  <div className="photo-compare-row">
                    {group.photos.map((photo, pIdx) => {
                      const analysis = photo.ai_analysis;
                      const isKeep = analysis ? analysis.recommendation === "keep" : pIdx < keepCount;
                      const fileName = photo.path.split(/[\\/]/).pop() || photo.path;
                      const imgUrl = photo.thumbnail_path || `/api/raw-file?path=${encodeURIComponent(photo.path)}`;

                      return (
                        <div
                          key={photo.path || pIdx}
                          className={`photo-card ${isKeep ? "recommended" : "discarded"}`}
                          style={{ minWidth: "220px", maxWidth: "250px" }}
                        >
                          {isKeep ? (
                            <div className="photo-badge-ribbon keep">
                              MANTENER
                            </div>
                          ) : (
                            <div className="photo-badge-stamp discard">
                              A CUARENTENA
                            </div>
                          )}

                          {analysis && (
                            <div className="photo-ring-corner">
                              <QualityRing score={analysis.total_score} size={36} />
                            </div>
                          )}

                          <div style={{ width: "100%", height: "160px", background: "#030712", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <img
                              src={imgUrl}
                              alt={fileName}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                              onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                            />
                          </div>

                          <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                            <Text weight="semibold" size={200} style={{ color: "#F8FAFC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={fileName}>
                              {fileName}
                            </Text>

                            {analysis && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                <MetricBar label="Nitidez" value={analysis.sharpness_score} size="sm" />
                                <MetricBar label="Calidad" value={analysis.total_score} size="lg" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Botón flotante para mover descartadas a cuarentena (T040, T041) */}
              {discardedInScan.length > 0 && (
                <div className="curator-action-bar" data-testid="quarantine-move-action-bar">
                  <span style={{ fontSize: "14px", color: "#F8FAFC" }}>
                    <strong>{discardedInScan.length} fotos</strong> listas para enviar a cuarentena
                  </span>
                  <Button
                    appearance="primary"
                    icon={<BroomRegular />}
                    className="curator-quarantine-cta"
                    onClick={handleMoveToQuarantineFromScan}
                    disabled={movingToQuarantine}
                    data-testid="quarantine-move-btn"
                  >
                    {movingToQuarantine ? "Moviendo a cuarentena..." : "🗑 Mover a Cuarentena"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {/* Modal de Detalles de Origen del Archivo */}
      {selectedOriginEntry && typeof document !== "undefined" &&
        createPortal(
          <div
            className="quarantine-origin-modal-backdrop"
            onClick={() => setSelectedOriginEntry(null)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="quarantine-origin-modal-card"
              onClick={(e) => e.stopPropagation()}
              data-testid="quarantine-origin-modal"
            >
              {/* Header */}
              <div className="quarantine-origin-modal-header">
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <div className="quarantine-origin-icon-badge">
                    <FolderOpenRegular />
                  </div>
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: 700, color: "#F8FAFC" }}>
                      Detalles de Origen del Archivo
                    </div>
                    <div style={{ fontSize: "12px", color: "#94A3B8" }}>
                      Trazabilidad, procedencia y estado de aislamiento seguro
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="quarantine-origin-close-btn"
                  onClick={() => setSelectedOriginEntry(null)}
                  title="Cerrar modal"
                  aria-label="Cerrar"
                >
                  ✕
                </button>
              </div>

              {/* Body */}
              <div className="quarantine-origin-modal-body">
                {/* 1. Nombre y Tamaño */}
                <div className="quarantine-origin-field">
                  <span className="quarantine-origin-field-label">Nombre del Archivo</span>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "14px", fontWeight: 700, color: "#F8FAFC" }}>
                      {getFileOriginInfo(selectedOriginEntry.original_path).fileName}
                    </span>
                    <Badge size="medium" appearance="tint" style={{ color: "#00E5FF", borderColor: "rgba(0, 229, 255, 0.4)" }}>
                      {formatBytes(selectedOriginEntry.size_bytes)}
                    </Badge>
                  </div>
                </div>

                {/* 2. Ruta Original Completa (De donde se eliminó) */}
                <div className="quarantine-origin-field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span className="quarantine-origin-field-label" style={{ color: "#00E5FF" }}>
                      📍 Ruta de Origen Original (Fuente de eliminación)
                    </span>
                    <button
                      type="button"
                      className="quarantine-origin-copy-btn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(selectedOriginEntry.original_path);
                          setCopiedOriginalPath(true);
                          setTimeout(() => setCopiedOriginalPath(false), 2000);
                        } catch {}
                      }}
                      title="Copiar ruta de origen al portapapeles"
                    >
                      {copiedOriginalPath ? (
                        <>
                          <CheckmarkRegular style={{ color: "#10B981" }} />
                          <span style={{ color: "#10B981" }}>Copiado</span>
                        </>
                      ) : (
                        <>
                          <CopyRegular />
                          <span>Copiar ruta</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="quarantine-origin-code-box">
                    {selectedOriginEntry.original_path}
                  </div>
                </div>

                {/* 3. Carpeta Contenedora Original */}
                <div className="quarantine-origin-field">
                  <span className="quarantine-origin-field-label">📁 Carpeta Contenedora Original</span>
                  <div className="quarantine-origin-code-box" style={{ color: "#CBD5E1" }}>
                    {getFileOriginInfo(selectedOriginEntry.original_path).parentDir}
                  </div>
                </div>

                {/* 4. Fuente / Módulo que lo eliminó */}
                <div className="quarantine-origin-field">
                  <span className="quarantine-origin-field-label">🛡️ Fuente / Módulo de Detección</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px" }}>
                    <Badge size="medium" appearance="filled" style={{ backgroundColor: "rgba(0, 229, 255, 0.15)", color: "#00E5FF", border: "1px solid rgba(0, 229, 255, 0.4)" }}>
                      {selectedOriginEntry.source_module}
                    </Badge>
                    <span style={{ fontSize: "12.5px", color: "#CBD5E1" }}>
                      {getSourceModuleLabel(selectedOriginEntry.source_module)}
                    </span>
                  </div>
                </div>

                {/* 5. Ubicación en Aislamiento Cuarentena */}
                <div className="quarantine-origin-field">
                  <span className="quarantine-origin-field-label">🔒 Ubicación Actual en Aislamiento Seguro</span>
                  <div className="quarantine-origin-code-box" style={{ fontSize: "11.5px", color: "#94A3B8" }}>
                    {selectedOriginEntry.quarantine_path}
                  </div>
                </div>

                {/* 6. Hash SHA-256 */}
                <div className="quarantine-origin-field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span className="quarantine-origin-field-label">🔑 Hash de Verificación Criptográfica (SHA-256)</span>
                    <button
                      type="button"
                      className="quarantine-origin-copy-btn"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(selectedOriginEntry.sha256);
                          setCopiedSha(true);
                          setTimeout(() => setCopiedSha(false), 2000);
                        } catch {}
                      }}
                    >
                      {copiedSha ? "Copiado" : "Copiar Hash"}
                    </button>
                  </div>
                  <div className="quarantine-origin-code-box" style={{ fontSize: "11px", color: "#94A3B8" }}>
                    {selectedOriginEntry.sha256}
                  </div>
                </div>

                {/* 7. Fechas */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "4px" }}>
                  <div className="quarantine-origin-subcard">
                    <span style={{ fontSize: "11px", color: "#64748B", textTransform: "uppercase" }}>Fecha de Aislamiento</span>
                    <span style={{ fontSize: "13px", color: "#E2E8F0", fontWeight: 500 }}>
                      {new Date(selectedOriginEntry.quarantined_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="quarantine-origin-subcard">
                    <span style={{ fontSize: "11px", color: "#64748B", textTransform: "uppercase" }}>Purga Automática</span>
                    <span style={{ fontSize: "13px", color: "#E2E8F0", fontWeight: 500 }}>
                      {new Date(selectedOriginEntry.expires_at).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="quarantine-origin-modal-footer">
                <Button
                  appearance="subtle"
                  onClick={() => setSelectedOriginEntry(null)}
                >
                  Cerrar
                </Button>

                <Button
                  appearance="primary"
                  icon={<ArrowUndoRegular />}
                  style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 700 }}
                  onClick={async () => {
                    try {
                      await invoke("restore_items", { entry_ids: [selectedOriginEntry.id] });
                      setSelectedOriginEntry(null);
                      await loadQuarantineData();
                    } catch (err) {
                      console.error("Error al restaurar:", err);
                    }
                  }}
                >
                  Restaurar a Ubicación Original
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};