import React, { useState } from "react";
import { TabList, Tab, TabValue, Text } from "@fluentui/react-components";
import { AppsListDetailRegular, PowerRegular } from "@fluentui/react-icons";
import { UninstallerPanel } from "./UninstallerPanel";
import { StartupPanel } from "./StartupPanel";

export interface SystemManagementPanelProps {
  defaultTab?: "uninstaller" | "startup";
}

export const SystemManagementPanel: React.FC<SystemManagementPanelProps> = ({
  defaultTab = "uninstaller",
}) => {
  const [activeTab, setActiveTab] = useState<TabValue>(defaultTab);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        maxWidth: "1150px",
        margin: "0 auto",
        gap: "16px",
        padding: "0 10px 40px",
      }}
      data-testid="system-management-panel"
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          paddingBottom: "16px",
        }}
      >
        <div>
          <Text weight="bold" size={600} style={{ color: "#F8FAFC", display: "block" }}>
            Gestión del Sistema
          </Text>
          <Text size={300} style={{ color: "#94A3B8" }}>
            Desinstalación profunda de aplicaciones y optimización de arranque
          </Text>
        </div>

        {/* TabList horizontal con Cyan active color */}
        <TabList
          selectedValue={activeTab}
          onTabSelect={(_e, data) => setActiveTab(data.value)}
          data-testid="system-management-tabs"
          style={{
            background: "rgba(15, 23, 42, 0.6)",
            padding: "4px",
            borderRadius: "10px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <Tab
            value="uninstaller"
            icon={<AppsListDetailRegular />}
            data-testid="tab-uninstaller"
            style={{
              color: activeTab === "uninstaller" ? "#00E5FF" : "#94A3B8",
              fontWeight: activeTab === "uninstaller" ? 600 : 400,
            }}
          >
            Desinstalador Profundo
          </Tab>
          <Tab
            value="startup"
            icon={<PowerRegular />}
            data-testid="tab-startup"
            style={{
              color: activeTab === "startup" ? "#00E5FF" : "#94A3B8",
              fontWeight: activeTab === "startup" ? 600 : 400,
            }}
          >
            Inicio de Windows
          </Tab>
        </TabList>
      </div>

      {/* Contenidos montados de forma persistente para no perder estado al alternar */}
      <div
        style={{ display: activeTab === "uninstaller" ? "block" : "none" }}
        data-testid="content-uninstaller"
      >
        <UninstallerPanel />
      </div>

      <div
        style={{ display: activeTab === "startup" ? "block" : "none" }}
        data-testid="content-startup"
      >
        <StartupPanel />
      </div>
    </div>
  );
};
