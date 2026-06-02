// POST /api/funnels/generate
//
// Generates a 5-question Resonance Quiz from the coach's Brand OS
// synthesis. Reads cp_brand_os_runs.synthesis_json, sends to Claude
// Sonnet 4.6, validates the response as strict FunnelConfig JSON,
// creates a cp_funnels row, and returns the new funnel.
//
// Requires: authenticated coach with at least one completed Brand OS run.
// Rate limit: 4 per minute (quiz generation is ~$0.03 per call).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { generateFunnelSlug } from "@/lib/funnel-slug";
import { buildBriefBlock } from "@/lib/funnel-config";
import type { BrandOsSynthesis } from "@/app/api/brand-os/synthesize/route";

export const runtime = "edge";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// ── Types ────────────────────────────────────────────────

type FunnelChoice = {
  key: string;
  text: string;
  scores: Record<string, number>;
};

type FunnelQuestion = {
  id: string;
  text: string;
  choices: FunnelChoice[];
};

type FunnelResult = {
  key: string;
  pillar_name: string;
  headline: string;
  body: string;
  cta_text: string;
  cta_url: string;
};

type FunnelConfig = {
  intro: {
    headline: string;
    subhead: string;
    cta_label: string;
  };
  questions: FunnelQuestion[];
  results: FunnelResult[];
  branding: {
    primary_hex: string;
    accent_hex: string;
    background_hex: string;
    font_family: string;
  };
};

type GenerateBody = {
  runId?: string;
  ctaUrl?: string;
};

// ── Handler ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimitByUser(user.id, "funnels/generate", 4, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });
  }

  let body: GenerateBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
  }

  // ── Fetch synthesis ────────────────────────────────────

  // If runId is provided, use that specific run. Otherwise, fetch the
  // most recent completed run with a synthesis.
  let synthesisQuery = supabase
    .from("cp_brand_os_runs")
    .select("id, synthesis_json")
    .eq("coach_id", user.id)
    .not("synthesis_json", "is", null);

  if (body.runId) {
    synthesisQuery = synthesisQuery.eq("id", body.runId);
  } else {
    synthesisQuery = synthesisQuery
      .eq("state", "complete")
      .order("synthesized_at", { ascending: false })
      .limit(1);
  }

  const { data: runs, error: runError } = await synthesisQuery;

  if (runError || !runs || runs.length === 0) {
    return NextResponse.json(
      { error: "No completed Brand OS found. Complete Brand OS first to generate a quiz." },
      { status: 404 }
    );
  }

  const run = runs[0];
  const synthesis = run.synthesis_json as BrandOsSynthesis;

  if (!synthesis.pillars || synthesis.pillars.length < 2) {
    return NextResponse.json(
      { error: "Brand OS synthesis needs at least 2 pillars to generate a quiz." },
      { status: 422 }
    );
  }

  // ── Fetch branding ─────────────────────────────────────

  const { data: coachRow } = await supabase
    .from("cp_coaches")
    .select("brand_primary_hex, brand_font, business_name")
    .eq("id", user.id)
    .single();

  const branding = {
    primary_hex: coachRow?.brand_primary_hex || "#00FF41",
    accent_hex: darkenHex(coachRow?.brand_primary_hex || "#00FF41", 20),
    background_hex: "#FAFAF8",
    font_family: coachRow?.brand_font || "Plus Jakarta Sans",
  };

  // ── Build prompt ───────────────────────────────────────

  // Take up to 3 pillars for the quiz archetypes.
  const pillars = synthesis.pillars.slice(0, 3);
  const pillarKeys = pillars.map((_, i) => `pillar_${i + 1}`);

  const ctaUrl = body.ctaUrl || "";

  const systemPrompt = buildSystemPrompt(pillarKeys);
  const userPrompt = buildUserPrompt(synthesis, pillars, ctaUrl);

  // ── Call Anthropic ─────────────────────────────────────

  let config: FunnelConfig | null = null;
  let attempts = 0;

  while (!config && attempts < 2) {
    attempts++;
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const json = await res.json();
    const text = String(json?.content?.[0]?.text ?? "").trim();
    config = parseAndValidateConfig(text, pillarKeys, branding);
  }

  if (!config) {
    return NextResponse.json(
      { error: "Could not generate quiz. Try again or edit your Brand OS." },
      { status: 422 }
    );
  }

  // ── Save to database ───────────────────────────────────

  const title = config.intro.headline || "Your Brand Quiz";
  const slug = generateFunnelSlug(title);

  const admin = createAdminClient();
  const { data: funnel, error: insertError } = await admin
    .from("cp_funnels")
    .insert({
      coach_id: user.id,
      slug,
      type: "resonance",
      title,
      config,
      published: false,
      generated_from_run_id: run.id,
    })
    .select("id, slug, title, config, published, created_at")
    .single();

  if (insertError) {
    // Slug collision: regenerate with new suffix
    if (insertError.code === "23505") {
      const retrySlug = generateFunnelSlug(title);
      const { data: retry, error: retryErr } = await admin
        .from("cp_funnels")
        .insert({
          coach_id: user.id,
          slug: retrySlug,
          type: "resonance",
          title,
          config,
          published: false,
          generated_from_run_id: run.id,
        })
        .select("id, slug, title, config, published, created_at")
        .single();

      if (retryErr) {
        return NextResponse.json({ error: "Failed to save quiz." }, { status: 500 });
      }
      return NextResponse.json({ funnel: retry });
    }
    return NextResponse.json({ error: "Failed to save quiz." }, { status: 500 });
  }

  return NextResponse.json({ funnel });
}

// ── Prompt builders ──────────────────────────────────────

function buildSystemPrompt(pillarKeys: string[]): string {
  const scoreShape = pillarKeys.reduce((acc, k) => ({ ...acc, [k]: 0 }), {} as Record<string, number>);
  const scoreExample = JSON.stringify(scoreShape);

  return [
    "You are generating a 5-question Resonance Quiz funnel for a coach.",
    "The quiz segments visitors into 3 archetypes, one per pillar from the coach's Brand OS.",
    "",
    "OUTPUT: Strict JSON matching this schema (no markdown fences, no explanation):",
    "{",
    '  "intro": { "headline": string, "subhead": string, "cta_label": "Start" },',
    '  "questions": [',
    "    {",
    `      "id": "q1", "text": string,`,
    `      "choices": [`,
    `        { "key": "a", "text": string, "scores": ${scoreExample} },`,
    `        { "key": "b", "text": string, "scores": ${scoreExample} },`,
    `        { "key": "c", "text": string, "scores": ${scoreExample} }`,
    "      ]",
    "    }",
    "    // ... 5 questions total",
    "  ],",
    '  "results": [',
    `    { "key": "${pillarKeys[0]}", "pillar_name": string, "headline": string, "body": string, "cta_text": string, "cta_url": string }`,
    "    // ... one result per pillar",
    "  ]",
    "}",
    "",
    "RULES:",
    "- Exactly 5 questions, each with exactly 3 choices (keys a, b, c)",
    "- Each choice scores 0 or 2 toward exactly ONE pillar, 0 for all others",
    "- Question style: situational ('When X happens, what do you do?'), not abstract",
    "- Use the coach's vocab_yes words where natural; never use their vocab_no words",
    "- Address the named buyer mirror in second person where natural",
    "- Result body: 2-3 sentences in the coach's voice, tying the pillar to what this type wrestles with",
    "- result headline format: \"You're a [archetype name].\"",
    "- intro.headline: a curiosity hook in the coach's voice register",
    "- intro.subhead: describes the quiz (e.g. '5 questions. ~60 seconds. See how you show up.')",
    "- NO coach jargon: transformation, unlock, level up, thrive, journey",
    "- NO em dashes",
    "- Return ONLY the JSON object. No markdown fences. No explanation.",
    "",
    "VOICE FIDELITY (non-negotiable): The quiz's voice, tone, and vocabulary come ONLY from the coach's Brand OS voice DNA below — never from the register of the brief. Use their vocab_yes language, honor their signature moves, avoid their vocab_no words and generic coaching jargon, and never use em dashes. If the brief is written in flat or corporate language, do NOT mirror that — translate the intent into the coach's voice.",
    "RESULTS: Always resolve to exactly the 3 pillar archetypes provided. Never invent a 4th archetype or drop a pillar, even if the brief's topic seems unrelated — frame the questions around the brief's topic while still mapping to these 3 pillars.",
  ].join("\n");
}

function buildUserPrompt(
  synthesis: BrandOsSynthesis,
  pillars: BrandOsSynthesis["pillars"],
  ctaUrl: string,
  brief?: string
): string {
  return buildBriefBlock(brief) + [
    "Generate a Resonance Quiz from this coach's Brand OS synthesis.",
    "",
    `POSITIONING: ${synthesis.positioning_line}`,
    `SIGNATURE LINE: ${synthesis.signature_line}`,
    "",
    "VOICE DNA:",
    `  Tone: ${synthesis.voice_dna.tone}`,
    `  Rhythm: ${synthesis.voice_dna.rhythm}`,
    `  Signature moves: ${synthesis.voice_dna.signature_moves.join(", ")}`,
    `  Use these words: ${synthesis.voice_dna.vocab_yes.join(", ")}`,
    `  Never use: ${synthesis.voice_dna.vocab_no.join(", ")}`,
    "",
    "BUYER MIRROR:",
    `  Name: ${synthesis.buyer_mirror.name}`,
    `  Portrait: ${synthesis.buyer_mirror.one_line_portrait}`,
    `  Body state: ${synthesis.buyer_mirror.body_state}`,
    `  What they've tried: ${synthesis.buyer_mirror.graveyard}`,
    "",
    "PILLARS (these become the 3 result archetypes):",
    ...pillars.map((p, i) =>
      `  Pillar ${i + 1} (key: pillar_${i + 1}): "${p.name}" — ${p.why}. Enemy: ${p.enemy}. Proof: ${p.proof}`
    ),
    "",
    `CTA URL for all results: ${ctaUrl || "(leave empty, coach will set later)"}`,
    "",
    "Generate the quiz now. Return ONLY the JSON.",
  ].join("\n");
}

// ── Validation ───────────────────────────────────────────

function parseAndValidateConfig(
  text: string,
  pillarKeys: string[],
  branding: FunnelConfig["branding"]
): FunnelConfig | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);

    // Validate intro
    if (!parsed.intro?.headline || !parsed.intro?.subhead) return null;

    // Validate questions
    if (!Array.isArray(parsed.questions) || parsed.questions.length !== 5) return null;
    for (const q of parsed.questions) {
      if (!q.id || !q.text || !Array.isArray(q.choices) || q.choices.length !== 3) return null;
      for (const c of q.choices) {
        if (!c.key || !c.text || typeof c.scores !== "object") return null;
      }
    }

    // Validate results
    if (!Array.isArray(parsed.results) || parsed.results.length < 2) return null;
    for (const r of parsed.results) {
      if (!r.key || !r.pillar_name || !r.headline || !r.body) return null;
    }

    // Ensure result keys match pillar keys
    const resultKeys = new Set(parsed.results.map((r: FunnelResult) => r.key));
    for (const pk of pillarKeys) {
      if (!resultKeys.has(pk)) return null;
    }

    // Attach branding (not AI-generated, from coach settings)
    return {
      intro: {
        headline: String(parsed.intro.headline),
        subhead: String(parsed.intro.subhead),
        cta_label: String(parsed.intro.cta_label || "Start"),
      },
      questions: parsed.questions.map((q: FunnelQuestion, i: number) => ({
        id: q.id || `q${i + 1}`,
        text: String(q.text),
        choices: q.choices.map((c: FunnelChoice) => ({
          key: String(c.key),
          text: String(c.text),
          scores: c.scores,
        })),
      })),
      results: parsed.results.map((r: FunnelResult) => ({
        key: String(r.key),
        pillar_name: String(r.pillar_name),
        headline: String(r.headline),
        body: String(r.body),
        cta_text: String(r.cta_text || "Learn more"),
        cta_url: String(r.cta_url || ""),
      })),
      branding,
    } satisfies FunnelConfig;
  } catch {
    return null;
  }
}

// ── Helpers ──────────────────────────────────────────────

function darkenHex(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const r = Math.max(0, parseInt(clean.slice(0, 2), 16) - amount);
  const g = Math.max(0, parseInt(clean.slice(2, 4), 16) - amount);
  const b = Math.max(0, parseInt(clean.slice(4, 6), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
