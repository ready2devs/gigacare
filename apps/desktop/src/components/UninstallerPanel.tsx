import React, { useState, useEffect } from "react";
import {
  Button,
  Text,
  Spinner,
  Input,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@fluentui/react-components";
import {
  AppsListDetailRegular,
  ArrowClockwiseRegular,
  DeleteRegular,
  SearchRegular,
  WarningRegular,
  BroomRegular,
  CheckmarkRegular,
} from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { InstalledApp, ResidualScanResult, UninstallResult } from "../types/models";
import { formatBytes } from "./DevCleaning/ConfirmClean";

const formatLastUsed = (app: InstalledApp): { text: string; isOld: boolean } => {
  if (typeof app.last_used_days === "number") {
    const days = app.last_used_days;
    let dateStr = "";
    if (app.last_used_at) {
      try {
        const d = new Date(app.last_used_at);
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleDateString();
        }
      } catch {}
    }

    if (days === 0) {
      return { text: "Usado hoy", isOld: false };
    }
    if (days === 1) {
      return { text: "Usado ayer", isOld: false };
    }
    if (dateStr) {
      return {
        text: `Último uso: ${dateStr} (hace ${days} días)`,
        isOld: days >= 90,
      };
    }
    return {
      text: `Último uso: hace ${days} días`,
      isOld: days >= 90,
    };
  }

  if (app.install_date) {
    try {
      const s = String(app.install_date);
      if (s.length === 8) {
        const yr = s.substring(0, 4);
        const mo = s.substring(4, 6);
        const dy = s.substring(6, 8);
        return { text: `Instalado: ${dy}/${mo}/${yr}`, isOld: false };
      }
    } catch {}
    return { text: `Instalado: ${app.install_date}`, isOld: false };
  }

  return { text: "Uso no registrado", isOld: false };
};

export const UninstallerPanel: React.FC = () => {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedApp, setSelectedApp] = useState<InstalledApp | null>(null);
  const [residualResult, setResidualResult] = useState<ResidualScanResult | null>(null);
  const [scanningResiduals, setScanningResiduals] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);
  const [appToUninstall, setAppToUninstall] = useState<InstalledApp | null>(null);

  const fetchApps = async () => {
    setLoading(true);
    setError(null);
    setSelectedApp(null);
    setResidualResult(null);
    try {
      const data = await invoke<InstalledApp[]>("list_installed_apps");
      setApps(data);
    } catch (err: any) {
      setError(err?.toString() || "Error al escanear aplicaciones instaladas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  const handleSelectApp = async (app: InstalledApp) => {
    setSelectedApp(app);
    setScanningResiduals(true);
    setResidualResult(null);
    try {
      const res = await invoke<ResidualScanResult>("scan_residuals", {
        app_name: app.name,
        publisher: app.publisher,
      });
      setResidualResult(res);
    } catch (err) {
      console.error("Error al escanear residuales:", err);
    } finally {
      setScanningResiduals(false);
    }
  };

  const handleOpenUninstallDialog = (app: InstalledApp) => {
    setAppToUninstall(app);
  };

  const handleConfirmUninstall = async () => {
    if (!appToUninstall) return;
    const app = appToUninstall;
    setAppToUninstall(null);
    setUninstalling(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await invoke<UninstallResult>("uninstall_app", {
        app_id: app.id,
      });
      if (res.success) {
        setSuccessMsg(
          res.message ||
            `Desinstalador de "${app.name}" iniciado. Completa los pasos en la ventana de Windows y luego presiona "Actualizar lista".`
        );
        setSelectedApp(null);
        setResidualResult(null);
      } else {
        setError(res.message || "La desinstalación no pudo completarse.");
      }
    } catch (err: any) {
      setError(err?.toString() || "Error al ejecutar el desinstalador.");
    } finally {
      setUninstalling(false);
    }
  };

  const filteredApps = apps.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.publisher.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalAppBytes = apps.reduce((acc, a) => acc + (a.size_bytes || 0), 0);

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
            <AppsListDetailRegular style={{ color: "#00E5FF", fontSize: "24px" }} />
            Desinstalador Limpio
          </Text>
          <Text size={200} style={{ color: "#94A3B8" }}>
            Desinstalación profunda de programas con detección de restos y carpetas residuales huérfanas.
          </Text>
        </div>

        <Button
          appearance="subtle"
          icon={<ArrowClockwiseRegular />}
          onClick={fetchApps}
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
            Programas Instalados
          </span>
          <span style={{ fontSize: "24px", fontWeight: 700, color: "#F8FAFC" }}>
            {apps.length}
          </span>
          <span style={{ fontSize: "11px", color: "#64748B" }}>
            {apps.some((a) => a.source === "uwp" || a.source === "store" || a.source === "registry_wow64")
              ? "Detectados (Registro + UWP + Store)"
              : "Detectados en registro y sistema"}
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
            Espacio Estimado
          </span>
          <span style={{ fontSize: "24px", fontWeight: 700, color: "#00E5FF" }}>
            {formatBytes(totalAppBytes)}
          </span>
          <span style={{ fontSize: "11px", color: "#64748B" }}>
            Suma de tamaños reportados
          </span>
        </div>
      </div>

      {/* Messages */}
      {successMsg && (
        <div
          style={{
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            color: "#34D399",
            padding: "10px 14px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "13px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckmarkRegular />
            <span>{successMsg}</span>
          </div>
          <Button size="small" appearance="subtle" onClick={() => setSuccessMsg(null)}>
            Cerrar
          </Button>
        </div>
      )}

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

      {/* Search Input */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <Input
          contentBefore={<SearchRegular />}
          placeholder="Buscar aplicación o editor..."
          value={searchQuery}
          onChange={(_, data) => setSearchQuery(data.value)}
          style={{ maxWidth: "380px", width: "100%" }}
        />
        <span style={{ fontSize: "12px", color: "#64748B" }}>
          {filteredApps.length} resultado(s)
        </span>
      </div>

      {/* Main Grid: Left Apps List, Right App Details & Residuals */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: "16px",
          alignItems: "start",
        }}
      >
        {/* Apps List */}
        {loading ? (
          <div style={{ padding: "48px", textAlign: "center" }}>
            <Spinner label="Cargando aplicaciones instaladas..." />
          </div>
        ) : filteredApps.length === 0 ? (
          <div
            style={{
              padding: "40px",
              textAlign: "center",
              background: "rgba(15, 23, 42, 0.4)",
              borderRadius: "10px",
              color: "#94A3B8",
            }}
          >
            No se encontraron programas instalados.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filteredApps.map((app) => {
              const isSelected = selectedApp?.id === app.id;
              const usageInfo = formatLastUsed(app);
              return (
                <div
                  key={app.id}
                  onClick={() => handleSelectApp(app)}
                  style={{
                    background: isSelected
                      ? "rgba(0, 229, 255, 0.08)"
                      : "rgba(15, 23, 42, 0.55)",
                    border: isSelected
                      ? "1px solid rgba(0, 229, 255, 0.4)"
                      : "1px solid rgba(255,255,255,0.07)",
                    borderRadius: "10px",
                    padding: "12px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "16px",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                    <span style={{ fontWeight: 600, fontSize: "14px", color: "#F8FAFC" }}>
                      {app.name}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                      <span style={{ fontSize: "11px", color: "#94A3B8" }}>
                        {app.publisher} • v{app.version}
                      </span>
                      {app.source && (
                        <span
                          style={{
                            fontSize: "10px",
                            padding: "1px 6px",
                            borderRadius: "4px",
                            background: "rgba(255, 255, 255, 0.06)",
                            color: "#94A3B8",
                            textTransform: "uppercase",
                          }}
                        >
                          {app.source === "uwp"
                            ? "UWP"
                            : app.source === "store"
                            ? "Store"
                            : app.source === "registry_wow64"
                            ? "WOW64"
                            : "Registro"}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 500,
                          color: usageInfo.isOld ? "#F59E0B" : "#67E8F9",
                          background: usageInfo.isOld ? "rgba(245, 158, 11, 0.1)" : "rgba(6, 182, 212, 0.1)",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          border: usageInfo.isOld
                            ? "1px solid rgba(245, 158, 11, 0.25)"
                            : "1px solid rgba(6, 182, 212, 0.2)",
                        }}
                      >
                        {usageInfo.text}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "#CBD5E1" }}>
                      {app.size_bytes ? formatBytes(app.size_bytes) : "—"}
                    </span>
                    <Button
                      size="small"
                      appearance="subtle"
                      icon={<DeleteRegular />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenUninstallDialog(app);
                      }}
                      disabled={uninstalling}
                    >
                      Desinstalar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selected App Detail & Residual Inspection */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "12px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
            position: "sticky",
            top: "16px",
          }}
        >
          {selectedApp ? (
            <>
              <div style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "10px" }}>
                <span style={{ fontSize: "11px", color: "#00E5FF", textTransform: "uppercase", fontWeight: 600 }}>
                  Detalles de la Aplicación
                </span>
                <h3 style={{ margin: "4px 0 0 0", fontSize: "16px", color: "#F8FAFC" }}>
                  {selectedApp.name}
                </h3>
                <span style={{ fontSize: "12px", color: "#94A3B8" }}>
                  {selectedApp.publisher}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94A3B8" }}>Versión:</span>
                  <span style={{ color: "#F8FAFC" }}>{selectedApp.version}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#94A3B8" }}>Tamaño instalado:</span>
                  <span style={{ color: "#F8FAFC", fontWeight: 600 }}>
                    {selectedApp.size_bytes ? formatBytes(selectedApp.size_bytes) : "Desconocido"}
                  </span>
                </div>
                {selectedApp.install_date && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#94A3B8" }}>Instalado:</span>
                    <span style={{ color: "#F8FAFC" }}>{selectedApp.install_date}</span>
                  </div>
                )}
                {typeof selectedApp.last_used_days === "number" && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#94A3B8" }}>Última vez usado:</span>
                    <span style={{ color: selectedApp.last_used_days >= 90 ? "#F59E0B" : "#00E5FF", fontWeight: 600 }}>
                      {selectedApp.last_used_at
                        ? `${new Date(selectedApp.last_used_at).toLocaleDateString()} (hace ${selectedApp.last_used_days} días)`
                        : `Hace ${selectedApp.last_used_days} días`}
                    </span>
                  </div>
                )}
                {typeof selectedApp.usage_count === "number" && selectedApp.usage_count > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#94A3B8" }}>Ejecuciones registradas:</span>
                    <span style={{ color: "#F8FAFC" }}>{selectedApp.usage_count} veces</span>
                  </div>
                )}
              </div>

              {/* Residuals Inspection */}
              <div
                style={{
                  background: "rgba(11, 15, 25, 0.5)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <BroomRegular style={{ color: "#38BDF8" }} />
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#E2E8F0" }}>
                    Rastreo de Residuales
                  </span>
                </div>

                {scanningResiduals ? (
                  <Spinner size="tiny" label="Buscando restos en AppData..." />
                ) : residualResult ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "11px", color: "#94A3B8" }}>
                      {residualResult.residual_paths.length} carpeta(s) identificada(s):
                    </span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#38BDF8" }}>
                      {formatBytes(residualResult.total_residual_bytes)} en residuos
                    </span>
                    {residualResult.residual_paths.map((p, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: "10px",
                          color: "#64748B",
                          fontFamily: "monospace",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={p}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: "11px", color: "#64748B" }}>
                    No se detectaron restos activos.
                  </span>
                )}
              </div>

              <Button
                appearance="primary"
                icon={<DeleteRegular />}
                style={{
                  backgroundColor: "#EF4444",
                  color: "#FFFFFF",
                  fontWeight: 600,
                  marginTop: "6px",
                }}
                onClick={() => handleOpenUninstallDialog(selectedApp)}
                disabled={uninstalling}
              >
                {uninstalling ? "Iniciando..." : "Desinstalar Programa"}
              </Button>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "32px 8px", color: "#94A3B8", fontSize: "13px" }}>
              Selecciona una aplicación de la lista para ver sus detalles y auditar carpetas residuales.
            </div>
          )}
        </div>
      </div>

      {/* Diálogo Moderno de Confirmación de Desinstalación */}
      <Dialog
        open={Boolean(appToUninstall)}
        onOpenChange={(_, data) => !data.open && setAppToUninstall(null)}
      >
        <DialogSurface
          style={{
            maxWidth: "480px",
            background: "#0F172A",
            border: "1px solid rgba(0, 229, 255, 0.3)",
            boxShadow: "0 16px 36px rgba(0, 0, 0, 0.5)",
          }}
        >
          <DialogBody>
            <DialogTitle
              style={{
                color: "#00E5FF",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "18px",
              }}
            >
              <DeleteRegular style={{ fontSize: "22px", color: "#F87171" }} />
              ¿Confirmar desinstalación?
            </DialogTitle>

            <DialogContent
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
                marginTop: "12px",
              }}
            >
              <Text size={300} style={{ color: "#F8FAFC" }}>
                Estás a punto de desinstalar la siguiente aplicación de tu equipo:
              </Text>

              <div
                style={{
                  background: "rgba(0, 229, 255, 0.06)",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(0, 229, 255, 0.15)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <Text weight="semibold" style={{ display: "block", color: "#F8FAFC", fontSize: "15px" }}>
                    {appToUninstall?.name}
                  </Text>
                  <Text size={200} style={{ color: "#94A3B8" }}>
                    {appToUninstall?.publisher || "Editor desconocido"} {appToUninstall?.version ? `• v${appToUninstall.version}` : ""}
                  </Text>
                </div>
                <Text weight="semibold" style={{ color: "#00E5FF", fontSize: "14px" }}>
                  {appToUninstall?.size_bytes ? formatBytes(appToUninstall.size_bytes) : "—"}
                </Text>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "10px",
                  background: "rgba(245, 158, 11, 0.08)",
                  border: "1px solid rgba(245, 158, 11, 0.2)",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  color: "#FCD34D",
                  fontSize: "12px",
                }}
              >
                <WarningRegular style={{ fontSize: "18px", flexShrink: 0, marginTop: "2px" }} />
                <span>
                  Al pulsar confirmar, Windows iniciará el asistente oficial de desinstalación del programa. Si el Control de Cuentas de Usuario (UAC) te solicita permisos de Administrador, acéptalos para continuar.
                </span>
              </div>
            </DialogContent>

            <DialogActions style={{ marginTop: "22px", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <Button appearance="secondary" onClick={() => setAppToUninstall(null)}>
                Cancelar
              </Button>
              <Button
                appearance="primary"
                style={{ backgroundColor: "#EF4444", color: "#FFFFFF", fontWeight: 600 }}
                onClick={handleConfirmUninstall}
              >
                Iniciar Desinstalación
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
};
