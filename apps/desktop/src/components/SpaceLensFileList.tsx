import React, { useState, useMemo, useEffect } from "react";
import { SpaceMapNode } from "../types/models";
import { formatBytesShort } from "./SpaceLensDriveSelector";
import { getNodeIconType } from "./SpaceLensBubbles";

// T006: Constantes de extensiones de media (RF-002)
export const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif",
  "heic", "heif", "avif", "raw", "cr2", "nef", "arw", "svg", "ico",
]);

export const VIDEO_EXTENSIONS = new Set([
  "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v",
  "mpg", "mpeg", "3gp", "ts", "vob", "ogv",
]);

export interface SpaceLensFileListProps {
  currentNode: SpaceMapNode | null;
  items: SpaceMapNode[];
  selectedPaths: Set<string>;
  onSelectionChange: (newSelected: Set<string>) => void;
  onNavigate: (node: SpaceMapNode) => void;
  hoveredPath?: string;
  onItemHover?: (node: SpaceMapNode | null) => void;
  isMtpDevice?: boolean;
  activeItemPath?: string | null;
  onSelectItem?: (node: SpaceMapNode) => void;
  selectFilter?: string;
  onFilterChange?: (filter: string) => void;
}

export const isProtectedSystemNode = (node: SpaceMapNode): boolean => {
  if (node.is_system) return true;
  const name = node.name.toLowerCase().trim();
  const path = node.path.toLowerCase().replace(/\//g, "\\");

  const protectedNames = [
    "windows",
    "program files",
    "program files (x86)",
    "programdata",
    "system volume information",
    "$recycle.bin",
    "system32",
    "syswow64",
    "winsxs",
    "software分distribution",
    "pagefile.sys",
    "hiberfil.sys",
  ];

  if (protectedNames.includes(name)) return true;
  return protectedNames.some((pn) => path.endsWith(`\\${pn}`) || path.includes(`\\${pn}\\`));
};

export const getRowIconEmoji = (node: SpaceMapNode): string => {
  const iconType = getNodeIconType(node);
  switch (iconType) {
    case "folder": return "📁";
    case "video": return "🎬";
    case "image": return "🖼️";
    case "audio": return "🎵";
    case "document": return "📄";
    case "phone": return "📱";
    default: return "📄";
  }
};

export const SpaceLensFileList: React.FC<SpaceLensFileListProps> = ({
  currentNode,
  items,
  selectedPaths,
  onSelectionChange,
  onNavigate,
  hoveredPath,
  onItemHover,
  isMtpDevice = false,
  activeItemPath,
  onSelectItem,
  selectFilter: controlledFilter,
  onFilterChange,
}) => {
  const [internalFilter, setInternalFilter] = useState<string>(controlledFilter ?? "custom");
  const [infoToast, setInfoToast] = useState<string | null>(null);

  useEffect(() => {
    if (controlledFilter !== undefined) {
      setInternalFilter(controlledFilter);
    }
  }, [controlledFilter]);

  const selectFilter = controlledFilter !== undefined ? controlledFilter : internalFilter;

  // Ordenar elementos por tamaño descendente (más pesado primero, RF-SM-003)
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.size_bytes - a.size_bytes);
  }, [items]);

  // Manejo del selector "Seleccionar:" (T024)
  const handleSelectFilterChange = (filter: string) => {
    setInternalFilter(filter);
    onFilterChange?.(filter);
    if (isMtpDevice) return; // MTP es solo lectura

    const next = new Set<string>();

    if (filter === "all") {
      for (const item of sortedItems) {
        if (!isProtectedSystemNode(item)) {
          next.add(item.path);
        }
      }
    } else if (filter === "none") {
      next.clear();
    } else if (filter === "gt100mb") {
      const threshold = 100 * 1024 * 1024;
      for (const item of sortedItems) {
        if (!item.is_directory && item.size_bytes > threshold && !isProtectedSystemNode(item)) {
          next.add(item.path);
        }
      }
    } else if (filter === "gt1gb") {
      const threshold = 1024 * 1024 * 1024;
      for (const item of sortedItems) {
        if (!item.is_directory && item.size_bytes > threshold && !isProtectedSystemNode(item)) {
          next.add(item.path);
        }
      }
    } else if (filter === "photos") {
      // T008: Seleccionar archivos de imagen (RF-002)
      for (const item of sortedItems) {
        if (item.is_directory || isProtectedSystemNode(item)) continue;
        const ext = (item.extension || item.name.split(".").pop() || "").toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          next.add(item.path);
        }
      }
    } else if (filter === "videos") {
      // T008: Seleccionar archivos de video (RF-002)
      for (const item of sortedItems) {
        if (item.is_directory || isProtectedSystemNode(item)) continue;
        const ext = (item.extension || item.name.split(".").pop() || "").toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) {
          next.add(item.path);
        }
      }
    }

    onSelectionChange(next);
  };

  // Toggle individual
  const handleCheckboxToggle = (node: SpaceMapNode) => {
    if (isMtpDevice || isProtectedSystemNode(node)) return;

    const next = new Set(selectedPaths);
    if (next.has(node.path)) {
      next.delete(node.path);
    } else {
      next.add(node.path);
    }
    setInternalFilter("custom");
    onFilterChange?.("custom");
    onSelectionChange(next);
  };

  // Botón ℹ para abrir en el Explorador de archivos de Windows (T027)
  const handleOpenPath = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    try {
      const opener = await import("@tauri-apps/plugin-opener");
      if (opener && opener.openPath) {
        await opener.openPath(path);
      }
    } catch {
      console.log("[SpaceLens] Abrir en explorador de Windows:", path);
      setInfoToast(`Ruta: ${path}`);
      setTimeout(() => setInfoToast(null), 3000);
    }
  };

  return (
    <div className="spacelens-filelist-panel" data-testid="spacelens-filelist-panel">
      {/* 1. Cabecera con nombre, tamaño y cantidad de items (T022) */}
      <div className="spacelens-filelist-header">
        <div className="spacelens-filelist-title-row">
          <span className="spacelens-filelist-title-icon">
            {currentNode?.is_directory ? "📁" : "💾"}
          </span>
          <span className="spacelens-filelist-name" title={currentNode?.path}>
            {currentNode?.name || "Raíz"}
          </span>
        </div>

        <div className="spacelens-filelist-stats-row">
          <span className="spacelens-filelist-total-size">
            {formatBytesShort(currentNode?.size_bytes || 0)}
          </span>
          <span className="spacelens-filelist-item-count">
            {currentNode?.item_count !== undefined
              ? `${currentNode.item_count.toLocaleString()} items`
              : `${sortedItems.length} items`}
          </span>
        </div>
      </div>

      {/* 2. Selector "Seleccionar:" (T024) */}
      <div className="spacelens-filelist-toolbar">
        <label htmlFor="spacelens-select-dropdown" className="spacelens-toolbar-label">
          Seleccionar:
        </label>
        <select
          id="spacelens-select-dropdown"
          data-testid="spacelens-select-filter"
          className="spacelens-filter-select"
          value={selectFilter}
          disabled={isMtpDevice}
          onChange={(e) => handleSelectFilterChange(e.target.value)}
        >
          <option value="custom">Personalizado</option>
          <option value="none">Ninguno</option>
          <option value="all">Todo</option>
          <option value="gt100mb">Archivos &gt; 100MB</option>
          <option value="gt1gb">Archivos &gt; 1GB</option>
          <option value="photos">Solo Fotos</option>
          <option value="videos">Solo Videos</option>
        </select>
      </div>

      {isMtpDevice && (
        <div className="spacelens-mtp-badge-banner" data-testid="mtp-readonly-banner">
          <span>📱 Dispositivo MTP — Solo lectura (Selección protegida)</span>
        </div>
      )}

      {/* 3. Lista scrollable con items ordenados por tamaño (T022, T023) */}
      <div className="spacelens-filelist-scrollable" role="list">
        {sortedItems.length === 0 ? (
          <div className="spacelens-empty-list">Esta carpeta no contiene elementos</div>
        ) : (
          sortedItems.map((item) => {
            const isProtected = isProtectedSystemNode(item);
            const isDisabled = isMtpDevice || isProtected;
            const isSelected = selectedPaths.has(item.path);
            const isInspected = activeItemPath === item.path || (Boolean(activeItemPath) && activeItemPath?.toLowerCase() === item.path.toLowerCase());
            const isHovered = Boolean(
              hoveredPath &&
              (hoveredPath === item.path ||
               hoveredPath.replace(/\\+/g, "\\").toLowerCase() === item.path.replace(/\\+/g, "\\").toLowerCase())
            );

            return (
              <div
                key={item.path}
                role="listitem"
                data-testid={`filelist-row-${item.name}`}
                className={`spacelens-filelist-row ${isHovered ? "hovered" : ""} ${isSelected ? "selected" : ""} ${isInspected ? "inspected" : ""} ${isDisabled ? "disabled-system" : ""}`}
                style={{
                  borderLeft: isInspected ? "3px solid #00E5FF" : undefined,
                  backgroundColor: isInspected ? "rgba(0, 229, 255, 0.12)" : undefined,
                }}
                onMouseEnter={() => onItemHover && onItemHover(item)}
                onMouseLeave={() => onItemHover && onItemHover(null)}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.tagName.toLowerCase() === "input" || target.tagName.toLowerCase() === "button") return;
                  if (onSelectItem) {
                    onSelectItem(item);
                  }
                }}
                onDoubleClick={() => {
                  if (item.is_directory) onNavigate(item);
                }}
              >
                {/* (1) Checkbox Fluent UI / accesible (T023, T026) */}
                <input
                  type="checkbox"
                  data-testid={`checkbox-${item.name}`}
                  className="spacelens-row-checkbox"
                  checked={isSelected}
                  disabled={isDisabled}
                  onChange={() => handleCheckboxToggle(item)}
                  onClick={(e) => e.stopPropagation()}
                  title={
                    isMtpDevice
                      ? "Dispositivo MTP en modo solo lectura"
                      : isProtected
                      ? "Carpeta/archivo del sistema protegido"
                      : "Seleccionar para eliminar"
                  }
                  aria-label={`Seleccionar ${item.name}`}
                />

                {/* (2) Botón ℹ para abrir en Explorador (T027) */}
                <button
                  type="button"
                  data-testid={`info-btn-${item.name}`}
                  className="spacelens-row-info-btn"
                  onClick={(e) => handleOpenPath(e, item.path)}
                  title="Abrir en el Explorador de archivos de Windows"
                >
                  ℹ
                </button>

                {/* (3) Icono de tipo */}
                <span className="spacelens-row-icon">{getRowIconEmoji(item)}</span>

                {/* (4) Nombre truncado */}
                <span
                  className="spacelens-row-name"
                  title={item.name}
                >
                  {item.name}
                </span>

                {/* Indicador flecha ▸ para carpetas clickeable para navegar hacia adentro */}
                {item.is_directory && (
                  <span
                    className="spacelens-row-arrow"
                    title="Entrar en carpeta (doble clic o clic en ▸)"
                    style={{ cursor: "pointer", padding: "4px 8px" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate(item);
                    }}
                  >
                    ▸
                  </span>
                )}

                {/* (5) Tamaño alineado a la derecha en color cyan */}
                <span className="spacelens-row-size">
                  {formatBytesShort(item.size_bytes)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {infoToast && (
        <div className="spacelens-info-toast" data-testid="spacelens-info-toast">
          {infoToast}
        </div>
      )}
    </div>
  );
};
