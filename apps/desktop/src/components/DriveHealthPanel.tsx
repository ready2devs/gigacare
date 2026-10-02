import React from "react";
import { Badge } from "@fluentui/react-components";
import { ArrowClockwiseRegular } from "@fluentui/react-icons";
import { DriveHealthInfo } from "../types/models";
import "./driveHealthPanel.css";

export interface DriveHealthPanelProps {
  data: DriveHealthInfo;
  onRefresh: () => void;
}

const formatBytesToGb = (bytes: number): string => {
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
};

export const DriveHealthPanel: React.FC<DriveHealthPanelProps> = ({
  data,
  onRefresh,
}) => {
  const {
    drive_label,
    drive_path,
    total_bytes,
    free_bytes,
    usage_percent,
    disk_type,
    filesystem,
    smart_status,
    temperature_celsius,
    drive_wear_percent,
    reallocated_sectors,
    power_on_hours,
    fill_forecast,
  } = data;

  // Doughnut math
  const radius = 45;
  const circumference = 2 * Math.PI * radius; // ~282.74
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, usage_percent)) / 100) * circumference;

  let doughnutColor = "#4ADE80";
  if (usage_percent >= 90) {
    doughnutColor = "#F87171";
  } else if (usage_percent >= 80) {
    doughnutColor = "#FACC15";
  }

  // Smart status badge color
  let smartBadgeColor: "success" | "warning" | "danger" | "informative" = "informative";
  if (smart_status === "Healthy") smartBadgeColor = "success";
  else if (smart_status === "Warning") smartBadgeColor = "warning";
  else if (smart_status === "Critical") smartBadgeColor = "danger";

  // Temperature color
  let tempColor = "#4ADE80";
  if (temperature_celsius && temperature_celsius > 70) tempColor = "#F87171";
  else if (temperature_celsius && temperature_celsius > 50) tempColor = "#FACC15";

  return (
    <div className="drive-health-panel" data-testid="drive-health-panel">
      <div className="drive-health-header">
        <h2 className="drive-health-title">Salud del Disco</h2>
        <button
          className="drive-health-refresh-btn"
          data-testid="refresh-drive-btn"
          onClick={onRefresh}
          title="Actualizar datos del disco"
        >
          <ArrowClockwiseRegular /> Actualizar
        </button>
      </div>

      <div className="drive-health-columns">
        {/* Columna 1: Gráfico Doughnut SVG */}
        <div className="drive-health-col-doughnut" data-testid="doughnut-col">
          <svg width="120" height="120" viewBox="0 0 120 120">
            {/* Background ring */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth="10"
            />
            {/* Progress ring */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={doughnutColor}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform="rotate(-90 60 60)"
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
            {/* Number inside */}
            <text
              x="60"
              y="56"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#F8FAFC"
              fontSize="20"
              fontWeight="700"
            >
              {usage_percent}%
            </text>
            <text
              x="60"
              y="74"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#94A3B8"
              fontSize="11"
            >
              usado
            </text>
          </svg>
        </div>

        {/* Columna 2: Info del disco */}
        <div className="drive-health-col-info" data-testid="info-col">
          <h3 className="drive-health-drive-name">{drive_label}</h3>
          <p className="drive-health-drive-path">{drive_path}</p>
          <div className="drive-health-badges">
            <Badge appearance="tint" color="brand">{disk_type}</Badge>
            <Badge appearance="outline">{filesystem}</Badge>
            <Badge appearance="filled" color={smartBadgeColor} data-testid="smart-badge">{smart_status}</Badge>
          </div>
          <div className="drive-health-free-text">
            {formatBytesToGb(free_bytes)} free of {formatBytesToGb(total_bytes)}
          </div>
        </div>

        {/* Columna 3: Métricas Hardware */}
        <div className="drive-health-col-metrics" data-testid="metrics-col">
          {/* Capacity used */}
          <div className="drive-health-metric-row">
            <span className="drive-health-metric-label">Capacity used</span>
            <div className="drive-health-metric-value">
              <div className="drive-health-metric-bar">
                <div
                  className="drive-health-metric-bar-fill"
                  style={{ width: `${usage_percent}%`, background: doughnutColor }}
                />
              </div>
              <span>{usage_percent}%</span>
            </div>
          </div>

          {/* SMART self-check */}
          <div className="drive-health-metric-row">
            <span className="drive-health-metric-label">SMART self-check</span>
            <span
              className="drive-health-metric-value"
              style={{
                color:
                  smart_status === "Healthy"
                    ? "#4ADE80"
                    : smart_status === "Warning"
                    ? "#FACC15"
                    : smart_status === "Critical"
                    ? "#F87171"
                    : "#94A3B8",
              }}
            >
              {smart_status}
            </span>
          </div>

          {/* Drive wear */}
          {drive_wear_percent !== null && drive_wear_percent !== undefined && (
            <div className="drive-health-metric-row" data-testid="wear-metric">
              <span className="drive-health-metric-label">Drive wear used</span>
              <div className="drive-health-metric-value">
                <div className="drive-health-metric-bar">
                  <div
                    className="drive-health-metric-bar-fill"
                    style={{ width: `${drive_wear_percent}%`, background: "#38BDF8" }}
                  />
                </div>
                <span>{drive_wear_percent}%</span>
              </div>
            </div>
          )}

          {/* Temperature */}
          {temperature_celsius !== null && temperature_celsius !== undefined && (
            <div className="drive-health-metric-row" data-testid="temp-metric">
              <span className="drive-health-metric-label">Temperature</span>
              <div className="drive-health-metric-value">
                <div className="drive-health-metric-bar">
                  <div
                    className="drive-health-metric-bar-fill"
                    style={{
                      width: `${Math.min(100, (temperature_celsius / 85) * 100)}%`,
                      background: tempColor,
                    }}
                  />
                </div>
                <span>{temperature_celsius}°C</span>
              </div>
            </div>
          )}

          {/* Reallocated sectors */}
          <div className="drive-health-metric-row">
            <span className="drive-health-metric-label">Reallocated sectors</span>
            <span
              className="drive-health-metric-value"
              style={{
                color:
                  reallocated_sectors === null || reallocated_sectors === undefined
                    ? "#94A3B8"
                    : reallocated_sectors === 0
                    ? "#4ADE80"
                    : "#FACC15",
              }}
            >
              {reallocated_sectors === null || reallocated_sectors === undefined
                ? "N/A"
                : reallocated_sectors === 0
                ? "0 - healthy"
                : `${reallocated_sectors} - warning`}
            </span>
          </div>

          {/* Power-on time */}
          <div className="drive-health-metric-row">
            <span className="drive-health-metric-label">Power-on time</span>
            <span className="drive-health-metric-value">
              {power_on_hours !== null && power_on_hours !== undefined
                ? `${power_on_hours} hours`
                : "N/A"}
            </span>
          </div>
        </div>
      </div>

      {/* Sección FILL FORECAST condicional */}
      {fill_forecast && (
        <div className="drive-health-forecast-section" data-testid="fill-forecast-section">
          <svg className="drive-health-forecast-svg" width="60" height="24" viewBox="0 0 60 24">
            <path
              d="M0 20 L20 16 L40 10 L60 2"
              fill="none"
              stroke="#00E5FF"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
          </svg>
          <div className="drive-health-forecast-text">
            Filling at about {fill_forecast.gb_per_day} GB per day — full in roughly{" "}
            {fill_forecast.full_in_weeks} weeks.
          </div>
        </div>
      )}
    </div>
  );
};
