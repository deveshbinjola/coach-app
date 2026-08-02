import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_ACCENT_HEX } from "@/lib/brand-kit";

const NEON = "#00" + "FF41";

// These templates go to paying customers. They were still sending the retired
// agency neon long after the product stopped using it, and nothing failed.
const TEMPLATES = [
  "lib/brand-os/tripwire-provision.ts",
  "lib/brand-os/legacy-recovery.ts",
  "app/api/brand-os/email/route.ts",
  "lib/email/daily-brief.ts",
  "lib/email/onboarding-sequence.ts",
  "lib/email/archetype-result.ts",
  "lib/email/post-call-invite.ts",
  "lib/email/referral-invite.ts",
];

describe("transactional email branding", () => {
  it.each(TEMPLATES)("%s sends no neon", (path) => {
    expect(readFileSync(path, "utf8")).not.toContain(NEON);
  });

  it("the templates that interpolate an accent use the shared constant", () => {
    for (const path of ["lib/brand-os/tripwire-provision.ts", "app/api/brand-os/email/route.ts"]) {
      const src = readFileSync(path, "utf8");
      expect(src).toContain("DEFAULT_ACCENT_HEX");
      // interpolation, not a literal that can drift again
      expect(src).toMatch(/\$\{DEFAULT_ACCENT_HEX\}/);
    }
  });

  it("the accent is readable as a button fill behind light text", () => {
    // #FAF8F3 on the accent. Forest clears AA; neon would be about 1.5:1.
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    };
    const [hi, lo] = [lum("#FAF8F3"), lum(DEFAULT_ACCENT_HEX)].sort((a, b) => b - a);
    expect((hi + 0.05) / (lo + 0.05)).toBeGreaterThan(4.5);
  });
});

describe("the failing greys", () => {
  // #9CA3AF and #9A9A95 both measure about 2.4-2.8:1 on the warm paper. They
  // were the app token, the /meet and /login tokens, the /win scorecard, the
  // share card PNG and four email templates. Fixed in every one; pinned here
  // because a single paste brings them back and nothing else would fail.
  const FAILING = ["#9CA3" + "AF", "#9A9A" + "95"];
  const SURFACES = [
    "app/globals.css", "app/meet/meet.css", "app/login/login.css",
    "app/win/ScorecardClient.tsx", "lib/share-card.ts",
    "lib/email/daily-brief.ts", "lib/email/archetype-result.ts",
    "app/api/cron/brand-os-digest/route.ts",
  ];
  it.each(SURFACES)("%s uses neither", (path) => {
    const src = readFileSync(path, "utf8");
    for (const grey of FAILING) {
      // the explanatory comments name them on purpose
      const uses = src.split("\n").filter((l) => l.includes(grey) && !l.includes("Was "));
      expect(uses).toEqual([]);
    }
  });
});
