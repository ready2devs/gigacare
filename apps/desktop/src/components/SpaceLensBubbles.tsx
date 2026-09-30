import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { SpaceMapNode } from "../types/models";
import { formatBytesShort } from "./SpaceLensDriveSelector";

export interface PackedBubble {
  node: SpaceMapNode;
  x: number;
  y: number;
  r: number;
  isOthersGroup?: boolean;
}

export interface SpaceLensBubblesProps {
  nodes: SpaceMapNode[];
  parentName?: string;
  parentSize?: number;
  onBubbleClick: (node: SpaceMapNode) => void;
  onBubbleHover?: (node: SpaceMapNode | null) => void;
  hoveredPath?: string;
  selectedPaths: Set<string>;
  onBackClick?: () => void;
  isDark?: boolean;
}

// ─── Pre-cargar iconos SVG en memoria ──────────────────────────────
const svgIcons: Record<string, HTMLImageElement> = {};

const SVG_STRINGS: Record<string, string> = {
  folder: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#C4B5FD"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg>`,
  video: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#C4B5FD"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>`,
  image: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#C4B5FD"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
  audio: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#C4B5FD"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`,
  document: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#C4B5FD"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
  phone: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#C4B5FD"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>`,
  generic: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#C4B5FD"><path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/></svg>`,
};

if (typeof window !== "undefined") {
  for (const [key, svg] of Object.entries(SVG_STRINGS)) {
    const img = new Image();
    img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    svgIcons[key] = img;
  }
}

export const getNodeIconType = (node: SpaceMapNode): string => {
  if (node.is_directory) {
    if (node.path.toLowerCase().includes("mtp://") || node.name.toLowerCase().includes("galaxy")) {
      return "phone";
    }
    return "folder";
  }
  const ext = (node.extension || "").toLowerCase();
  if (["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "raw"].includes(ext)) return "image";
  if (["mp3", "wav", "flac", "ogg", "m4a", "aac"].includes(ext)) return "audio";
  if (["pdf", "doc", "docx", "txt", "xlsx", "xls", "pptx", "md"].includes(ext)) return "document";
  return "generic";
};

// ─── Algoritmo de Circle-Packing Simplificado ───────────────────────
export function computeCirclePacking(
  inputNodes: SpaceMapNode[],
  canvasWidth: number,
  canvasHeight: number
): { bubbles: PackedBubble[]; boundingCircle: { x: number; y: number; r: number } } {
  if (!inputNodes || inputNodes.length === 0) {
    return {
      bubbles: [],
      boundingCircle: { x: canvasWidth / 2, y: canvasHeight / 2, r: Math.min(canvasWidth, canvasHeight) * 0.45 },
    };
  }

  // 1. Filtrar y ordenar por tamaño descendente
  const sorted = [...inputNodes].sort((a, b) => b.size_bytes - a.size_bytes);

  // 2. Limitar a top 50, agrupar resto en "Otros" (T021)
  const MAX_BUBBLES = 50;
  let activeNodes: SpaceMapNode[] = [];
  let otherNodes: SpaceMapNode[] = [];

  if (sorted.length > MAX_BUBBLES) {
    activeNodes = sorted.slice(0, MAX_BUBBLES);
    otherNodes = sorted.slice(MAX_BUBBLES);
  } else {
    activeNodes = sorted;
  }

  if (otherNodes.length > 0) {
    const totalOtherBytes = otherNodes.reduce((sum, n) => sum + n.size_bytes, 0);
    activeNodes.push({
      name: `Otros (${otherNodes.length} items)`,
      path: "__spacelens_others__",
      size_bytes: totalOtherBytes,
      is_directory: true,
      children: otherNodes,
      item_count: otherNodes.length,
      modified_at: new Date().toISOString(),
    });
  }

  const maxSize = Math.max(...activeNodes.map((n) => n.size_bytes), 1);
  const minDimension = Math.min(canvasWidth, canvasHeight);
  const maxRadius = Math.max(35, minDimension * 0.28);
  const minRadius = 18;

  // 3. Asignar radios iniciales proporcionales a sqrt(size/maxSize)
  const rawCircles = activeNodes.map((node) => {
    const ratio = Math.sqrt(Math.max(node.size_bytes, 1) / maxSize);
    const r = Math.max(minRadius, ratio * maxRadius);
    return {
      node,
      r,
      x: 0,
      y: 0,
      isOthersGroup: node.path === "__spacelens_others__",
    };
  });

  // 4. Posicionamiento con espiral incremental y detección de colisión
  const placed: Array<{ x: number; y: number; r: number; node: SpaceMapNode; isOthersGroup?: boolean }> = [];

  for (let i = 0; i < rawCircles.length; i++) {
    const c = rawCircles[i];
    if (i === 0) {
      c.x = 0;
      c.y = 0;
      placed.push(c);
      continue;
    }

    if (i === 1) {
      const prev = placed[0];
      c.x = prev.r + c.r + 4;
      c.y = 0;
      placed.push(c);
      continue;
    }

    // Para los siguientes: búsqueda con espiral de Arquímedes con ángulo áureo
    let bestX = 0;
    let bestY = 0;
    let placedOk = false;
    const phi = 137.5 * (Math.PI / 180); // Ángulo áureo
    let step = 1;

    while (!placedOk && step < 1200) {
      const angle = step * phi;
      const dist = (c.r + 10) * Math.sqrt(step) * 0.45;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist;

      // Verificar colisión con todos los ya colocados
      let collides = false;
      for (const p of placed) {
        const dx = tx - p.x;
        const dy = ty - p.y;
        const minDist = c.r + p.r + 4; // Margen de 4px
        if (dx * dx + dy * dy < minDist * minDist) {
          collides = true;
          break;
        }
      }

      if (!collides) {
        bestX = tx;
        bestY = ty;
        placedOk = true;
      }
      step++;
    }

    c.x = bestX;
    c.y = bestY;
    placed.push(c);
  }

  // 5. Calcular bounding box exacto y centroide geométrico de todos los círculos (T015, CleanMyMac style)
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const p of placed) {
    if (p.x - p.r < minX) minX = p.x - p.r;
    if (p.x + p.r > maxX) maxX = p.x + p.r;
    if (p.y - p.r < minY) minY = p.y - p.r;
    if (p.y + p.r > maxY) maxY = p.y + p.r;
  }

  const clusterCenterX = (minX + maxX) / 2;
  const clusterCenterY = (minY + maxY) / 2;

  // Recentrar todas las coordenadas relativas al centroide geométrico
  for (const p of placed) {
    p.x -= clusterCenterX;
    p.y -= clusterCenterY;
  }

  // Calcular el radio máximo exacto desde el nuevo centroide
  let maxExtentFromCenter = 0;
  for (const p of placed) {
    const distFromCenter = Math.hypot(p.x, p.y) + p.r;
    if (distFromCenter > maxExtentFromCenter) {
      maxExtentFromCenter = distFromCenter;
    }
  }

  const rawBoundR = Math.max(maxExtentFromCenter + 16, minDimension * 0.35);

  // 6. Escalar y centrar perfectamente en el viewport del canvas
  const availableR = (minDimension / 2) * 0.86;
  const scale = availableR / rawBoundR;
  const canvasCenterX = canvasWidth / 2;
  const canvasCenterY = canvasHeight / 2;

  const finalBubbles: PackedBubble[] = placed.map((p) => ({
    node: p.node,
    x: canvasCenterX + p.x * scale,
    y: canvasCenterY + p.y * scale,
    r: p.r * scale,
    isOthersGroup: p.isOthersGroup,
  }));

  return {
    bubbles: finalBubbles,
    boundingCircle: {
      x: canvasCenterX,
      y: canvasCenterY,
      r: rawBoundR * scale,
    },
  };
}

export const SpaceLensBubbles: React.FC<SpaceLensBubblesProps> = ({
  nodes,
  parentName: _parentName = "Raíz",
  parentSize: _parentSize,
  onBubbleClick,
  onBubbleHover,
  hoveredPath,
  selectedPaths,
  onBackClick,
  isDark = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 700, height: 600 });
  const [activeHoverNode, setActiveHoverNode] = useState<SpaceMapNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Animación de transición (T019)
  const [animProgress, setAnimProgress] = useState<number>(1);
  const animRef = useRef<number | null>(null);

  // Redimensionar con ResizeObserver (RF-SM-008)
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 50 && height > 50) {
          setDimensions({ width: Math.round(width), height: Math.round(height) });
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Recalcular circle packing al cambiar nodos o dimensiones
  const { bubbles, boundingCircle } = useMemo(() => {
    return computeCirclePacking(nodes, dimensions.width, dimensions.height);
  }, [nodes, dimensions.width, dimensions.height]);

  // Transición suave al cambiar nodes (T019)
  useEffect(() => {
    let start: number | null = null;
    const duration = 300; // 300ms cubic-bezier transition

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(1, elapsed / duration);
      // Easing cubic-bezier(0.25, 0.1, 0.25, 1) approx
      const eased = Math.sin((progress * Math.PI) / 2);
      setAnimProgress(eased);

      if (progress < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };

    setAnimProgress(0);
    animRef.current = requestAnimationFrame(step);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [nodes]);

  // Dibujar en el Canvas 2D
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Retina display resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Limpiar canvas
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    // 1. Dibujar burbuja padre semitransparente como contenedor (T015, T040)
    ctx.save();
    const parentGrad = ctx.createRadialGradient(
      boundingCircle.x,
      boundingCircle.y,
      boundingCircle.r * 0.1,
      boundingCircle.x,
      boundingCircle.y,
      boundingCircle.r
    );
    if (isDark) {
      parentGrad.addColorStop(0, "rgba(124, 58, 237, 0.25)");
      parentGrad.addColorStop(1, "rgba(76, 29, 149, 0.45)");
    } else {
      parentGrad.addColorStop(0, "rgba(237, 233, 254, 0.6)");
      parentGrad.addColorStop(1, "rgba(196, 181, 253, 0.45)");
    }

    ctx.beginPath();
    ctx.arc(boundingCircle.x, boundingCircle.y, boundingCircle.r * animProgress, 0, Math.PI * 2);
    ctx.fillStyle = parentGrad;
    ctx.fill();
    ctx.strokeStyle = isDark ? "rgba(124, 58, 237, 0.4)" : "rgba(124, 58, 237, 0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();

    // 2. Dibujar burbujas hijas
    for (const b of bubbles) {
      const isHovered = hoveredPath === b.node.path || activeHoverNode?.path === b.node.path;
      const isSelected = selectedPaths.has(b.node.path);
      const curR = b.r * animProgress;

      if (curR < 3) continue;

      ctx.save();

      // Efecto Glow para la burbuja hovered (T017)
      if (isHovered) {
        ctx.shadowColor = "#00E5FF";
        ctx.shadowBlur = 18;
      }

      // Gradientes según tipo y tema (T015, T040 & Spec 3.2)
      ctx.beginPath();
      ctx.arc(b.x, b.y, curR, 0, Math.PI * 2);

      if (b.isOthersGroup) {
        ctx.fillStyle = isDark ? "rgba(100, 116, 139, 0.45)" : "rgba(203, 213, 225, 0.75)";
      } else if (b.node.is_directory) {
        const folderGrad = ctx.createRadialGradient(b.x, b.y, curR * 0.1, b.x, b.y, curR);
        if (isDark) {
          folderGrad.addColorStop(0, "rgba(139, 92, 246, 0.85)");
          folderGrad.addColorStop(1, "rgba(108, 58, 237, 0.65)");
        } else {
          folderGrad.addColorStop(0, "rgba(196, 181, 253, 0.9)");
          folderGrad.addColorStop(1, "rgba(139, 92, 246, 0.75)");
        }
        ctx.fillStyle = folderGrad;
      } else {
        const fileGrad = ctx.createRadialGradient(b.x, b.y, curR * 0.1, b.x, b.y, curR);
        if (isDark) {
          fileGrad.addColorStop(0, "rgba(167, 139, 250, 0.9)");
          fileGrad.addColorStop(1, "rgba(124, 58, 237, 0.75)");
        } else {
          fileGrad.addColorStop(0, "rgba(221, 214, 254, 0.95)");
          fileGrad.addColorStop(1, "rgba(167, 139, 250, 0.85)");
        }
        ctx.fillStyle = fileGrad;
      }
      ctx.fill();

      // Resaltado de selección (T015)
      if (isSelected) {
        ctx.fillStyle = "rgba(0, 229, 255, 0.28)";
        ctx.fill();
        ctx.strokeStyle = "#00E5FF";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (isHovered) {
        ctx.strokeStyle = "#00E5FF";
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = isDark
          ? (b.node.is_directory ? "rgba(196, 181, 253, 0.35)" : "rgba(255, 255, 255, 0.2)")
          : (b.node.is_directory ? "rgba(109, 40, 217, 0.35)" : "rgba(100, 116, 139, 0.3)");
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      ctx.restore();

      // 3. Renderizar icono SVG si radio >= 35px (T016)
      const showIcon = curR >= 35;
      const iconType = b.isOthersGroup ? "generic" : getNodeIconType(b.node);
      const iconImg = svgIcons[iconType];

      if (showIcon && iconImg && iconImg.complete) {
        const iconSize = Math.min(28, curR * 0.42);
        const iconY = curR >= 50 ? b.y - iconSize * 0.9 : b.y - iconSize * 0.6;
        ctx.drawImage(iconImg, b.x - iconSize / 2, iconY, iconSize, iconSize);
      }

      // 4. Renderizar texto (nombre y tamaño) dentro de la burbuja
      if (curR >= 22) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Nombre
        const maxTextWidth = curR * 1.6;
        let fontSize = Math.min(13, Math.max(10, Math.round(curR * 0.22)));
        ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        ctx.fillStyle = isDark ? "#F8FAFC" : "#1E1B4B";
        ctx.shadowColor = isDark ? "rgba(0, 0, 0, 0.8)" : "rgba(255, 255, 255, 0.8)";
        ctx.shadowBlur = 4;

        // Truncar texto si excede
        let displayName = b.node.name;
        if (ctx.measureText(displayName).width > maxTextWidth) {
          while (displayName.length > 3 && ctx.measureText(displayName + "…").width > maxTextWidth) {
            displayName = displayName.slice(0, -1);
          }
          displayName += "…";
        }

        const nameY = showIcon && curR >= 50 ? b.y + 6 : b.y - 4;
        ctx.fillText(displayName, b.x, nameY);

        // Tamaño
        if (curR >= 28) {
          const sizeFontSize = Math.min(11, Math.max(9, Math.round(curR * 0.18)));
          ctx.font = `500 ${sizeFontSize}px monospace`;
          ctx.fillStyle = isDark ? "#C4B5FD" : "#5B21B6";
          const sizeY = nameY + fontSize + 2;
          ctx.fillText(formatBytesShort(b.node.size_bytes), b.x, sizeY);
        }

        ctx.restore();
      }
    }
  }, [bubbles, boundingCircle, animProgress, hoveredPath, activeHoverNode, selectedPaths, dimensions]);

  // Hover detection con debounce de 80ms (T017)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let foundBubble: PackedBubble | null = null;
      // Probar de menor a mayor radio para priorizar burbujas interiores si hay superposición
      for (const b of bubbles) {
        const dist = Math.hypot(mouseX - b.x, mouseY - b.y);
        if (dist <= b.r) {
          foundBubble = b;
          break;
        }
      }

      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

      hoverTimerRef.current = setTimeout(() => {
        if (foundBubble) {
          setActiveHoverNode(foundBubble.node);
          setTooltipPos({ x: e.clientX, y: e.clientY });
          if (onBubbleHover) onBubbleHover(foundBubble.node);
        } else {
          setActiveHoverNode(null);
          setTooltipPos(null);
          if (onBubbleHover) onBubbleHover(null);
        }
      }, 80);
    },
    [bubbles, onBubbleHover]
  );

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setActiveHoverNode(null);
    setTooltipPos(null);
    if (onBubbleHover) onBubbleHover(null);
  }, [onBubbleHover]);

  // Clic detection (T018)
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      for (const b of bubbles) {
        const dist = Math.hypot(mouseX - b.x, mouseY - b.y);
        if (dist <= b.r) {
          onBubbleClick(b.node);
          return;
        }
      }

      // Clic fuera de las burbujas hijas pero dentro o fuera de la burbuja padre
      if (onBackClick) {
        onBackClick();
      }
    },
    [bubbles, onBubbleClick, onBackClick]
  );

  return (
    <div className="spacelens-canvas-wrapper" ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <canvas
        ref={canvasRef}
        className="spacelens-canvas"
        style={{ width: dimensions.width, height: dimensions.height, display: "block", cursor: "pointer" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        data-testid="spacelens-canvas"
      />

      {/* T020 & T038: Tooltip flotante al hacer hover con boundary clamp y MTP */}
      {activeHoverNode && tooltipPos && (() => {
        const clampedX = typeof window !== "undefined"
          ? Math.min(window.innerWidth - 340, Math.max(10, tooltipPos.x + 15))
          : tooltipPos.x + 15;
        const clampedY = typeof window !== "undefined"
          ? Math.min(window.innerHeight - 200, Math.max(10, tooltipPos.y + 15))
          : tooltipPos.y + 15;
        const isMtpPath = activeHoverNode.path.toLowerCase().includes("mtp://") ||
                          activeHoverNode.name.toLowerCase().includes("galaxy");

        return (
          <div
            className="spacelens-hover-tooltip"
            style={{
              position: "fixed",
              left: clampedX,
              top: clampedY,
              zIndex: 9999,
              pointerEvents: "none",
            }}
            data-testid="spacelens-hover-tooltip"
          >
            <div className="spacelens-tooltip-header">
              <span className="spacelens-tooltip-icon">
                {isMtpPath ? "📱" : activeHoverNode.is_directory ? "📁" : "📄"}
              </span>
              <span className="spacelens-tooltip-title">{activeHoverNode.name}</span>
            </div>

            <div className="spacelens-tooltip-type">
              {isMtpPath
                ? "📱 Almacenamiento del teléfono"
                : activeHoverNode.is_system
                ? "Carpeta del sistema (Protegida)"
                : activeHoverNode.is_directory
                ? "Carpeta de archivos"
                : `Archivo ${(activeHoverNode.extension || "").toUpperCase()}`}
            </div>

          <div className="spacelens-tooltip-details">
            <div className="spacelens-tooltip-row">
              <span className="spacelens-tooltip-lbl">Tamaño:</span>
              <span className="spacelens-tooltip-val">
                {formatBytesShort(activeHoverNode.size_bytes)}
                {activeHoverNode.item_count !== undefined ? ` (${activeHoverNode.item_count} elementos)` : ""}
              </span>
            </div>

            {activeHoverNode.modified_at && (
              <div className="spacelens-tooltip-row">
                <span className="spacelens-tooltip-lbl">Modificado:</span>
                <span className="spacelens-tooltip-val">
                  {new Date(activeHoverNode.modified_at).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            )}
          </div>
        </div>
        );
      })()}
    </div>
  );
};
