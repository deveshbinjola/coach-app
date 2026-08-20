import { describe, it, expect } from "vitest";
import { parseRows, leadName, reflectOnRows } from "@/lib/lead-import";

describe("parseRows", () => {
  it("trims, drops blanks, keeps order", () => {
    expect(parseRows("  Marcus  \n\n Dana \n")).toEqual(["Marcus", "Dana"]);
  });
});

describe("leadName", () => {
  it("takes everything before the first comma", () => {
    expect(leadName("Marcus, asked about the work twice")).toBe("Marcus");
  });
  it("treats a row with no comma as all name", () => {
    expect(leadName("Sam from the retreat")).toBe("Sam from the retreat");
  });
});

describe("reflectOnRows", () => {
  it("names repeat interest", () => {
    expect(reflectOnRows(["Marcus, asked about the work twice"]))
      .toBe("Marcus already asked. That's not a cold lead. That's someone waiting.");
  });

  it("names going quiet", () => {
    expect(reflectOnRows(["Dana, went quiet in March"]))
      .toBe("Dana went quiet. That usually isn't a no. It's usually life.");
  });

  it("names a past client", () => {
    expect(reflectOnRows(["Priya, old client from last year"]))
      .toBe("Priya already knows what you're like to work with. That's the shortest distance you have.");
  });

  it("falls back to an honest count when no note matches", () => {
    expect(reflectOnRows(["Sam", "Alex", "Jo"]))
      .toBe("3 names. That's 3 conversations you can pick back up.");
  });

  it("handles a single unnoted name without saying '1 names'", () => {
    expect(reflectOnRows(["Sam"])).toBe("One name. That's one conversation you can pick back up.");
  });

  it("prefers the first row that matches over a later one", () => {
    expect(reflectOnRows(["Sam", "Dana, ghosted me", "Marcus, asked twice"]))
      .toBe("Dana went quiet. That usually isn't a no. It's usually life.");
  });

  it("never assumes the lead's gender", () => {
    const lines = [
      reflectOnRows(["Marcus, asked twice"]),
      reflectOnRows(["Dana, went quiet"]),
      reflectOnRows(["Priya, old client"]),
    ];
    for (const l of lines) expect(l).not.toMatch(/\b(he|she|his|her|him)\b/i);
  });

  it("returns empty for no rows", () => {
    expect(reflectOnRows([])).toBe("");
  });
});
