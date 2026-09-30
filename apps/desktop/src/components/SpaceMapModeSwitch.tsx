import React, { useState, useEffect } from "react";
import { ToggleButton } from "@fluentui/react-components";

export type VisualizationMode = "treemap" | "sunburst";

export const DEFAULT_MODE_STORAGE_KEY = "gigacare_spacemap_mode";

export interface SpaceMapModeSwitchProps {
  mode?: VisualizationMode;
  onChange?: (mode: VisualizationMode) => void;
  storageKey?: string;
}

export const SpaceMapModeSwitch: React.FC<SpaceMapModeSwitchProps> = ({
  mode: controlledMode,
  onChange,
  storageKey = DEFAULT_MODE_STORAGE_KEY,
}) => {
  const [internalMode, setInternalMode] = useState<VisualizationMode>(() => {
    if (controlledMode) return controlledMode;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "treemap" || saved === "sunburst") {
        return saved;
      }
    } catch {
      // Ignorar errores de localStorage
    }
    return "treemap";
  });

  useEffect(() => {
    if (controlledMode) {
      setInternalMode(controlledMode);
    }
  }, [controlledMode]);

  const currentMode = controlledMode ?? internalMode;

  const handleSelect = (newMode: VisualizationMode) => {
    setInternalMode(newMode);
    try {
      localStorage.setItem(storageKey, newMode);
    } catch {
      // Ignorar errores de localStorage
    }
    if (onChange) {
      onChange(newMode);
    }
  };

  return (
    <div
      style={{
        display: "inline-flex",
        gap: "4px",
        padding: "3px",
        borderRadius: "999px",
        background: "#111827",
        border: "1px solid rgba(255, 255, 255, 0.1)",
      }}
      data-testid="spacemap-mode-switch"
    >
      <ToggleButton
        size="small"
        checked={currentMode === "treemap"}
        onClick={() => handleSelect("treemap")}
        data-testid="mode-btn-treemap"
        style={{
          borderRadius: "999px",
          backgroundColor: currentMode === "treemap" ? "#00E5FF" : "transparent",
          color: currentMode === "treemap" ? "#0B0F19" : "#F8FAFC",
          fontWeight: currentMode === "treemap" ? 600 : 400,
          border: "none",
        }}
      >
        ▦ Treemap
      </ToggleButton>
      <ToggleButton
        size="small"
        checked={currentMode === "sunburst"}
        onClick={() => handleSelect("sunburst")}
        data-testid="mode-btn-sunburst"
        style={{
          borderRadius: "999px",
          backgroundColor: currentMode === "sunburst" ? "#00E5FF" : "transparent",
          color: currentMode === "sunburst" ? "#0B0F19" : "#F8FAFC",
          fontWeight: currentMode === "sunburst" ? 600 : 400,
          border: "none",
        }}
      >
        ◎ Sunburst
      </ToggleButton>
    </div>
  );
};
