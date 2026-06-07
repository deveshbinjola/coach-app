import { describe, it, expect } from "vitest";
import {
  buildSharpenSystemPrompt,
  buildUserPrompt,
  parsePolishResponse,
  runGuardrails,
  MAX_POLISH_CHARS,
  MIN_POLISH_CHARS,
} from "@/lib/content/polish-core";

describe("buildSharpenSystemPrompt", () => {
  const voiceJson = { tone: ["direct"], do_nots: ['no "crushing it"'], vocabulary: { avoid: ["synergy"] } };
  const samples = ["Be where your feet are.", "Most guys have a clarity problem."];

  it("embeds the do-nots, vocabulary, and sample messages", () => {
    const p = buildSharpenSystemPrompt(voiceJson, samples);
    expect(p).toContain("Be where your feet are.");
    expect(p).toContain("synergy");
    // do_nots are embedded inside the JSON.stringify'd voice block, so inner
    // quotes are escaped (JSON serialization). Assert the escaped form.
    expect(p).toContain('no \\"crushing it\\"');
  });

  it("forbids adding new facts and em-dashes, and demands JSON output", () => {
    const p = buildSharpenSystemPrompt(voiceJson, samples);
    expect(p.toLowerCase()).toContain("do not add");
    expect(p.toLowerCase()).toContain("em-dash");
    expect(p).toContain('"polished"');
    expect(p).toContain('"changes"');
  });

  it("instructs preserving structure (lists/line breaks)", () => {
    const p = buildSharpenSystemPrompt(voiceJson, samples);
    expect(p.toLowerCase()).toContain("structure");
  });

  it("exposes char bounds", () => {
    expect(MIN_POLISH_CHARS).toBe(20);
    expect(MAX_POLISH_CHARS).toBe(4000);
  });
});

describe("buildUserPrompt", () => {
  it("wraps the raw draft", () => {
    const p = buildUserPrompt("ok so here is my messy draft about clarity");
    expect(p).toContain("messy draft about clarity");
  });

  it("appends a steer line when given, and none when not", () => {
    expect(buildUserPrompt("draft", "tighter").toLowerCase()).toContain("shorter");
    expect(buildUserPrompt("draft", "warmer").toLowerCase()).toContain("warm");
    expect(buildUserPrompt("draft", "shorter").toLowerCase()).toContain("short");
    expect(buildUserPrompt("draft", "keep_more").toLowerCase()).toContain("their own words");
    expect(buildUserPrompt("draft")).not.toMatch(/STEER:/);
  });
});

describe("parsePolishResponse", () => {
  it("parses clean JSON", () => {
    const r = parsePolishResponse('{"polished":"Tight copy.","changes":["cut filler"]}');
    expect(r.polished).toBe("Tight copy.");
    expect(r.changes).toEqual(["cut filler"]);
  });

  it("parses fenced JSON", () => {
    const r = parsePolishResponse('```json\n{"polished":"Hi.","changes":["a","b"]}\n```');
    expect(r.polished).toBe("Hi.");
    expect(r.changes).toEqual(["a", "b"]);
  });

  it("falls back to raw text with empty changes when unparseable", () => {
    const r = parsePolishResponse("just some plain text the model returned");
    expect(r.polished).toBe("just some plain text the model returned");
    expect(r.changes).toEqual([]);
  });

  it("drops non-string change entries and trims", () => {
    const r = parsePolishResponse('{"polished":"  x  ","changes":["ok",2,null,"two"]}');
    expect(r.polished).toBe("x");
    expect(r.changes).toEqual(["ok", "two"]);
  });
});

describe("runGuardrails", () => {
  it("flags an em-dash in the polished text", () => {
    const flags = runGuardrails("plain raw text here", "now with an em-dash — see");
    expect(flags.some((f) => f.kind === "em_dash")).toBe(true);
  });

  it("flags a number that appears only in the polished text", () => {
    const flags = runGuardrails("I help coaches grow", "I help 500 coaches grow");
    const added = flags.find((f) => f.kind === "numbers_added");
    expect(added).toBeTruthy();
    expect(added && "values" in added && added.values).toContain("500");
  });

  it("does not flag numbers already present in the raw", () => {
    const flags = runGuardrails("3 steps to clarity", "The 3 steps to clarity");
    expect(flags.some((f) => f.kind === "numbers_added")).toBe(false);
  });

  it("flags ballooned output (>1.4x words)", () => {
    const raw = "short draft";
    const polished = "this is a much much much much much much much longer polished draft now";
    expect(runGuardrails(raw, polished).some((f) => f.kind === "ballooned")).toBe(true);
  });

  it("flags dropped structure when raw was bulleted and polished is prose", () => {
    const raw = "- point one\n- point two\n- point three";
    const polished = "Point one, point two, and point three all together.";
    expect(runGuardrails(raw, polished).some((f) => f.kind === "structure_dropped")).toBe(true);
  });

  it("returns no flags for a clean, faithful, tighter edit", () => {
    const raw = "ok so most guys think they have a discipline problem but its clarity";
    const polished = "Most guys think they have a discipline problem. It is clarity.";
    expect(runGuardrails(raw, polished)).toEqual([]);
  });
});
