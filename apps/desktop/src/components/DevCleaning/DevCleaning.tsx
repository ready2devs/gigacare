import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { DevCleanTab } from "./DevCleanTab";
import { ModelsTab } from "./ModelsTab";
import { PythonTab } from "./PythonTab";
import { SmartCareAnalysis } from "../../types/models";
import "./devcleaning.css";

export type DevCleaningTabId = "caches" | "models" | "python";

export interface DevCleaningProps {
  onRecovered?: (bytes: number) => void;
  smartCareAnalysis?: SmartCareAnalysis | null;
}

export const DevCleaning: React.FC<DevCleaningProps> = ({ onRecovered, smartCareAnalysis }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<DevCleaningTabId>("caches");

  return (
    <div className="devcleaning-container">
      {/* Module Header */}
      <div className="devcleaning-header">
        <div className="devcleaning-title-group">
          <h2>Dev Cleaning</h2>
          <div className="devcleaning-subtitle">
            {t("dev_cleaning.headerSubtitle", "Cachés de desarrollo, modelos de IA y entornos Python")}
          </div>
        </div>

        {/* Navigation Pills */}
        <div className="devcleaning-nav-pills">
          <button
            className={`devcleaning-pill ${activeTab === "caches" ? "active" : ""}`}
            onClick={() => setActiveTab("caches")}
          >
            {t("dev_cleaning.tabs.caches", "Cachés Dev")}
          </button>
          <button
            className={`devcleaning-pill ${activeTab === "models" ? "active" : ""}`}
            onClick={() => setActiveTab("models")}
          >
            {t("dev_cleaning.tabs.models", "Modelos IA")}
          </button>
          <button
            className={`devcleaning-pill ${activeTab === "python" ? "active" : ""}`}
            onClick={() => setActiveTab("python")}
          >
            {t("dev_cleaning.tabs.python", "Entornos Python")}
          </button>
        </div>
      </div>

      {/* Active Tab View */}
      {activeTab === "caches" && <DevCleanTab onRecovered={onRecovered} smartCareAnalysis={smartCareAnalysis} />}
      {activeTab === "models" && <ModelsTab onRecovered={onRecovered} />}
      {activeTab === "python" && <PythonTab onRecovered={onRecovered} />}
    </div>
  );
};

export default DevCleaning;
