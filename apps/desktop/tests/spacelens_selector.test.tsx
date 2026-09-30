import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpaceLensDriveSelector } from "../src/components/SpaceLensDriveSelector";
import { SpaceLensWelcome } from "../src/components/SpaceLensWelcome";
import { StorageDevice } from "../src/types/models";

const mockDevices: StorageDevice[] = [
  {
    id: "C:",
    label: "Disco Local (C:)",
    device_type: "local_disk",
    root_path: "C:\\",
    total_bytes: 2000000000000,
    used_bytes: 1400000000000,
    free_bytes: 600000000000,
    is_removable: false,
    icon_hint: "hard_drive",
    is_ready: true,
  },
  {
    id: "E:",
    label: "Kingston USB 64GB",
    device_type: "usb_drive",
    root_path: "E:\\",
    total_bytes: 64000000000,
    used_bytes: 48000000000,
    free_bytes: 16000000000,
    is_removable: true,
    icon_hint: "usb",
    is_ready: true,
  },
  {
    id: "mtp://device-01",
    label: "Teléfono Móvil MTP",
    device_type: "mtp_device",
    root_path: "mtp://device-01",
    total_bytes: 128000000000,
    used_bytes: 98000000000,
    free_bytes: 30000000000,
    is_removable: true,
    icon_hint: "phone",
    is_ready: false,
  },
];

describe("T007 & T022: SpaceLensDriveSelector & Welcome Selector", () => {
  it("renders trigger button with current device", () => {
    const onDeviceChange = vi.fn();
    render(
      <SpaceLensDriveSelector
        currentDevice={mockDevices[0]}
        devices={mockDevices}
        onDeviceChange={onDeviceChange}
      />
    );

    const trigger = screen.getByTestId("spacelens-drive-selector-button");
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent).toContain("Disco Local (C:)");
  });

  it("opens dropdown and shows grouped sections", () => {
    const onDeviceChange = vi.fn();
    render(
      <SpaceLensDriveSelector
        currentDevice={mockDevices[0]}
        devices={mockDevices}
        onDeviceChange={onDeviceChange}
      />
    );

    const trigger = screen.getByTestId("spacelens-drive-selector-button");
    fireEvent.click(trigger);

    expect(screen.getByText("DISCOS INTERNOS")).toBeInTheDocument();
    expect(screen.getByText("DISPOSITIVOS EXTERNOS")).toBeInTheDocument();
    expect(screen.getByText("DISPOSITIVOS MTP")).toBeInTheDocument();
    expect(screen.getByText("Kingston USB 64GB")).toBeInTheDocument();
    expect(screen.getByText("Teléfono Móvil MTP")).toBeInTheDocument();
  });

  it("emits onDeviceChange when a device option is clicked", () => {
    const onDeviceChange = vi.fn();
    render(
      <SpaceLensDriveSelector
        currentDevice={mockDevices[0]}
        devices={mockDevices}
        onDeviceChange={onDeviceChange}
      />
    );

    const trigger = screen.getByTestId("spacelens-drive-selector-button");
    fireEvent.click(trigger);

    const usbOption = screen.getByTestId("drive-option-E:");
    fireEvent.click(usbOption);

    expect(onDeviceChange).toHaveBeenCalledTimes(1);
    expect(onDeviceChange).toHaveBeenCalledWith(mockDevices[1]);
  });

  it("calls onRefresh when refresh button is clicked", () => {
    const onDeviceChange = vi.fn();
    const onRefresh = vi.fn();
    render(
      <SpaceLensDriveSelector
        currentDevice={mockDevices[0]}
        devices={mockDevices}
        onDeviceChange={onDeviceChange}
        onRefresh={onRefresh}
      />
    );

    fireEvent.click(screen.getByTestId("spacelens-drive-selector-button"));
    const refreshBtn = screen.getByTestId("refresh-devices-btn");
    fireEvent.click(refreshBtn);

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  // T022: Nuevos test cases para selector actualizado en Welcome y Dashboard
  it("T022(a): el selector de Welcome no renderiza un elemento <select> nativo", () => {
    const { container } = render(
      <SpaceLensWelcome
        devices={mockDevices}
        selectedDevice={mockDevices[0]}
        onSelectDevice={vi.fn()}
        onStartScan={vi.fn()}
      />
    );

    const nativeSelect = container.querySelector("select");
    expect(nativeSelect).toBeNull();
    expect(screen.getByTestId("spacelens-drive-selector-button")).toBeInTheDocument();
  });

  it("T022(b): el botón 'Elegir carpeta...' está presente con data-testid en Welcome y en el dropdown", () => {
    const onPickFolder = vi.fn();
    render(
      <SpaceLensWelcome
        devices={mockDevices}
        selectedDevice={mockDevices[0]}
        onSelectDevice={vi.fn()}
        onStartScan={vi.fn()}
        onPickFolder={onPickFolder}
      />
    );

    const welcomeFolderBtn = screen.getByTestId("welcome-pick-folder-btn");
    expect(welcomeFolderBtn).toBeInTheDocument();
    expect(welcomeFolderBtn.textContent).toContain("Elegir carpeta");

    // Abrir el dropdown dentro de Welcome y verificar que también tiene el botón en el footer
    fireEvent.click(screen.getByTestId("spacelens-drive-selector-button"));
    const dropdownFolderBtn = screen.getByTestId("pick-folder-btn");
    expect(dropdownFolderBtn).toBeInTheDocument();
  });

  it("T022(c): las unidades se agrupan por categoría en el selector de Welcome", () => {
    render(
      <SpaceLensWelcome
        devices={mockDevices}
        selectedDevice={mockDevices[0]}
        onSelectDevice={vi.fn()}
        onStartScan={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("spacelens-drive-selector-button"));

    expect(screen.getByText("DISCOS INTERNOS")).toBeInTheDocument();
    expect(screen.getByText("DISPOSITIVOS EXTERNOS")).toBeInTheDocument();
    expect(screen.getByText("DISPOSITIVOS MTP")).toBeInTheDocument();
  });

  it("T022(d): un dispositivo MTP con is_ready=false muestra aviso al intentar escanear", () => {
    const onStartScan = vi.fn();
    render(
      <SpaceLensWelcome
        devices={mockDevices}
        selectedDevice={mockDevices[2]} // MTP con is_ready: false
        onSelectDevice={vi.fn()}
        onStartScan={onStartScan}
      />
    );

    fireEvent.click(screen.getByTestId("welcome-start-scan-btn"));

    expect(onStartScan).not.toHaveBeenCalled();
    const warning = screen.getByTestId("welcome-mtp-warning");
    expect(warning).toBeInTheDocument();
    expect(warning.textContent).toContain("Transferencia de Archivos");
  });
});
