import React, { useState, useEffect } from "react";
import {
  Button,
  Text,
  Switch,
  Spinner,
  Input,
} from "@fluentui/react-components";
import {
  PowerRegular,
  ArrowClockwiseRegular,
  ShieldLockRegular,
  WarningRegular,
  SearchRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { StartupItem } from "../types/models";

export const StartupPanel: React.FC = () => {
  const [items, setItems] = useState<StartupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterImpact, setFilterImpact] = useState<string>("all");

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<StartupItem[]>("list_startup_items");
      setItems(data);
    } catch (err: any) {
      setError(err?.toString() || "Error al cargar los elementos de inicio.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleToggle = async (item: StartupItem) => {
    if (item.protected) {
      setError(`El servicio "${item.name}" está protegido por el sistema y no puede desactivarse.`);
      return;
    }

    const nextEnabled = !item.enabled;
    setError(null);
    try {
      await invoke("toggle_startup_item", {
        item_id: item.id,
        enabled: nextEnabled,
      });
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, enabled: nextEnabled } : it
        )
      );
    } catch (err: any) {
      setError(err?.message || err?.toString() || "No se pudo cambiar el estado del elemento.");
    }
  };

  const filteredItems = items.filter((it) => {
    const matchesSearch =
      it.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      it.path.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesImpact =
      filterImpact === "all" || it.impact.toLowerCase() === filterImpact;
    return matchesSearch && matchesImpact;
  });

  const activeCount = items.filter((i) => i.enabled).length;
  const highImpactActiveCount = items.filter(
    (i) => i.enabled && i.impact.toLowerCase() === "high"
  ).length;

  const getImpactBadge = (impact: string) => {
    const imp = impact.toLowerCase();
    if (imp === "high") {
      return {
        label: "Impacto Alto",
        bg: "rgba(239, 68, 68, 0.15)",
        color: "#F87171",
        border: "rgba(239, 68, 68, 0.3)",
      };
    }
    if (imp === "medium") {
      return {
        label: "Impacto Medio",
        bg: "rgba(234, 179, 8, 0.15)",
        color: "#FACC15",
        border: "rgba(234, 179, 8, 0.3)",
      };
    }
    return {
      label: "Impacto Bajo",
      bg: "rgba(16, 185, 129, 0.15)",
      color: "#34D399",
      border: "rgba(16, 185, 129, 0.3)",
    };
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "registry_hkcu":
        return "Registro (Usuario)";
      case "registry_hklm":
        return "Registro (Sistema)";
      case "startup_folder":
        return "Carpeta Inicio";
      case "task_scheduler":
        return "Tarea Programada";
      default:
        return source;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "0 16px 32px 16px",
        color: "#F8FAFC",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: "12px",
        }}
      >
        <div>
          <Text
            weight="bold"
            size={500}
            style={{
              color: "#F8FAFC",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <PowerRegular style={{ color: "#00E5FF", fontSize: "24px" }} />
            Gestor de Inicio de Windows
          </Text>
          <Text size={200} style={{ color: "#94A3B8" }}>
            Optimiza el tiempo de arranque controlando las aplicaciones que se inician automáticamente.
          </Text>
        </div>

        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={fetchItems}
          disabled={loading}
        >
          Actualizar
        </Button>
      </div>

      {/* Metrics Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        <div
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "11px", color: "#94A3B8", textTransform: "uppercase", fontWeight: 600 }}>
            Total Detectados
          </span>
          <span style={{ fontSize: "24px", fontWeight: 700, color: "#F8FAFC" }}>
            {items.length}
          </span>
          <span style={{ fontSize: "11px", color: "#64748B" }}>
            Registros HKCU, HKLM y carpeta Startup
          </span>
        </div>

        <div
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid rgba(0, 229, 255, 0.25)",
            borderRadius: "12px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "11px", color: "#94A3B8", textTransform: "uppercase", fontWeight: 600 }}>
            Activos al Arranque
          </span>
          <span style={{ fontSize: "24px", fontWeight: 700, color: "#00E5FF" }}>
            {activeCount}
          </span>
          <span style={{ fontSize: "11px", color: "#64748B" }}>
            Ejecutándose en el inicio de sesión
          </span>
        </div>

        <div
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "11px", color: "#94A3B8", textTransform: "uppercase", fontWeight: 600 }}>
            Impacto Alto Activos
          </span>
          <span
            style={{
              fontSize: "24px",
              fontWeight: 700,
              color: highImpactActiveCount > 0 ? "#F87171" : "#34D399",
            }}
          >
            {highImpactActiveCount}
          </span>
          <span style={{ fontSize: "11px", color: "#64748B" }}>
            Programas que ralentizan el arranque
          </span>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            color: "#FCA5A5",
            padding: "10px 14px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "13px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <WarningRegular />
            <span>{error}</span>
          </div>
          <Button size="small" appearance="subtle" onClick={() => setError(null)}>
            Cerrar
          </Button>
        </div>
      )}

      {/* Search & Filter Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <Input
          contentBefore={<SearchRegular />}
          placeholder="Buscar aplicación o ruta..."
          value={searchQuery}
          onChange={(_, data) => setSearchQuery(data.value)}
          style={{ minWidth: "280px" }}
        />

        <div style={{ display: "flex", gap: "6px" }}>
          {["all", "high", "medium", "low"].map((f) => (
            <Button
              key={f}
              size="small"
              appearance={filterImpact === f ? "primary" : "secondary"}
              onClick={() => setFilterImpact(f)}
            >
              {f === "all"
                ? "Todos"
                : f === "high"
                ? "Alto"
                : f === "medium"
                ? "Medio"
                : "Bajo"}
            </Button>
          ))}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: "48px", textAlign: "center" }}>
          <Spinner label="Analizando programas de inicio..." />
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          style={{
            padding: "40px",
            textAlign: "center",
            background: "rgba(15, 23, 42, 0.4)",
            borderRadius: "10px",
            color: "#94A3B8",
          }}
        >
          No se encontraron programas de inicio que coincidan con el filtro.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filteredItems.map((item) => {
            const badge = getImpactBadge(item.impact);
            return (
              <div
                key={item.id}
                style={{
                  background: "rgba(15, 23, 42, 0.55)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: "14px", color: "#F8FAFC" }}>
                      {item.name}
                    </span>

                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: badge.bg,
                        color: badge.color,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {badge.label}
                    </span>

                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 8px",
                        borderRadius: "6px",
                        background: "rgba(148, 163, 184, 0.12)",
                        color: "#94A3B8",
                      }}
                    >
                      {getSourceLabel(item.source)}
                    </span>

                    {item.protected && (
                      <span
                        style={{
                          fontSize: "11px",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: "rgba(0, 229, 255, 0.12)",
                          color: "#00E5FF",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        <ShieldLockRegular /> Protegido
                      </span>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize: "11px",
                      color: "#64748B",
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={item.path}
                  >
                    {item.path}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Switch
                    checked={item.enabled}
                    disabled={item.protected}
                    onChange={() => handleToggle(item)}
                    label={item.enabled ? "Activado" : "Desactivado"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
