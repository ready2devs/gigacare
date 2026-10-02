import React from "react";

export interface ReviewCategory {
  id: string;
  name: string;
  totalBytes: number;
}

export interface ReviewCategoryListProps {
  categories: ReviewCategory[];
  selected: string;
  onSelect: (id: string) => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export const ReviewCategoryList: React.FC<ReviewCategoryListProps> = ({
  categories,
  selected,
  onSelect,
}) => {
  return (
    <div className="review-panel-left" data-testid="review-category-list">
      {categories.map((cat) => {
        const isSelected = cat.id === selected;
        return (
          <div
            key={cat.id}
            data-testid={`category-item-${cat.id}`}
            className={`review-cat-item ${isSelected ? "selected" : ""}`}
            onClick={() => onSelect(cat.id)}
          >
            <div className="review-cat-header">
              <div className="review-cat-bullet" />
              <span>{cat.name}</span>
            </div>
            <div className="review-cat-size">
              {formatBytes(cat.totalBytes)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
