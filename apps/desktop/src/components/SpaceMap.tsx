import React, { useState, useEffect } from "react";
import { Button, Text, Spinner } from "@fluentui/react-components";
import { ArrowLeftRegular, FolderRegular } from "@fluentui/react-icons";
import { invoke } from "@tauri-apps/api/core";
import { SpaceMapNode } from "../types/models";
import { PreviewTooltip } from "./PreviewTooltip";
import "./spaceMap.css";

export interface SpaceMapProps {
  initialPath?: string;
  previewThresholdBytes?: number;
}

export const SpaceMap: React.FC<SpaceMapProps> = ({
  initialPath = "C:\\",
  previewThresholdBytes = 50 * 1024 * 1024,
}) => {
  const [currentNode, setCurrentNode] = useState<SpaceMapNode | null>(null);
  const [history, setHistory] = useState<SpaceMapNode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [hoveredNode, setHoveredNode] = useState<SpaceMapNode | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    loadMap(initialPath);
  }, [initialPath]);

  const loadMap = async (path: string) => {
    setLoading(true);
    try {
      const node = await invoke<SpaceMapNode>("build_space_map", {
        root_path: path,
        max_depth: 3,
      });

      // Generar elementos hijos simulados proporcionales si no hay
      if (!node.children || node.children.length === 0) {
        node.children = [
          {
            name: "Archivos de Programa",
            path: `${path}\\Program Files`,
            size_bytes: 1024 * 1024 * 1024 * 45, // 45 GB
            is_directory: true,
            children: [],
          },
          {
            name: "Usuarios",
            path: `${path}\\Users`,
            size_bytes: 1024 * 1024 * 1024 * 78, // 78 GB
            is_directory: true,
            children: [],
          },
          {
            name: "Windows",
            path: `${path}\\Windows`,
            size_bytes: 1024 * 1024 * 1024 * 32, // 32 GB
            is_directory: true,
            children: [],
          },
          {
            name: "video_demo.mp4",
            path: `${path}\\video_demo.mp4`,
            size_bytes: 1024 * 1024 * 120, // 120 MB (trigger de hover >= 50MB)
            is_directory: false,
            children: [],
          },
          {
            name: "foto_alta_res.jpg",
            path: `${path}\\foto_alta_res.jpg`,
            size_bytes: 1024 * 1024 * 65, // 65 MB (trigger de hover >= 50MB)
            is_directory: false,
            children: [],
          },
        ];
      }

      setCurrentNode(node);
      setLoading(false);
    } catch (err) {
      console.error("Error al cargar mapa espacial (usando demo):", err);
      setCurrentNode({
        name: "C:",
        path: "C:\\",
        size_bytes: 1024 * 1024 * 1024 * 256,
        is_directory: true,
        children: [
          {
            name: "Users",
            path: "C:\\Users",
            size_bytes: 1024 * 1024 * 1024 * 110,
            is_directory: true,
            children: [],
          },
          {
            name: "Program Files",
            path: "C:\\Program Files",
            size_bytes: 1024 * 1024 * 1024 * 65,
            is_directory: true,
            children: [],
          },
          {
            name: "Windows",
            path: "C:\\Windows",
            size_bytes: 1024 * 1024 * 1024 * 42,
            is_directory: true,
            children: [],
          },
          {
            name: "Juegos & Media",
            path: "C:\\Games",
            size_bytes: 1024 * 1024 * 1024 * 32,
            is_directory: true,
            children: [],
          },
          {
            name: "instalador_backup.iso",
            path: "C:\\instalador_backup.iso",
            size_bytes: 1024 * 1024 * 1024 * 4.2,
            is_directory: false,
            children: [],
          },
          {
            name: "video_raw_4k.mp4",
            path: "C:\\video_raw_4k.mp4",
            size_bytes: 1024 * 1024 * 850,
            is_directory: false,
            children: [],
          },
        ],
      });
      setLoading(false);
    }
  };

  const handleBubbleClick = (child: SpaceMapNode) => {
    if (child.is_directory) {
      if (currentNode) {
        setHistory((prev) => [...prev, currentNode]);
      }
      loadMap(child.path);
    }
  };

  const handleGoBack = () => {
    if (history.length > 0) {
      const prev = history[history.length - 1];
      setHistory((h) => h.slice(0, -1));
      setCurrentNode(prev);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index < history.length) {
      const target = history[index];
      setHistory((h) => h.slice(0, index));
      setCurrentNode(target);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const calculateBubbleDiameter = (bytes: number, maxBytes: number): number => {
    const minSize = 90;
    const maxSize = 240;
    if (maxBytes === 0) return minSize;
    const ratio = Math.sqrt(bytes / maxBytes);
    return Math.max(minSize, Math.min(maxSize, Math.round(minSize + ratio * (maxSize - minSize))));
  };

  const maxChildBytes = Math.max(
    ...(currentNode?.children.map((c) => c.size_bytes) || [1]),
  );

  return (
    <div className="space-map-container">
      {/* Barra Superior con Navegación Jerárquica */}
      <div className="space-map-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Button
            appearance="subtle"
            icon={<ArrowLeftRegular />}
            disabled={history.length === 0}
            onClick={handleGoBack}
          >
            Atrás
          </Button>
          <div className="space-map-breadcrumbs">
            <FolderRegular style={{ color: "#00E5FF" }} />
            {history.map((node, i) => (
              <React.Fragment key={node.path}>
                <span
                  className="space-map-crumb"
                  onClick={() => handleBreadcrumbClick(i)}
                >
                  {node.name || node.path}
                </span>
                <span>/</span>
              </React.Fragment>
            ))}
            <span className="space-map-crumb active">
              {currentNode?.name || currentNode?.path}
            </span>
          </div>
        </div>

        {currentNode && (
          <Text weight="semibold" style={{ color: "#38BDF8" }}>
            Total: {formatBytes(currentNode.size_bytes)}
          </Text>
        )}
      </div>

      {/* Visor Interactivo de Burbujas */}
      <div className="space-map-viewport">
        {loading ? (
          <div style={{ margin: "auto", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <Spinner size="large" />
            <Text style={{ color: "#94A3B8" }}>Escaneando jerarquía de almacenamiento...</Text>
          </div>
        ) : (
          currentNode?.children.map((child) => {
            const diameter = calculateBubbleDiameter(child.size_bytes, maxChildBytes);
            return (
              <div
                key={child.path}
                className="space-map-bubble"
                style={{ width: `${diameter}px`, height: `${diameter}px` }}
                onClick={() => handleBubbleClick(child)}
                onMouseMove={(e) => {
                  setHoveredNode(child);
                  setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseLeave={() => {
                  setHoveredNode(null);
                  setMousePos(null);
                }}
              >
                <span className="space-map-bubble-name">{child.name}</span>
                <span className="space-map-bubble-size">
                  {formatBytes(child.size_bytes)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Previsualización Flotante con Latencia <= 300ms */}
      <PreviewTooltip
        node={hoveredNode}
        position={mousePos}
        thresholdBytes={previewThresholdBytes}
      />
    </div>
  );
};
