// POST /api/brand-os/synthesize
//
// Reads all answers for a run, calls Anthropic to generate a structured
// Brand OS deliverable (voice DNA, pillars, keywords, strengths, gaps,
// next steps, markdown export), stores it on cp_brand_os_runs.synthesis_json.
//
// Idempotent: if synthesis already exists and ?force=true is not set,
// returns the cached version. Output endpoint hits this lazily on first
// visit so the coach sees a real deliverable, not a Q&A dump.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getQuestion, pick, type Audience } from "@/lib/brand-os/questions";
import { getVoiceProfile, deriveProfileSlug, type VoiceProfileSlug, type AudienceSelf, type AudienceServes } from "@/lib/voice-profiles";
import { buildOverlayFromSynthesis, saveBrandVoiceOverlay } from "@/lib/brand-os/voice-overlay";

export const runtime = "edge";

export type BrandOsSynthesis = {
  // ── Headline ────────────────────────────────────────────
  positioning_line: string;          // refined "who I help" — 1 sentence, sharper than mirror.q1
  signature_line:   string;          // pulled/refined from mirror.q8 (11pm sentence) — the killer line

  // ── Voice DNA ──────────────────────────────────────────
  voice_dna: {
    tone: string;                    // e.g. "direct, embodied, intellectually rigorous"
    rhythm: string;                  // e.g. "short declarative + the occasional long unspooling sentence"
    signature_moves: string[];       // 3–5 things they do that AI can't fake
    vocab_yes: string[];             // 10–15 words/phrases they actually use
    vocab_no:  string[];             // 8–12 words/phrases to never use (their anti-vocab)
  };

  // ── Buyer Mirror ───────────────────────────────────────
  buyer_mirror: {
    name: string;                    // the avatar's first name
    one_line_portrait: string;       // single sentence: who they are right now
    body_state: string;              // somatic answer, sensory not analytical
    secret_sentence: string;         // the 11pm one-sentence — straight quote or close
    graveyard: string;               // what they've already tried
  };

  // ── Pillars ─────────────────────────────────────────────
  pillars: Array<{
    name: string;                    // 2–4 word pillar name
    why: string;                     // one sentence: why this earns the spot
    enemy: string;                   // what this pillar pushes against
    proof: string;                   // your evidence / lived experience
  }>;

  // ── Content keywords ──────────────────────────────────
  keywords: string[];                // 12–18 SEO/topic keywords for content engine

  // ── Resonance hooks ───────────────────────────────────
  resonance_hooks: Array<{
    headline: string;
    angle: string;
    pillar: string;                  // which pillar it belongs to
  }>; // 5 ship-this-week content angles

  // ── Strengths / Gaps ───────────────────────────────────
  strengths: string[];               // 3–5 things already strong
  gaps:      string[];               // 3–5 things to work on
  what_great: string;                // one paragraph: what's working
  what_not:   string;                // one paragraph: what's missing or generic

  // ── Action plan ────────────────────────────────────────
  next_steps: Array<{
    action: string;
    why: string;
    when: string;                    // "this week" / "this month" / "before next cohort"
  }>;

  // ── Full markdown export ──────────────────────────────
  // Server-rendered from the fields above (we do this in TS, not LLM, to
  // guarantee structure).
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";

  let body: { runId?: string };
  try {
    body = (await request.json()) as { runId?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const runId = (body.runId ?? "").trim();
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  // Verify ownership + grab run.
  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id, audience, variant, synthesis_json")
    .eq("id", runId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  // Return cached unless forced. Also opportunistically (re-)write the
  // voice overlay — covers the case where the synthesis pre-dates the
  // overlay feature.
  if (!force && run.synthesis_json) {
    try {
      const overlay = buildOverlayFromSynthesis(run.synthesis_json as BrandOsSynthesis, runId);
      await saveBrandVoiceOverlay(supabase, user.id, overlay);
    } catch (e) {
      console.error("[brand-os/synthesize] overlay refresh on cache hit failed:", e);
    }
    return NextResponse.json({ synthesis: run.synthesis_json, cached: true });
  }

  // Pull all answers.
  const { data: answers } = await supabase
    .from("cp_brand_os_answers")
    .select("question_id, raw_text, module")
    .eq("run_id", runId);

  if (!answers || answers.length < 3) {
    return NextResponse.json({ error: "not_enough_answers" }, { status: 400 });
  }

  // Pull coach voice profile for tone register.
  const { data: coach } = await supabase
    .from("cp_coaches")
    .select("audience_self, audience_serves, voice_profile_slug")
    .eq("user_id", user.id)
    .maybeSingle();

  const audience = run.audience as Audience;
  const profileSlug: VoiceProfileSlug | null =
    (coach?.voice_profile_slug as VoiceProfileSlug | null) ??
    deriveProfileSlug(
      (coach?.audience_self as AudienceSelf | null) ?? "integrated",
      (coach?.audience_serves as AudienceServes | null) ?? "both",
    );
  const profile = getVoiceProfile(profileSlug);

  // Build the AI input — labelled Q&A blocks.
  const qaBlocks = answers
    .filter((a) => (a.raw_text ?? "").trim().length > 0)
    .map((a) => {
      const q = getQuestion(a.question_id);
      const prompt = q ? pick(q.prompt, audience) : a.question_id;
      return `### ${a.question_id} (${a.module})\nQ: ${prompt}\nA: ${(a.raw_text ?? "").slice(0, 4000)}`;
    })
    .join("\n\n");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API not configured." }, { status: 500 });
  }

  const sysPrompt = buildSynthesisPrompt(audience, profile.audienceDescription);
  const userPrompt = `Here are the coach's answers. Synthesize the Brand OS deliverable as STRICT JSON only.\n\n${qaBlocks}`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4500,
      system: sysPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    return NextResponse.json({ error: "anthropic_error", detail: detail.slice(0, 500) }, { status: 502 });
  }

  const aiData = await aiRes.json() as { content?: Array<{ type: string; text?: string }> };
  const raw = aiData.content?.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({ error: "could_not_parse", raw: raw.slice(0, 500) }, { status: 502 });
  }

  let synthesis: BrandOsSynthesis;
  try {
    synthesis = JSON.parse(jsonMatch[0]) as BrandOsSynthesis;
  } catch {
    return NextResponse.json({ error: "invalid_json", raw: raw.slice(0, 500) }, { status: 502 });
  }

  // Persist the synthesis on the run.
  await supabase
    .from("cp_brand_os_runs")
    .update({
      synthesis_json: synthesis,
      synthesized_at: new Date().toISOString(),
    })
    .eq("id", runId);

  // Distill into the voice overlay and push to cp_coaches so every
  // downstream content-gen call starts using the coach's actual voice
  // instead of the generic 6-slug register. Non-fatal if it fails —
  // synthesis is the deliverable, overlay is a bonus channel.
  try {
    const overlay = buildOverlayFromSynthesis(synthesis, runId);
    await saveBrandVoiceOverlay(supabase, user.id, overlay);
  } catch (e) {
    console.error("[brand-os/synthesize] failed to persist voice overlay:", e);
  }

  return NextResponse.json({ synthesis, cached: false });
}

function buildSynthesisPrompt(audience: Audience, audienceDesc: string): string {
  const register =
    audience === "M" ? "masculine-coded, direct, edge-aware, purpose-driven"
    : audience === "W" ? "feminine-coded, somatic, nervous-system aware, embodied"
    : "balanced, soft-direct";

  return `You are the Brand OS synthesizer. The coach just finished a guided brand discovery quiz. Your job: produce a *deliverable*, not a recap. A coach should read this and feel "this is me, but sharper than I could have written it myself."

VOICE REGISTER (the coach's working register): ${register}
THEIR AUDIENCE: ${audienceDesc}

QUALITY BAR
- "Positioning line" must NOT read like "I help [type] go from [pain] to [outcome]." That template is banned. Write what they actually do, using their actual specifics.
- "Signature line" is pulled from their answers — closest to the 11pm-drink-in-hand sentence (mirror.q8) — or refined slightly to land cleaner. Never invented from scratch.
- "Voice DNA" comes from reading their signal.q1 writing samples. signature_moves are things THIS coach does that a generic AI mimicker wouldn't. vocab_yes / vocab_no are observed, not aspirational.
- "Pillars" come from their stance.q3 JSON if present (look for {scores:[{candidate, depth, pull, anchor}]} — keep the 3 with highest totals). Each pillar gets an enemy (what it pushes against) and proof (their evidence).
- "Keywords" are SEO + content-engine keywords a coach in their lane should be claiming. 12–18 of them. Mix head terms and long-tail.
- "Resonance hooks" are 5 specific content angles they could ship in the next 7 days. Use their pillar names. Use their vocab. Headline + 1-line angle + pillar tag.
- "Strengths" / "Gaps" are honest. Don't sycophant. If their positioning is generic, say so in "gaps" and in "what_not".
- "Next steps" are 3 actions: action + why + when. Specific.

STRICT OUTPUT: Return ONLY a single JSON object matching this exact shape:

{
  "positioning_line": "string",
  "signature_line": "string",
  "voice_dna": {
    "tone": "string",
    "rhythm": "string",
    "signature_moves": ["string", ...],
    "vocab_yes": ["string", ...],
    "vocab_no": ["string", ...]
  },
  "buyer_mirror": {
    "name": "string",
    "one_line_portrait": "string",
    "body_state": "string",
    "secret_sentence": "string",
    "graveyard": "string"
  },
  "pillars": [
    { "name": "string", "why": "string", "enemy": "string", "proof": "string" }
  ],
  "keywords": ["string", ...],
  "resonance_hooks": [
    { "headline": "string", "angle": "string", "pillar": "string" }
  ],
  "strengths": ["string", ...],
  "gaps": ["string", ...],
  "what_great": "string",
  "what_not": "string",
  "next_steps": [
    { "action": "string", "why": "string", "when": "string" }
  ]
}

NO prose around the JSON. NO markdown code fences. NO commentary. Just the JSON object.`;
}
