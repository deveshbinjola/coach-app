import { describe, it, expect } from "vitest";
import { matchesTriggerConfig } from "@/lib/sequence-triggers";

describe("matchesTriggerConfig", () => {
  it("quiz_completed always matches (empty config)", () => {
    expect(matchesTriggerConfig("quiz_completed", {}, {})).toBe(true);
  });

  it("status_change matches when to_status matches", () => {
    expect(
      matchesTriggerConfig(
        "status_change",
        { to_status: "qualified" },
        { to_status: "qualified" }
      )
    ).toBe(true);
  });

  it("status_change rejects when to_status differs", () => {
    expect(
      matchesTriggerConfig(
        "status_change",
        { to_status: "qualified" },
        { to_status: "booked" }
      )
    ).toBe(false);
  });

  it("status_change with empty config matches any status change", () => {
    expect(
      matchesTriggerConfig(
        "status_change",
        {},
        { to_status: "client" }
      )
    ).toBe(true);
  });
});
