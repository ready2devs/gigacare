import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "../src/mockTauriBridge"; // Activate web mock
import { SpaceMap } from "../src/components/SpaceMap";

describe("T008, T031-T037: SpaceLens Integration Flow in SpaceMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T033: renders 4-zone layout: top nav, file list, bubbles canvas, and status bar", async () => {
    render(<SpaceMap initialMode="explored" />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByTestId("spacelens-root")).toBeInTheDocument();
      expect(screen.getByTestId("spacelens-top-nav")).toBeInTheDocument();
      expect(screen.getByTestId("spacelens-filelist-panel")).toBeInTheDocument();
      expect(screen.getByTestId("spacelens-canvas")).toBeInTheDocument();
      expect(screen.getByTestId("spacelens-status-bar")).toBeInTheDocument();
    }, { timeout: 8000 });
  }, 10000);

  it("T034 & T035: navigation down, back ◀ and forward ▶ buttons with history stack", async () => {
    render(<SpaceMap initialMode="explored" />);

    // Wait until items are rendered
    const usersRow = await screen.findByTestId("filelist-row-Users", {}, { timeout: 8000 });
    expect(usersRow).toBeInTheDocument();

    const backBtn = screen.getByTestId("nav-back-button") as HTMLButtonElement;
    const forwardBtn = screen.getByTestId("nav-forward-button") as HTMLButtonElement;

    expect(backBtn).toBeDisabled();
    expect(forwardBtn).toBeDisabled();

    // Double click to navigate into Users
    fireEvent.doubleClick(usersRow);

    // After navigation, back button should become enabled
    await waitFor(() => {
      expect(backBtn).not.toBeDisabled();
    }, { timeout: 8000 });

    // Click Back ◀
    fireEvent.click(backBtn);

    // Should return to root and forward button should be enabled
    await waitFor(() => {
      expect(forwardBtn).not.toBeDisabled();
      expect(screen.getByTestId("filelist-row-Users")).toBeInTheDocument();
    }, { timeout: 8000 });

    // Click Forward ▶
    fireEvent.click(forwardBtn);
    await waitFor(() => {
      expect(screen.getByTestId("filelist-row-Luciano")).toBeInTheDocument();
    }, { timeout: 8000 });
  }, 25000);

  it("T008: changing device updates breadcrumbs, resets history, and loads new device", async () => {
    render(<SpaceMap initialMode="explored" />);

    await waitFor(() => {
      expect(screen.getByTestId("spacelens-drive-selector-button")).toBeInTheDocument();
    }, { timeout: 8000 });

    // Open drive selector
    fireEvent.click(screen.getByTestId("spacelens-drive-selector-button"));

    // Select USB Kingston 64GB
    const usbOption = await screen.findByTestId("drive-option-E:");
    fireEvent.click(usbOption);

    // Should load USB device content
    await waitFor(() => {
      expect(screen.getAllByText(/Kingston/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId("filelist-row-Backups")).toBeInTheDocument();
    }, { timeout: 8000 });
  }, 15000);

  it("T031 & T032: review and clean flow opens dialog and cleans items", async () => {
    render(<SpaceMap initialMode="explored" />);

    await waitFor(() => {
      expect(screen.getByTestId("filelist-row-Users")).toBeInTheDocument();
    }, { timeout: 8000 });

    // Select Users checkbox
    const usersCb = screen.getByTestId("checkbox-Users") as HTMLInputElement;
    fireEvent.click(usersCb);

    // Review button should now be enabled
    const reviewBtn = screen.getByTestId("review-clean-button") as HTMLButtonElement;
    expect(reviewBtn).not.toBeDisabled();

    // Click review and clean
    fireEvent.click(reviewBtn);

    // Confirm dialog should be open
    expect(await screen.findByText(/Confirmar Limpieza a Cuarentena/i)).toBeInTheDocument();

    // Click confirm in dialog
    const confirmBtn = screen.getByText(/Confirmar y Mover/i);
    fireEvent.click(confirmBtn);

    // Toast message should appear
    await waitFor(() => {
      expect(screen.getByTestId("spacelens-success-toast")).toBeInTheDocument();
    }, { timeout: 8000 });
  }, 20000);
});