import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import type { VoiceProfile } from "@/lib/types";
import { loadBrandVoiceOverlay, renderOverlayPromptBlock } from "@/lib/brand-os/voice-overlay";

export const runtime = 'edge';

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

type HookArchetype =
  | "quiet_contradiction"
  | "unsayable_truth"
  | "identity_mirror"
  | "pain_question"
  | "curiosity_gap"
  | "framework_reveal";

const ARCHETYPE_INSTRUCTIONS: Record<HookArchetype, string> = {
  quiet_contradiction:
    "Quiet Contradiction: sets up an expectation, then refuses it. The reader thought they were doing X, but they were actually doing Y. Example energy: 'You built a job not a business.'",
  unsayable_truth:
    "Unsayable Truth: names what the reader felt but never articulated. Slightly uncomfortable, immediately recognizable. Example energy: 'Nobody can tell your content from anyone else's.'",
  identity_mirror:
    "Identity Mirror: names the reader more precisely than they'd name themselves. They see themselves and can't look away. Example energy: 'You're not the CEO. You're the entire company.'",
  pain_question:
    "Pain Question: opens with the ache the reader is already carrying. Not a generic question — the specific one they ask themselves at 2am. Example energy: 'Your best clients are leaving at checkout.'",
  curiosity_gap:
    "Curiosity Gap: starts something the brain can't close without swiping. An unfinished idea, a contradiction that demands resolution. Example energy: 'You're feeding offers that will never feed you back.'",
  framework_reveal:
    "Framework Reveal: teases a named system without naming it yet. The reader senses there's a structure they're missing. The acronym lives on Slide 2, not the cover. Example energy: 'There's a 4-letter system behind every coach who scales without burning out.' or 'I stopped giving advice. I started giving frameworks.'",
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimitByUser(user.id, "content/hooks", 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { archetype?: unknown; angle?: unknown; audienceSignal?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const archetype = normalizeArchetype(body.archetype);
  const angle = cleanText(body.angle, 240);
  const audienceSignal = cleanText(body.audienceSignal, 500);

  const [profileRes, brandOverlay] = await Promise.all([
    supabase
      .from("cp_voice_profiles")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadBrandVoiceOverlay(supabase, user.id),
  ]);

  const profile = (profileRes.data as VoiceProfile | null) ?? null;
  const overlayBlock = renderOverlayPromptBlock(brandOverlay);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ hooks: fallbackHooks(archetype, angle) });
  }

  const system = [
    overlayBlock ?? "",
    "You generate Instagram carousel cover hooks for a coach.",
    "Use the coach's voice profile as the source of truth for tone and language.",
    "Do not use em dash characters.",
    "Return ONLY a JSON array of exactly 3 strings. No explanation, no markdown.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const prompt = [
    `Generate 3 Instagram carousel cover hooks using this archetype:`,
    "",
    ARCHETYPE_INSTRUCTIONS[archetype],
    "",
    "HOOK PSYCHOLOGY RULES (apply to every hook):",
    "Every hook must pass the 3-job test:",
    "  1. GET NOTICED (pattern interrupt in under 250ms)",
    "  2. ACTIVATE SELF-REFERENCE (reader feels NAMED, not addressed)",
    "  3. OPEN A LOOP (brain can't close it without swiping)",
    "",
    "FORMAT RULES:",
    "  - Maximum 30 words per hook",
    "  - 4-6 lines when displayed at large text (5-7 words per line)",
    "  - Identity-level: name WHO the reader IS, not what their problem is",
    "  - Felt, not explained: reader should feel something before understanding",
    "  - Last word(s) carry the contradiction or sting",
    "  - NEVER use framework names, jargon, or technical terms",
    "  - NEVER use abstract noun + grandiose verb ('unlock potential', 'scale impact')",
    "  - Must NOT sound like a generic LinkedIn coach wrote it",
    "",
    "CLICHE SELF-CHECK (reject and regenerate if any hook fails):",
    "  - Would a Tony Robbins-adjacent coach post this? Reject.",
    "  - Is there an abstract noun + grandiose verb? Reject.",
    "  - Could this be anyone's hook? Reject. It must feel specific.",
    "",
    "COACH ANGLE:",
    angle || "(generate hooks about the coach's core expertise)",
    "",
    "AUDIENCE SIGNAL:",
    audienceSignal || "(none)",
    "",
    "VOICE PROFILE:",
    JSON.stringify(profile?.voice_json ?? {}, null, 2),
    "",
    "VOICE SAMPLES:",
    (profile?.sample_messages ?? []).slice(0, 3).join("\n\n") || "(none)",
    "",
    "Return a JSON array of exactly 3 hook strings. Each hook should feel distinctly different while matching the archetype.",
  ].join("\n");

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ hooks: fallbackHooks(archetype, angle) });
    }

    const json = await res.json();
    const text = String(json?.content?.[0]?.text ?? "").trim();
    const hooks = parseHooks(text);
    if (hooks) {
      return NextResponse.json({ hooks });
    }
    return NextResponse.json({ hooks: fallbackHooks(archetype, angle) });
  } catch {
    return NextResponse.json({ hooks: fallbackHooks(archetype, angle) });
  }
}

function parseHooks(text: string): string[] | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (
      Array.isArray(parsed) &&
      parsed.length >= 2 &&
      parsed.every((item) => typeof item === "string" && item.length > 0)
    ) {
      return parsed.slice(0, 3).map((h) => stripEmDash(h.trim()));
    }
    return null;
  } catch {
    return null;
  }
}

function fallbackHooks(archetype: HookArchetype, angle: string): string[] {
  const topic = angle || "your business";
  const fallbacks: Record<HookArchetype, string[]> = {
    quiet_contradiction: [
      `You're doing everything right. That's the problem.`,
      `The harder you work the further you fall behind.`,
      `You built exactly what you were told to build. It's not working.`,
    ],
    unsayable_truth: [
      `Nobody is going to tell you this so I will.`,
      `The thing you're avoiding is the only thing that matters.`,
      `You already know what's wrong. You just don't want to fix it.`,
    ],
    identity_mirror: [
      `You're not running a business. You're surviving one.`,
      `You look successful. You feel stuck.`,
      `Everyone thinks you have it figured out. You don't.`,
    ],
    pain_question: [
      `Why does ${topic} still feel this hard?`,
      `You've tried everything. Nothing sticks.`,
      `Same effort. Same result. Every single month.`,
    ],
    curiosity_gap: [
      `There's one thing separating you from the coaches who scale.`,
      `I changed one thing about ${topic}. Everything shifted.`,
      `The answer isn't what you think it is.`,
    ],
    framework_reveal: [
      `There's a 4-letter system behind every coach who scales without burning out.`,
      `I stopped giving advice about ${topic}. I started giving frameworks.`,
      `The coaches who win aren't working harder. They have a system you don't.`,
    ],
  };
  return fallbacks[archetype];
}

function normalizeArchetype(value: unknown): HookArchetype {
  if (
    value === "quiet_contradiction" ||
    value === "unsayable_truth" ||
    value === "identity_mirror" ||
    value === "pain_question" ||
    value === "curiosity_gap" ||
    value === "framework_reveal"
  ) {
    return value;
  }
  return "quiet_contradiction";
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return stripEmDash(value).trim().slice(0, maxLength);
}

function stripEmDash(value: string): string {
  return value.replaceAll("—", ",");
}
