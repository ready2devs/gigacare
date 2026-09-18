import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@fluentui/react-components";
import {
  BroomRegular,
  ShieldCheckmarkRegular,
  ImageMultipleRegular,
  AppsListDetailRegular,
  PowerRegular,
  DataPieRegular,
  SettingsRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
} from "@fluentui/react-icons";
import { ModuleCard } from "./ModuleCard";
import "./shell.css";

export interface ShellProps {
  isDark: boolean;
  onToggleTheme: () => void;
  activeModule?: string;
  onModuleChange?: (id: string) => void;
  children?: React.ReactNode;
}

export const Shell: React.FC<ShellProps> = ({
  isDark,
  onToggleTheme,
  activeModule: propActiveModule,
  onModuleChange,
  children,
}) => {
  const { t } = useTranslation();
  const [internalActive, setInternalActive] = useState<string>("smartcare");
  const activeModule = propActiveModule ?? internalActive;
  const setActiveModule = onModuleChange ?? setInternalActive;

  const modules = [
    {
      id: "smartcare",
      title: t("modules.smartcare.title", "SmartCare"),
      subtitle: t("modules.smartcare.subtitle", "Limpieza del Sistema"),
      icon: <BroomRegular />,
    },
    {
      id: "quarantine",
      title: t("modules.quarantine.title", "Cuarentena"),
      subtitle: t("modules.quarantine.subtitle", "Aislamiento Seguro"),
      icon: <ShieldCheckmarkRegular />,
    },
    {
      id: "photos",
      title: t("modules.photos.title", "Curador de Fotos"),
      subtitle: t("modules.photos.subtitle", "IA & Nitidez Local"),
      icon: <ImageMultipleRegular />,
    },
    {
      id: "uninstaller",
      title: t("modules.uninstaller.title", "Desinstalador"),
      subtitle: t("modules.uninstaller.subtitle", "Limpieza Profunda"),
      icon: <AppsListDetailRegular />,
    },
    {
      id: "startup",
      title: t("modules.startup.title", "Inicio de Windows"),
      subtitle: t("modules.startup.subtitle", "Optimizar Arranque"),
      icon: <PowerRegular />,
    },
    {
      id: "space_map",
      title: t("modules.space_map.title", "Space Map"),
      subtitle: t("modules.space_map.subtitle", "Explorador Visual"),
      icon: <DataPieRegular />,
    },
    {
      id: "settings",
      title: t("modules.settings.title", "Configuración"),
      subtitle: t("modules.settings.subtitle", "Ajustes y Licencia"),
      icon: <SettingsRegular />,
    },
  ];

  return (
    <div className="gc-shell-layout">
      {/* Header */}
      <header className="gc-shell-header">
        <div className="gc-shell-brand">
          <span className="gc-brand-title">GigaCare</span>
          <span className="gc-brand-badge">v1.0.0</span>
        </div>
        <Button
          appearance="subtle"
          icon={isDark ? <WeatherSunnyRegular /> : <WeatherMoonRegular />}
          onClick={onToggleTheme}
        >
          {isDark ? t("common.lightTheme", "Tema Claro") : t("common.darkTheme", "Tema Oscuro")}
        </Button>
      </header>

      {/* Body con Sidebar y Contenido Principal */}
      <div className="gc-shell-body">
        <nav className="gc-shell-sidebar">
          {modules.map((m) => (
            <ModuleCard
              key={m.id}
              id={m.id}
              title={m.title}
              subtitle={m.subtitle}
              icon={m.icon}
              selected={activeModule === m.id}
              onClick={setActiveModule}
            />
          ))}
        </nav>

        <main className="gc-main-content">
          <div key={activeModule} className="gc-transition-container">
            {children ? (
              children
            ) : (
              <div>
                <h2>{modules.find((m) => m.id === activeModule)?.title}</h2>
                <p>{modules.find((m) => m.id === activeModule)?.subtitle}</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Status Bar */}
      <footer className="gc-status-bar">
        <span>{t("common.status", "Estado")}: {t("common.ready", "Listo")}</span>
        <span>Windows 11 Mica Enabled • GigaCare Core v1.0.0</span>
      </footer>
    </div>
  );
};
