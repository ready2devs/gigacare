import React from "react";
import "./shell.css";

export interface ModuleCardProps {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: (id: string) => void;
}

export const ModuleCard: React.FC<ModuleCardProps> = ({
  id,
  title,
  subtitle,
  icon,
  selected,
  onClick,
}) => {
  return (
    <div
      className={`gc-module-card ${selected ? "selected" : ""}`}
      onClick={() => onClick(id)}
    >
      <div className="gc-card-icon">{icon}</div>
      <div className="gc-card-text">
        <span className="gc-card-title">{title}</span>
        {subtitle && <span className="gc-card-subtitle">{subtitle}</span>}
      </div>
    </div>
  );
};
