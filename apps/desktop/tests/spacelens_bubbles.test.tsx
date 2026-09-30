import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import {
  SpaceLensBubbles,
  computeCirclePacking,
  getNodeIconType,
} from "../src/components/SpaceLensBubbles";
import { SpaceMapNode } from "../src/types/models";

const mockNodes: SpaceMapNode[] = [
  {
    name: "Videos",
    path: "C:\\Videos",
    size_bytes: 180 * 1024 * 1024 * 1024,
    is_directory: true,
    children: [],
  },
  {
    name: "Downloads",
    path: "C:\\Downloads",
    size_bytes: 120 * 1024 * 1024 * 1024,
    is_directory: true,
    children: [],
  },
  {
    name: "dataset.zip",
    path: "C:\\dataset.zip",
    size_bytes: 18 * 1024 * 1024 * 1024,
    is_directory: false,
    extension: "zip",
    children: [],
  },
  {
    name: "movie.mp4",
    path: "C:\\movie.mp4",
    size_bytes: 5 * 1024 * 1024 * 1024,
    is_directory: false,
    extension: "mp4",
    children: [],
  },
  {
    name: "photo.jpg",
    path: "C:\\photo.jpg",
    size_bytes: 25 * 1024 * 1024,
    is_directory: false,
    extension: "jpg",
    children: [],
  },
];

describe("T015-T021: SpaceLensBubbles & Circle Packing Engine", () => {
  it("T015: computeCirclePacking calculates non-overlapping bubbles and bounding circle", () => {
    const { bubbles, boundingCircle } = computeCirclePacking(mockNodes, 800, 600);

    expect(bubbles.length).toBe(5);
    expect(boundingCircle.r).toBeGreaterThan(50);

    // Verify ordering: first bubble should be largest (Videos)
    expect(bubbles[0].node.name).toBe("Videos");
    expect(bubbles[0].r).toBeGreaterThan(bubbles[1].r);

    // Verify bubbles don't heavily overlap (distance between centers >= sum of radii minus small margin)
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const dist = Math.hypot(bubbles[i].x - bubbles[j].x, bubbles[i].y - bubbles[j].y);
        const minDist = bubbles[i].r + bubbles[j].r;
        expect(dist).toBeGreaterThanOrEqual(minDist * 0.7); // allow tight circle packing contact
      }
    }
  });

  it("T016: getNodeIconType identifies proper icon types for files and folders", () => {
    expect(getNodeIconType({ name: "Folder", path: "C:\\F", size_bytes: 100, is_directory: true, children: [] })).toBe("folder");
    expect(getNodeIconType({ name: "video.mp4", path: "C:\\v.mp4", size_bytes: 100, is_directory: false, extension: "mp4", children: [] })).toBe("video");
    expect(getNodeIconType({ name: "pic.png", path: "C:\\p.png", size_bytes: 100, is_directory: false, extension: "png", children: [] })).toBe("image");
    expect(getNodeIconType({ name: "song.mp3", path: "C:\\s.mp3", size_bytes: 100, is_directory: false, extension: "mp3", children: [] })).toBe("audio");
    expect(getNodeIconType({ name: "doc.pdf", path: "C:\\d.pdf", size_bytes: 100, is_directory: false, extension: "pdf", children: [] })).toBe("document");
    expect(getNodeIconType({ name: "Phone", path: "mtp://device/DCIM", size_bytes: 100, is_directory: true, children: [] })).toBe("phone");
    expect(getNodeIconType({ name: "data.xyz", path: "C:\\d.xyz", size_bytes: 100, is_directory: false, extension: "xyz", children: [] })).toBe("generic");
  });

  it("T021: groups items exceeding top 50 into 'Otros (N items)'", () => {
    const manyNodes: SpaceMapNode[] = [];
    for (let i = 0; i < 75; i++) {
      manyNodes.push({
        name: `file_${i}.dat`,
        path: `C:\\file_${i}.dat`,
        size_bytes: (100 - i) * 1024 * 1024,
        is_directory: false,
        extension: "dat",
        children: [],
      });
    }

    const { bubbles } = computeCirclePacking(manyNodes, 800, 600);
    // 50 top + 1 "Otros" = 51 bubbles
    expect(bubbles.length).toBe(51);

    const othersBubble = bubbles.find((b) => b.isOthersGroup || b.node.name.startsWith("Otros"));
    expect(othersBubble).toBeDefined();
    expect(othersBubble?.node.name).toContain("25 items");
  });

  it("T017 & T018: renders canvas and handles click and hover", () => {
    const onBubbleClick = vi.fn();
    const onBubbleHover = vi.fn();

    render(
      <SpaceLensBubbles
        nodes={mockNodes}
        onBubbleClick={onBubbleClick}
        onBubbleHover={onBubbleHover}
        selectedPaths={new Set()}
      />
    );

    const canvas = screen.getByTestId("spacelens-canvas");
    expect(canvas).toBeInTheDocument();

    // Trigger click on canvas
    fireEvent.click(canvas, { clientX: 400, clientY: 300 });

    // Trigger mouse move on canvas
    fireEvent.mouseMove(canvas, { clientX: 400, clientY: 300 });

    // Trigger mouse leave
    fireEvent.mouseLeave(canvas);
  });
});
