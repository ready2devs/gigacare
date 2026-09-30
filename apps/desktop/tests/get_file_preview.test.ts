import { describe, it, expect } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import "../src/mockTauriBridge";

describe("TASK-20: get_file_preview command", () => {
  it("returns base64 + metadata for .jpg file", async () => {
    const res: any = await invoke("get_file_preview", { path: "C:\\Photos\\vacation.jpg" });
    expect(res).toBeDefined();
    expect(res.media_type).toBe("image/jpeg");
    expect(res.preview_base64).toBeTruthy();
    expect(res.metadata).toBeDefined();
    expect(res.metadata.dimensions).toBe("1920x1080");
    expect(res.metadata.codec).toBe("jpeg");
    expect(res.metadata.size_bytes).toBeGreaterThan(0);
  });

  it("returns base64 + metadata for .mp4 video file", async () => {
    const res: any = await invoke("get_file_preview", { path: "C:\\Videos\\clip.mp4" });
    expect(res).toBeDefined();
    expect(res.media_type).toBe("video/mp4");
    expect(res.preview_base64).toBeTruthy();
    expect(res.metadata).toBeDefined();
    expect(res.metadata.dimensions).toBe("3840x2160");
    expect(res.metadata.codec).toBe("h264");
    expect(res.metadata.size_bytes).toBeGreaterThan(0);
  });
});
