import { describe, it, expect, vi } from "vitest";
import "../src/mockTauriBridge"; // activates mock on window
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { StorageDevice, DiskInfo, SpaceMapNode, SpaceLensScanProgress } from "../src/types/models";

describe("SpaceLens Mock Tauri Bridge (T009 - T014)", () => {
  it("T009: list_storage_devices returns 4 devices", async () => {
    const devices = await invoke<StorageDevice[]>("list_storage_devices");
    expect(devices).toHaveLength(4);

    const c = devices.find((d) => d.id === "C:");
    expect(c).toBeDefined();
    expect(c?.label.toLowerCase()).toContain("disco local");
    expect(c?.device_type).toBe("local_disk");
    expect(c?.total_bytes).toBeGreaterThan(1.5 * 1024 * 1024 * 1024 * 1024);

    const d = devices.find((d) => d.id === "D:");
    expect(d).toBeDefined();
    expect(d?.device_type).toBe("local_disk");

    const usb = devices.find((d) => d.id === "E:");
    expect(usb).toBeDefined();
    expect(usb?.device_type).toBe("usb_drive");
    expect(usb?.is_removable).toBe(true);

    const phone = devices.find((d) => d.device_type === "mtp_device");
    expect(phone).toBeDefined();
    expect(phone?.label).toContain("Samsung Galaxy S24");
    expect(phone?.is_removable).toBe(true);
  });

  it("T013: get_disk_info returns correct info per drive", async () => {
    const infoC = await invoke<DiskInfo>("get_disk_info", { drive: "C:\\" });
    expect(infoC.total_bytes).toBeGreaterThan(1.5 * 1024 * 1024 * 1024 * 1024);

    const infoD = await invoke<DiskInfo>("get_disk_info", { drive: "D:\\" });
    expect(infoD.total_bytes).toBe(1024 * 1024 * 1024 * 1024);

    const infoE = await invoke<DiskInfo>("get_disk_info", { drive: "E:\\" });
    expect(infoE.total_bytes).toBe(64 * 1024 * 1024 * 1024);

    const infoPhone = await invoke<DiskInfo>("get_disk_info", { drive: "mtp://Samsung-Galaxy-S24" });
    expect(infoPhone.total_bytes).toBe(128 * 1024 * 1024 * 1024);
  });

  it("T010 & T014: build_space_map for C: emits progress and returns 2TB dynamic tree with deep navigation", async () => {
    const progressEvents: SpaceLensScanProgress[] = [];
    const unlisten = await listen<SpaceLensScanProgress>("spacelens-scan-progress", (ev) => {
      progressEvents.push(ev.payload);
    });

    const root = await invoke<SpaceMapNode>("build_space_map", { root_path: "C:\\" });
    expect(root.name).toContain("Disco Local");
    expect(root.size_bytes).toBe(2 * 1024 * 1024 * 1024 * 1024);
    expect(progressEvents.length).toBe(5);

    const winNode = root.children.find((c) => c.name === "Windows");
    expect(winNode).toBeDefined();
    expect(winNode?.is_system).toBe(true);

    // Deep navigation to Downloads
    const downloads = await invoke<SpaceMapNode>("build_space_map", {
      root_path: "C:\\Users\\Luciano\\Downloads",
    });
    expect(downloads.name).toBe("Downloads");
    expect(downloads.children.length).toBeGreaterThan(5);

    const isoFile = downloads.children.find((c) => c.extension === "iso");
    expect(isoFile).toBeDefined();
    expect(isoFile?.is_directory).toBe(false);

    unlisten();
  }, 10000);

  it("T011: build_space_map for Galaxy S24 generates internal storage and 200+ photos in Camera", async () => {
    const s24Root = await invoke<SpaceMapNode>("build_space_map", {
      root_path: "mtp://Samsung-Galaxy-S24",
    });
    expect(s24Root.name).toBe("Almacenamiento interno");
    expect(s24Root.children.some((c) => c.name === "DCIM")).toBe(true);

    const camera = await invoke<SpaceMapNode>("build_space_map", {
      root_path: "mtp://Samsung-Galaxy-S24/Almacenamiento interno/DCIM/Camera",
    });
    expect(camera.children.length).toBeGreaterThan(200);
  }, 10000);

  it("T012: build_space_map for Kingston USB generates folders with files", async () => {
    const usbRoot = await invoke<SpaceMapNode>("build_space_map", {
      root_path: "E:\\",
    });
    expect(usbRoot.children.some((c) => c.name === "Backups")).toBe(true);
    expect(usbRoot.children.some((c) => c.name === "Películas")).toBe(true);

    const backups = await invoke<SpaceMapNode>("build_space_map", {
      root_path: "E:\\Backups",
    });
    expect(backups.children.some((c) => c.extension === "zip")).toBe(true);
  }, 10000);
});
