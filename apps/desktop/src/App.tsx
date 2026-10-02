import { useState, useEffect } from "react";
import {
  FluentProvider,
  Dialog,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogActions,
  DialogContent,
  Button,
  Text,
} from "@fluentui/react-components";
import { WarningRegular } from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { obsidianDarkTheme, gigacareLightTheme } from "./theme";
import { Shell } from "./components/Shell";
import { SpaceMap } from "./components/SpaceMap";
import { PhotoCurator } from "./components/PhotoCurator";
import { QuarantinePanel } from "./components/QuarantinePanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { DevCleaning } from "./components/DevCleaning/DevCleaning";
import { JunkFilesPanel } from "./components/JunkFilesPanel";
import { SystemManagementPanel } from "./components/SystemManagementPanel";
import { SmartCareWelcome } from "./components/SmartCareWelcome";
import { SmartCareScanning } from "./components/SmartCareScanning";
import { SmartCareResults } from "./components/SmartCareResults";
import { CleanupReviewModal } from "./components/CleanupReviewModal";
import {
  CleanResult,
  OverrideMap,
  SmartCareAnalysis,
  JunkFilesScanResult,
  InstalledApp,
} from "./types/models";

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const searchParams = new URLSearchParams(window.location.search);
  const initialMod = searchParams.get("module") || "smartcare";

  const resolvedInitialModule =
    initialMod === "uninstaller" || initialMod === "startup"
      ? "system_management"
      : initialMod;
  const initialDefaultTab: "uninstaller" | "startup" =
    initialMod === "startup" ? "startup" : "uninstaller";

  const [activeModule, setActiveModule] = useState<string>(resolvedInitialModule);
  const [previousModule, setPreviousModule] = useState<string>("smartcare");
  const [systemMgmtTab] = useState<"uninstaller" | "startup">(initialDefaultTab);
  const [focusCategory] = useState<string | undefined>(undefined);
  const [photoOverrides, setPhotoOverrides] = useState<OverrideMap>({});

  // SmartCare Redesign State
  const [smartCareAnalysis, setSmartCareAnalysis] = useState<SmartCareAnalysis | null>(null);
  const [smartcarePhase, setSmartcarePhase] = useState<"welcome" | "scanning" | "results">("welcome");
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [junkData, setJunkData] = useState<JunkFilesScanResult | null>(null);
  const [devData, setDevData] = useState<{ caches?: any[]; models?: any[]; python?: any[] } | null>(null);
  const [appsData, setAppsData] = useState<InstalledApp[] | null>(null);
  const [customSelectedPaths, setCustomSelectedPaths] = useState<string[] | null>(null);
  const [customAppsToUninstall, setCustomAppsToUninstall] = useState<string[] | null>(null);
  const [cleanSummary, setCleanSummary] = useState<string | null>(null);

  // App uninstall dialog confirmation queue
  const [pendingAppsQueue, setPendingAppsQueue] = useState<InstalledApp[]>([]);
  const [currentAppToUninstall, setCurrentAppToUninstall] = useState<InstalledApp | null>(null);
  const [uninstalledAppsCount, setUninstalledAppsCount] = useState(0);

  useEffect(() => {
    invoke<SmartCareAnalysis | null>("get_smartcare_analysis")
      .then((analysis) => {
        if (analysis && analysis.is_valid) {
          setSmartCareAnalysis(analysis);
          setSmartcarePhase("results");
        }
      })
      .catch((err) => {
        console.warn("No se pudo cargar análisis previo de SmartCare:", err);
      });
  }, []);

  const handleOpenReview = async () => {
    try {
      const [junkRes, cachesRes, modelsRes, pyRes, appsRes] = await Promise.all([
        invoke<JunkFilesScanResult>("scan_junk_files").catch(() => null),
        invoke<any>("dev_clean_scan").catch(() => null),
        invoke<any>("ml_model_scan").catch(() => null),
        invoke<any>("python_env_scan").catch(() => null),
        invoke<InstalledApp[]>("list_installed_apps_with_usage").catch(() => null),
      ]);

      if (junkRes) setJunkData(junkRes);
      setDevData({
        caches: cachesRes?.findings || [],
        models: modelsRes?.models || [],
        python: pyRes?.envs || [],
      });
      if (appsRes) setAppsData(appsRes);
    } catch (err) {
      console.warn("Error al cargar datos detallados para revisión:", err);
    }
    setIsReviewOpen(true);
  };

  const handleRefreshDrive = async () => {
    try {
      const updatedHealth = await invoke<any>("get_drive_health", { drive: "C:" });
      if (smartCareAnalysis) {
        setSmartCareAnalysis({
          ...smartCareAnalysis,
          drive_health: updatedHealth,
        });
      }
    } catch (err) {
      console.warn("Error al actualizar salud del disco:", err);
    }
  };

  const handleAcceptReview = (paths: string[], apps: string[]) => {
    setCustomSelectedPaths(paths);
    setCustomAppsToUninstall(apps);
    setIsReviewOpen(false);
  };

  const executeSmartCareClean = async (
    explicitPaths?: string[],
    explicitApps?: string[]
  ) => {
    setCleanSummary(null);
    let pathsToClean = explicitPaths || customSelectedPaths;
    let appsToClean = explicitApps || customAppsToUninstall || [];

    // Si el usuario no revisó manualmente, limpiar automáticamente todos los items seguros de junk + dev caches
    if (!pathsToClean) {
      const paths: string[] = [];
      try {
        const junk = await invoke<JunkFilesScanResult>("scan_junk_files");
        for (const cat of junk.categories) {
          for (const item of cat.items) {
            if (item.safe) paths.push(item.path);
          }
        }
        const devCaches = await invoke<any>("dev_clean_scan");
        for (const finding of devCaches.findings || []) {
          if (finding.safety === "safe") paths.push(finding.path);
        }
      } catch (e) {
        console.warn("Error al recolectar items por defecto:", e);
      }
      pathsToClean = paths;
    }

    let filesMoved = 0;
    let bytesFreed = 0;

    // Separar recycle bin de items estándar
    const rbItems: string[] = [];
    const regularItems: string[] = [];

    for (const p of pathsToClean || []) {
      if (p.toLowerCase().includes("$recycle.bin") || p.toLowerCase().includes("recycle_bin")) {
        rbItems.push(p);
      } else {
        regularItems.push(p);
      }
    }

    if (regularItems.length > 0) {
      try {
        const res = await invoke<CleanResult>("clean_items", { item_ids: regularItems });
        filesMoved += res.items_moved;
        bytesFreed += res.bytes_freed;
      } catch (e) {
        console.error("Error en clean_items:", e);
      }
    }

    if (rbItems.length > 0) {
      try {
        const res = await invoke<CleanResult>("clean_recycle_bin", { items: rbItems });
        filesMoved += res.items_moved;
        bytesFreed += res.bytes_freed;
      } catch (e) {
        console.error("Error en clean_recycle_bin:", e);
      }
    }

    // Gestionar desinstalación de aplicaciones si hay seleccionadas
    if (appsToClean.length > 0 && appsData) {
      const matched = appsData.filter((a) => appsToClean?.includes(a.id) || appsToClean?.includes(a.name));
      if (matched.length > 0) {
        setUninstalledAppsCount(0);
        setPendingAppsQueue(matched.slice(1));
        setCurrentAppToUninstall(matched[0]);
        return;
      }
    }

    setCleanSummary(
      `Limpieza completada: ${filesMoved} archivos aislados en cuarentena (${formatBytes(bytesFreed)} liberados).`
    );
  };

  const handleUninstallNextApp = async (shouldUninstall: boolean) => {
    if (shouldUninstall && currentAppToUninstall) {
      try {
        await invoke("uninstall_app", { app_id: currentAppToUninstall.id });
        setUninstalledAppsCount((c) => c + 1);
      } catch (e) {
        console.error("Error al desinstalar app:", e);
      }
    }

    if (pendingAppsQueue.length > 0) {
      const next = pendingAppsQueue[0];
      setPendingAppsQueue((q) => q.slice(1));
      setCurrentAppToUninstall(next);
    } else {
      setCurrentAppToUninstall(null);
      setCleanSummary(
        `Limpieza completada con éxito. ${uninstalledAppsCount + (shouldUninstall ? 1 : 0)} apps desinstaladas.`
      );
    }
  };

  const handleCancelAllAppUninstalls = () => {
    setPendingAppsQueue([]);
    setCurrentAppToUninstall(null);
    setCleanSummary(
      `Desinstalaciones canceladas. ${uninstalledAppsCount} apps desinstaladas.`
    );
  };

  const renderActiveModule = () => {
    switch (activeModule) {
      case "smartcare": {
        if (smartcarePhase === "scanning") {
          return (
            <SmartCareScanning
              onComplete={(analysis) => {
                setSmartCareAnalysis(analysis);
                setSmartcarePhase("results");
              }}
              onCancel={() => setSmartcarePhase("welcome")}
            />
          );
        }

        if (smartcarePhase === "results" && smartCareAnalysis) {
          return (
            <>
              <SmartCareResults
                analysis={smartCareAnalysis}
                onReview={handleOpenReview}
                onExecute={() => executeSmartCareClean()}
                onRestart={() => setSmartcarePhase("welcome")}
                onRefreshDrive={handleRefreshDrive}
              />
              {cleanSummary && (
                <div
                  data-testid="smartcare-clean-summary"
                  style={{
                    margin: "16px auto 0",
                    maxWidth: "960px",
                    width: "100%",
                    padding: "12px 20px",
                    background: "rgba(0, 229, 255, 0.1)",
                    border: "1px solid #00E5FF",
                    borderRadius: "8px",
                    color: "#00E5FF",
                    textAlign: "center",
                  }}
                >
                  {cleanSummary}
                </div>
              )}
            </>
          );
        }

        return (
          <SmartCareWelcome
            onAnalyze={() => setSmartcarePhase("scanning")}
            lastAnalysisHours={
              smartCareAnalysis?.timestamp
                ? Math.max(
                    1,
                    Math.round(
                      (Date.now() - new Date(smartCareAnalysis.timestamp).getTime()) /
                        (1000 * 60 * 60)
                    )
                  )
                : null
            }
          />
        );
      }

      case "quarantine":
        return <QuarantinePanel />;

      case "junk_files":
        return (
          <JunkFilesPanel
            focusCategory={focusCategory}
            smartCareAnalysis={smartCareAnalysis}
          />
        );

      case "system_management":
        return <SystemManagementPanel defaultTab={systemMgmtTab} />;

      case "dev_cleaning":
        return (
          <DevCleaning
            smartCareAnalysis={smartCareAnalysis}
          />
        );

      case "settings":
        return (
          <SettingsPanel
            onClose={() => setActiveModule(previousModule || "smartcare")}
          />
        );

      default:
        return (
          <div style={{ padding: "32px", textAlign: "center", color: "#94A3B8" }}>
            Módulo {activeModule} en desarrollo.
          </div>
        );
    }
  };

  return (
    <FluentProvider
      theme={isDark ? obsidianDarkTheme : gigacareLightTheme}
      style={{ height: "100vh" }}
    >
      <Shell
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        activeModule={activeModule}
        onModuleChange={(mod) => {
          if (activeModule !== "settings") {
            setPreviousModule(activeModule);
          }
          setActiveModule(mod);
        }}
      >
        {/* SpaceMap persistente */}
        <div style={{ display: activeModule === "space_map" ? "contents" : "none" }}>
          <SpaceMap
            isVisible={activeModule === "space_map"}
            smartCareAnalysis={smartCareAnalysis}
          />
        </div>
        {/* PhotoCurator persistente */}
        <div style={{ display: activeModule === "photos" ? "contents" : "none" }}>
          <PhotoCurator
            overrides={photoOverrides}
            onOverridesChange={setPhotoOverrides}
            onCleanDiscarded={async (paths) => {
              try {
                await invoke("clean_items", { item_ids: paths });
                setActiveModule("quarantine");
              } catch (err) {
                console.error("Error al enviar fotos a cuarentena:", err);
              }
            }}
          />
        </div>
        {activeModule !== "space_map" && activeModule !== "photos" && renderActiveModule()}

        {/* Modal de Revisión detallada */}
        {smartCareAnalysis && (
          <CleanupReviewModal
            open={isReviewOpen}
            analysis={smartCareAnalysis}
            junkData={junkData}
            devData={devData}
            appsData={appsData}
            onAccept={handleAcceptReview}
            onClose={() => setIsReviewOpen(false)}
          />
        )}

        {/* Diálogo de confirmación individual de desinstalación de aplicaciones */}
        <Dialog open={Boolean(currentAppToUninstall)}>
          <DialogSurface style={{ maxWidth: "480px", background: "#0F172A", border: "1px solid rgba(239, 68, 68, 0.4)" }}>
            <DialogBody>
              <DialogTitle style={{ color: "#EF4444", display: "flex", alignItems: "center", gap: "8px" }}>
                <WarningRegular style={{ fontSize: "24px" }} />
                Confirmar Desinstalación Permanente
              </DialogTitle>
              <DialogContent style={{ marginTop: "12px", color: "#F8FAFC" }}>
                <Text size={300}>
                  La desinstalación de <strong>{currentAppToUninstall?.name}</strong> es permanente y no se puede revertir desde la cuarentena. ¿Deseas continuar?
                </Text>
              </DialogContent>
              <DialogActions style={{ marginTop: "20px" }}>
                <Button appearance="subtle" onClick={handleCancelAllAppUninstalls}>
                  Cancelar todo
                </Button>
                <Button appearance="secondary" onClick={() => handleUninstallNextApp(false)}>
                  Omitir
                </Button>
                <Button appearance="primary" style={{ background: "#EF4444", color: "#FFFFFF" }} onClick={() => handleUninstallNextApp(true)}>
                  Desinstalar
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </Shell>
    </FluentProvider>
  );
}
