// POST /api/brand-os/pushback — generate 2 differentiated alternatives.
//
// Called when the client-side marker detection fires. Uses Anthropic to
// produce two real alternatives the coach can pick from (or modify, or
// override). Each alternative names the buyer it pulls and loses.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";

export const runtime = "edge";

type Body = {
  runId: string;
  questionId: string;
  answer: string;
  audience: "M" | "W" | "X";
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "brand-os/pushback", 15, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = (await request.json()) as Body;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      error: "anthropic_not_configured",
      option_a: "(Set ANTHROPIC_API_KEY in Cloudflare Pages env vars to generate real alternatives.)",
      option_b: "(Same — stub response until the key is configured.)",
    }, { status: 200 });
  }

  // Verify the run belongs to the caller (RLS already enforces but be explicit).
  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("id, audience")
    .eq("id", body.runId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });

  const sysPrompt = buildSystemPrompt(body.questionId, body.audience);
  const userPrompt = `The coach answered:\n\n"${body.answer}"\n\nReturn EXACTLY two differentiated alternatives in JSON with keys "option_a" and "option_b". Each must include the buyer it pulls and the buyer it loses, in the format described.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      system: sysPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: "anthropic_error", detail: text.slice(0, 500) }, { status: 502 });
  }

  const data = await res.json() as {
    content?: Array<{ type: string; text?: string }>;
  };
  const raw = data.content?.find((c) => c.type === "text")?.text ?? "";

  // Try to extract JSON. Models sometimes wrap in code fences.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json({
      option_a: raw.slice(0, 500),
      option_b: "(Could not parse second option — see option A.)",
    });
  }
  try {
    const parsed = JSON.parse(jsonMatch[0]) as { option_a?: string; option_b?: string };
    return NextResponse.json({
      option_a: parsed.option_a ?? "(missing)",
      option_b: parsed.option_b ?? "(missing)",
    });
  } catch {
    return NextResponse.json({
      option_a: raw.slice(0, 500),
      option_b: "(JSON parse failed — see option A.)",
    });
  }
}

function buildSystemPrompt(questionId: string, audience: "M" | "W" | "X"): string {
  const tone =
    audience === "M" ? "masculine-coded, direct, edge-aware, purpose-driven"
    : audience === "W" ? "feminine-coded, somatic, nervous-system aware, embodied"
    : "balanced, soft-direct, audience-neutral";

  const triggerGuidance =
    questionId === "mirror.q1" ? "This is a POSITIONING sentence. The alternatives must be sharply differentiated, name a specific buyer, and avoid generic coach-landing-page language."
    : questionId === "signal.q11" ? "These are SENSORY FELT-SENSE words. The alternatives must be true sensory descriptors (sounds, textures, temperatures, body sensations) — not adjectives."
    : questionId === "stance.q9" ? "These are STANCE NAMES. The alternatives must be specific, multi-word, take a clear position. No single-word generics ('Leadership', 'Mindset')."
    : questionId === "funnel.q7" ? "This is a CTA. The alternatives must be in the coach's voice, not generic ('book a discovery call'). Each names a specific moment of action."
    : "Make the alternatives concrete and differentiated.";

  return `You are the Brand OS Agent v2 push-back layer. Your job: refuse generic language and propose two real, differentiated alternatives.

Voice register: ${tone}.

${triggerGuidance}

Return STRICT JSON only, no prose around it:

{
  "option_a": "[the alternative sentence/line. 1-3 sentences max.]\\n\\nPulls: [specific buyer this attracts]\\nLoses: [specific buyer who would bounce]\\nThe bet: [the courage move underneath]",
  "option_b": "[a different alternative — different angle, different bet.]\\n\\nPulls: [...]\\nLoses: [...]\\nThe bet: [...]"
}

Both options must be defensible, specific, and avoid: high performers, level up, transform, breakthrough, your best self, manifestation, divine feminine, sacred, soul-led, magnetic (positioning), or any single-word stance.`;
}
