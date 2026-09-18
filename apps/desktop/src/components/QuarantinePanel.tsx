import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Checkbox,
  Text,
  Badge,
  Input,
  Spinner,
} from "@fluentui/react-components";
import {
  ArrowUndoRegular,
  DeleteRegular,
  SearchRegular,
  WarningRegular,
  ShieldCheckmarkRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import {
  QuarantineEntry,
  QuarantineStats,
  RestoreResult,
  PurgeResult,
} from "../types/models";
import "./quarantinePanel.css";

export const QuarantinePanel: React.FC = () => {
  const [entries, setEntries] = useState<QuarantineEntry[]>([]);
  const [stats, setStats] = useState<QuarantineStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedModule, setSelectedModule] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState<boolean>(false);

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
      setLoading(false);
    } catch (err) {
      console.error("Error al cargar cuarentena:", err);
      // Mock inicial si se ejecuta sin backend
      setEntries([
        {
          id: "demo-q-1",
          original_path: "C:\\Users\\Demo\\AppData\\Local\\Temp\\cache_01.tmp",
          quarantine_path: "C:\\Users\\Demo\\.gigacare\\quarantine\\files\\demo-q-1\\cache_01.tmp",
          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          size_bytes: 1024 * 1024 * 25, // 25 MB
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
          size_bytes: 1024 * 1024 * 140, // 140 MB
          quarantined_at: new Date(Date.now() - 1 * 86400000).toISOString(),
          expires_at: new Date(Date.now() + 6 * 86400000).toISOString(),
          source_module: "installers",
          status: "quarantined",
        },
      ]);
      setStats({
        total_items: 2,
        total_bytes: 1024 * 1024 * 165,
        max_space_bytes: 1024 * 1024 * 1024 * 5, // 5 GB
      });
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
    if (bytes === 0) return "0 B";
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

  const percentSpace = stats
    ? Math.min(100, (stats.total_bytes / stats.max_space_bytes) * 100)
    : 0;

  const isSpaceWarning = percentSpace > 80;

  return (
    <div className="quarantine-panel-container">
      {/* Header con Indicador de Espacio */}
      <div className="quarantine-header-card">
        <div>
          <Text weight="bold" size={500} style={{ color: "#F8FAFC", display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheckmarkRegular style={{ color: "#00E5FF", fontSize: "24px" }} />
            Panel de Cuarentena Reversible
          </Text>
          <Text size={200} style={{ color: "#94A3B8" }}>
            Aislamiento seguro con verificación de integridad criptográfica SHA-256.
          </Text>
        </div>

        {stats && (
          <div className="quarantine-space-indicator">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
              <span style={{ color: "#94A3B8" }}>Espacio ocupado:</span>
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
        )}
      </div>

      {/* Alerta si se supera el umbral */}
      {isSpaceWarning && (
        <div className="quarantine-space-alert">
          <WarningRegular style={{ fontSize: "18px" }} />
          <span>
            La cuarentena está superando el 80% de su límite asignado ({formatBytes(stats?.max_space_bytes || 0)}). Purga elementos antiguos para evitar bloqueos.
          </span>
        </div>
      )}

      {/* Toolbar: Búsqueda, Filtros y Acciones */}
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

      {/* Lista Cronológica de Archivos */}
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
              return (
                <div key={entry.id} className="quarantine-item-row">
                  <Checkbox
                    checked={isChecked}
                    onChange={() => handleToggleOne(entry.id)}
                  />
                  <div className="quarantine-item-info">
                    <span className="quarantine-item-path" title={entry.original_path}>
                      {entry.original_path}
                    </span>
                    <div className="quarantine-item-meta">
                      <Badge size="small" appearance="tint">
                        {entry.source_module}
                      </Badge>
                      <span>Ingreso: {new Date(entry.quarantined_at).toLocaleDateString()}</span>
                      <span>Expira: {new Date(entry.expires_at).toLocaleDateString()}</span>
                      <span title={entry.sha256}>SHA: {entry.sha256.substring(0, 8)}...</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "16px", marginLeft: "16px" }}>
                    <Text weight="semibold" style={{ color: "#38BDF8" }}>
                      {formatBytes(entry.size_bytes)}
                    </Text>

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
    </div>
  );
};
