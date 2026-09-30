import React from "react";

export const SkeletonPhotoCard: React.FC = () => {
  return (
    <div
      className="skeleton-card"
      data-testid="skeleton-photo-card"
      style={{
        minWidth: "220px",
        maxWidth: "260px",
        borderRadius: "14px",
        background: "rgba(15, 23, 42, 0.6)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Thumbnail shimmer area */}
      <div
        className="skeleton-thumbnail shimmer"
        style={{
          width: "100%",
          height: "170px",
          background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)",
          backgroundSize: "200% 100%",
        }}
      />

      {/* Content lines */}
      <div style={{ padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div
          className="skeleton-line shimmer"
          style={{
            width: "70%",
            height: "12px",
            borderRadius: "4px",
            background: "rgba(255, 255, 255, 0.08)",
          }}
        />
        <div
          className="skeleton-line shimmer"
          style={{
            width: "100%",
            height: "8px",
            borderRadius: "4px",
            background: "rgba(255, 255, 255, 0.05)",
          }}
        />
        <div
          className="skeleton-line shimmer"
          style={{
            width: "100%",
            height: "8px",
            borderRadius: "4px",
            background: "rgba(255, 255, 255, 0.05)",
          }}
        />
        <div
          className="skeleton-line shimmer"
          style={{
            width: "100%",
            height: "10px",
            borderRadius: "4px",
            background: "rgba(255, 255, 255, 0.06)",
            marginTop: "2px",
          }}
        />
      </div>
    </div>
  );
};
