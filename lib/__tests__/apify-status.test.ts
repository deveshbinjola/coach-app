import { describe, it, expect } from "vitest";
import { mapApifyStatus, type ImportStatus } from "@/lib/voice/apify-status";

describe("mapApifyStatus", () => {
  it("maps terminal success to complete", () => {
    const s: ImportStatus = mapApifyStatus("SUCCEEDED");
    expect(s).toBe("complete");
  });
  it("maps in-flight states to processing", () => {
    expect(mapApifyStatus("READY")).toBe("processing");
    expect(mapApifyStatus("RUNNING")).toBe("processing");
  });
  it("maps terminal failures to failed", () => {
    expect(mapApifyStatus("FAILED")).toBe("failed");
    expect(mapApifyStatus("TIMED-OUT")).toBe("failed");
    expect(mapApifyStatus("ABORTED")).toBe("failed");
  });
  it("treats unknown/missing status as processing (don't fail prematurely)", () => {
    expect(mapApifyStatus("SOMETHING_NEW")).toBe("processing");
    expect(mapApifyStatus(null)).toBe("processing");
    expect(mapApifyStatus(undefined)).toBe("processing");
  });
});
