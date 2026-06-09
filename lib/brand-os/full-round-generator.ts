// full-round-generator · Brand OS v5
//
// Reads the 16 answers (Snapshot 5 + Full Round 11), builds the structured
// outputs (voice protocol, pre-post ritual, pillars, held draft, calendar,
// refuses), writes them to cp_brand_os_runs, sets the 24-hour hold
// timestamp, and returns a FullRoundPayload.

import { createAdminClient } from "@/lib/supabase-admin";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

export type Stance = {
  name: string;
  proofClient: { story: string; named_week?: string };
  proofPersonal: { story: string; named_week?: string };
};

export type ContentPiece = {
  day: number;
  title: string;
  body?: string;
  stance: string;
  channel: string;
  cta_variant?: string;
};

export type FullRoundPayload = {
  voiceProfile: {
    texture: [string, string, string];
    landingState: string;
    cue: string;
    practiceShort: string;
  };
  prePostRitual: string[];
  pillars: [Stance, Stance, Stance];
  heldDraft: {
    body: string;
    target_channel: string;
    held_until: string;
  };
  contentCalendar: ContentPiece[];
  refuses: string[];
};

async function callAnthropic(system: string, prompt: string, maxTokens = 1200): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return String(json?.content?.[0]?.text ?? "").trim();
}

function parseJsonFromReply<T>(reply: string, fallback: T): T {
  // Pull the first JSON object or array from the reply.
  const match = reply.match(/[\[{][\s\S]*[\]}]/);
  if (!match) return fallback;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return fallback;
  }
}

async function loadAllAnswers(runId: string): Promise<Record<string, string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("cp_brand_os_answers")
    .select("question_id, refined_text, raw_text")
    .eq("run_id", runId);

  const map: Record<string, string> = {};
  for (const a of data ?? []) {
    const text = (a.refined_text ?? a.raw_text ?? "").toString().trim();
    if (text) map[a.question_id] = text;
  }
  return map;
}

async function buildVoiceProtocol(
  answers: Record<string, string>,
  voiceTexture: [string, string, string],
): Promise<FullRoundPayload["voiceProfile"]> {
  const landingStateRaw = answers["round.landing_state"] ?? "";

  if (!landingStateRaw) {
    return {
      texture: voiceTexture,
      landingState: "After morning walk. Throat soft.",
      cue: "When the throat softens, write.",
      practiceShort: "Ten minutes of breath. Walk outside.",
    };
  }

  const system = [
    "You read a coach's answer about the state their best content comes from.",
    "Return JSON with four keys: landing_state, cue, practice_short.",
    "  landing_state  : one sentence naming the state. Body-first, image-first.",
    "  cue            : one sentence the body gives when they are in that state. The check.",
    "  practice_short : one sentence describing the smallest practice that returns them there.",
    "No preamble. JSON only.",
  ].join("\n");
  const reply = await callAnthropic(system, `Coach's answer:\n${landingStateRaw}\n\nJSON:`, 400);
  const parsed = parseJsonFromReply<{ landing_state?: string; cue?: string; practice_short?: string }>(reply, {});
  return {
    texture: voiceTexture,
    landingState:  parsed.landing_state  ?? landingStateRaw.split(/[.!?]/)[0],
    cue:           parsed.cue            ?? "When the body softens, write.",
    practiceShort: parsed.practice_short ?? "Ten minutes of breath before the laptop.",
  };
}

async function buildPrePostRitual(landingState: string, practice: string): Promise<string[]> {
  const system = [
    "Write a three-step pre-post ritual a coach can do in five minutes before publishing.",
    "Each step is one sentence, verb-led, body-first.",
    "Return JSON array of exactly three strings. No preamble.",
  ].join("\n");
  const reply = await callAnthropic(system, `Landing state: ${landingState}\nPractice that returns them: ${practice}\n\nThree steps:`, 240);
  const parsed = parseJsonFromReply<string[]>(reply, []);
  if (parsed.length === 3) return parsed;
  return [
    "Close the laptop. Step outside.",
    "Three breaths through the nose. Slow.",
    "Check the body. If soft, write. If tight, wait.",
  ];
}

async function buildPillars(answers: Record<string, string>): Promise<FullRoundPayload["pillars"]> {
  const brainDump = answers["stance.q1"] ?? "";
  const named     = answers["stance.q9"] ?? "";
  const proof     = answers["stance.q7"] ?? "";
  const promise   = answers["round.promise"] ?? "";

  const system = [
    "You build three named brand pillars for a coach.",
    "Each pillar has: name (a real phrase, not a single word) + proofClient (one client outcome with a named week) + proofPersonal (one personal moment with a named week).",
    "Return JSON array of exactly three objects with keys: name, proofClient.story, proofClient.named_week, proofPersonal.story, proofPersonal.named_week.",
    "Tone: grounded, image-first, no jargon. No em dashes.",
  ].join("\n");

  const prompt = [
    `Brain-dump of 20 things: ${brainDump}`,
    "",
    `Named three: ${named}`,
    "",
    `Proof artifacts: ${proof}`,
    "",
    `90-day promise: ${promise}`,
    "",
    "Three pillars as JSON:",
  ].join("\n");

  const reply = await callAnthropic(system, prompt, 1600);
  const parsed = parseJsonFromReply<Array<Stance>>(reply, []);
  const safe: Stance[] = parsed.slice(0, 3).map((p) => ({
    name: p.name ?? "(pending)",
    proofClient: { story: p.proofClient?.story ?? "", named_week: p.proofClient?.named_week },
    proofPersonal: { story: p.proofPersonal?.story ?? "", named_week: p.proofPersonal?.named_week },
  }));
  while (safe.length < 3) safe.push({ name: "(pending)", proofClient: { story: "" }, proofPersonal: { story: "" } });
  return [safe[0], safe[1], safe[2]];
}

async function polishHeldDraft(
  unsaid: string,
  voice: FullRoundPayload["voiceProfile"],
  channel: string,
  antiVoice: string[],
): Promise<FullRoundPayload["heldDraft"]> {
  const hold = new Date();
  hold.setHours(hold.getHours() + 24);
  const heldUntil = hold.toISOString();

  if (!unsaid) {
    return { body: "TBD", target_channel: channel, held_until: heldUntil };
  }

  const system = [
    "Polish a coach's unsaid take into a publishable post.",
    "Match their voice texture. Refuse the anti-voice words.",
    "Format for the target channel.",
    "Eight-word first sentence where possible. No em dashes. No jargon.",
    "Return just the post body, no quotes, no preamble.",
  ].join("\n");

  const prompt = [
    `Voice texture: ${voice.texture.join(", ")}`,
    `Landing state: ${voice.landingState}`,
    `Anti-voice (forbidden): ${antiVoice.join(", ") || "(none)"}`,
    `Channel: ${channel}`,
    "",
    `The coach's unsaid take:`,
    unsaid,
    "",
    "Polished post:",
  ].join("\n");

  const body = await callAnthropic(system, prompt, 800);
  return { body: body.replace(/^["']|["']$/g, ""), target_channel: channel, held_until: heldUntil };
}

async function generateCalendar(
  pillars: FullRoundPayload["pillars"],
  voice: FullRoundPayload["voiceProfile"],
  channel: string,
): Promise<ContentPiece[]> {
  const system = [
    "Generate 30 content pieces across 30 days for a coach.",
    "Per piece: day (1 to 30), title (one sentence), stance (which pillar name), channel.",
    "Distribute roughly 10 per pillar. Tone matches voice texture. No em dashes.",
    "Return a JSON array of objects with keys: day, title, stance, channel.",
  ].join("\n");

  const prompt = [
    `Three pillars: ${pillars.map((p) => p.name).join(" | ")}`,
    `Voice texture: ${voice.texture.join(", ")}`,
    `Channel: ${channel}`,
    "",
    "JSON array of 30 pieces:",
  ].join("\n");

  const reply = await callAnthropic(system, prompt, 3200);
  const parsed = parseJsonFromReply<ContentPiece[]>(reply, []);
  return parsed.slice(0, 45);
}

async function persistFullRound(runId: string, payload: FullRoundPayload): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("cp_brand_os_runs")
    .update({
      voice_profile: payload.voiceProfile,
      landing_state: { text: payload.voiceProfile.landingState, cue: payload.voiceProfile.cue },
      pre_post_ritual: payload.prePostRitual,
      pillars: payload.pillars,
      held_draft: payload.heldDraft,
      channel_anchor: payload.heldDraft.target_channel,
      content_calendar: payload.contentCalendar,
      tier: "full_round",
      hold_until: payload.heldDraft.held_until,
      variant_v: "v5",
    })
    .eq("id", runId);
}

export async function generateFullRound(runId: string): Promise<FullRoundPayload> {
  const answers = await loadAllAnswers(runId);
  const channel = answers["distribution.q1"] ?? "newsletter";

  // Pull voice texture from the run's existing voice_profile (set by snapshot-generator).
  const admin = createAdminClient();
  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("voice_profile, anti_voice")
    .eq("id", runId)
    .maybeSingle();
  const voiceTexture: [string, string, string] = (run?.voice_profile?.texture as [string, string, string]) ?? ["GROUNDED", "DIRECT", "POETIC"];
  const antiVoice: string[] = (run?.anti_voice as string[]) ?? [];

  // Build voice protocol first; the rest depend on it.
  const voiceProfile = await buildVoiceProtocol(answers, voiceTexture);
  const prePostRitual = await buildPrePostRitual(voiceProfile.landingState, voiceProfile.practiceShort);

  // Pillars + draft can run in parallel.
  const [pillars, heldDraft] = await Promise.all([
    buildPillars(answers),
    polishHeldDraft(answers["round.unsaid"] ?? "", voiceProfile, channel, antiVoice),
  ]);

  // Calendar last (depends on pillars).
  const contentCalendar = await generateCalendar(pillars, voiceProfile, channel);

  const payload: FullRoundPayload = {
    voiceProfile,
    prePostRitual,
    pillars,
    heldDraft,
    contentCalendar,
    refuses: antiVoice,
  };

  await persistFullRound(runId, payload);
  return payload;
}
