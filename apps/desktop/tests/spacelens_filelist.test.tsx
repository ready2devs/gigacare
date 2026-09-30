import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  SpaceLensFileList,
  isProtectedSystemNode,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from "../src/components/SpaceLensFileList";
import { SpaceMapNode } from "../src/types/models";

const mockCurrentNode: SpaceMapNode = {
  name: "Luciano",
  path: "C:\\Users\\Luciano",
  size_bytes: 780 * 1024 * 1024 * 1024,
  is_directory: true,
  item_count: 48500,
  children: [],
};

const mockItems: SpaceMapNode[] = [
  {
    name: "Windows",
    path: "C:\\Windows",
    size_bytes: 42 * 1024 * 1024 * 1024,
    is_directory: true,
    is_system: true,
    children: [],
  },
  {
    name: "Workspace",
    path: "C:\\Users\\Luciano\\Workspace",
    size_bytes: 198 * 1024 * 1024 * 1024,
    is_directory: true,
    children: [],
  },
  {
    name: "Downloads",
    path: "C:\\Users\\Luciano\\Downloads",
    size_bytes: 120 * 1024 * 1024 * 1024,
    is_directory: true,
    children: [],
  },
  {
    name: "big_dataset.zip",
    path: "C:\\Users\\Luciano\\Downloads\\big_dataset.zip",
    size_bytes: 2500 * 1024 * 1024, // 2.5 GB
    is_directory: false,
    extension: "zip",
    children: [],
  },
  {
    name: "medium_file.iso",
    path: "C:\\Users\\Luciano\\Downloads\\medium_file.iso",
    size_bytes: 350 * 1024 * 1024, // 350 MB
    is_directory: false,
    extension: "iso",
    children: [],
  },
  {
    name: "small_note.txt",
    path: "C:\\Users\\Luciano\\Downloads\\small_note.txt",
    size_bytes: 50 * 1024, // 50 KB
    is_directory: false,
    extension: "txt",
    children: [],
  },
  {
    name: "vacation_photo.jpg",
    path: "C:\\Users\\Luciano\\Downloads\\vacation_photo.jpg",
    size_bytes: 5 * 1024 * 1024, // 5 MB
    is_directory: false,
    extension: "jpg",
    children: [],
  },
  {
    name: "tutorial_video.mp4",
    path: "C:\\Users\\Luciano\\Downloads\\tutorial_video.mp4",
    size_bytes: 800 * 1024 * 1024, // 800 MB
    is_directory: false,
    extension: "mp4",
    children: [],
  },
  {
    name: "system_photo.jpg",
    path: "C:\\Windows\\system_photo.jpg",
    size_bytes: 2 * 1024 * 1024,
    is_directory: false,
    is_system: true,
    extension: "jpg",
    children: [],
  },
];

describe("T022-T028: SpaceLensFileList", () => {
  it("T022 & T023: renders panel header with size, items count, and sorted rows", () => {
    const onSelectionChange = vi.fn();
    const onNavigate = vi.fn();

    render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={new Set()}
        onSelectionChange={onSelectionChange}
        onNavigate={onNavigate}
      />
    );

    expect(screen.getByText("Luciano")).toBeInTheDocument();
    expect(screen.getByText("48,500 items")).toBeInTheDocument();

    // Verify row elements
    const workspaceRow = screen.getByTestId("filelist-row-Workspace");
    expect(workspaceRow).toBeInTheDocument();
    expect(screen.getByTestId("checkbox-Workspace")).toBeInTheDocument();
    expect(screen.getByTestId("info-btn-Workspace")).toBeInTheDocument();
  });

  it("T024: handles selection filter dropdown (all, none, >100mb, >1gb)", () => {
    let selected = new Set<string>();
    const onSelectionChange = vi.fn((next) => {
      selected = next;
    });
    const onNavigate = vi.fn();

    const { rerender } = render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={selected}
        onSelectionChange={onSelectionChange}
        onNavigate={onNavigate}
      />
    );

    const filterSelect = screen.getByTestId("spacelens-select-filter");

    // Select "all" -> should select all non-protected items (Workspace, Downloads, big_dataset, medium_file, small_note), but NOT Windows
    fireEvent.change(filterSelect, { target: { value: "all" } });
    expect(onSelectionChange).toHaveBeenCalled();
    expect(selected.has("C:\\Windows")).toBe(false);
    expect(selected.has("C:\\Users\\Luciano\\Workspace")).toBe(true);

    // Select "> 1gb" -> should select big_dataset.zip (2.5GB) only among files
    fireEvent.change(filterSelect, { target: { value: "gt1gb" } });
    expect(selected.has("C:\\Users\\Luciano\\Downloads\\big_dataset.zip")).toBe(true);
    expect(selected.has("C:\\Users\\Luciano\\Downloads\\medium_file.iso")).toBe(false);

    // Select "none"
    fireEvent.change(filterSelect, { target: { value: "none" } });
    expect(selected.size).toBe(0);
  });

  it("T025: double click on folder navigates into it", () => {
    const onNavigate = vi.fn();
    render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={new Set()}
        onSelectionChange={vi.fn()}
        onNavigate={onNavigate}
      />
    );

    const downloadsRow = screen.getByTestId("filelist-row-Downloads");
    fireEvent.doubleClick(downloadsRow);

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ name: "Downloads" }));
  });

  it("T026: disables checkbox for system folders and for all items in MTP mode", () => {
    const { rerender } = render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={new Set()}
        onSelectionChange={vi.fn()}
        onNavigate={vi.fn()}
        isMtpDevice={false}
      />
    );

    const windowsCheckbox = screen.getByTestId("checkbox-Windows") as HTMLInputElement;
    expect(windowsCheckbox.disabled).toBe(true);

    const workspaceCheckbox = screen.getByTestId("checkbox-Workspace") as HTMLInputElement;
    expect(workspaceCheckbox.disabled).toBe(false);

    // Now re-render as MTP mode
    rerender(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={new Set()}
        onSelectionChange={vi.fn()}
        onNavigate={vi.fn()}
        isMtpDevice={true}
      />
    );

    expect(screen.getByTestId("mtp-readonly-banner")).toBeInTheDocument();
    expect((screen.getByTestId("checkbox-Workspace") as HTMLInputElement).disabled).toBe(true);
  });

  it("T027: info button opens path or logs feedback", async () => {
    render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={new Set()}
        onSelectionChange={vi.fn()}
        onNavigate={vi.fn()}
      />
    );

    const infoBtn = screen.getByTestId("info-btn-Workspace");
    fireEvent.click(infoBtn);
    // Should render toast with path
    const toast = await screen.findByTestId("spacelens-info-toast");
    expect(toast).toHaveTextContent("Workspace");
  });

  it("T028: syncs hover state with row highlight and onItemHover callback", () => {
    const onItemHover = vi.fn();
    render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={new Set()}
        onSelectionChange={vi.fn()}
        onNavigate={vi.fn()}
        hoveredPath="C:\\Users\\Luciano\\Downloads"
        onItemHover={onItemHover}
      />
    );

    const downloadsRow = screen.getByTestId("filelist-row-Downloads");
    expect(downloadsRow.classList.contains("hovered")).toBe(true);

    fireEvent.mouseEnter(downloadsRow);
    expect(onItemHover).toHaveBeenCalledWith(expect.objectContaining({ name: "Downloads" }));

    fireEvent.mouseLeave(downloadsRow);
    expect(onItemHover).toHaveBeenCalledWith(null);
  });

  // T009: Nuevos test cases para filtros de media (RF-002)
  it("T009(a): filtro 'photos' selecciona solo archivos con extensiones de imagen", () => {
    let selected = new Set<string>();
    const onSelectionChange = vi.fn((next) => { selected = next; });

    render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={selected}
        onSelectionChange={onSelectionChange}
        onNavigate={vi.fn()}
      />
    );

    const filterSelect = screen.getByTestId("spacelens-select-filter");
    fireEvent.change(filterSelect, { target: { value: "photos" } });

    expect(onSelectionChange).toHaveBeenCalled();
    // jpg debe estar seleccionado
    expect(selected.has("C:\\Users\\Luciano\\Downloads\\vacation_photo.jpg")).toBe(true);
    // mp4 NO debe estar seleccionado
    expect(selected.has("C:\\Users\\Luciano\\Downloads\\tutorial_video.mp4")).toBe(false);
    // zip NO debe estar seleccionado
    expect(selected.has("C:\\Users\\Luciano\\Downloads\\big_dataset.zip")).toBe(false);
  });

  it("T009(b): filtro 'videos' selecciona solo archivos con extensiones de video", () => {
    let selected = new Set<string>();
    const onSelectionChange = vi.fn((next) => { selected = next; });

    render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={selected}
        onSelectionChange={onSelectionChange}
        onNavigate={vi.fn()}
      />
    );

    const filterSelect = screen.getByTestId("spacelens-select-filter");
    fireEvent.change(filterSelect, { target: { value: "videos" } });

    expect(onSelectionChange).toHaveBeenCalled();
    // mp4 debe estar seleccionado
    expect(selected.has("C:\\Users\\Luciano\\Downloads\\tutorial_video.mp4")).toBe(true);
    // jpg NO debe estar seleccionado
    expect(selected.has("C:\\Users\\Luciano\\Downloads\\vacation_photo.jpg")).toBe(false);
  });

  it("T009(c): filtros de media respetan isProtectedSystemNode (nodo protegido no se selecciona)", () => {
    let selected = new Set<string>();
    const onSelectionChange = vi.fn((next) => { selected = next; });

    render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={selected}
        onSelectionChange={onSelectionChange}
        onNavigate={vi.fn()}
      />
    );

    const filterSelect = screen.getByTestId("spacelens-select-filter");
    fireEvent.change(filterSelect, { target: { value: "photos" } });

    // El archivo de sistema (system_photo.jpg en C:\Windows) NO debe seleccionarse
    expect(selected.has("C:\\Windows\\system_photo.jpg")).toBe(false);
    // Pero la foto normal sí
    expect(selected.has("C:\\Users\\Luciano\\Downloads\\vacation_photo.jpg")).toBe(true);
  });

  it("T009(d): cambiar un checkbox individual tras seleccionar 'photos' cambia selectFilter a 'custom'", () => {
    let selected = new Set<string>(["C:\\Users\\Luciano\\Downloads\\vacation_photo.jpg"]);
    const onSelectionChange = vi.fn((next) => { selected = next; });

    const { rerender } = render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={selected}
        onSelectionChange={onSelectionChange}
        onNavigate={vi.fn()}
      />
    );

    // Simular click en checkbox individual de un archivo no-foto
    const txtCheckbox = screen.getByTestId("checkbox-small_note.txt");
    fireEvent.click(txtCheckbox);

    // El filtro debería volver a "custom" al modificar individualmente
    expect(onSelectionChange).toHaveBeenCalled();
    // El dropdown debería mostrar "custom" (controlled by state internally)
    const filterSelect = screen.getByTestId("spacelens-select-filter") as HTMLSelectElement;
    expect(filterSelect.value).toBe("custom");
  });

  it("T009(e): onFilterChange se invoca al cambiar el filtro y al alternar un checkbox", () => {
    const onFilterChange = vi.fn();
    const onSelectionChange = vi.fn();

    render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={new Set()}
        onSelectionChange={onSelectionChange}
        onNavigate={vi.fn()}
        onFilterChange={onFilterChange}
      />
    );

    const filterSelect = screen.getByTestId("spacelens-select-filter");

    // Cambiar a photos
    fireEvent.change(filterSelect, { target: { value: "photos" } });
    expect(onFilterChange).toHaveBeenCalledWith("photos");

    // Cambiar a videos
    fireEvent.change(filterSelect, { target: { value: "videos" } });
    expect(onFilterChange).toHaveBeenCalledWith("videos");

    // Cambiar a gt100mb
    fireEvent.change(filterSelect, { target: { value: "gt100mb" } });
    expect(onFilterChange).toHaveBeenCalledWith("gt100mb");

    // Toggle de un checkbox individual comunica 'custom' a onFilterChange
    const noteCheckbox = screen.getByTestId("checkbox-small_note.txt");
    fireEvent.click(noteCheckbox);
    expect(onFilterChange).toHaveBeenCalledWith("custom");
  });

  it("T009(f): respeta la prop selectFilter provista desde el componente padre", () => {
    const { rerender } = render(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={new Set()}
        onSelectionChange={vi.fn()}
        onNavigate={vi.fn()}
        selectFilter="photos"
      />
    );

    const filterSelect = screen.getByTestId("spacelens-select-filter") as HTMLSelectElement;
    expect(filterSelect.value).toBe("photos");

    rerender(
      <SpaceLensFileList
        currentNode={mockCurrentNode}
        items={mockItems}
        selectedPaths={new Set()}
        onSelectionChange={vi.fn()}
        onNavigate={vi.fn()}
        selectFilter="videos"
      />
    );

    expect(filterSelect.value).toBe("videos");
  });
});
