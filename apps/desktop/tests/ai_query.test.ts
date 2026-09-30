import { describe, it, expect } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import "../src/mockTauriBridge";

describe("TASK-29: nl_query_files Tauri Command", () => {
  it("invokes nl_query_files and returns FileFilterResult", async () => {
    const res: any = await invoke("nl_query_files", {
      query: "videos grandes",
      nodes: [
        { path: "C:\\Downloads\\vid1.mp4", name: "vid1.mp4", size_bytes: 2000000000, is_directory: false, extension: "mp4" },
        { path: "C:\\Downloads\\doc.pdf", name: "doc.pdf", size_bytes: 500000, is_directory: false, extension: "pdf" },
      ],
    });

    expect(res).toBeDefined();
    expect(res.matched_paths).toBeDefined();
    expect(res.matched_paths.length).toBe(1);
    expect(res.matched_paths[0]).toBe("C:\\Downloads\\vid1.mp4");
    expect(res.total_matched).toBe(1);
    expect(res.total_bytes).toBe(2000000000);
    expect(res.summary).toContain("Se identificaron 1 archivos");
  });
});
