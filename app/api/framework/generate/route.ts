import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";

export const runtime = "edge";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

type GenerateBody = {
  transformation?: unknown;
  niche?: unknown;
  audience?: unknown;
  letterCount?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimitByUser(user.id, "framework/generate", 8, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: GenerateBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const transformation = cleanText(body.transformation, 1000);
  if (!transformation || transformation.length < 20) {
    return NextResponse.json(
      { error: "Please describe your transformation process in more detail (at least 20 characters)." },
      { status: 400 }
    );
  }

  const niche = cleanText(body.niche, 200);
  const audience = cleanText(body.audience, 200);
  const letterCount = typeof body.letterCount === "number" && body.letterCount >= 3 && body.letterCount <= 7
    ? body.letterCount
    : 5;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
  }

  const system = [
    "You are a branding strategist who specializes in helping coaches coin signature frameworks.",
    "A signature framework is a named acronym (like S.C.O.R.E., T.A.S.T.E., G.R.O.W.) where each letter represents a pillar of the coach's method.",
    "The acronym should be:",
    "- A real English word that resonates with the transformation",
    "- Memorable and easy to say",
    "- 3-7 letters (the coach specified their preference)",
    "- Professional but not corporate — coaches use these with real humans",
    "",
    "Return EXACTLY 4 framework options as a JSON array. Each option:",
    '{ "acronym": "WORD", "name": "The W.O.R.D. Method", "tagline": "One-liner positioning statement", "pillars": [{"letter": "W", "title": "Pillar Name", "description": "One sentence explaining this pillar"}], "leadMagnetType": "audit|scorecard|checklist|playbook|blueprint" }',
    "",
    "Rules:",
    "- Each acronym must be a different real English word",
    "- Pillar titles should be concrete nouns or action words, not abstract fluff",
    "- Tagline should name the audience and the transformation",
    "- The lead magnet type should match the framework's energy (diagnostic frameworks → audit/scorecard, process frameworks → playbook/blueprint, tactical frameworks → checklist)",
    "- No motivational cliches. No 'unleash your potential'. Specific and grounded.",
    "",
    "Return ONLY the JSON array, no markdown fences, no explanation.",
  ].join("\n");

  const prompt = [
    `The coach describes their transformation process:`,
    `"${transformation}"`,
    niche ? `\nTheir niche: ${niche}` : "",
    audience ? `\nTheir audience: ${audience}` : "",
    `\nGenerate 4 framework acronyms with exactly ${letterCount} letters each.`,
  ]
    .filter(Boolean)
    .join("\n");

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
        max_tokens: 2000,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "AI service error" }, { status: 502 });
    }

    const json = await res.json();
    const text = String(json?.content?.[0]?.text ?? "").trim();
    const frameworks = parseFrameworks(text);

    if (!frameworks || frameworks.length === 0) {
      return NextResponse.json({ error: "Could not generate frameworks. Try rephrasing." }, { status: 422 });
    }

    return NextResponse.json({ frameworks });
  } catch {
    return NextResponse.json({ error: "AI service error" }, { status: 502 });
  }
}

type FrameworkOption = {
  acronym: string;
  name: string;
  tagline: string;
  pillars: Array<{ letter: string; title: string; description: string }>;
  leadMagnetType: string;
};

function parseFrameworks(text: string): FrameworkOption[] | null {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;

    return parsed
      .filter(
        (f: Record<string, unknown>) =>
          typeof f.acronym === "string" &&
          typeof f.name === "string" &&
          Array.isArray(f.pillars) &&
          f.pillars.length >= 3
      )
      .slice(0, 4) as FrameworkOption[];
  } catch {
    return null;
  }
}

function cleanText(val: unknown, maxLen: number): string {
  if (typeof val !== "string") return "";
  return val.trim().slice(0, maxLen);
}
