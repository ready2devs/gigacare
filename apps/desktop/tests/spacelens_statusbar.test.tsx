import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpaceLensStatusBar } from "../src/components/SpaceLensStatusBar";
import { StorageDevice } from "../src/types/models";

const mockLocalDisk: StorageDevice = {
  id: "C:",
  label: "Disco Local (C:)",
  device_type: "local_disk",
  root_path: "C:\\",
  total_bytes: 2 * 1024 * 1024 * 1024 * 1024,
  used_bytes: Math.round(1.4 * 1024 * 1024 * 1024 * 1024),
  free_bytes: Math.round(0.6 * 1024 * 1024 * 1024 * 1024),
  is_removable: false,
  icon_hint: "hard_drive",
  is_ready: true,
};

const mockMtpDevice: StorageDevice = {
  id: "mtp://samsung",
  label: "Samsung Galaxy S24",
  device_type: "mtp_device",
  root_path: "mtp://samsung",
  total_bytes: 128 * 1024 * 1024 * 1024,
  used_bytes: 98 * 1024 * 1024 * 1024,
  free_bytes: 30 * 1024 * 1024 * 1024,
  is_removable: true,
  icon_hint: "phone",
  is_ready: true,
};

describe("T029-T030: SpaceLensStatusBar", () => {
  it("renders disk info and disabled review button when nothing is selected", () => {
    const onReview = vi.fn();
    render(
      <SpaceLensStatusBar
        currentDevice={mockLocalDisk}
        selectedCount={0}
        selectedBytes={0}
        onReviewAndClean={onReview}
      />
    );

    expect(screen.getByText("Disco Local (C:)")).toBeInTheDocument();
    expect(screen.getByText(/usado/)).toBeInTheDocument();

    const cleanBtn = screen.getByTestId("review-clean-button") as HTMLButtonElement;
    expect(cleanBtn).toBeDisabled();
  });

  it("updates count and size dynamically and enables review button when items are selected", () => {
    const onReview = vi.fn();
    render(
      <SpaceLensStatusBar
        currentDevice={mockLocalDisk}
        selectedCount={3}
        selectedBytes={3 * 1024 * 1024 * 1024}
        onReviewAndClean={onReview}
      />
    );

    expect(screen.getByTestId("selected-count-text")).toHaveTextContent("3 elementos seleccionados");
    expect(screen.getByTestId("selected-bytes-text")).toHaveTextContent("3 GB");

    const cleanBtn = screen.getByTestId("review-clean-button") as HTMLButtonElement;
    expect(cleanBtn).not.toBeDisabled();

    fireEvent.click(cleanBtn);
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  it("renders MTP read-only badge and no review button when active device is MTP", () => {
    render(
      <SpaceLensStatusBar
        currentDevice={mockMtpDevice}
        selectedCount={0}
        selectedBytes={0}
        onReviewAndClean={vi.fn()}
      />
    );

    expect(screen.getByTestId("mtp-status-badge")).toBeInTheDocument();
    expect(screen.queryByTestId("review-clean-button")).not.toBeInTheDocument();
  });
});
