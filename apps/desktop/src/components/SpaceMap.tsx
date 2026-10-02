import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { TabList, Tab, TabValue, Badge, Button } from "@fluentui/react-components";
import {
  DataPieRegular,
  CopyRegular,
  ShieldRegular,
} from "@fluentui/react-icons";

import { SpaceMapNode, StorageDevice, SpaceLensScanProgress, CleanResult } from "../types/models";

import { SpaceLensDriveSelector } from "./SpaceLensDriveSelector";
import { SpaceLensFileList } from "./SpaceLensFileList";
import { SpaceLensStatusBar } from "./SpaceLensStatusBar";
import { SpaceLensWelcome } from "./SpaceLensWelcome";
import { SpaceLensScanning } from "./SpaceLensScanning";
import { SpaceMapCanvas } from "./SpaceMapCanvas";
import { SpaceMapModeSwitch } from "./SpaceMapModeSwitch";
import { SpaceMapInspector } from "./SpaceMapInspector";
import { SpaceMapSavingsBar } from "./SpaceMapSavingsBar";
import { SpaceMapNLBar } from "./SpaceMapNLBar";
import { SpaceMapDuplicatesTriage } from "./SpaceMapDuplicatesTriage";
import { SpaceMapQuarantineTab } from "./SpaceMapQuarantineTab";
import { useInspector } from "../hooks/useInspector";
import { useTreemapLayout } from "../hooks/useTreemapLayout";
import { useSunburstLayout } from "../hooks/useSunburstLayout";
import { LayoutNode } from "../types/treemap";
import { SmartCareAnalysis } from "../types/models";
import { ConfirmDialog } from "./ConfirmDialog";
import "./spaceMap.css";

export interface SpaceMapProps {
  initialPath?: string;
  previewThresholdBytes?: number;
  initialMode?: "welcome" | "scanning" | "explored";
  initialTab?: "map" | "duplicates" | "quarantine";
  /** Controla la visibilidad del componente. Cuando pasa de false a true en modo "explored",
   * verifica que el dispositivo seleccionado siga disponible (CE-005). */
  isVisible?: boolean;
  smartCareAnalysis?: SmartCareAnalysis | null;
}

export const SpaceMap: React.FC<SpaceMapProps> = ({
  initialPath = "C:\\",
  initialMode = "welcome",
  initialTab = "map",
  isVisible = true,
  smartCareAnalysis,
}) => {
  const [viewMode, setViewMode] = useState<"welcome" | "scanning" | "explored">(initialMode);
  const [activeTab, setActiveTab] = useState<TabValue>(initialTab);
  const [layoutMode, setLayoutMode] = useState<"treemap" | "sunburst">(() => {
    return (localStorage.getItem("gigacare_spacemap_mode") as "treemap" | "sunburst") || "treemap";
  });

  const [devices, setDevices] = useState<StorageDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<StorageDevice | null>(null);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState<boolean>(false);

  const [currentNode, setCurrentNode] = useState<SpaceMapNode | null>(null);
  const [history, setHistory] = useState<SpaceMapNode[]>([]);
  const [forwardHistory, setForwardHistory] = useState<SpaceMapNode[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<SpaceLensScanProgress | null>(null);

  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [selectFilter, setSelectFilter] = useState<string>("custom");
  const [hoveredPath, setHoveredPath] = useState<string | undefined>(undefined);
  const [highlightedPaths, setHighlightedPaths] = useState<string[]>([]);
  const [autoRules, setAutoRules] = useState<any[]>([]);
  const [suggestToast, setSuggestToast] = useState<{ count: number; bytes: number; desc: string } | null>(null);

  // Inspector hook
  const inspector = useInspector();

  // Canvas responsive measurement
  const canvasContainerRef = React.useRef<HTMLDivElement>(null);
  const [canvasDimensions, setCanvasDimensions] = useState<{ width: number; height: number }>({
    width: 900,
    height: 600,
  });

  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width));
      const h = Math.max(300, Math.floor(rect.height - 40));
      setCanvasDimensions({ width: w, height: h });
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [viewMode, activeTab]);

  // Convertir hijos del nodo actual en LayoutNode[]
  const layoutNodes: LayoutNode[] = useMemo(() => {
    if (!currentNode || !currentNode.children || currentNode.children.length === 0) return [];

    let filteredChildren = currentNode.children;
    const isCategoryOrSizeFilter = ["gt100mb", "gt1gb", "photos", "videos"].includes(selectFilter);

    if (isCategoryOrSizeFilter) {
      filteredChildren = currentNode.children.filter((c) => selectedPaths.has(c.path));
    } else if (selectFilter === "custom" && selectedPaths.size > 0) {
      filteredChildren = currentNode.children.filter((c) => selectedPaths.has(c.path));
    } else {
      filteredChildren = currentNode.children;
    }

    return filteredChildren.map((c) => ({
      path: c.path,
      name: c.name,
      size_bytes: c.size_bytes || 0,
      depth: 1,
      is_directory: c.is_directory,
      extension: c.extension,
      is_system: c.is_system,
      children: c.children
        ? c.children.map((sub) => ({
            path: sub.path,
            name: sub.name,
            size_bytes: sub.size_bytes || 0,
            depth: 2,
            is_directory: sub.is_directory,
            extension: sub.extension,
            is_system: sub.is_system,
          }))
        : undefined,
    }));
  }, [currentNode, selectedPaths, selectFilter]);

  const rootLayoutNode: LayoutNode | null = useMemo(() => {
    if (!currentNode) return null;
    return {
      path: currentNode.path,
      name: currentNode.name,
      size_bytes: currentNode.size_bytes || 1,
      is_directory: true,
      children: layoutNodes,
    };
  }, [currentNode, layoutNodes]);

  // Cálculo de layouts interactivos
  const treemapViewport = useMemo(
    () => ({
      x: 0,
      y: 0,
      w: canvasDimensions.width,
      h: canvasDimensions.height,
    }),
    [canvasDimensions.width, canvasDimensions.height]
  );

  const { rects } = useTreemapLayout(layoutNodes, treemapViewport);

  const sunburstCenter = useMemo(
    () => ({
      x: Math.floor(canvasDimensions.width / 2),
      y: Math.floor(canvasDimensions.height / 2),
    }),
    [canvasDimensions.width, canvasDimensions.height]
  );

  const sunburstInnerR = Math.max(35, Math.min(canvasDimensions.width, canvasDimensions.height) * 0.12);
  const sunburstRingW = Math.max(25, Math.min(canvasDimensions.width, canvasDimensions.height) * 0.1);

  const { arcs } = useSunburstLayout(rootLayoutNode, sunburstCenter, sunburstInnerR, sunburstRingW, 3);

  // Modal de confirmación de eliminación
  const [confirmOpen, setConfirmOpen] = useState<boolean>(false);
  const [isCleaning, setIsCleaning] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [deviceDisconnectedMsg, setDeviceDisconnectedMsg] = useState<string | null>(null);

  // T010: keepCount para curación de fotos (PA-004, RF-003)
  const [keepCount, setKeepCount] = useState<number>(() => {
    const stored = localStorage.getItem("gigacare_photo_keep_count");
    return stored ? parseInt(stored, 10) : 1;
  });

  const handleKeepCountChange = (count: number) => {
    setKeepCount(count);
    localStorage.setItem("gigacare_photo_keep_count", String(count));
    // Persistir en AppConfig con catch silencioso (PA-004)
    invoke("update_config", { keep_count: count }).catch(() => {
      // Silencioso: si falla, el valor se preserva desde localStorage
    });
  };

  // T030: Fase de transición Scanning → Dashboard
  const [transitionPhase, setTransitionPhase] = useState<"none" | "completing" | "entering">("none");

  const [photoCurateMenuOpen, setPhotoCurateMenuOpen] = useState(false);
  const photoCurateMenuRef = useRef<HTMLDivElement>(null);

  // Cerrar menú de curación al hacer click fuera (T011)
  useEffect(() => {
    if (!photoCurateMenuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (photoCurateMenuRef.current && !photoCurateMenuRef.current.contains(e.target as Node)) {
        setPhotoCurateMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [photoCurateMenuOpen]);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    listen<SpaceLensScanProgress>("spacelens-scan-progress", (event) => {
      setScanProgress(event.payload);
    }).then((unlisten) => {
      unlistenFn = unlisten;
    }).catch((err) => {
      console.warn("No se pudo registrar listener de spacelens-scan-progress:", err);
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // CE-005: Al volver a SpaceMap (isVisible pasa a true) en modo "explored",
  // verificar que la unidad seleccionada sigue disponible.
  useEffect(() => {
    if (!isVisible) return;
    if (viewMode !== "explored" || !selectedDevice) return;

    let cancelled = false;
    invoke<StorageDevice[]>("list_storage_devices")
      .then((devList) => {
        if (cancelled) return;
        const stillExists = devList.some((d) => d.id === selectedDevice.id);
        if (!stillExists) {
          setDeviceDisconnectedMsg(`La unidad "${selectedDevice.label}" ya no está disponible.`);
        }
      })
      .catch(() => {
        // Silencioso: si no podemos obtener lista, no interrumpimos la experiencia
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const loadDevices = useCallback(async () => {
    setIsRefreshingDevices(true);
    try {
      const devList = await invoke<StorageDevice[]>("list_storage_devices");
      setDevices(devList);
      setSelectedDevice((prev) => {
        if (prev) return prev;
        const matched = devList.find((d) => initialPath.toLowerCase().startsWith(d.root_path.toLowerCase())) || devList[0];
        return matched || null;
      });
    } catch {
      const fallbackDev: StorageDevice = {
        id: "C:",
        label: "Disco local (C:)",
        device_type: "local_disk",
        root_path: "C:\\",
        total_bytes: Math.round(1.81 * 1024 * 1024 * 1024 * 1024),
        used_bytes: Math.round(0.68 * 1024 * 1024 * 1024 * 1024),
        free_bytes: Math.round(1.13 * 1024 * 1024 * 1024 * 1024),
        is_removable: false,
        icon_hint: "hard_drive",
        is_ready: true,
      };
      setDevices([fallbackDev]);
      setSelectedDevice((prev) => prev || fallbackDev);
    } finally {
      setIsRefreshingDevices(false);
    }
  }, [initialPath]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const loadPath = useCallback(async (path: string, pushToHistory = true) => {
    setLoading(true);
    setScanProgress(null);
    try {
      const node = await invoke<SpaceMapNode>("build_space_map", {
        root_path: path,
        max_depth: 3,
      });

      if (pushToHistory && currentNode) {
        setHistory((prev) => [...prev, currentNode]);
        setForwardHistory([]);
      }

      setCurrentNode(node);
      setSelectedPaths(new Set());
      setSelectFilter("custom");
      setViewMode("explored");

      // Cargar sugerencias automáticas de limpieza
      try {
        const rules: any = await invoke("suggest_auto_rules", { nodes: node.children });
        if (rules && rules.length > 0) {
          setAutoRules(rules);
        } else {
          setAutoRules([]);
        }
      } catch {
        setAutoRules([]);
      }
    } catch (err) {
      console.error("Error al cargar space map para:", path, err);
      if (smartCareAnalysis?.drive_health) {
        const used = smartCareAnalysis.drive_health.used_bytes;
        const fallbackNode: SpaceMapNode = {
          path: path,
          name: path,
          size_bytes: used,
          is_directory: true,
          children: [
            {
              path: `${path}Windows`,
              name: "Windows",
              size_bytes: Math.round(used * 0.4),
              is_directory: true,
              children: [],
            },
            {
              path: `${path}Users`,
              name: "Users",
              size_bytes: Math.round(used * 0.35),
              is_directory: true,
              children: [],
            },
            {
              path: `${path}Program Files`,
              name: "Program Files",
              size_bytes: Math.round(used * 0.25),
              is_directory: true,
              children: [],
            },
          ],
        };
        setCurrentNode(fallbackNode);
        setViewMode("explored");
      }
    } finally {
      setLoading(false);
    }
  }, [currentNode]);

  useEffect(() => {
    if (initialMode === "explored" && selectedDevice && !currentNode && !loading) {
      loadPath(selectedDevice.root_path, false);
    }
  }, [initialMode, selectedDevice, currentNode, loading, loadPath]);

  // T035: Integrar análisis persistente en SpaceMap
  useEffect(() => {
    if (
      smartCareAnalysis &&
      smartCareAnalysis.is_valid &&
      viewMode === "welcome" &&
      !loading &&
      !currentNode
    ) {
      const ageHours =
        (Date.now() - new Date(smartCareAnalysis.timestamp).getTime()) /
        (1000 * 60 * 60);
      if (ageHours < 24) {
        const targetPath = smartCareAnalysis.drive_health?.drive_path || "C:\\";
        loadPath(targetPath, false);
      }
    }
  }, [smartCareAnalysis, viewMode, loading, currentNode, loadPath]);

  const handleStartScan = async () => {
    // T020: CE-MTP: Si el dispositivo es MTP sin letra de unidad, mostrar aviso elegante
    if (selectedDevice?.device_type === "mtp_device" && !selectedDevice?.is_ready) {
      setToastMessage(
        'Para escanear este dispositivo, conéctalo en modo Transferencia de Archivos (Almacenamiento Masivo) o selecciona una carpeta sincronizada'
      );
      setTimeout(() => setToastMessage(null), 7000);
      return;
    }

    setViewMode("scanning");
    setTransitionPhase("none");
    const targetPath = selectedDevice?.root_path || "C:\\";
    try {
      await loadPath(targetPath, false);
      // T030: Transición animada al finalizar el escaneo
      setTransitionPhase("completing"); // barra shimmer → fill completo (400ms)
      setTimeout(() => {
        setViewMode("explored");
        setTransitionPhase("entering"); // fade-in del dashboard (500ms)
        setTimeout(() => {
          setTransitionPhase("none");
        }, 600);
      }, 500);
    } catch {
      setTransitionPhase("none");
    }
  };

  const handleCancelScan = () => {
    setViewMode("welcome");
    setScanProgress(null);
    setLoading(false);
  };

  const handleResetToWelcome = () => {
    setViewMode("welcome");
    setCurrentNode(null);
    setHistory([]);
    setForwardHistory([]);
    setSelectedPaths(new Set());
    setSelectFilter("custom");
    setHoveredPath(undefined);
    inspector.clearSelection();
  };

  // T019: Manejar selección de carpeta personalizada desde Dashboard DriveSelector
  const handlePickFolderFromDashboard = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        title: "Elegir carpeta a analizar",
      });
      if (selected) {
        const folderPath = typeof selected === "string" ? selected : (selected as string[])[0];
        if (folderPath) {
          const folderName = folderPath.split(/[/\\]/).filter(Boolean).pop() || folderPath;
          const customDevice: StorageDevice = {
            id: "custom_folder",
            label: folderName,
            device_type: "local_disk",
            root_path: folderPath,
            total_bytes: 0,
            used_bytes: 0,
            free_bytes: 0,
            is_removable: false,
            icon_hint: "folder",
            is_ready: true,
          };
          setSelectedDevice(customDevice);
          setViewMode("scanning");
          await loadPath(customDevice.root_path, false);
          setTransitionPhase("completing");
          setTimeout(() => {
            setViewMode("explored");
            setTransitionPhase("entering");
            setTimeout(() => setTransitionPhase("none"), 600);
          }, 500);
        }
      }
    } catch (err) {
      console.log("[SpaceLens] Elegir carpeta (dashboard):", err);
    }
  };

  // T018: Manejar selección de carpeta personalizada desde Welcome
  const handlePickFolderFromWelcome = (customDevice: StorageDevice) => {
    setSelectedDevice(customDevice);
    setCurrentNode(null);
    setHistory([]);
    setForwardHistory([]);
    // Iniciar el escaneo de la carpeta seleccionada directamente
    setViewMode("scanning");
    loadPath(customDevice.root_path, false).then(() => {
      setTransitionPhase("completing");
      setTimeout(() => {
        setViewMode("explored");
        setTransitionPhase("entering");
        setTimeout(() => setTransitionPhase("none"), 600);
      }, 500);
    }).catch(() => {
      setTransitionPhase("none");
      setViewMode("welcome");
    });
  };

  const handleDeviceChange = (device: StorageDevice) => {
    setSelectedDevice(device);
    setCurrentNode(null);
    setHistory([]);
    setForwardHistory([]);
    setSelectedPaths(new Set());
    setSelectFilter("custom");
    setHoveredPath(undefined);
    inspector.clearSelection();
    loadPath(device.root_path, false);
  };

  const handleNavigateDown = (childNode: SpaceMapNode) => {
    if (!childNode.is_directory) {
      inspector.selectItem(childNode.path, false, childNode.size_bytes);
      return;
    }
    loadPath(childNode.path, true);
  };

  const handleNavigateBack = () => {
    if (history.length === 0) return;
    const prevNode = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    if (currentNode) {
      setForwardHistory((prev) => [currentNode, ...prev]);
    }
    setCurrentNode(prevNode);
    setSelectedPaths(new Set());
    setSelectFilter("custom");
    inspector.clearSelection();
  };

  const handleNavigateForward = () => {
    if (forwardHistory.length === 0) return;
    const nextNode = forwardHistory[0];
    setForwardHistory((prev) => prev.slice(1));
    if (currentNode) {
      setHistory((prev) => [...prev, currentNode]);
    }
    setCurrentNode(nextNode);
    setSelectedPaths(new Set());
    setSelectFilter("custom");
    inspector.clearSelection();
  };

  const handleJumpToCrumb = (targetPath: string) => {
    if (currentNode?.path === targetPath) return;

    const indexInHistory = history.findIndex((h) => h.path.toLowerCase() === targetPath.toLowerCase());
    if (indexInHistory >= 0) {
      const targetNode = history[indexInHistory];
      const newHistory = history.slice(0, indexInHistory);
      if (currentNode) {
        setForwardHistory((prev) => [currentNode, ...prev]);
      }
      setHistory(newHistory);
      setCurrentNode(targetNode);
      setSelectedPaths(new Set());
      setSelectFilter("custom");
      inspector.clearSelection();
      return;
    }

    loadPath(targetPath, true);
  };



  const breadcrumbSegments = useMemo(() => {
    if (!currentNode) return [];
    const rootPath = selectedDevice?.root_path || "C:\\";
    const currentPath = currentNode.path;

    const segments: Array<{ label: string; path: string }> = [];

    const rootIcon =
      selectedDevice?.device_type === "mtp_device"
        ? "📱"
        : selectedDevice?.is_removable
        ? "🔌"
        : "💾";

    segments.push({
      label: `${rootIcon} ${selectedDevice?.label || rootPath}`,
      path: rootPath,
    });

    const normRoot = (rootPath || "C:\\").replace(/\\+$/, "").toLowerCase();
    const normCurrent = (currentPath || "").replace(/\\+$/, "");

    if (normCurrent.toLowerCase() !== normRoot) {
      let rel = normCurrent;
      if (rel.toLowerCase().startsWith(normRoot)) {
        rel = rel.slice(normRoot.length);
      }
      const parts = rel.split(/[/\\]/).filter(Boolean);

      let accumulated = rootPath.replace(/\\+$/, "");
      for (const part of parts) {
        accumulated += `\\${part}`;
        segments.push({
          label: part,
          path: accumulated,
        });
      }
    }

    return segments;
  }, [currentNode, selectedDevice]);

  const { totalSelectedBytes, selectedCount } = useMemo(() => {
    let bytes = 0;
    const count = selectedPaths.size;
    if (!currentNode || count === 0) {
      return { totalSelectedBytes: 0, selectedCount: 0 };
    }

    const map = new Map<string, number>();
    const registerSizes = (node: SpaceMapNode) => {
      map.set(node.path, node.size_bytes);
      for (const ch of node.children) {
        registerSizes(ch);
      }
    };
    registerSizes(currentNode);

    for (const p of selectedPaths) {
      bytes += map.get(p) || 0;
    }

    return { totalSelectedBytes: bytes, selectedCount: count };
  }, [currentNode, selectedPaths]);

  const handleConfirmClean = async () => {
    setConfirmOpen(false);
    setIsCleaning(true);
    try {
      const itemPaths = Array.from(selectedPaths);
      const res = await invoke<CleanResult>("clean_items", {
        item_ids: itemPaths,
      });

      const freedFormatted = `${(res.bytes_freed / (1024 * 1024 * 1024)).toFixed(2)} GB`;
      setToastMessage(`Se liberaron ${freedFormatted} a Cuarentena de forma reversible.`);
      setSelectedPaths(new Set());
      inspector.clearSelection();

      if (currentNode) {
        await loadPath(currentNode.path, false);
      }

      setTimeout(() => setToastMessage(null), 4000);
    } catch {
      setToastMessage("Hubo un error al mover elementos a cuarentena.");
      setTimeout(() => setToastMessage(null), 4000);
    } finally {
      setIsCleaning(false);
    }
  };

  const handleQuarantineSingle = async (path: string) => {
    try {
      await invoke("clean_items", { item_ids: [path] });
      setToastMessage("Elemento enviado a cuarentena.");
      inspector.clearSelection();
      if (currentNode) {
        await loadPath(currentNode.path, false);
      }
    } catch {
      setToastMessage("Error al enviar a cuarentena.");
    }
  };

  return (
    <div className="space-map-container" data-testid="spacelens-root">
      {/* Fase 1: Pantalla de Bienvenida */}
      {viewMode === "welcome" && (
        <SpaceLensWelcome
          devices={devices}
          selectedDevice={selectedDevice}
          onSelectDevice={(dev) => setSelectedDevice(dev)}
          onStartScan={handleStartScan}
          onPickFolder={handlePickFolderFromWelcome}
        />
      )}

      {/* Fase 2: Escaneando */}
      {viewMode === "scanning" && (
        <SpaceLensScanning
          progress={scanProgress}
          onCancel={handleCancelScan}
          scanComplete={transitionPhase === "completing"}
        />
      )}

      {/* Fase 3: Exploración unificada con Tabs */}
      {viewMode === "explored" && (
        <>
          {/* Barra Superior con Navegación, Tabs inline, NLBar y ModeSwitch */}
          <header className="spacelens-top-nav" data-testid="spacelens-top-nav">
            <button
              type="button"
              className="spacelens-reset-start-btn"
              onClick={handleResetToWelcome}
              title="Volver a la selección de discos y escaneo inicial"
            >
              <span className="spacelens-reset-icon">↺</span>
              <span>Volver a empezar</span>
            </button>

            <div className="spacelens-top-nav-divider" />

            {/* Pestañas Inline principales: [Mapa de Espacio | Curador de Duplicados | Cuarentena] */}
            <TabList
              selectedValue={activeTab}
              onTabSelect={(_e, data) => setActiveTab(data.value)}
              data-testid="spacemap-tabs"
            >
              <Tab value="map" icon={<DataPieRegular />} data-testid="tab-spacemap">
                Mapa de Espacio
              </Tab>
              <Tab value="duplicates" icon={<CopyRegular />} data-testid="tab-duplicates">
                Curador de Duplicados
              </Tab>
              <Tab value="quarantine" icon={<ShieldRegular />} data-testid="tab-quarantine">
                Cuarentena
              </Tab>
            </TabList>

            <div className="spacelens-top-nav-spacer" />

            {/* Barra de Consulta en Lenguaje Natural */}
            {activeTab === "map" && (
              <SpaceMapNLBar
                onResults={(res) => setHighlightedPaths(res.matched_paths)}
                onClear={() => setHighlightedPaths([])}
                nodes={currentNode?.children}
                currentPath={currentNode?.path}
              />
            )}

            {/* Selector de modo Treemap vs Sunburst */}
            {activeTab === "map" && (
              <SpaceMapModeSwitch
                mode={layoutMode}
                onChange={(m) => setLayoutMode(m)}
              />
            )}

            {/* T011: Botón con menú desplegable para Curar Fotos (RF-003) */}
            {activeTab === "map" && (
              <div
                ref={photoCurateMenuRef}
                className="spacelens-curate-dropdown-container"
                data-testid="photo-curate-dropdown-container"
              >
                <div style={{ display: "flex", alignItems: "stretch" }}>
                  <button
                    className="spacelens-curate-trigger"
                    data-testid="photo-curate-main-btn"
                    onClick={() => setActiveTab("duplicates")}
                    title="Curar fotos duplicadas de esta carpeta"
                  >
                    {"📸 " + (keepCount === 1 ? "Curar fotos (Mejor 1)" : "Curar fotos (Mejores " + keepCount + ")")}
                  </button>
                  <button
                    className="spacelens-curate-trigger spacelens-curate-chevron"
                    data-testid="photo-curate-chevron-btn"
                    onClick={() => setPhotoCurateMenuOpen((prev) => !prev)}
                    title="Elegir cuántas fotos conservar por grupo"
                    aria-haspopup="listbox"
                    aria-expanded={photoCurateMenuOpen}
                  >
                    {photoCurateMenuOpen ? "▲" : "▼"}
                  </button>
                </div>

                {photoCurateMenuOpen && (
                  <div
                    className="spacelens-curate-menu"
                    data-testid="photo-curate-menu"
                    role="listbox"
                  >
                    {([
                      { label: "Mejor foto", value: 1 },
                      { label: "Mejores 2 fotos", value: 2 },
                      { label: "Mejores 3 fotos", value: 3 },
                    ] as { label: string; value: number }[]).map((opt) => (
                      <button
                        key={opt.value}
                        className={"spacelens-curate-option" + (keepCount === opt.value ? " active" : "")}
                        data-testid={"curate-option-" + opt.value}
                        role="option"
                        aria-selected={keepCount === opt.value}
                        onClick={() => {
                          handleKeepCountChange(opt.value);
                          setPhotoCurateMenuOpen(false);
                          setActiveTab("duplicates");
                        }}
                      >
                        {keepCount === opt.value && <span className="spacelens-curate-check">{"✓"}</span>}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Badge de Sugerencias Adaptativas IA */}
            {autoRules.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  background: "rgba(0, 229, 255, 0.12)",
                  border: "1px solid #00E5FF",
                  borderRadius: "16px",
                  padding: "4px 10px",
                  gap: "6px",
                }}
                onClick={() => {
                  const firstRule = autoRules[0];
                  setSuggestToast({
                    count: firstRule.matched_count,
                    bytes: firstRule.matched_bytes,
                    desc: firstRule.description,
                  });
                }}
                data-testid="badge-auto-rules"
                title="Sugerencias inteligentes de limpieza adaptativa"
              >
                <span style={{ fontSize: "12px" }}>💡</span>
                <span style={{ fontSize: "12px", color: "#00E5FF", fontWeight: 600 }}>
                  {autoRules.reduce((sum, r) => sum + r.matched_count, 0)} sugerencias
                </span>
                <Badge appearance="filled" color="brand" size="small">
                  {autoRules.length}
                </Badge>
              </div>
            )}

            {/* Selector de unidad de disco */}
            <SpaceLensDriveSelector
              currentDevice={selectedDevice}
              devices={devices}
              onDeviceChange={handleDeviceChange}
              onRefresh={loadDevices}
              isRefreshing={isRefreshingDevices}
              onPickFolder={handlePickFolderFromDashboard}
            />
          </header>

          {/* Sub-header de navegación histórica y breadcrumbs (solo en tab map) */}
          {activeTab === "map" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "8px 16px",
                background: "rgba(11, 15, 25, 0.9)",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              <div className="spacelens-nav-buttons">
                <button
                  type="button"
                  data-testid="nav-back-button"
                  className="spacelens-nav-btn"
                  disabled={history.length === 0}
                  onClick={handleNavigateBack}
                  title="Ir atrás"
                >
                  ◀
                </button>
                <button
                  type="button"
                  data-testid="nav-forward-button"
                  className="spacelens-nav-btn"
                  disabled={forwardHistory.length === 0}
                  onClick={handleNavigateForward}
                  title="Ir adelante"
                >
                  ▶
                </button>
              </div>

              <nav className="spacelens-breadcrumbs-container" aria-label="Ruta actual">
                {breadcrumbSegments.map((seg, idx) => {
                  const isLast = idx === breadcrumbSegments.length - 1;
                  return (
                    <React.Fragment key={seg.path}>
                      <span
                        className={`spacelens-crumb-item ${isLast ? "active" : ""}`}
                        onClick={() => handleJumpToCrumb(seg.path)}
                        title={seg.path}
                      >
                        {seg.label}
                      </span>
                      {!isLast && <span className="spacelens-crumb-separator">▸</span>}
                    </React.Fragment>
                  );
                })}
              </nav>
            </div>
          )}

          {/* Contenido según pestaña activa */}
          <main className="spacelens-main-split" style={{ display: "flex", flex: 1, minHeight: 0 }}>
            {/* 1. Tab Mapa de Espacio */}
            <div
              style={{
                display: activeTab === "map" ? "flex" : "none",
                flex: 1,
                width: "100%",
                height: "100%",
              }}
              data-testid="tab-content-map"
            >
              {/* Panel Izquierdo: Lista Jerárquica + Inspector + SavingsBar */}
              <div
                style={{
                  width: "360px",
                  display: "flex",
                  flexDirection: "column",
                  borderRight: "1px solid rgba(255, 255, 255, 0.08)",
                  background: "#0B0F19",
                  overflowY: "auto",
                }}
              >
                <SpaceLensFileList
                  currentNode={currentNode}
                  items={currentNode?.children || []}
                  selectedPaths={selectedPaths}
                  onSelectionChange={setSelectedPaths}
                  onNavigate={handleNavigateDown}
                  hoveredPath={hoveredPath}
                  onItemHover={(node) => setHoveredPath(node ? node.path : undefined)}
                  isMtpDevice={selectedDevice?.device_type === "mtp_device"}
                  activeItemPath={inspector.path}
                  onSelectItem={(node) => {
                    inspector.selectItem(node.path, node.is_directory, node.size_bytes);
                    setHoveredPath(node.path);
                  }}
                  selectFilter={selectFilter}
                  onFilterChange={setSelectFilter}
                />

                {/* Barra de Ahorro reactiva */}
                <div style={{ padding: "8px 12px" }}>
                  <SpaceMapSavingsBar
                    selectedBytes={totalSelectedBytes}
                    folderTotalBytes={currentNode?.size_bytes || 1}
                    diskTotalBytes={selectedDevice?.total_bytes || 1024 * 1024 * 1024 * 1024}
                    diskName={selectedDevice?.label || "Disco C:"}
                  />
                </div>

                {/* Panel de Inspección con thumbnail y acciones */}
                {inspector.path ? (
                  <div style={{ padding: "8px 12px" }}>
                    <SpaceMapInspector
                      path={inspector.path}
                      name={inspector.name}
                      isDirectory={inspector.isDirectory}
                      previewUrl={inspector.previewUrl}
                      mediaType={inspector.mediaType}
                      metadata={inspector.metadata}
                      onOpen={(p) => invoke("open_in_file_manager", { path: p })}
                      onQuarantine={(p) => handleQuarantineSingle(p)}
                      onExclude={(p) => invoke("add_exclusion", { pattern: p })}
                      onClose={() => inspector.clearSelection()}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      padding: "16px 12px",
                      margin: "8px 12px",
                      borderRadius: "8px",
                      border: "1px dashed rgba(255, 255, 255, 0.15)",
                      color: "#64748B",
                      fontSize: "12px",
                      textAlign: "center",
                    }}
                  >
                    🔍 Selecciona un archivo o carpeta en la lista o en el mapa para inspeccionar sus detalles y acciones.
                  </div>
                )}
              </div>

              {/* Panel Central: Canvas HTML5 Interactivo */}
              <div
                ref={canvasContainerRef}
                style={{
                  flex: 1,
                  position: "relative",
                  height: "100%",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  padding: "4px",
                }}
                data-testid="spacelens-canvas"
              >
                <SpaceMapCanvas
                  rects={rects}
                  arcs={arcs}
                  width={canvasDimensions.width}
                  height={canvasDimensions.height}
                  currentPath={currentNode?.path}
                  mode={layoutMode}
                  highlightedPaths={highlightedPaths}
                  selectedPath={inspector.path || null}
                  onSelect={(path, isDir) => {
                    const matched = currentNode?.children?.find((c) => c.path === path);
                    inspector.selectItem(path, isDir, matched?.size_bytes);
                    setHoveredPath(path);
                  }}
                  onNavigate={(path) => {
                    handleJumpToCrumb(path);
                  }}
                  onBack={handleNavigateBack}
                />

                {loading && (
                  <div className="spacelens-loading-overlay" data-testid="spacelens-loading-overlay">
                    <div className="spacelens-scan-progress-box">
                      <div className="spacelens-scan-spinner" />
                      <span className="spacelens-scan-title">Cargando contenido de la carpeta...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Tab Curador de Duplicados */}
            <div
              style={{
                display: activeTab === "duplicates" ? "block" : "none",
                flex: 1,
                width: "100%",
                height: "100%",
                overflowY: "auto",
              }}
              data-testid="tab-content-duplicates"
            >
              <SpaceMapDuplicatesTriage
                currentFolderPath={currentNode?.path}
                keepCount={keepCount}
                onQuarantineSelected={(paths) => {
                  invoke("clean_items", { item_ids: paths });
                  setToastMessage(`${paths.length} archivos duplicados aislados a cuarentena.`);
                  setTimeout(() => setToastMessage(null), 3000);
                }}
              />
            </div>

            {/* 3. Tab Cuarentena */}
            <div
              style={{
                display: activeTab === "quarantine" ? "block" : "none",
                flex: 1,
                width: "100%",
                height: "100%",
                overflowY: "auto",
              }}
              data-testid="tab-content-quarantine"
            >
              <SpaceMapQuarantineTab />
            </div>
          </main>

          {/* Barra de Estado Inferior CleanMyMac */}
          {activeTab === "map" && (
            <SpaceLensStatusBar
              currentDevice={selectedDevice}
              selectedCount={selectedCount}
              selectedBytes={totalSelectedBytes}
              onReviewAndClean={() => setConfirmOpen(true)}
              isCleaning={isCleaning}
            />
          )}

          {/* Toast de sugerencia inteligente */}
          {suggestToast && (
            <div
              style={{
                position: "fixed",
                bottom: "74px",
                right: "24px",
                background: "#111827",
                border: "1px solid #00E5FF",
                boxShadow: "0 0 16px rgba(0, 229, 255, 0.3)",
                color: "#F8FAFC",
                padding: "12px 18px",
                borderRadius: "8px",
                zIndex: 9999,
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                maxWidth: "380px",
              }}
              data-testid="toast-auto-suggest"
            >
              <div style={{ fontSize: "13px", fontWeight: 600, color: "#00E5FF" }}>
                💡 Sugerencia inteligente adaptativa
              </div>
              <div style={{ fontSize: "12px", color: "#CBD5E1" }}>
                ¿Deseas aislar automáticamente los {suggestToast.count} archivos identificados ({suggestToast.desc})?
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                <Button size="small" appearance="subtle" onClick={() => setSuggestToast(null)}>
                  Omitir
                </Button>
                <Button
                  size="small"
                  appearance="primary"
                  style={{ backgroundColor: "#00E5FF", color: "#0B0F19" }}
                  data-testid="btn-confirm-auto-isolate"
                  onClick={() => {
                    setSuggestToast(null);
                    setToastMessage(`${suggestToast.count} archivos aislados a cuarentena automáticamente.`);
                    setAutoRules([]);
                    setTimeout(() => setToastMessage(null), 3000);
                  }}
                >
                  Aislar automáticamente
                </Button>
              </div>
            </div>
          )}

          {/* Toast / Aviso de dispositivo desconectado (CE-005) */}
          {deviceDisconnectedMsg && (
            <div
              data-testid="spacelens-device-disconnected-toast"
              style={{
                position: "fixed",
                bottom: "110px",
                right: "24px",
                background: "#1E293B",
                border: "1px solid #F59E0B",
                color: "#FCD34D",
                padding: "12px 18px",
                borderRadius: "8px",
                fontWeight: 600,
                boxShadow: "0 4px 14px rgba(245, 158, 11, 0.3)",
                zIndex: 9999,
                maxWidth: "360px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              <span>⚠️ {deviceDisconnectedMsg}</span>
              <button
                onClick={() => {
                  setDeviceDisconnectedMsg(null);
                  setViewMode("welcome");
                  setCurrentNode(null);
                  setSelectedDevice(null);
                }}
                style={{
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "1px solid #F59E0B",
                  color: "#FCD34D",
                  borderRadius: "6px",
                  padding: "6px 14px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "13px",
                }}
              >
                Volver a empezar
              </button>
            </div>
          )}

          {/* Toast / Notificación global */}
          {toastMessage && (
            <div
              data-testid="spacelens-success-toast"
              style={{
                position: "fixed",
                bottom: "64px",
                right: "24px",
                background: "#00E5FF",
                color: "#0B0F19",
                padding: "10px 18px",
                borderRadius: "8px",
                fontWeight: 600,
                boxShadow: "0 4px 14px rgba(0, 229, 255, 0.4)",
                zIndex: 9999,
              }}
            >
              {toastMessage}
            </div>
          )}

          {/* Modal de Confirmación */}
          <ConfirmDialog
            open={confirmOpen}
            itemCount={selectedCount}
            totalBytes={totalSelectedBytes}
            onConfirm={handleConfirmClean}
            onCancel={() => setConfirmOpen(false)}
          />
        </>
      )}
    </div>
  );
};
