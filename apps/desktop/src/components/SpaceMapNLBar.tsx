import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Input, Spinner } from "@fluentui/react-components";
import {
  SparkleRegular,
  DismissRegular,
  BotRegular,
  CopyRegular,
  CheckmarkRegular,
} from "@fluentui/react-icons";
import { useNLQuery, FileFilterResult } from "../hooks/useNLQuery";
import { AIMarkdownView } from "./AIMarkdownView";
import "./spaceMapNLBar.css";

export interface SpaceMapNLBarProps {
  onResults?: (result: FileFilterResult) => void;
  onClear?: () => void;
  nodes?: any[];
  currentPath?: string;
}

export const SpaceMapNLBar: React.FC<SpaceMapNLBarProps> = ({
  onResults,
  onClear,
  nodes,
  currentPath,
}) => {
  const { query, setQuery, loading, executeQuery, clearQuery } = useNLQuery();
  const [activeResult, setActiveResult] = useState<FileFilterResult | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Cerrar modal con la tecla Escape
  useEffect(() => {
    if (!modalOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [modalOpen]);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim() && !loading) {
      e.preventDefault();
      const res = await executeQuery(query, nodes, currentPath);
      if (res) {
        setActiveResult(res);
        if (res.answer) {
          setModalOpen(true);
        }
        if (onResults) onResults(res);
      }
    }
  };

  const handleClear = () => {
    clearQuery();
    setActiveResult(null);
    setModalOpen(false);
    if (onClear) onClear();
  };

  const handleCopy = async () => {
    if (activeResult?.answer) {
      try {
        await navigator.clipboard.writeText(activeResult.answer);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback en caso de que navigator.clipboard no esté disponible
      }
    }
  };

  // Extraer el nombre legible de la carpeta actual para mostrar en el encabezado
  const folderName = currentPath
    ? currentPath.split(/[\\/]/).filter(Boolean).pop() || currentPath
    : "Carpeta actual";

  return (
    <div className="spacemap-nl-bar-root" data-testid="spacemap-nl-bar-container">
      <div className="nl-input-row">
        <Input
          contentBefore={<SparkleRegular style={{ color: "#00E5FF", fontSize: "16px" }} />}
          contentAfter={
            loading ? (
              <Spinner size="extra-tiny" />
            ) : query ? (
              <DismissRegular
                style={{ cursor: "pointer", color: "#94A3B8" }}
                onClick={handleClear}
                data-testid="nl-clear-btn"
                title="Limpiar búsqueda"
              />
            ) : null
          }
          placeholder="Pregúntale a GigaCare sobre esta carpeta o qué eliminar..."
          value={query}
          onChange={(_e, data) => setQuery(data.value)}
          onKeyDown={handleKeyDown}
          input={{ id: "nl-query-input-element" }}
          className="nl-search-input"
          data-testid="nl-query-input"
        />

        {activeResult?.answer && !modalOpen && (
          <button
            type="button"
            className="nl-view-analysis-pill"
            onClick={() => setModalOpen(true)}
            data-testid="nl-view-analysis-btn"
            title="Abrir el informe y análisis detallado de la IA"
          >
            <BotRegular style={{ fontSize: "15px" }} />
            <span>Ver análisis IA</span>
          </button>
        )}
      </div>

      {/* Popover / Toast flotante con el resumen de resultados */}
      {activeResult && (
        <div
          className="nl-results-dropdown"
          onClick={() => activeResult.answer && setModalOpen(true)}
          style={{ cursor: activeResult.answer ? "pointer" : "default" }}
          data-testid="nl-results-toast"
          role="status"
        >
          <div className="nl-dropdown-left">
            <span>
              ✨ {activeResult.summary}{" "}
              {activeResult.answer && !modalOpen && (
                <span style={{ color: "#00E5FF", fontWeight: 600 }}>
                  (Clic para ver análisis IA)
                </span>
              )}
            </span>
          </div>
          <button
            type="button"
            className="nl-dropdown-close"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            title="Descartar resultados"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tarjeta Modal montada en Portal en document.body para evitar recortes de CSS y backdrop-filter */}
      {modalOpen &&
        activeResult &&
        activeResult.answer &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="nl-modal-backdrop"
            onClick={() => setModalOpen(false)}
            role="dialog"
            aria-modal="true"
          >
            <div
              className="nl-modal-container"
              onClick={(e) => e.stopPropagation()}
              data-testid="nl-ai-modal"
            >
              {/* Header del Modal */}
              <div className="nl-modal-header">
                <div className="nl-modal-title-group">
                  <div className="nl-modal-icon-badge">
                    <SparkleRegular />
                  </div>
                  <div>
                    <div className="nl-modal-title-text">
                      Análisis de Espacio con IA
                    </div>
                    <div style={{ fontSize: "12px", color: "#94A3B8" }}>
                      Carpeta: <span style={{ color: "#E2E8F0" }}>{folderName}</span>
                    </div>
                  </div>
                </div>

                <div className="nl-modal-header-actions">
                  <span className="nl-modal-provider-tag">
                    {activeResult.provider || "GigaCare AI"}
                  </span>

                  <button
                    type="button"
                    className="nl-modal-copy-btn"
                    onClick={handleCopy}
                    title="Copiar texto del análisis al portapapeles"
                  >
                    {copied ? (
                      <>
                        <CheckmarkRegular style={{ color: "#10B981" }} />
                        <span style={{ color: "#10B981" }}>Copiado</span>
                      </>
                    ) : (
                      <>
                        <CopyRegular />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    className="nl-modal-close-btn"
                    onClick={() => setModalOpen(false)}
                    title="Cerrar modal (Esc)"
                    aria-label="Cerrar"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Cuerpo del Modal con Renderizador Markdown */}
              <div className="nl-modal-body">
                <AIMarkdownView content={activeResult.answer} />
              </div>

              {/* Footer del Modal */}
              <div className="nl-modal-footer">
                <div className="nl-modal-footer-tip">
                  <span>💡</span>
                  <span>
                    Puedes usar el Treemap o Sunburst para ubicar visualmente estos archivos y enviarlos a cuarentena.
                  </span>
                </div>

                <button
                  type="button"
                  className="nl-modal-primary-btn"
                  onClick={() => setModalOpen(false)}
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
