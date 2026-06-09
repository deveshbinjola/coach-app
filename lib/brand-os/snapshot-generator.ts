// snapshot-generator · Brand OS v5
//
// Reads the 5 Snapshot answers from cp_brand_os_answers, classifies the
// archetype, extracts the voice texture, triangulates "The Move", and
// surfaces the 3 pillar seeds. Writes the result to cp_brand_os_runs
// (archetype, voice_profile, anti_voice, avatar_profile, pillars) and
// returns the SnapshotPayload for the reveal UI.

import { createAdminClient } from "@/lib/supabase-admin";
import type { SnapshotPayload } from "@/components/brand-os/SnapshotReveal";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5";

type SnapshotAnswers = {
  audience?: string;       // snapshot.audience text
  wound?: string;          // snapshot.wound text
  dissent?: string;        // snapshot.dissent text
  paragraph?: string;      // snapshot.paragraph text
  refrain?: string;        // snapshot.refrain text
  audienceTag?: "M" | "W" | "X";
  coachId?: string;
};

/** Pull the 5 snapshot answers for a run, plus the legacy proxy answers if v5 IDs are empty. */
async function loadSnapshotAnswers(runId: string): Promise<SnapshotAnswers> {
  const admin = createAdminClient();

  const { data: run } = await admin
    .from("cp_brand_os_runs")
    .select("audience, coach_id")
    .eq("id", runId)
    .maybeSingle();

  const { data: answers } = await admin
    .from("cp_brand_os_answers")
    .select("question_id, refined_text, raw_text")
    .eq("run_id", runId);

  const map = new Map<string, string>();
  for (const a of answers ?? []) {
    const text = (a.refined_text ?? a.raw_text ?? "").toString().trim();
    if (text) map.set(a.question_id, text);
  }

  return {
    // Prefer v5 IDs; fall back to legacy proxies for in-flight recovery runs.
    audience:  map.get("snapshot.audience")  ?? map.get("mirror.q1"),
    wound:     map.get("snapshot.wound")     ?? map.get("mirror.q11"),
    dissent:   map.get("snapshot.dissent")   ?? map.get("stance.q4"),
    paragraph: map.get("snapshot.paragraph") ?? map.get("signal.q1"),
    refrain:   map.get("snapshot.refrain")   ?? map.get("mirror.q8"),
    audienceTag: (run?.audience as "M" | "W" | "X" | undefined) ?? "X",
    coachId: run?.coach_id ?? undefined,
  };
}

async function callAnthropic(system: string, prompt: string, maxTokens = 800): Promise<string> {
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

/** Classify the brand archetype from the wound answer. */
async function classifyArchetype(wound: string): Promise<SnapshotPayload["archetype"]> {
  if (!wound) return "sage";
  const system = [
    "You classify a coach's brand archetype from their founder-wound answer.",
    "Six archetypes. Pick exactly one. Reply with ONLY the lowercase word.",
    "  sage     → needed to understand something nobody was explaining",
    "  lover    → needed to feel seen, accepted, in their body",
    "  warrior  → needed someone to tell the truth",
    "  magician → needed to be changed, transformed",
    "  creator  → needed to make something real",
    "  ruler    → needed to be in charge of the room, set the standard",
  ].join("\n");
  const reply = await callAnthropic(system, `Wound: ${wound}\n\nArchetype:`, 24);
  const word = reply.toLowerCase().match(/sage|lover|warrior|magician|creator|ruler/)?.[0];
  return (word ?? "sage") as SnapshotPayload["archetype"];
}

/** Extract 3 sensory voice words from the paragraph sample. */
async function extractVoiceTexture(paragraph: string, refrain?: string): Promise<[string, string, string]> {
  if (!paragraph) return ["GROUNDED", "DIRECT", "POETIC"];
  const system = [
    "You extract three sensory voice words from a coach's real writing sample.",
    "Sensory means: words that point at how the writing feels in the body, the room, the pace.",
    "Not adjectives like 'authentic' or 'real'.",
    "Examples of valid words: grounded, warm, slow, urgent, quiet-direct, devotional, somatic, precise, contrarian, instructional, embodied.",
    "Reply with ONLY three words, comma-separated, uppercase. No prefix. No quotes.",
  ].join("\n");
  const prompt = `Paragraph:\n${paragraph}\n\n${refrain ? `Refrain: ${refrain}\n\n` : ""}Three sensory voice words:`;
  const reply = await callAnthropic(system, prompt, 60);
  const words = reply
    .replace(/[^A-Za-z\-,\s]/g, "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w.toUpperCase());
  while (words.length < 3) words.push(["GROUNDED", "DIRECT", "POETIC"][words.length]);
  return [words[0], words[1], words[2]];
}

/** Triangulate "The Move You Have Been Missing" from refrain × paragraph × audience. */
async function triangulateTheMove(answers: SnapshotAnswers): Promise<string> {
  if (!answers.refrain && !answers.paragraph) {
    return "Write the post while you are in the landing state, not after.";
  }
  const system = [
    "You write ONE declarative sentence in Sunny Binjola's voice.",
    "Sunny voice: grounded, image-first, no em dashes, no jargon, eight-word density when possible, father-to-son register.",
    "The sentence names the gap between what the coach keeps SAYING (refrain) and what their content actually DOES (paragraph).",
    "It is a coaching insight, not a critique. One sentence. No preamble.",
  ].join("\n");
  const prompt = [
    `Coach says repeatedly: ${answers.refrain ?? "(unknown)"}`,
    "",
    `Their actual content texture (from a paragraph they wrote):`,
    answers.paragraph?.slice(0, 800) ?? "(unknown)",
    "",
    `Their audience: ${answers.audienceTag === "M" ? "men" : answers.audienceTag === "W" ? "women" : "mixed"}`,
    "",
    "Name the move they have been missing. One sentence. No quotes.",
  ].join("\n");
  const reply = await callAnthropic(system, prompt, 140);
  return reply.replace(/^["']|["']$/g, "").split("\n")[0].trim();
}

/** Surface 3 pillar seeds from wound + dissent + refrain. */
function pillarSeedsFrom(answers: SnapshotAnswers): SnapshotPayload["pillarSeeds"] {
  const oneSentence = (s?: string) =>
    (s ?? "").split(/[.!?]\s/)[0].slice(0, 120).trim() || "(pending)";
  return {
    cornerstone: oneSentence(answers.wound),
    edge:        oneSentence(answers.dissent),
    teaching:    oneSentence(answers.refrain),
  };
}

/** Persist the generated Snapshot to cp_brand_os_runs. */
async function persistSnapshot(runId: string, payload: SnapshotPayload, raw: {
  voiceTexture: [string, string, string];
  archetypeStatement: string;
  theMove: string;
}): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("cp_brand_os_runs")
    .update({
      archetype: payload.archetype,
      voice_profile: {
        texture: raw.voiceTexture,
        archetype_statement: raw.archetypeStatement,
        the_move: raw.theMove,
        generated_at: new Date().toISOString(),
      },
      pillars: payload.pillarSeeds,
      tier: "snapshot",
      variant_v: "v5",
    })
    .eq("id", runId);
}

export async function generateSnapshot(runId: string): Promise<SnapshotPayload> {
  const answers = await loadSnapshotAnswers(runId);

  const [archetype, voiceTexture, theMove] = await Promise.all([
    classifyArchetype(answers.wound ?? ""),
    extractVoiceTexture(answers.paragraph ?? "", answers.refrain),
    triangulateTheMove(answers),
  ]);

  const archetypeStatement = archetypeStatementFor(archetype);
  const pillarSeeds = pillarSeedsFrom(answers);

  const payload: SnapshotPayload = {
    archetype,
    archetypeStatement,
    voiceTexture,
    theMoveYouMissed: theMove,
    pillarSeeds,
  };

  await persistSnapshot(runId, payload, { voiceTexture, archetypeStatement, theMove });
  return payload;
}

function archetypeStatementFor(arch: SnapshotPayload["archetype"]): string {
  switch (arch) {
    case "sage":     return "Sages teach by revealing what is hidden. Your content lands when it makes the reader say 'no one else is saying this.' It breaks the moment you try to sell instead of show.";
    case "lover":    return "Lovers teach by inviting the body home. Your content lands when it reads as devotional practice. It breaks when you try to convince instead of attune.";
    case "warrior":  return "Warriors teach by telling the truth nobody else will. Your content lands when the reader feels permission to stop pretending. It breaks the moment it gets diplomatic.";
    case "magician": return "Magicians teach by reframing. Your content lands when you name a thing nobody else has named. It breaks the moment you slide into general coach language.";
    case "creator":  return "Creators teach by making the thing in public. Your content lands when the reader sees the work being done. It breaks the moment it becomes about the work instead of from it.";
    case "ruler":    return "Rulers teach by holding the standard. Your content lands when the reader feels invited into a higher floor. It breaks the moment it sounds like permission instead of invitation.";
  }
}
