// POST /api/brand-os-preview
//
// Public, no-auth endpoint. Powers the free "Try one question" widget on
// elevateaisystem.com/brand-os. The marketing site calls this cross-origin;
// CORS is open to the canonical marketing domains.
//
// Body: { prompt?: "positioning", answer: string }
//
// Returns: { verdict, headline, body, next_prompt, what_brand_os_would_do }
//   verdict ∈ { "push_back", "affirm" }
//
// Lives in coach-app (not on the marketing site) so we don't have to leak
// the Anthropic key onto the static marketing Pages project. The key
// already exists here for every other Brand OS endpoint.

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

const DEFAULT_MODEL = "claude-haiku-4-5";
const MAX_ANSWER_CHARS = 1500;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

// CORS — marketing site origin posts here.
const ALLOWED_ORIGINS = [
  "https://elevateaisystem.com",
  "https://www.elevateaisystem.com",
  "http://localhost:3000",
  "http://localhost:8788",
];
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

type PromptKey = "positioning";

const PROMPTS: Record<PromptKey, { question: string; system: string }> = {
  positioning: {
    question: "In one sentence, who do you work with and what do you do for them?",
    system: `You are the Brand OS Agent, the free taste of the full product on the marketing site.

The visitor just answered a positioning question. Your job is to either:
1. PUSH BACK if the answer reads generic (template-y, vague, every-other-coach language), OR
2. AFFIRM if the answer is specific, embodied, and real

GENERIC RED FLAGS (push back if 2+ present):
- "I help [type] go from [pain] to [outcome] in [time]" — the standard coach-landing-page template
- "transformation", "unlock", "limitless", "level up", "thrive", "fulfillment", "purpose", "limitless potential"
- Vague pronouns: "people who", "those who", "anyone who"
- Abstract outcomes: "success", "freedom", "confidence", "their best self"
- No specific person, revenue band, or context

SPECIFIC GREEN FLAGS (affirm if these show):
- A named persona type with concrete revenue or career stage
- A specific problem, not an abstract pain
- Their own vocabulary, not coaching jargon
- Body / situation specifics
- Honest "I don't fully know yet" energy is also good — better than fake confidence

OUTPUT FORMAT: Return STRICT JSON only, no prose around it:
{
  "verdict": "push_back" | "affirm",
  "headline": "string — 1 punchy line capturing what you noticed",
  "body": "string — 2 to 4 sentences. Specific. Quote their words back when relevant. No coaching jargon yourself.",
  "next_prompt": "string — one specific question or rewrite suggestion. If you pushed back, this is what they should try instead. If you affirmed, this is what to sharpen next.",
  "what_brand_os_would_do": "string — 1 sentence. What the full Brand OS would do with this answer in the next 90 minutes (e.g. 'pull this thread through all 6 modules and turn it into your signature line + 45 days of content angles')."
}

QUALITY BAR:
- Be honest, not mean. Specific, not vague.
- NO em dashes. Use commas, periods, or semicolons.
- Never use these words yourself: "transformation", "unlock", "elevate", "level up", "thrive", "purpose-driven"
- Write at a 9th-grade reading level. Coaches scan, they don't read.`,
  },
};

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function GET(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/brand-os-preview",
    has_anthropic_key: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.PREVIEW_MODEL ?? DEFAULT_MODEL,
    available_prompts: Object.keys(PROMPTS),
  }, { headers: cors });
}

export async function POST(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "Preview unavailable — ANTHROPIC_API_KEY not set on the platform.",
    }, { status: 503, headers: cors });
  }

  let body: { prompt?: string; answer?: string };
  try {
    body = (await request.json()) as { prompt?: string; answer?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400, headers: cors });
  }

  const promptKey = (body.prompt === "positioning" ? "positioning" : "positioning") as PromptKey;
  const config = PROMPTS[promptKey];

  const answerRaw = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!answerRaw) {
    return NextResponse.json({ error: "Answer is required." }, { status: 400, headers: cors });
  }
  if (answerRaw.length < 8) {
    return NextResponse.json({ error: "Answer is too short for the AI to read." }, { status: 400, headers: cors });
  }
  const safeAnswer = answerRaw.slice(0, MAX_ANSWER_CHARS);

  const model = process.env.PREVIEW_MODEL ?? DEFAULT_MODEL;

  const aiRes = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      system: config.system,
      messages: [
        { role: "user", content: `QUESTION: ${config.question}\n\nANSWER: ${safeAnswer}` },
      ],
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    console.error("[brand-os-preview] anthropic error", aiRes.status, detail.slice(0, 300));
    return NextResponse.json({
      error: "Could not reach the Brand OS Agent right now. Try again in a minute.",
    }, { status: 502, headers: cors });
  }

  const aiData = await aiRes.json() as { content?: Array<{ type: string; text?: string }> };
  const raw = aiData.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    return NextResponse.json({
      error: "Got a response but could not parse it. Try once more.",
    }, { status: 502, headers: cors });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "AI returned unexpected format. Try again." }, { status: 502, headers: cors });
  }

  const verdict = parsed.verdict === "affirm" ? "affirm" : "push_back";

  return NextResponse.json({
    verdict,
    headline: String(parsed.headline ?? "").slice(0, 200),
    body: String(parsed.body ?? "").slice(0, 1200),
    next_prompt: String(parsed.next_prompt ?? "").slice(0, 600),
    what_brand_os_would_do: String(parsed.what_brand_os_would_do ?? "").slice(0, 400),
  }, { headers: cors });
}
