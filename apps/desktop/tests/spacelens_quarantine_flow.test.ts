import { describe, it, expect } from "vitest";
import "../src/mockTauriBridge";
import { invoke } from "@tauri-apps/api/core";
import { CleanResult, QuarantineEntry } from "../src/types/models";

describe("Clean and Quarantine Flow Verification", () => {
  it("clean_items moves selected files to quarantine and list_quarantine includes them", async () => {
    const testPath = "C:\\Users\\Luciano\\AppData\\Local\\Temp\\test_file.tmp";
    
    const cleanRes = await invoke<CleanResult>("clean_items", {
      item_ids: [testPath]
    });

    expect(cleanRes.items_moved).toBe(1);

    const qList = await invoke<QuarantineEntry[]>("list_quarantine");
    expect(qList.length).toBeGreaterThan(0);
    const matched = qList.find(e => e.original_path === testPath);
    expect(matched).toBeDefined();
    expect(matched?.status).toBe("quarantined");
  });
});
