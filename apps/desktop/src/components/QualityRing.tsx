import React from "react";

export interface QualityRingProps {
  score: number; // 0 to 1
  size?: number; // default 40
}

export const QualityRing: React.FC<QualityRingProps> = ({
  score,
  size = 40,
}) => {
  const clamped = Math.max(0, Math.min(1, isNaN(score) ? 0 : score));
  const pct = Math.round(clamped * 100);

  let statusColor = "#EF4444";
  if (clamped >= 0.8) {
    statusColor = "#10B981";
  } else if (clamped >= 0.5) {
    statusColor = "#F59E0B";
  }

  const strokeWidth = Math.max(3, Math.round(size * 0.09));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clamped * circumference);

  return (
    <div
      className="quality-ring"
      data-testid="quality-ring"
      style={{
        position: "relative",
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* Track de fondo */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255, 255, 255, 0.12)"
          strokeWidth={strokeWidth}
        />
        {/* Arco de progreso */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={statusColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{ transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      <span
        style={{
          position: "absolute",
          fontSize: size <= 40 ? "10px" : "12px",
          fontWeight: 700,
          color: "#F8FAFC",
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {pct}%
      </span>
    </div>
  );
};
