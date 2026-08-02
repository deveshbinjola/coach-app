import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_ACCENT_HEX, DEFAULT_BRAND_KIT } from "@/lib/brand-kit";

const NEON = "#00" + "FF41"; // split so this file is not itself a grep hit

describe("default accent", () => {
  it("is the forest brand, not the abandoned neon", () => {
    expect(DEFAULT_ACCENT_HEX).toBe("#0B6E23");
    expect(DEFAULT_ACCENT_HEX).not.toBe(NEON);
  });

  it("agrees with the default brand kit, so a coach gets one colour either way", () => {
    expect(DEFAULT_BRAND_KIT.accentHex).toBe(DEFAULT_ACCENT_HEX);
  });

  // The literal was in seven places and drifted from the brand for months
  // without anyone noticing, because nothing failed when it did.
  it.each([
    "components/content/ContentWorkspace.tsx",
    "app/api/content/draft/route.ts",
    "app/api/funnels/generate/route.ts",
  ])("%s carries no neon literal", (path) => {
    expect(readFileSync(path, "utf8")).not.toContain(NEON);
  });
});
