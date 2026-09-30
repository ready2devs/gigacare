import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "../types/treemap";

export interface FileFilterResult {
  query_parsed?: any;
  matched_paths: string[];
  total_matched: number;
  total_bytes: number;
  summary: string;
  answer?: string;
  provider?: string;
}

export interface UseNLQueryResult {
  query: string;
  setQuery: (q: string) => void;
  loading: boolean;
  result: FileFilterResult | null;
  error: string | null;
  highlightedPaths: string[];
  executeQuery: (customQuery?: string, nodes?: FileNode[], folderPath?: string) => Promise<FileFilterResult | null>;
  clearQuery: () => void;
}

export function useNLQuery(): UseNLQueryResult {
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<FileFilterResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedPaths, setHighlightedPaths] = useState<string[]>([]);

  const executeQuery = useCallback(
    async (customQuery?: string, nodes?: FileNode[], folderPath?: string): Promise<FileFilterResult | null> => {
      const q = (customQuery ?? query).trim();
      if (!q) {
        setResult(null);
        setHighlightedPaths([]);
        return null;
      }

      setLoading(true);
      setError(null);

      // Si estamos en entorno web, consultar el endpoint inteligente /api/ai-analyze
      try {
        const resp = await fetch("/api/ai-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            folderPath: folderPath || "",
            nodes: (nodes || []).map((n) => ({
              path: n.path,
              name: n.name,
              size_bytes: n.size_bytes,
              extension: n.extension,
              is_directory: n.is_directory,
              modified_at: (n as any).modified_at,
            })),
          }),
        });

        if (resp.ok) {
          const aiData = await resp.json();
          if (aiData && aiData.answer) {
            const filterRes: FileFilterResult = {
              matched_paths: aiData.matched_paths || [],
              total_matched: (aiData.matched_paths || []).length,
              total_bytes: aiData.total_bytes || 0,
              summary: `Respuesta generada con ${aiData.provider || "IA"}`,
              answer: aiData.answer,
              provider: aiData.provider,
            };
            setResult(filterRes);
            setHighlightedPaths(filterRes.matched_paths);
            return filterRes;
          }
        }
      } catch {
        // Fallback a IPC si no hay endpoint web
      }

      try {
        const res = await invoke<FileFilterResult>("nl_query_files", {
          query: q,
          nodes,
        });

        setResult(res);
        setHighlightedPaths(res?.matched_paths || []);
        return res;
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        setError(errMsg);
        setResult(null);
        setHighlightedPaths([]);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [query]
  );

  const clearQuery = useCallback(() => {
    setQuery("");
    setLoading(false);
    setResult(null);
    setError(null);
    setHighlightedPaths([]);
  }, []);

  return {
    query,
    setQuery,
    loading,
    result,
    error,
    highlightedPaths,
    executeQuery,
    clearQuery,
  };
}
