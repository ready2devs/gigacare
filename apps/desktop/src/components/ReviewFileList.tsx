import React from "react";
import { DocumentRegular, FolderRegular } from "@fluentui/react-icons";

export interface ReviewFileItem {
  path: string;
  name: string;
  sizeBytes: number;
  isDirectory?: boolean;
  date?: string;
}

export interface ReviewFileListProps {
  items: ReviewFileItem[];
  selectedPaths: Set<string>;
  onToggle: (path: string) => void;
  onToggleAll: (selectAll: boolean) => void;
  sortBy: "size" | "name" | "date";
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const ReviewFileList: React.FC<ReviewFileListProps> = ({
  items,
  selectedPaths,
  onToggle,
  onToggleAll,
  sortBy,
}) => {
  const sortedItems = [...items].sort((a, b) => {
    if (sortBy === "size") {
      return b.sizeBytes - a.sizeBytes;
    }
    if (sortBy === "name") {
      return a.name.localeCompare(b.name);
    }
    if (sortBy === "date") {
      return (b.date || "").localeCompare(a.date || "");
    }
    return 0;
  });

  const allSelected =
    sortedItems.length > 0 &&
    sortedItems.every((item) => selectedPaths.has(item.path));

  // Truncate name if > 40 chars
  const truncate = (str: string, len = 40) => {
    if (str.length <= len) return str;
    return str.slice(0, len) + "...";
  };

  return (
    <div className="review-panel-right" data-testid="review-file-list">
      {/* Header */}
      <div className="review-file-header">
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            data-testid="select-all-checkbox"
            checked={allSelected}
            onChange={(e) => onToggleAll(e.target.checked)}
          />
          <span>Seleccionar todos</span>
        </label>
        <span>Archivos ({sortedItems.length})</span>
      </div>

      {/* List items */}
      <div className="review-file-list-scroll">
        {sortedItems.map((item) => {
          const isChecked = selectedPaths.has(item.path);
          return (
            <div
              key={item.path}
              data-testid={`file-row-${item.path}`}
              className="review-file-item"
              onClick={() => onToggle(item.path)}
              style={{ cursor: "pointer" }}
            >
              <div className="review-file-left">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggle(item.path)}
                />
                {item.isDirectory ? (
                  <FolderRegular style={{ color: "#38BDF8", fontSize: "16px" }} />
                ) : (
                  <DocumentRegular style={{ color: "#94A3B8", fontSize: "16px" }} />
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                  <span className="review-file-name" title={item.path}>
                    {truncate(item.name)}
                  </span>
                  {item.date && (
                    <span style={{ fontSize: "11px", color: "#64748B" }}>
                      {item.date}
                    </span>
                  )}
                </div>
              </div>
              <span className="review-file-size">
                {formatBytes(item.sizeBytes)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
