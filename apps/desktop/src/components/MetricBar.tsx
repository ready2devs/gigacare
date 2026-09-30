import React, { useEffect, useState } from "react";

export interface MetricBarProps {
  label: string;
  value: number; // 0 to 1
  size?: "sm" | "lg";
}

export const MetricBar: React.FC<MetricBarProps> = ({
  label,
  value,
  size = "sm",
}) => {
  const clamped = Math.max(0, Math.min(1, isNaN(value) ? 0 : value));
  const pct = Math.round(clamped * 100);
  const [animatedWidth, setAnimatedWidth] = useState<number>(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setAnimatedWidth(pct);
    }, 40);
    return () => clearTimeout(t);
  }, [pct]);

  let statusColor = "#EF4444"; // < 0.5 (red)
  let statusClass = "red";
  if (clamped >= 0.8) {
    statusColor = "#10B981"; // >= 0.8 (green)
    statusClass = "green";
  } else if (clamped >= 0.5) {
    statusColor = "#F59E0B"; // 0.5-0.79 (amber)
    statusClass = "amber";
  }

  const trackHeight = size === "lg" ? "6px" : "4px";

  return (
    <div
      className="metric-bar"
      data-testid="metric-bar"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        fontSize: "11px",
        color: "#94A3B8",
      }}
    >
      <span
        className="metric-bar-label"
        style={{ minWidth: "80px", color: "#94A3B8" }}
      >
        {label}
      </span>

      <div
        className="metric-bar-track"
        style={{
          flex: 1,
          height: trackHeight,
          background: "rgba(255, 255, 255, 0.08)",
          borderRadius: "3px",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div
          className={`metric-bar-fill ${statusClass}`}
          data-testid="metric-bar-fill"
          style={{
            width: `${animatedWidth}%`,
            height: "100%",
            borderRadius: "3px",
            background: statusColor,
            transition: "width 600ms ease-out",
          }}
        />
      </div>

      <span
        className="metric-bar-value"
        data-testid="metric-bar-value"
        style={{
          minWidth: "32px",
          textAlign: "right",
          color: statusColor,
          fontWeight: size === "lg" ? 700 : 600,
        }}
      >
        {pct}%
      </span>
    </div>
  );
};
