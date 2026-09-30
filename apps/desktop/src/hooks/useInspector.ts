import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface FileMetadata {
  dimensions?: string | null;
  codec?: string | null;
  modified_at?: string | null;
  size_bytes: number;
}

export interface InspectorState {
  path: string | null;
  name: string;
  isDirectory: boolean;
  previewUrl: string | null;
  mediaType: string | null;
  metadata: FileMetadata | null;
  loading: boolean;
  error: string | null;
}

export function useInspector() {
  const [state, setState] = useState<InspectorState>({
    path: null,
    name: "",
    isDirectory: false,
    previewUrl: null,
    mediaType: null,
    metadata: null,
    loading: false,
    error: null,
  });

  const lastBlobUrlRef = useRef<string | null>(null);

  const cleanLastBlob = useCallback(() => {
    if (lastBlobUrlRef.current && lastBlobUrlRef.current.startsWith("blob:")) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanLastBlob();
    };
  }, [cleanLastBlob]);

  const selectItem = useCallback(
    async (path: string, isDirectory: boolean = false, defaultSize: number = 0) => {
      cleanLastBlob();

      const name = path.split(/[/\\]/).filter(Boolean).pop() || path;

      if (isDirectory) {
        setState({
          path,
          name,
          isDirectory: true,
          previewUrl: null,
          mediaType: "folder",
          metadata: { size_bytes: defaultSize },
          loading: false,
          error: null,
        });
        return;
      }

      setState({
        path,
        name,
        isDirectory: false,
        previewUrl: null,
        mediaType: null,
        metadata: { size_bytes: defaultSize },
        loading: true,
        error: null,
      });

      try {
        const res: any = await invoke("get_file_preview", { path });
        let url: string | null = null;

        if (res && res.preview_url) {
          url = res.preview_url;
        } else if (res && res.preview_base64) {
          // Convertir base64 a Blob URL para óptimo manejo de memoria
          try {
            const byteCharacters = atob(res.preview_base64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: res.media_type || "image/jpeg" });
            url = URL.createObjectURL(blob);
            lastBlobUrlRef.current = url;
          } catch {
            url = `data:${res.media_type};base64,${res.preview_base64}`;
          }
        }

        setState({
          path,
          name,
          isDirectory: false,
          previewUrl: url,
          mediaType: res?.media_type || null,
          metadata: res?.metadata || { size_bytes: defaultSize },
          loading: false,
          error: null,
        });
      } catch (err: any) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err?.message || String(err),
        }));
      }
    },
    [cleanLastBlob]
  );

  const clearSelection = useCallback(() => {
    cleanLastBlob();
    setState({
      path: null,
      name: "",
      isDirectory: false,
      previewUrl: null,
      mediaType: null,
      metadata: null,
      loading: false,
      error: null,
    });
  }, [cleanLastBlob]);

  return {
    ...state,
    selectItem,
    clearSelection,
  };
}
