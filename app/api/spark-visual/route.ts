import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";

export const runtime = "edge";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

type VisualType = "infographic" | "flow" | "framework" | "quote";

type VisualElement = { label: string; value?: string; icon?: string };

type SparkVisualData = {
  type: VisualType;
  title: string;
  subtitle?: string;
  elements: VisualElement[];
};

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = await rateLimitByUser(user.id, "spark-visual", 20, 3600);
  if (limited) return NextResponse.json({ error: "Rate limit — try again in a few minutes." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length < 10) {
    return NextResponse.json({ error: "Text too short to visualize." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "API key not configured." }, { status: 500 });

  const systemPrompt = `You are a visual content strategist for coaches and creators. Given a block of text, extract the core ideas and return EXACTLY 4 visual interpretations as JSON.

Each interpretation must be a different visual type. Always return one of each: "infographic", "flow", "framework", "quote".

Rules:
- Title: under 8 words, punchy, no generic filler
- Subtitle: one short sentence that adds context
- Elements: 3-6 items per visual. Each has a "label" (the main text) and optional "value" (a stat, number, or short detail)
- For "flow" type: elements are sequential steps
- For "framework" type: elements form a named system or matrix
- For "infographic" type: elements are key data points or insights
- For "quote" type: first element.label is the hero quote, rest are supporting points
- Write for Instagram-savvy coaches who want bold, shareable visuals
- Never use generic business language — be specific to the input text

Return ONLY valid JSON matching this shape:
{
  "variations": [
    {
      "type": "infographic",
      "title": "...",
      "subtitle": "...",
      "elements": [{ "label": "...", "value": "..." }, ...]
    },
    { "type": "flow", ... },
    { "type": "framework", ... },
    { "type": "quote", ... }
  ]
}`;

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
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: `Visualize this text:\n\n${text.slice(0, 2000)}` }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return NextResponse.json({ error: `AI error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const raw = data?.content?.[0]?.text ?? "";

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse visual data." }, { status: 502 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as { variations: SparkVisualData[] };

    if (!Array.isArray(parsed.variations) || parsed.variations.length === 0) {
      return NextResponse.json({ error: "No visual variations generated." }, { status: 502 });
    }

    const validated = parsed.variations
      .filter((v) => v.type && v.title && Array.isArray(v.elements) && v.elements.length > 0)
      .slice(0, 4);

    return NextResponse.json({ variations: validated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Visual generation failed." },
      { status: 500 },
    );
  }
}
