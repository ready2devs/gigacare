import React from "react";

export interface ReviewSubcategory {
  id: string;
  name: string;
  sizeBytes: number;
  checked: boolean;
}

export interface ReviewSubcategoryListProps {
  subcategories: ReviewSubcategory[];
  selected: string;
  onSelect: (id: string) => void;
  onToggleSubcategory?: (id: string, checked: boolean) => void;
  isAppFilter?: boolean;
  selectedAppFilter?: string;
  onSelectAppFilter?: (filter: string) => void;
  isPlaceholder?: boolean;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const ReviewSubcategoryList: React.FC<ReviewSubcategoryListProps> = ({
  subcategories,
  selected,
  onSelect,
  onToggleSubcategory,
  isAppFilter,
  selectedAppFilter,
  onSelectAppFilter,
  isPlaceholder,
}) => {
  if (isPlaceholder) {
    return (
      <div className="review-panel-center" data-testid="review-subcategory-list">
        <div className="review-placeholder-box" data-testid="multimedia-placeholder">
          Módulo multimedia sin sentido en desarrollo para futura especificación.
        </div>
      </div>
    );
  }

  if (isAppFilter) {
    const filters = [
      { id: "1_year", label: "> 1 año sin uso" },
      { id: "2_years", label: "> 2 años sin uso" },
      { id: "never", label: "Nunca usadas" },
    ];
    return (
      <div className="review-panel-center" data-testid="review-subcategory-list">
        <div className="review-radio-group" data-testid="app-filter-radio-group">
          {filters.map((f) => (
            <label key={f.id} className="review-radio-label">
              <input
                type="radio"
                name="appFilter"
                value={f.id}
                checked={selectedAppFilter === f.id}
                onChange={() => onSelectAppFilter && onSelectAppFilter(f.id)}
              />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="review-panel-center" data-testid="review-subcategory-list">
      {subcategories.map((sub) => {
        const isSelected = sub.id === selected;
        return (
          <div
            key={sub.id}
            data-testid={`subcategory-item-${sub.id}`}
            className={`review-subcat-item ${isSelected ? "selected" : ""}`}
            onClick={() => onSelect(sub.id)}
          >
            <div className="review-subcat-left">
              <input
                type="checkbox"
                checked={sub.checked}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  onToggleSubcategory &&
                  onToggleSubcategory(sub.id, e.target.checked)
                }
              />
              <div className="review-subcat-info">
                <span className="review-subcat-name">{sub.name}</span>
                <span className="review-subcat-size">
                  {formatBytes(sub.sizeBytes)}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
