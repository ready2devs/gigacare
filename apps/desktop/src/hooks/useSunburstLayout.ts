import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LayoutNode, Point, SunburstArc } from "../types/treemap";

export interface UseSunburstLayoutResult {
  arcs: SunburstArc[];
  loading: boolean;
  error: string | null;
  recompute: () => Promise<void>;
}

export function computeSunburstLocal(
  root: LayoutNode | null,
  center: Point,
  innerRadius: number = 40,
  ringWidth: number = 30,
  maxDepth: number = 4
): SunburstArc[] {
  if (!root || (root.size_bytes || 0) <= 0 || maxDepth <= 0) return [];

  const arcs: SunburstArc[] = [];
  arcs.push({
    path: root.path,
    name: root.name,
    center,
    r_inner: innerRadius,
    r_outer: innerRadius + ringWidth,
    start_angle: 0,
    end_angle: 2 * Math.PI,
    depth: 0,
    size_bytes: root.size_bytes,
    is_directory: root.is_directory,
  });

  const recurse = (
    children: LayoutNode[],
    parentSize: number,
    parentStart: number,
    parentEnd: number,
    curDepth: number
  ) => {
    if (curDepth >= maxDepth || !children || !children.length || parentSize <= 0) return;
    const parentSweep = parentEnd - parentStart;
    if (parentSweep < 0.001) return;

    const totalChildrenSize = children.reduce((s, c) => s + (c.size_bytes || 0), 0);
    if (totalChildrenSize <= 0) return;
    const baseSize = Math.max(parentSize, totalChildrenSize);
    let curAngle = parentStart;
    const rInner = innerRadius + curDepth * ringWidth;
    const rOuter = rInner + ringWidth;

    for (const child of children) {
      if ((child.size_bytes || 0) <= 0) continue;
      const sweep = (child.size_bytes / baseSize) * parentSweep;
      if (sweep < 0.001) {
        curAngle += sweep;
        continue;
      }
      const startAngle = curAngle;
      const endAngle = curAngle + sweep;
      arcs.push({
        path: child.path,
        name: child.name,
        center,
        r_inner: rInner,
        r_outer: rOuter,
        start_angle: startAngle,
        end_angle: endAngle,
        depth: curDepth,
        size_bytes: child.size_bytes,
        is_directory: child.is_directory,
      });
      if (child.children && child.children.length > 0) {
        recurse(child.children, child.size_bytes, startAngle, endAngle, curDepth + 1);
      }
      curAngle += sweep;
    }
  };

  if (root.children && root.children.length > 0) {
    recurse(root.children, root.size_bytes, 0, 2 * Math.PI, 1);
  }

  return arcs;
}

export function useSunburstLayout(
  root: LayoutNode | null,
  center: Point,
  innerRadius: number = 40,
  ringWidth: number = 30,
  maxDepth: number = 4
): UseSunburstLayoutResult {
  const [arcs, setArcs] = useState<SunburstArc[]>(() =>
    computeSunburstLocal(root, center, innerRadius, ringWidth, maxDepth)
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef<number>(0);

  const recompute = useCallback(async () => {
    if (!root || (root.size_bytes || 0) <= 0 || maxDepth <= 0) {
      setArcs([]);
      setLoading(false);
      setError(null);
      return;
    }

    const currentId = ++requestIdRef.current;
    setLoading(true);
    setError(null);

    const local = computeSunburstLocal(root, center, innerRadius, ringWidth, maxDepth);
    if (local.length > 0) {
      setArcs(local);
    }

    try {
      const result = await invoke<SunburstArc[]>("compute_sunburst_layout", {
        root,
        center,
        inner_radius: innerRadius,
        ring_width: ringWidth,
        max_depth: maxDepth,
      });
      if (currentId === requestIdRef.current && result && result.length > 0) {
        setArcs(result);
      }
    } catch (err: any) {
      if (currentId === requestIdRef.current && local.length === 0) {
        setError(err?.message || String(err));
        setArcs([]);
      }
    } finally {
      if (currentId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [root, center.x, center.y, innerRadius, ringWidth, maxDepth]);

  useEffect(() => {
    if (!root || (root.size_bytes || 0) <= 0 || maxDepth <= 0) {
      setArcs([]);
      setLoading(false);
      setError(null);
      return;
    }

    const currentId = ++requestIdRef.current;
    const local = computeSunburstLocal(root, center, innerRadius, ringWidth, maxDepth);
    if (local.length > 0) {
      setArcs(local);
    }

    setLoading(true);
    setError(null);

    invoke<SunburstArc[]>("compute_sunburst_layout", {
      root,
      center,
      inner_radius: innerRadius,
      ring_width: ringWidth,
      max_depth: maxDepth,
    })
      .then((result) => {
        if (currentId === requestIdRef.current && result && result.length > 0) {
          setArcs(result);
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
  }, [root, center.x, center.y, innerRadius, ringWidth, maxDepth]);

  return { arcs, loading, error, recompute };
}
