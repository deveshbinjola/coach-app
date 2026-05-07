// Edge Function: voice-demo-draft
//
// The /welcome onboarding "magic moment" — but now in side-by-side mode.
// Two drafts, same inbound message, same model:
//
//   1. generic_draft — what a "generic AI" would write. No voice profile,
//      no tone matching, no signature patterns. Competent and polite.
//      This is what the coach would get from any other tool in the space.
//
//   2. draft        — what THEIR AI writes. Their voice profile, their
//      sample messages, their do-nots. The version that converts.
//
// Showing them next to each other is the difference between "the AI does
// what AIs do" and "this AI is mine." That contrast is the screenshot
// moment — the thing a coach sends to a friend.
//
// Cost: 2x Anthropic calls per onboarding magic moment. Volume is tiny
// (one per new coach), so the cost is rounding error against word-of-mouth.
//
// Auth: user JWT only.
// Input:  { inbound_message: string }
// Output: { draft, generic_draft, voice_version }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800;
const MAX_INBOUND_CHARS = 2000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    // Scope to coach via JWT so RLS auto-filters voice profile lookup.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { inbound_message } = (await req.json()) as {
      inbound_message?: string;
    };
    if (!inbound_message || typeof inbound_message !== "string") {
      return json({ error: "inbound_message required" }, 400);
    }
    const trimmed = inbound_message.trim().slice(0, MAX_INBOUND_CHARS);
    if (trimmed.length < 10) {
      return json({ error: "inbound_message too short" }, 400);
    }

    const { data: voiceProfile } = await supabase
      .from("cp_voice_profiles")
      .select("voice_json, sample_messages, version")
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ error: "ANTHROPIC_API_KEY not configured" }, 500);
    }

    const userPrompt = `A lead sent you this message:

"""
${trimmed}
"""

Write a single-message reply in the appropriate voice. Don't sign off with a name (that gets appended later). Aim for 2-5 sentences unless the message clearly calls for shorter or longer. Output the reply text only. No preamble, no quotes around it, no explanation. Do not use em-dashes (—) anywhere in your reply.`;

    // Two parallel calls. They use the same model and the same user prompt;
    // the system prompt is what differs. We deliberately use the SAME model
    // for both so the contrast is "voice vs no voice," not "good model vs
    // bad model" — that'd be cheating.
    const [voiceRes, genericRes] = await Promise.all([
      callAnthropic({
        apiKey,
        systemPrompt: buildVoiceSystemPrompt(voiceProfile),
        userPrompt,
      }),
      callAnthropic({
        apiKey,
        systemPrompt: buildGenericSystemPrompt(),
        userPrompt,
      }),
    ]);

    if (!voiceRes.ok) {
      return json(
        { error: `Anthropic API (voice) ${voiceRes.status}: ${voiceRes.text}` },
        502
      );
    }
    if (!genericRes.ok) {
      return json(
        { error: `Anthropic API (generic) ${genericRes.status}: ${genericRes.text}` },
        502
      );
    }

    const draft = voiceRes.text.trim();
    const generic_draft = genericRes.text.trim();
    if (!draft || !generic_draft) {
      return json({ error: "Model returned empty draft" }, 502);
    }

    return json({
      draft,
      generic_draft,
      voice_version: voiceProfile?.version ?? null,
    });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

// ---------- helpers ----------

type VoiceProfileRow = {
  voice_json: unknown;
  sample_messages: string[] | null;
  version: number;
} | null;

async function callAnthropic({
  apiKey,
  systemPrompt,
  userPrompt,
}: {
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
}): Promise<{ ok: true; text: string } | { ok: false; status: number; text: string }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, text };
  }
  const result = await res.json();
  const text = result?.content?.[0]?.text ?? "";
  return { ok: true, text };
}

/** "Their AI" — full voice profile, sample messages, do-nots. The good
 *  version. */
function buildVoiceSystemPrompt(profile: VoiceProfileRow): string {
  const parts = [
    "You are a writing assistant for a men's coach. Your job is to draft",
    "ONE message reply to a lead in the COACH'S voice. Not your voice. Not",
    "a generic helpful-AI voice. Their voice.",
    "",
    "Always:",
    "- Match the cadence, vocabulary, and emotional register described below.",
    "- Be direct. No filler openers (\"I hope this finds you well\", etc.).",
    "- Sound like a person who's already in conversation, not selling.",
    "",
    "Never:",
    "- Use words explicitly listed under do_nots / vocabulary.avoid.",
    "- Overuse exclamation points or emojis unless the voice profile",
    "  shows the coach uses them.",
    "- Add a signature, name, or any post-message metadata.",
    "- Use em-dashes (—). Use periods, commas, colons, or parentheses",
    "  instead. Em-dashes are a known AI tell and undermine voice fidelity.",
    "",
  ];

  if (profile?.voice_json) {
    parts.push(
      "VOICE PROFILE (the coach's actual voice):",
      "```json",
      JSON.stringify(profile.voice_json, null, 2),
      "```",
      ""
    );
  } else {
    parts.push(
      "NOTE: The coach hasn't set up a voice profile yet. Default to a",
      "warm-but-direct men's-coaching tone. Short sentences. No corporate",
      "jargon. No fluffy validation. Speak like a thoughtful friend who's",
      "already done this work."
    );
  }

  if (profile?.sample_messages && profile.sample_messages.length > 0) {
    parts.push(
      "SAMPLE MESSAGES (this is HOW the coach writes. Match this rhythm.):"
    );
    profile.sample_messages.forEach((m, i) => {
      parts.push(`--- Sample ${i + 1} ---`, m);
    });
    parts.push("");
  }

  return parts.join("\n");
}

/** "Generic AI" — what every other tool in the space produces. Competent.
 *  Polite. Bland. The version that doesn't get sent. The version the coach
 *  has been complaining about for two years.
 *
 *  We are NOT making this deliberately bad — that'd feel staged. We're
 *  making it the honest baseline: a helpful AI assistant writing a
 *  reasonable reply with no voice grounding. Most coaches will instantly
 *  recognize it as "the AI message I would have ignored." */
function buildGenericSystemPrompt(): string {
  return [
    "You are an AI writing assistant. A coach has received a message from",
    "a lead and needs a reply. Draft a reasonable, professional, helpful",
    "response.",
    "",
    "Aim for warm and friendly. Be reasonably concise. Acknowledge what",
    "they said and offer a clear next step.",
    "",
    "Output the reply text only. No preamble, no quotes around it, no",
    "explanation. Do not sign off with a name. Do not use em-dashes (—);",
    "use periods, commas, or colons instead.",
  ].join("\n");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}
