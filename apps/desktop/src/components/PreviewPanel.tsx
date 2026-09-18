import React, { useState, useMemo } from "react";
import {
  Button,
  Checkbox,
  Text,
  Badge,
} from "@fluentui/react-components";
import {
  BroomRegular,
  DismissRegular,
  FilterRegular,
} from "@fluentui/react-icons";
import { ScanItem } from "../types/models";
import { ConfirmDialog } from "./ConfirmDialog";
import "./preview.css";

export interface PreviewPanelProps {
  items: ScanItem[];
  onConfirmClean: (selectedPaths: string[]) => void;
  onCancel: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  items,
  onConfirmClean,
  onCancel,
}) => {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(items.map((i) => i.path)),
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((item) => cats.add(item.category));
    return ["all", ...Array.from(cats)];
  }, [items]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === "all") return items;
    return items.filter((item) => item.category === selectedCategory);
  }, [items, selectedCategory]);

  const { selectedCount, selectedBytes } = useMemo(() => {
    let count = 0;
    let bytes = 0;
    items.forEach((item) => {
      if (selectedPaths.has(item.path)) {
        count += 1;
        bytes += item.size_bytes;
      }
    });
    return { selectedCount: count, selectedBytes: bytes };
  }, [items, selectedPaths]);

  const allFilteredSelected = useMemo(() => {
    if (filteredItems.length === 0) return false;
    return filteredItems.every((item) => selectedPaths.has(item.path));
  }, [filteredItems, selectedPaths]);

  const handleToggleAll = () => {
    const next = new Set(selectedPaths);
    if (allFilteredSelected) {
      filteredItems.forEach((item) => next.delete(item.path));
    } else {
      filteredItems.forEach((item) => next.add(item.path));
    }
    setSelectedPaths(next);
  };

  const handleToggleItem = (path: string) => {
    const next = new Set(selectedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setSelectedPaths(next);
  };

  const handleExecuteClean = () => {
    setShowConfirm(false);
    onConfirmClean(Array.from(selectedPaths));
  };

  return (
    <div className="preview-panel-container">
      {/* Header Resumen */}
      <div className="preview-header-card">
        <div>
          <Text weight="bold" size={500} style={{ color: "#F8FAFC", display: "block" }}>
            Vista Previa de Limpieza
          </Text>
          <Text size={200} style={{ color: "#94A3B8" }}>
            Revisa y selecciona los archivos antes de enviarlos a cuarentena.
          </Text>
        </div>

        <div className="preview-stats-group">
          <div className="preview-stat-item">
            <span className="preview-stat-value">{selectedCount}</span>
            <span className="preview-stat-label">Archivos elegidos</span>
          </div>
          <div className="preview-stat-item">
            <span className="preview-stat-value">{formatBytes(selectedBytes)}</span>
            <span className="preview-stat-label">Espacio total</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="preview-filters-bar">
        <FilterRegular style={{ color: "#00E5FF", marginLeft: "4px" }} />
        {categories.map((cat) => (
          <Button
            key={cat}
            size="small"
            appearance={selectedCategory === cat ? "primary" : "subtle"}
            style={
              selectedCategory === cat
                ? { backgroundColor: "rgba(0, 229, 255, 0.2)", borderColor: "#00E5FF", color: "#00E5FF" }
                : {}
            }
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === "all" ? "Todos" : cat}
          </Button>
        ))}
      </div>

      {/* Lista de Archivos */}
      <div className="preview-list-card">
        <div className="preview-list-header">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Checkbox
              checked={allFilteredSelected}
              onChange={handleToggleAll}
              label="Seleccionar todo"
            />
          </div>
          <span>{filteredItems.length} elementos</span>
        </div>

        <div className="preview-list-items">
          {filteredItems.map((item) => {
            const isChecked = selectedPaths.has(item.path);
            return (
              <div
                key={item.path}
                className="preview-item-row"
                onClick={() => handleToggleItem(item.path)}
              >
                <Checkbox
                  checked={isChecked}
                  onChange={() => handleToggleItem(item.path)}
                />
                <div className="preview-item-info">
                  <span className="preview-item-path" title={item.path}>
                    {item.path}
                  </span>
                  <div className="preview-item-meta">
                    <Badge size="small" appearance="tint">
                      {item.category}
                    </Badge>
                    <span>{new Date(item.modified_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="preview-item-size">{formatBytes(item.size_bytes)}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Acciones */}
      <div className="preview-actions-bar">
        <Button appearance="secondary" icon={<DismissRegular />} onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          appearance="primary"
          icon={<BroomRegular />}
          disabled={selectedCount === 0}
          style={{ backgroundColor: "#00E5FF", color: "#0B0F19", fontWeight: 600 }}
          onClick={() => setShowConfirm(true)}
        >
          Confirmar Limpieza ({selectedCount})
        </Button>
      </div>

      {/* Diálogo de Doble Acción */}
      <ConfirmDialog
        open={showConfirm}
        itemCount={selectedCount}
        totalBytes={selectedBytes}
        onConfirm={handleExecuteClean}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
};
