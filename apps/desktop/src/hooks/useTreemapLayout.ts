import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LayoutNode, Rect, TreemapRect } from "../types/treemap";

export interface UseTreemapLayoutResult {
  rects: TreemapRect[];
  loading: boolean;
  error: string | null;
  recompute: () => Promise<void>;
}

export function computeSquarifiedLocal(nodes: LayoutNode[], container: Rect): TreemapRect[] {
  if (!nodes || !nodes.length || container.w <= 0 || container.h <= 0) return [];
  const sorted = [...nodes].filter((n) => (n.size_bytes || 0) > 0).sort((a, b) => b.size_bytes - a.size_bytes);
  const totalSize = sorted.reduce((sum, n) => sum + n.size_bytes, 0);
  const totalArea = container.w * container.h;
  if (totalSize <= 0 || totalArea <= 0) return [];

  const scale = totalArea / totalSize;
  const normalized = sorted.map((n, idx) => ({ idx, node: n, area: n.size_bytes * scale }));

  const worstAspect = (row: number[], side: number) => {
    if (!row.length || side <= 0) return Infinity;
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum <= 0) return Infinity;
    const s2 = side * side;
    const sum2 = sum * sum;
    return row.reduce((max, r) => Math.max(max, (s2 * r) / sum2, sum2 / (s2 * r)), 0);
  };

  const rects: TreemapRect[] = [];
  let rem = { ...container };
  let currentRow: { idx: number; node: LayoutNode; area: number }[] = [];

  const flushRow = (row: typeof currentRow) => {
    if (!row.length) return;
    const rowSum = row.reduce((s, item) => s + item.area, 0);
    if (rem.w < rem.h) {
      const rowH = rowSum / rem.w;
      let curX = rem.x;
      for (const item of row) {
        const itemW = item.area / rowH;
        rects.push({
          path: item.node.path,
          name: item.node.name,
          rect: { x: curX, y: rem.y, w: itemW, h: rowH },
          size_bytes: item.node.size_bytes,
          depth: 1,
          is_directory: item.node.is_directory,
          extension: item.node.extension,
          is_system: item.node.is_system,
        });
        curX += itemW;
      }
      rem.y += rowH;
      rem.h -= rowH;
    } else {
      const rowW = rowSum / rem.h;
      let curY = rem.y;
      for (const item of row) {
        const itemH = item.area / rowW;
        rects.push({
          path: item.node.path,
          name: item.node.name,
          rect: { x: rem.x, y: curY, w: rowW, h: itemH },
          size_bytes: item.node.size_bytes,
          depth: 1,
          is_directory: item.node.is_directory,
          extension: item.node.extension,
          is_system: item.node.is_system,
        });
        curY += itemH;
      }
      rem.x += rowW;
      rem.w -= rowW;
    }
  };

  for (const item of normalized) {
    const side = Math.min(rem.w, rem.h);
    if (side <= 0) break;
    if (!currentRow.length) {
      currentRow.push(item);
    } else {
      const areasWithout = currentRow.map((i) => i.area);
      const areasWith = [...areasWithout, item.area];
      if (worstAspect(areasWith, side) <= worstAspect(areasWithout, side)) {
        currentRow.push(item);
      } else {
        flushRow(currentRow);
        currentRow = [item];
      }
    }
  }
  if (currentRow.length) flushRow(currentRow);
  return rects;
}

export function useTreemapLayout(
  nodes: LayoutNode[],
  container: Rect
): UseTreemapLayoutResult {
  const [rects, setRects] = useState<TreemapRect[]>(() => computeSquarifiedLocal(nodes, container));
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<number>(0);

  const recompute = useCallback(async () => {
    if (!nodes || nodes.length === 0 || container.w <= 0 || container.h <= 0) {
      setRects([]);
      setLoading(false);
      setError(null);
      return;
    }

    const currentId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    // Cálculo inicial inmediato para evitar pantalla en negro
    const local = computeSquarifiedLocal(nodes, container);
    if (local.length > 0) {
      setRects(local);
    }

    try {
      const result = await invoke<TreemapRect[]>("compute_treemap_layout", {
        nodes,
        container,
      });
      if (currentId === requestIdRef.current && result && result.length > 0) {
        setRects(result);
      }
    } catch (err: any) {
      if (currentId === requestIdRef.current) {
        // Si el IPC falla pero tenemos el cálculo local, no dejarlo en blanco
        if (local.length === 0) {
          setError(err?.message || String(err));
          setRects([]);
        }
      }
    } finally {
      if (currentId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [nodes, container.x, container.y, container.w, container.h]);

  useEffect(() => {
    if (!nodes || nodes.length === 0 || container.w <= 0 || container.h <= 0) {
      setRects([]);
      setLoading(false);
      setError(null);
      return;
    }

    const currentId = ++requestIdRef.current;

    // Cálculo inmediato
    const local = computeSquarifiedLocal(nodes, container);
    if (local.length > 0) {
      setRects(local);
    }

    setLoading(true);
    setError(null);

    invoke<TreemapRect[]>("compute_treemap_layout", {
      nodes,
      container,
    })
      .then((result) => {
        if (currentId === requestIdRef.current && result && result.length > 0) {
          setRects(result);
        }
      })
      .catch((err: any) => {
        if (currentId === requestIdRef.current && local.length === 0) {
          setError(err?.message || String(err));
        }
      })
      .finally(() => {
        if (currentId === requestIdRef.current) {
          setLoading(false);
        }
      });
  }, [nodes, container.x, container.y, container.w, container.h]);

  return { rects, loading, error, recompute };
}
