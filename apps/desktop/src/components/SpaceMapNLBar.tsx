import React, { useState } from "react";
import { Input, Spinner, Button } from "@fluentui/react-components";
import { SparkleRegular, DismissRegular, BotRegular } from "@fluentui/react-icons";
import { useNLQuery, FileFilterResult } from "../hooks/useNLQuery";

export interface SpaceMapNLBarProps {
  onResults?: (result: FileFilterResult) => void;
  onClear?: () => void;
  nodes?: any[];
  currentPath?: string;
}

export const SpaceMapNLBar: React.FC<SpaceMapNLBarProps> = ({ onResults, onClear, nodes, currentPath }) => {
  const { query, setQuery, loading, error, executeQuery, clearQuery } = useNLQuery();
  const [activeResult, setActiveResult] = useState<FileFilterResult | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);

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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "6px",
        position: "relative",
      }}
      data-testid="spacemap-nl-bar-container"
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <Input
          contentBefore={<SparkleRegular style={{ color: "#00E5FF" }} />}
          contentAfter={
            loading ? (
              <Spinner size="extra-tiny" />
            ) : query ? (
              <DismissRegular
                style={{ cursor: "pointer", color: "#94A3B8" }}
                onClick={handleClear}
                data-testid="nl-clear-btn"
              />
            ) : null
          }
          placeholder="Pregúntale a GigaCare sobre esta carpeta o qué eliminar..."
          value={query}
          onChange={(_e, data) => setQuery(data.value)}
          onKeyDown={handleKeyDown}
          input={{ id: "nl-query-input-element" }}
          style={{
            minWidth: "380px",
            background: "#111827",
            borderRadius: "999px",
            color: "#F8FAFC",
            border: "1px solid rgba(0, 229, 255, 0.3)",
            boxShadow: "0 0 10px rgba(0, 229, 255, 0.1)",
          }}
          data-testid="nl-query-input"
        />
        {activeResult?.answer && !modalOpen && (
          <Button
            size="small"
            appearance="subtle"
            icon={<BotRegular />}
            onClick={() => setModalOpen(true)}
            style={{ color: "#00E5FF", border: "1px solid rgba(0, 229, 255, 0.4)", borderRadius: "999px" }}
          >
            Ver análisis
          </Button>
        )}
      </div>

      {/* Banner resumen que SIEMPRE contiene el resumen y el data-testid requerido por las pruebas */}
      {activeResult && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(0, 229, 255, 0.12)",
            border: "1px solid #00E5FF",
            borderRadius: "8px",
            padding: "6px 12px",
            color: "#F8FAFC",
            fontSize: "12px",
            boxShadow: "0 0 12px rgba(0, 229, 255, 0.2)",
            cursor: activeResult.answer ? "pointer" : "default",
          }}
          onClick={() => activeResult.answer && setModalOpen(true)}
          data-testid="nl-results-toast"
        >
          <span>✨ {activeResult.summary} {activeResult.answer && !modalOpen && "(Clic para ver análisis IA)"}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "#94A3B8",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Tarjeta Modal Centrada con Backdrop para que NUNCA quede tapada */}
      {modalOpen && activeResult && activeResult.answer && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(8px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "20px",
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "760px",
              maxHeight: "85vh",
              display: "flex",
              flexDirection: "column",
              background: "#0B0F19",
              border: "1px solid #00E5FF",
              borderRadius: "16px",
              padding: "24px",
              boxShadow: "0 25px 60px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 229, 255, 0.35)",
              color: "#E2E8F0",
              fontSize: "14px",
              lineHeight: "1.7",
            }}
            onClick={(e) => e.stopPropagation()}
            data-testid="nl-ai-modal"
          >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", paddingBottom: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, color: "#00E5FF" }}>
              <BotRegular style={{ fontSize: "20px" }} />
              <span>Análisis de IA GigaCare • {activeResult.provider || "Modelo Local"}</span>
            </div>
            <button
              onClick={() => setModalOpen(false)}
              style={{
                background: "transparent",
                border: "none",
                color: "#94A3B8",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              ✕
            </button>
          </div>

          <div
            style={{
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "360px",
              overflowY: "auto",
              paddingRight: "6px",
            }}
          >
            {activeResult.answer}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }}>
            <Button appearance="primary" style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 600 }} onClick={() => setModalOpen(false)}>
              Entendido
            </Button>
          </div>
        </div>
        </div>
      )}

      {error && (
        <div
          style={{
            color: "#EF4444",
            fontSize: "11px",
            paddingLeft: "8px",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};
