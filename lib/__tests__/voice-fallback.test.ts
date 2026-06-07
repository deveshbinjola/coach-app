import { describe, it, expect } from "vitest";
import { buildFallbackVoice } from "@/lib/voice-profiles";
import { readInvokeError } from "@/lib/voice/invoke-error";

describe("buildFallbackVoice", () => {
  const answers = [
    { q: "belief", a: "Most guys don't have a discipline problem." },
    { q: "afraid", a: "Be where your feet are, brother." },
    { q: "short", a: "too short" }, // < 10 chars after trim? "too short" = 9 -> dropped
  ];

  it("produces a schema-valid voice_json", () => {
    const { voice_json } = buildFallbackVoice("m-coach-m-aud", answers);
    expect(Array.isArray(voice_json.tone)).toBe(true);
    expect(typeof voice_json.sentence_rhythm).toBe("string");
    const vocab = voice_json.vocabulary as { use: string[]; avoid: string[] };
    expect(Array.isArray(vocab.use)).toBe(true);
    expect(Array.isArray(vocab.avoid)).toBe(true);
    expect(Array.isArray(voice_json.do_nots)).toBe(true);
  });

  it("marks itself as a fallback", () => {
    const { voice_json } = buildFallbackVoice("m-coach-m-aud", answers);
    const sig = voice_json.training_signal as { fallback: boolean; reason: string };
    expect(sig.fallback).toBe(true);
    expect(sig.reason).toBe("voice_ai_unavailable");
  });

  it("uses the coach's substantive answers as sample_messages", () => {
    const { sample_messages } = buildFallbackVoice("m-coach-m-aud", answers);
    expect(sample_messages).toContain("Most guys don't have a discipline problem.");
    expect(sample_messages).toContain("Be where your feet are, brother.");
    expect(sample_messages).not.toContain("too short");
  });

  it("is audience-correct — a feminine/women profile avoids 'brother'", () => {
    const { voice_json } = buildFallbackVoice("f-coach-w-aud", answers);
    const vocab = voice_json.vocabulary as { avoid: string[] };
    expect(vocab.avoid).toContain("brother");
  });

  it("falls back to seed phrases when no answers are substantive", () => {
    const { sample_messages } = buildFallbackVoice("m-coach-m-aud", [
      { q: "x", a: "nope" },
    ]);
    expect(sample_messages.length).toBeGreaterThan(0);
  });
});

describe("readInvokeError", () => {
  it("pulls the real error from the Response body JSON on .context", async () => {
    const err = {
      message: "Edge Function returned a non-2xx status code",
      context: { text: async () => JSON.stringify({ error: "ANTHROPIC_API_KEY missing" }) },
    };
    expect(await readInvokeError(err)).toBe("ANTHROPIC_API_KEY missing");
  });

  it("supports a clone()-able Response context", async () => {
    const err = {
      message: "Edge Function returned a non-2xx status code",
      context: { clone: () => ({ text: async () => JSON.stringify({ message: "boom" }) }) },
    };
    expect(await readInvokeError(err)).toBe("boom");
  });

  it("returns raw text when the body is not JSON", async () => {
    const err = { message: "non-2xx", context: { text: async () => "plain failure text" } };
    expect(await readInvokeError(err)).toBe("plain failure text");
  });

  it("suppresses the generic non-2xx message and uses the fallback", async () => {
    const err = { message: "Edge Function returned a non-2xx status code" };
    expect(await readInvokeError(err, "fallback msg")).toBe("fallback msg");
  });

  it("keeps a real .message when there is no context", async () => {
    const err = { message: "Network request failed" };
    expect(await readInvokeError(err)).toBe("Network request failed");
  });
});
