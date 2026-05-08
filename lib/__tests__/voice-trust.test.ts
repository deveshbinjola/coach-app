// Tests for lib/voice-trust.ts
//
// summarizeTrust drives the Voice Trust gauge dial on Command Center
// — the screenshot moment of the product. Calibration discipline
// (TRUST_MIN_SAMPLE, TRUST_CONFIDENT_SAMPLE, EDIT_THRESHOLD_RATIO) is
// what keeps that number honest. These tests pin the math.
//
// scoreVoiceFit drives the inline draft critique. Threshold drift
// would silently change which drafts get flagged as "needs_edit".

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  summarizeTrust,
  scoreVoiceFit,
  EDIT_THRESHOLD_RATIO,
  TRUST_MIN_SAMPLE,
  TRUST_CONFIDENT_SAMPLE,
} from "@/lib/voice-trust";
import {
  makeMessage,
  makeVoiceProfile,
  TEST_NOW,
  daysAgo,
} from "./factories";

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TEST_NOW));
});
afterAll(() => {
  vi.useRealTimers();
});

describe("summarizeTrust — empty / sparse data", () => {
  it("returns confidence='none' when no messages", () => {
    const t = summarizeTrust([], TEST_NOW);
    expect(t.confidence).toBe("none");
    expect(t.asIsPct28).toBeNull();
    expect(t.last28.total).toBe(0);
  });

  it("withholds asIsPct28 below TRUST_MIN_SAMPLE", () => {
    const messages = Array.from({ length: TRUST_MIN_SAMPLE - 1 }, (_, i) =>
      makeMessage({ id: `m${i}`, was_edited: false, sent_at: daysAgo(2) })
    );
    const t = summarizeTrust(messages, TEST_NOW);
    expect(t.asIsPct28).toBeNull();
    expect(t.confidence).toBe("none");
  });

  it("marks 'preliminary' between TRUST_MIN_SAMPLE and TRUST_CONFIDENT_SAMPLE", () => {
    const n = TRUST_MIN_SAMPLE + 1;
    const messages = Array.from({ length: n }, (_, i) =>
      makeMessage({ id: `m${i}`, was_edited: false, sent_at: daysAgo(2) })
    );
    const t = summarizeTrust(messages, TEST_NOW);
    expect(t.confidence).toBe("preliminary");
    expect(t.asIsPct28).toBe(100);
  });

  it("marks 'real' at or above TRUST_CONFIDENT_SAMPLE", () => {
    const messages = Array.from({ length: TRUST_CONFIDENT_SAMPLE }, (_, i) =>
      makeMessage({ id: `m${i}`, was_edited: false, sent_at: daysAgo(2) })
    );
    const t = summarizeTrust(messages, TEST_NOW);
    expect(t.confidence).toBe("real");
  });
});

describe("summarizeTrust — as-is rate math", () => {
  it("computes sent-as-is percentage correctly", () => {
    // 7 unedited + 3 edited = 10 known → 70% as-is
    const unedited = Array.from({ length: 7 }, (_, i) =>
      makeMessage({ id: `u${i}`, was_edited: false, sent_at: daysAgo(2) })
    );
    const edited = Array.from({ length: 3 }, (_, i) =>
      makeMessage({ id: `e${i}`, was_edited: true, sent_at: daysAgo(2) })
    );
    const t = summarizeTrust([...unedited, ...edited], TEST_NOW);
    expect(t.last28.asIs).toBe(7);
    expect(t.last28.edited).toBe(3);
    expect(t.asIsPct28).toBe(70);
  });

  it("excludes messages outside the 28-day window", () => {
    const recent = makeMessage({ id: "r1", was_edited: false, sent_at: daysAgo(2) });
    const old    = makeMessage({ id: "o1", was_edited: false, sent_at: daysAgo(40) });
    const t = summarizeTrust([recent, old], TEST_NOW);
    expect(t.last28.total).toBe(1);
  });

  it("excludes messages without sent_at (drafts)", () => {
    const sent  = makeMessage({ id: "s1", was_edited: false, sent_at: daysAgo(2) });
    const draft = makeMessage({ id: "d1", was_edited: false, sent_at: null });
    const t = summarizeTrust([sent, draft], TEST_NOW);
    expect(t.last28.total).toBe(1);
  });

  it("excludes non-AI-drafted messages (coach wrote them)", () => {
    const ai    = makeMessage({ id: "ai", ai_drafted: true,  was_edited: false, sent_at: daysAgo(2) });
    const human = makeMessage({ id: "h",  ai_drafted: false, was_edited: false, sent_at: daysAgo(2) });
    const t = summarizeTrust([ai, human], TEST_NOW);
    expect(t.last28.total).toBe(1);
  });
});

describe("summarizeTrust — autoSendReady gate", () => {
  it("triggers when sample>=20 and as-is>=90%", () => {
    // 19 unedited + 1 edited = 95% over 20 messages
    const unedited = Array.from({ length: 19 }, (_, i) =>
      makeMessage({ id: `u${i}`, was_edited: false, sent_at: daysAgo(2) })
    );
    const edited = makeMessage({ id: "e1", was_edited: true, sent_at: daysAgo(2) });
    const t = summarizeTrust([...unedited, edited], TEST_NOW);
    expect(t.autoSendReady).toBe(true);
  });

  it("does NOT trigger when sample<20 even at 100%", () => {
    const messages = Array.from({ length: 19 }, (_, i) =>
      makeMessage({ id: `u${i}`, was_edited: false, sent_at: daysAgo(2) })
    );
    const t = summarizeTrust(messages, TEST_NOW);
    expect(t.autoSendReady).toBe(false);
  });

  it("does NOT trigger when sample>=20 but as-is<90%", () => {
    // 17 + 3 = 85% over 20
    const unedited = Array.from({ length: 17 }, (_, i) =>
      makeMessage({ id: `u${i}`, was_edited: false, sent_at: daysAgo(2) })
    );
    const edited = Array.from({ length: 3 }, (_, i) =>
      makeMessage({ id: `e${i}`, was_edited: true, sent_at: daysAgo(2) })
    );
    const t = summarizeTrust([...unedited, ...edited], TEST_NOW);
    expect(t.autoSendReady).toBe(false);
  });
});

describe("summarizeTrust — weekly buckets", () => {
  it("returns 4 weekly percentages", () => {
    const t = summarizeTrust([], TEST_NOW);
    expect(t.weeklyAsIsPct).toHaveLength(4);
  });

  it("buckets messages into the correct week", () => {
    // Last 7d window: all unedited.
    const thisWeek = Array.from({ length: 4 }, (_, i) =>
      makeMessage({ id: `tw${i}`, was_edited: false, sent_at: daysAgo(2) })
    );
    // 8-14d ago: all edited.
    const lastWeek = Array.from({ length: 4 }, (_, i) =>
      makeMessage({ id: `lw${i}`, was_edited: true, sent_at: daysAgo(10) })
    );
    const t = summarizeTrust([...thisWeek, ...lastWeek], TEST_NOW);
    // Most recent first per the doc comment in summarizeTrust.
    expect(t.weeklyAsIsPct[0]).toBe(100); // last 7d → 100% as-is
    expect(t.weeklyAsIsPct[1]).toBe(0);   // 8-14d  → 0% as-is
  });
});

describe("scoreVoiceFit — basic shape", () => {
  it("returns null for empty draft", () => {
    expect(scoreVoiceFit("", makeVoiceProfile())).toBeNull();
    expect(scoreVoiceFit("   \n  ", makeVoiceProfile())).toBeNull();
  });

  it("scores lower without a profile", () => {
    const withoutProfile = scoreVoiceFit("Hey, worth a quick chat?", null);
    const withProfile    = scoreVoiceFit("Hey, worth a quick chat?", makeVoiceProfile());
    expect(withoutProfile).not.toBeNull();
    expect(withProfile).not.toBeNull();
    expect(withoutProfile!.score).toBeLessThan(withProfile!.score);
  });

  it("flags em dashes (the app voice rule)", () => {
    const r = scoreVoiceFit("Hey — worth a chat?", makeVoiceProfile());
    expect(r!.reasons.some((x) => /em dash/i.test(x))).toBe(true);
  });

  it("flags excessive exclamations", () => {
    const r = scoreVoiceFit("Hey!! This is amazing!! Worth a chat??", makeVoiceProfile());
    expect(r!.reasons.some((x) => /excitement/i.test(x))).toBe(true);
  });

  it("rewards using vocabulary.use words", () => {
    const profile = makeVoiceProfile();
    // The factory profile has "honest" in vocabulary.use.
    const r = scoreVoiceFit("Want the honest read on this? Worth a chat?", profile);
    expect(r!.matched.some((m) => /Uses your words/.test(m))).toBe(true);
  });

  it("penalizes vocabulary.avoid words", () => {
    const profile = makeVoiceProfile();
    // The factory profile has "synergy" in vocabulary.avoid.
    const r = scoreVoiceFit(
      "Let's circle back on the synergy. Worth a chat?",
      profile
    );
    expect(r!.reasons.some((x) => /avoid/i.test(x))).toBe(true);
  });

  it("clamps score to [0, 100]", () => {
    const profile = makeVoiceProfile();
    const awful = "This is amazing!!!! Synergize the circle back — perfect!!!!";
    const r = scoreVoiceFit(awful, profile);
    expect(r!.score).toBeGreaterThanOrEqual(0);
    expect(r!.score).toBeLessThanOrEqual(100);
  });

  it("classifies score thresholds correctly", () => {
    // Verify the label thresholds: strong>=82, needs_edit>=58, weak<58.
    // Build a generic-looking draft → should land weak.
    const generic = scoreVoiceFit(
      "Thanks for reaching out. I would love to learn more about your goals.",
      makeVoiceProfile()
    );
    expect(generic!.label).toBe("weak");
  });
});

describe("constants — locked values", () => {
  it("EDIT_THRESHOLD_RATIO = 0.05 (5% threshold)", () => {
    expect(EDIT_THRESHOLD_RATIO).toBe(0.05);
  });

  it("TRUST_MIN_SAMPLE = 3", () => {
    expect(TRUST_MIN_SAMPLE).toBe(3);
  });

  it("TRUST_CONFIDENT_SAMPLE = 10", () => {
    expect(TRUST_CONFIDENT_SAMPLE).toBe(10);
  });
});
