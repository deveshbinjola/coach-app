// app/api/content/polish/route.ts
//
// POST { raw_text, steer? } -> { polished, changes, flags, voice_version, model }
// Edits the coach's own rough draft in their voice (Sharpen). One model call,
// grounded in the active voice profile. Uses the Cloudflare ANTHROPIC_API_KEY
// (same path as content/fix), NOT a Supabase edge secret.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import {
  buildSharpenSystemPrompt,
  buildUserPrompt,
  parsePolishResponse,
  runGuardrails,
  MIN_POLISH_CHARS,
  MAX_POLISH_CHARS,
  type PolishSteer,
} from "@/lib/content/polish-core";

export const runtime = "edge";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const VALID_STEERS: PolishSteer[] = ["tighter", "warmer", "shorter", "keep_more"];

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "content/polish", 15, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many polishes in a row. Give it a minute." }, { status: 429 });
  }

  let body: { raw_text?: unknown; steer?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawText = typeof body.raw_text === "string" ? body.raw_text.trim() : "";
  const steer = VALID_STEERS.includes(body.steer as PolishSteer) ? (body.steer as PolishSteer) : undefined;

  if (rawText.length < MIN_POLISH_CHARS) {
    return NextResponse.json({ error: "Add a bit more to work with." }, { status: 400 });
  }
  if (rawText.length > MAX_POLISH_CHARS) {
    return NextResponse.json({ error: "That is longer than this handles for now. Trim it or split it." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("cp_voice_profiles")
    .select("voice_json, sample_messages, version")
    .eq("coach_id", user.id)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "no_voice_profile" }, { status: 409 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI is not configured right now. Try again shortly." }, { status: 500 });
  }

  const system = buildSharpenSystemPrompt(profile.voice_json, profile.sample_messages ?? []);
  const userPrompt = buildUserPrompt(rawText, steer);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: `Could not reach the model: ${String(err)}` }, { status: 502 });
  }

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Model error ${res.status}: ${text.slice(0, 200)}` }, { status: 502 });
  }

  const result = await res.json();
  const rawOut: string = result?.content?.[0]?.text ?? "";
  const { polished, changes } = parsePolishResponse(rawOut);
  if (!polished.trim()) {
    return NextResponse.json({ error: "The model returned an empty edit. Try again." }, { status: 502 });
  }
  const flags = runGuardrails(rawText, polished);

  // v1 logging: metadata only, no raw text, no table (YAGNI).
  console.log("[content/polish]", JSON.stringify({
    coach: user.id,
    in_len: rawText.length,
    out_len: polished.length,
    steer: steer ?? null,
    voice_version: profile.version,
    model: MODEL,
    flags: flags.map((f) => f.kind),
  }));

  return NextResponse.json({ polished, changes, flags, voice_version: profile.version, model: MODEL });
}
