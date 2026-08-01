import { describe, it, expect } from "vitest";
import {
  EXAMPLE_MESSAGES,
  MESSAGE_MAX,
  VOICE_MAX,
  buildGenericPrompt,
  buildVoicedPrompt,
  parseVoicedDraft,
  validateDemoInput,
} from "@/lib/landing/demo";

const VALID_VOICE =
  "Good to hear from you. Before we talk logistics, tell me what actually made you reach out today.";

describe("validateDemoInput", () => {
  it("accepts a real pair", () => {
    const result = validateDemoInput({
      message: "Curious about coaching, what does it involve?",
      voiceSample: VALID_VOICE,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a message too short to answer", () => {
    const result = validateDemoInput({ message: "hi", voiceSample: VALID_VOICE });
    expect(result).toMatchObject({ ok: false, field: "message" });
  });

  it("rejects a voice sample too thin to learn from", () => {
    const result = validateDemoInput({
      message: "Curious about coaching, what does it involve?",
      voiceSample: "sure thing",
    });
    expect(result).toMatchObject({ ok: false, field: "voiceSample" });
  });

  it("rejects non-string input rather than coercing it", () => {
    expect(validateDemoInput({ message: 12345, voiceSample: VALID_VOICE }).ok).toBe(false);
    expect(validateDemoInput(null).ok).toBe(false);
    expect(validateDemoInput(undefined).ok).toBe(false);
  });

  it("truncates rather than rejecting oversized input", () => {
    const result = validateDemoInput({
      message: "a".repeat(MESSAGE_MAX + 500),
      voiceSample: "b".repeat(VOICE_MAX + 500),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toHaveLength(MESSAGE_MAX);
      expect(result.value.voiceSample).toHaveLength(VOICE_MAX);
    }
  });

  it("collapses whitespace so a wall of newlines is not mistaken for content", () => {
    const result = validateDemoInput({
      message: "  Curious   about\n\n\ncoaching, what does it involve?  ",
      voiceSample: VALID_VOICE,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.message).toBe("Curious about coaching, what does it involve?");
    }
  });

  it("does not let whitespace alone pass the length floor", () => {
    expect(validateDemoInput({ message: " ".repeat(200), voiceSample: VALID_VOICE }).ok).toBe(false);
  });

  it("passes every shipped example message", () => {
    for (const example of EXAMPLE_MESSAGES) {
      const result = validateDemoInput({ message: example.text, voiceSample: VALID_VOICE });
      expect(result.ok, `example "${example.label}" should be usable`).toBe(true);
    }
  });
});

describe("prompt construction", () => {
  it("keeps the voice sample out of the control prompt entirely", () => {
    const prompt = buildGenericPrompt("What does coaching involve?");
    const whole = `${prompt.system} ${prompt.user}`;
    expect(whole).toContain("What does coaching involve?");
    expect(whole).not.toContain(VALID_VOICE);
    // The control must not be sabotaged into writing badly. If it were, the
    // comparison on the landing page would be a rigged demo.
    expect(whole.toLowerCase()).not.toMatch(/generic|bland|robotic|poorly|corporate/);
  });

  it("gives the voiced prompt both the sample and the message", () => {
    const prompt = buildVoicedPrompt({
      message: "What does coaching involve?",
      voiceSample: VALID_VOICE,
    });
    expect(prompt.user).toContain(VALID_VOICE);
    expect(prompt.user).toContain("What does coaching involve?");
    expect(prompt.system).toContain("JSON");
  });

  it("forbids invented facts and em dashes in the voiced prompt", () => {
    const { system } = buildVoicedPrompt({ message: "hello there", voiceSample: VALID_VOICE });
    expect(system).toMatch(/never invent/i);
    expect(system).toMatch(/em dash/i);
  });
});

describe("parseVoicedDraft", () => {
  it("parses the JSON contract", () => {
    const parsed = parseVoicedDraft(
      JSON.stringify({ reply: "Good to hear from you.", noticed: "They are scared.", followUp: "Nudge Friday." }),
    );
    expect(parsed).toEqual({
      reply: "Good to hear from you.",
      noticed: "They are scared.",
      followUp: "Nudge Friday.",
    });
  });

  it("survives a fenced code block", () => {
    const parsed = parseVoicedDraft('```json\n{"reply":"Hello there","noticed":"","followUp":""}\n```');
    expect(parsed?.reply).toBe("Hello there");
  });

  it("strips em dashes out of every field", () => {
    const parsed = parseVoicedDraft(
      JSON.stringify({ reply: "Yes — soon", noticed: "Unsure — waiting", followUp: "Friday — early" }),
    );
    expect(`${parsed?.reply}${parsed?.noticed}${parsed?.followUp}`).not.toContain("—");
  });

  it("returns null on unparseable text so the caller can fall back", () => {
    expect(parseVoicedDraft("Good to hear from you!")).toBeNull();
    expect(parseVoicedDraft("")).toBeNull();
  });

  it("returns null when the reply is missing, even if the JSON parses", () => {
    expect(parseVoicedDraft(JSON.stringify({ noticed: "something" }))).toBeNull();
    expect(parseVoicedDraft(JSON.stringify({ reply: "   " }))).toBeNull();
  });

  it("tolerates a missing noticed or followUp", () => {
    const parsed = parseVoicedDraft(JSON.stringify({ reply: "Hello there" }));
    expect(parsed).toEqual({ reply: "Hello there", noticed: "", followUp: "" });
  });
});
