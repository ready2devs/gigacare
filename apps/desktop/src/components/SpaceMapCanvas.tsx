import React, { useRef, useEffect, useState, useCallback } from "react";
import { TreemapRect, SunburstArc } from "../types/treemap";

export interface SpaceMapCanvasProps {
  rects?: TreemapRect[];
  arcs?: SunburstArc[];
  mode?: "treemap" | "sunburst";
  currentPath?: string;
  selectedPath?: string | null;
  highlightedPaths?: string[];
  onSelect?: (path: string, isDirectory: boolean) => void;
  onNavigate?: (path: string) => void;
  onBack?: () => void;
  width?: number;
  height?: number;
  animationDuration?: number; // default 300ms
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface ZoomTransition {
  fromRect: { x: number; y: number; w: number; h: number };
  startTime: number;
  duration: number;
  targetPath: string;
}

export const SpaceMapCanvas: React.FC<SpaceMapCanvasProps> = ({
  rects = [],
  arcs = [],
  mode = "treemap",
  currentPath = "C:\\",
  selectedPath = null,
  highlightedPaths = [],
  onSelect,
  onNavigate,
  onBack,
  width = 800,
  height = 600,
  animationDuration = 300,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const [transition, setTransition] = useState<ZoomTransition | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const getCategoryColor = (item: { is_directory: boolean; extension?: string; name: string; is_system?: boolean; depth?: number }) => {
    if (item.is_system) return "rgba(71, 85, 105, 0.7)";
    if (item.is_directory) {
      return item.depth === 0 ? "rgba(99, 102, 241, 0.65)" : "rgba(124, 58, 237, 0.75)";
    }
    const ext = (item.extension || item.name.split(".").pop() || "").toLowerCase();
    const videoExts = ["mp4", "mkv", "mov", "avi", "wmv", "flv", "webm", "m4v"];
    const imageExts = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "raw", "svg"];
    const archiveExts = ["zip", "rar", "7z", "tar", "gz", "exe", "msi", "iso", "dmg"];
    const docExts = ["pdf", "docx", "xlsx", "pptx", "txt", "md", "csv", "json", "xml"];

    if (videoExts.includes(ext)) return "rgba(14, 165, 233, 0.85)"; // Cyan / Sky
    if (imageExts.includes(ext)) return "rgba(236, 72, 153, 0.85)"; // Pink / Rose
    if (archiveExts.includes(ext)) return "rgba(245, 158, 11, 0.85)"; // Amber
    if (docExts.includes(ext)) return "rgba(16, 185, 129, 0.85)"; // Emerald
    return "rgba(139, 92, 246, 0.75)"; // Violeta default
  };

  const getRectFillColor = (item: TreemapRect, isSelected: boolean, isHighlighted: boolean) => {
    if (isHighlighted) return "rgba(0, 229, 255, 0.9)";
    if (isSelected) return "rgba(0, 229, 255, 0.55)";
    return getCategoryColor(item);
  };

  const getArcFillColor = (item: SunburstArc, isSelected: boolean, isHighlighted: boolean) => {
    if (isHighlighted) return "rgba(0, 229, 255, 0.9)";
    if (isSelected) return "rgba(0, 229, 255, 0.55)";
    return getCategoryColor(item);
  };

  // Keyboard navigation: Escape para volver atrás
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || (e.altKey && e.key === "ArrowLeft")) {
        if (onBack) {
          e.preventDefault();
          onBack();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  // Loop de renderizado
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, width, height);

    // Fondo oscuro Obsidian
    ctx.fillStyle = "#0B0F19";
    ctx.fillRect(0, 0, width, height);

    // Calcular interpolación de zoom si hay transición activa
    let isAnimating = false;
    if (transition) {
      const now = performance.now();
      const elapsed = now - transition.startTime;
      const rawProgress = Math.min(1, elapsed / transition.duration);
      // Easing cúbico hacia afuera
      const t = 1 - Math.pow(1 - rawProgress, 3);

      const currentX = transition.fromRect.x * (1 - t);
      const currentY = transition.fromRect.y * (1 - t);
      const scaleX = 1 + ((width / transition.fromRect.w) - 1) * t;
      const scaleY = 1 + ((height / transition.fromRect.h) - 1) * t;

      ctx.translate(-currentX * scaleX, -currentY * scaleY);
      ctx.scale(scaleX, scaleY);

      if (rawProgress < 1) {
        isAnimating = true;
      } else {
        setTransition(null);
      }
    }

    if (mode === "treemap") {
      if (rects.length === 0) {
        ctx.fillStyle = "#64748B";
        ctx.font = "14px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Generando mapa de espacio o la carpeta está vacía...", width / 2, height / 2);
      } else {
        for (const item of rects) {
          const { x, y, w, h } = item.rect;
          const isHovered = hoveredPath === item.path;
          const isSelected = selectedPath === item.path;
          const isHighlighted = highlightedPaths.includes(item.path);

          ctx.fillStyle = getRectFillColor(item, isSelected, isHighlighted);
          ctx.fillRect(x, y, w, h);

          if (isHovered || isSelected) {
            ctx.strokeStyle = "#00E5FF";
            ctx.lineWidth = 2.5;
            ctx.strokeRect(x + 1, y + 1, Math.max(0, w - 2), Math.max(0, h - 2));
          } else {
            ctx.strokeStyle = "rgba(11, 15, 25, 0.85)";
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
          }

          if (w > 40 && h > 22) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x + 3, y + 3, Math.max(0, w - 6), Math.max(0, h - 6));
            ctx.clip();

            ctx.fillStyle = "#F8FAFC";
            ctx.font = "600 12px Segoe UI, sans-serif";
            ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
            ctx.shadowBlur = 3;
            ctx.fillText(item.name, x + 6, y + 16);

            if (h > 38 && w > 60) {
              ctx.fillStyle = "#E2E8F0";
              ctx.font = "10px Segoe UI, sans-serif";
              ctx.shadowBlur = 2;
              ctx.fillText(formatBytes(item.size_bytes), x + 6, y + 32);
            }
            ctx.restore();
          }
        }
      }
    } else if (mode === "sunburst") {
      if (arcs.length === 0) {
        ctx.fillStyle = "#64748B";
        ctx.font = "14px Segoe UI, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Generando vista Sunburst...", width / 2, height / 2);
      } else {
        for (const item of arcs) {
          const isHovered = hoveredPath === item.path;
          const isSelected = selectedPath === item.path;
          const isHighlighted = highlightedPaths.includes(item.path);

          ctx.save();
          ctx.beginPath();
          ctx.arc(item.center.x, item.center.y, item.r_outer, item.start_angle, item.end_angle, false);
          ctx.arc(item.center.x, item.center.y, item.r_inner, item.end_angle, item.start_angle, true);
          ctx.closePath();

          ctx.fillStyle = getArcFillColor(item, isSelected, isHighlighted);
          ctx.fill();

          if (isHovered || isSelected) {
            ctx.strokeStyle = "#00E5FF";
            ctx.lineWidth = 2.5;
            ctx.stroke();
          } else {
            ctx.strokeStyle = "rgba(11, 15, 25, 0.9)";
            ctx.lineWidth = 1;
            ctx.stroke();
          }

          // Etiqueta radial en el arco
          const angleSpan = item.end_angle - item.start_angle;
          if (angleSpan > 0.25 && item.r_outer - item.r_inner > 16) {
            const midAngle = (item.start_angle + item.end_angle) / 2;
            const midR = (item.r_inner + item.r_outer) / 2;
            const textX = item.center.x + midR * Math.cos(midAngle);
            const textY = item.center.y + midR * Math.sin(midAngle);

            ctx.save();
            ctx.translate(textX, textY);
            let rot = midAngle;
            if (rot > Math.PI / 2 && rot < (3 * Math.PI) / 2) {
              rot += Math.PI;
            }
            ctx.rotate(rot);
            ctx.fillStyle = "#F8FAFC";
            ctx.font = "600 10px Segoe UI, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
            ctx.shadowBlur = 3;
            ctx.fillText(item.name.length > 12 ? item.name.slice(0, 10) + "…" : item.name, 0, 0);
            ctx.restore();
          }

          ctx.restore();
        }
      }
    }

    ctx.restore();

    if (isAnimating) {
      animFrameRef.current = requestAnimationFrame(render);
    }
  }, [rects, arcs, mode, hoveredPath, selectedPath, highlightedPaths, width, height, transition]);

  // Repintar el canvas cada vez que cambian los datos o el estado visual
  useEffect(() => {
    // Cancelar cualquier frame de animación pendiente
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    // Renderizar inmediatamente (síncrono, sin esperar al siguiente frame)
    render();
  }, [render]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (transition) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (mode === "treemap") {
      let found: TreemapRect | null = null;
      for (let i = rects.length - 1; i >= 0; i--) {
        const item = rects[i];
        if (
          mouseX >= item.rect.x &&
          mouseX <= item.rect.x + item.rect.w &&
          mouseY >= item.rect.y &&
          mouseY <= item.rect.y + item.rect.h
        ) {
          found = item;
          break;
        }
      }
      setHoveredPath(found ? found.path : null);
    } else {
      let found: SunburstArc | null = null;
      for (const item of arcs) {
        const dx = mouseX - item.center.x;
        const dy = mouseY - item.center.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= item.r_inner && dist <= item.r_outer) {
          let angle = Math.atan2(dy, dx);
          if (angle < 0) angle += 2 * Math.PI;
          if (angle >= item.start_angle && angle <= item.end_angle) {
            found = item;
            break;
          }
        }
      }
      setHoveredPath(found ? found.path : null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredPath(null);
  };

  // Clic simple: seleccionar para inspección
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (transition) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (mode === "treemap") {
      for (let i = rects.length - 1; i >= 0; i--) {
        const item = rects[i];
        if (
          mouseX >= item.rect.x &&
          mouseX <= item.rect.x + item.rect.w &&
          mouseY >= item.rect.y &&
          mouseY <= item.rect.y + item.rect.h
        ) {
          if (onSelect) onSelect(item.path, item.is_directory);
          if (item.is_directory) {
            if (animationDuration > 0) {
              setTransition({
                fromRect: { ...item.rect },
                startTime: performance.now(),
                duration: animationDuration,
                targetPath: item.path,
              });
            }
            if (onNavigate) {
              onNavigate(item.path);
            }
          }
          break;
        }
      }
    } else {
      for (const item of arcs) {
        const dx = mouseX - item.center.x;
        const dy = mouseY - item.center.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= item.r_inner && dist <= item.r_outer) {
          let angle = Math.atan2(dy, dx);
          if (angle < 0) angle += 2 * Math.PI;
          if (angle >= item.start_angle && angle <= item.end_angle) {
            if (onSelect) onSelect(item.path, item.is_directory);
            if (item.is_directory && onNavigate) onNavigate(item.path);
            break;
          }
        }
      }
    }
  };

  // Doble clic: drill-down dentro de una subcarpeta
  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (transition) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (mode === "treemap") {
      for (let i = rects.length - 1; i >= 0; i--) {
        const item = rects[i];
        if (
          mouseX >= item.rect.x &&
          mouseX <= item.rect.x + item.rect.w &&
          mouseY >= item.rect.y &&
          mouseY <= item.rect.y + item.rect.h
        ) {
          if (item.is_directory && onNavigate) {
            if (animationDuration > 0) {
              setTransition({
                fromRect: { ...item.rect },
                startTime: performance.now(),
                duration: animationDuration,
                targetPath: item.path,
              });
            }
            onNavigate(item.path);
          }
          break;
        }
      }
    } else {
      for (const item of arcs) {
        const dx = mouseX - item.center.x;
        const dy = mouseY - item.center.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist >= item.r_inner && dist <= item.r_outer) {
          let angle = Math.atan2(dy, dx);
          if (angle < 0) angle += 2 * Math.PI;
          if (angle >= item.start_angle && angle <= item.end_angle) {
            if (item.is_directory && onNavigate) {
              onNavigate(item.path);
            }
            break;
          }
        }
      }
    }
  };

  // Generar fragmentos de breadcrumb
  const pathParts = currentPath.replace(/\\/g, "/").split("/").filter(Boolean);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
      data-testid="spacemap-container"
    >
      {/* Breadcrumbs superiores clickeables con botón Atrás */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "#94A3B8",
          fontSize: "13px",
          padding: "6px 12px",
          background: "rgba(17, 24, 39, 0.8)",
          borderRadius: "8px",
          border: "1px solid rgba(255, 255, 255, 0.06)",
          flexShrink: 0,
        }}
        data-testid="spacemap-breadcrumbs"
      >
        {onBack && (
          <button
            onClick={onBack}
            data-testid="drilldown-back-btn"
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              color: "#00E5FF",
              borderRadius: "4px",
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            ◀ Atrás
          </button>
        )}
        <span style={{ color: "#64748B" }}>Ruta:</span>
        <span
          onClick={() => onNavigate && onNavigate(pathParts[0] ? `${pathParts[0]}\\` : "C:\\")}
          style={{ cursor: "pointer", color: "#F8FAFC" }}
        >
          {pathParts[0] || "C:"}
        </span>
        {pathParts.slice(1).map((part, index) => {
          const fullSubPath = pathParts.slice(0, index + 2).join("\\");
          return (
            <React.Fragment key={fullSubPath}>
              <span style={{ color: "#64748B" }}>/</span>
              <span
                onClick={() => onNavigate && onNavigate(fullSubPath)}
                style={{
                  cursor: "pointer",
                  color: index === pathParts.length - 2 ? "#00E5FF" : "#F8FAFC",
                  fontWeight: index === pathParts.length - 2 ? 600 : 400,
                }}
              >
                {part}
              </span>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ flex: 1, position: "relative", minHeight: 0, width: "100%", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          style={{
            display: "block",
            borderRadius: "8px",
            cursor: hoveredPath ? "pointer" : "default",
            background: "#0B0F19",
            width: "100%",
            height: "100%",
          }}
          data-testid="space-map-canvas"
          data-hovered-path={hoveredPath || ""}
          data-rects-count={rects.length}
          data-arcs-count={arcs.length}
        />
      </div>
    </div>
  );
};
