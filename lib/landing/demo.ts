// The live demo on the landing page: the visitor pastes a real message they
// got and a few lines they have actually written, and we draft the reply twice.
//
// The comparison is the product's whole claim, so it has to be a fair fight:
// the SAME model runs both sides, and the only difference is that one side has
// their words and one does not. We do not tell one side to write badly, and we
// do not run a cheaper model on the generic side. If the gap is real, it shows
// up on its own; if it does not, the claim was wrong and we should know.
//
// Pure logic lives here so it can be tested without touching the network.

export const MESSAGE_MIN = 12;
export const MESSAGE_MAX = 600;
export const VOICE_MIN = 40;
export const VOICE_MAX = 500;

/** Prefills for the incoming message only. The voice sample is never
 *  prefilled, because a demo that puts words in their mouth proves nothing. */
export const EXAMPLE_MESSAGES = [
  {
    label: "The maybe",
    text: "Hey, saw your post. I've been thinking about coaching for a while but I'm not sure I'm ready to commit to anything right now. What does it actually involve?",
  },
  {
    label: "The price question",
    text: "This looks great. Can you tell me how much it costs before we book a call?",
  },
  {
    label: "The one who went quiet",
    text: "Sorry for the slow reply, things got busy. Still interested though. Where did we leave things?",
  },
] as const;

export type DemoInput = { message: string; voiceSample: string };

export type DemoValidation =
  | { ok: true; value: DemoInput }
  | { ok: false; field: "message" | "voiceSample"; error: string };

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export function validateDemoInput(body: unknown): DemoValidation {
  const raw = (body ?? {}) as Record<string, unknown>;
  const message = clean(raw.message, MESSAGE_MAX);
  const voiceSample = clean(raw.voiceSample, VOICE_MAX);

  if (message.length < MESSAGE_MIN) {
    return { ok: false, field: "message", error: "Paste a bit more of the message." };
  }
  if (voiceSample.length < VOICE_MIN) {
    return {
      ok: false,
      field: "voiceSample",
      error: "A couple more sentences in your own words. That is the whole trick.",
    };
  }
  return { ok: true, value: { message, voiceSample } };
}

/** The control. No voice, no context, no coaching frame. This is what a coach
 *  gets today from a general assistant, so it gets a genuinely fair prompt. */
export function buildGenericPrompt(message: string): { system: string; user: string } {
  return {
    system: "You are a helpful assistant. Write a good reply to the message.",
    user: `Write a reply to this message. Reply only with the message text, nothing else.\n\n${message}`,
  };
}

export function buildVoicedPrompt(input: DemoInput): { system: string; user: string } {
  const system = [
    "You draft replies for a coach, in the coach's own voice.",
    "The voice sample is the source of truth for how this person writes: sentence length, rhythm, punctuation, how warm or blunt they are, the words they reach for and the ones they never use.",
    "Match it. If they write short, write short. If they do not use exclamation marks, do not use them.",
    "Never invent facts, prices, availability, credentials, results, or client stories.",
    "Never use em dash characters.",
    "Reply with compact JSON only: {\"reply\": string, \"noticed\": string, \"followUp\": string}.",
    "reply: the message to send, in their voice.",
    "noticed: one short sentence naming the thing under what this person actually said. Not a summary of the words, the thing they did not say directly.",
    "followUp: one short sentence, when to follow up and why, if they do not reply.",
  ].join(" ");

  const user = [
    "HOW THIS COACH WRITES (their own words, match this):",
    input.voiceSample,
    "",
    "THE MESSAGE THAT CAME IN:",
    input.message,
  ].join("\n");

  return { system, user };
}

export type VoicedDraft = { reply: string; noticed: string; followUp: string };

/** The model is told to return JSON, but a demo must never show a visitor a
 *  raw brace. Anything unparseable degrades to using the text as the reply. */
export function parseVoicedDraft(text: string): VoicedDraft | null {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const reply = stripEmDash(clean(parsed.reply, 1200));
    if (!reply) return null;
    return {
      reply,
      noticed: stripEmDash(clean(parsed.noticed, 240)),
      followUp: stripEmDash(clean(parsed.followUp, 240)),
    };
  } catch {
    return null;
  }
}

export function stripEmDash(value: string): string {
  return value.replaceAll("—", ",");
}
