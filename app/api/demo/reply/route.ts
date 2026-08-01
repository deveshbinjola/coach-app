// POST /api/demo/reply — the landing page live demo. Public, no auth.
//
// A public endpoint that spends money on every call needs three things, and
// this has all three: a durable per-IP cap (cp_demo_runs, because the
// in-memory limiter is per-isolate on Cloudflare and cannot bound anything),
// hard input length caps, and a small max_tokens on both calls.
//
// Two model calls run in parallel, same model, same message. One gets the
// coach's own words and one does not. See lib/landing/demo.ts for why that is
// the honest way to draw the comparison.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import {
  buildGenericPrompt,
  buildVoicedPrompt,
  parseVoicedDraft,
  stripEmDash,
  validateDemoInput,
  type DemoInput,
} from "@/lib/landing/demo";

export const runtime = "edge";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
// The same model the assistant itself runs on. A demo on a cheaper model
// would be showing the visitor something the product does not do.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 500;

const HOURLY_PER_IP = 6;
const WINDOW_MS = 60 * 60 * 1000;

function clientIp(request: NextRequest): string {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function hashIp(ip: string): Promise<string> {
  // Salted so the stored value is not a rainbow-table lookup away from an
  // address. Falls back to an unsalted hash rather than failing the request.
  const salt = process.env.DEMO_IP_SALT ?? "coach-assistant-demo";
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function callModel(
  apiKey: string,
  prompt: { system: string; user: string },
): Promise<string | null> {
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
        max_tokens: MAX_TOKENS,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const text = String(json?.content?.[0]?.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate before rate limiting. A rejected body costs nothing to refuse, so
  // spending someone's budget on it only punishes the coach who mistyped and
  // does not slow anyone down who is actually trying to abuse this.
  const validated = validateDemoInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error, field: validated.field }, { status: 400 });
  }
  const input: DemoInput = validated.value;

  // Cheap in-memory gate, so a burst from one isolate never reaches the
  // database or the model. The durable check below is the real limit.
  const burst = rateLimit(`demo/reply:${ip}`, 3, 60_000);
  if (!burst.allowed) {
    return NextResponse.json({ error: "One at a time. Give it a few seconds." }, { status: 429 });
  }

  const ipHash = await hashIp(ip);
  const admin = createAdminClient();

  const { count } = await admin
    .from("cp_demo_runs")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", new Date(Date.now() - WINDOW_MS).toISOString());

  if ((count ?? 0) >= HOURLY_PER_IP) {
    return NextResponse.json(
      { error: "That is the demo limit for this hour. The real thing has no limit." },
      { status: 429 },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "The demo is resting. Try again shortly." }, { status: 503 });
  }

  const [genericText, voicedText] = await Promise.all([
    callModel(apiKey, buildGenericPrompt(input.message)),
    callModel(apiKey, buildVoicedPrompt(input)),
  ]);

  // Record the run either way: a failed attempt still cost a model call, so it
  // still counts against the limit.
  //
  // Awaited, not fired and forgotten. On the edge runtime a promise still in
  // flight when the response returns is cancelled, so the row never lands and
  // the hourly cap silently counts nothing. The extra round trip is worth
  // having a limit that actually exists.
  await admin.from("cp_demo_runs").insert({
    ip_hash: ipHash,
    message_chars: input.message.length,
    voice_chars: input.voiceSample.length,
    ok: Boolean(genericText && voicedText),
  });

  if (!genericText || !voicedText) {
    return NextResponse.json(
      { error: "That one did not come back. Try it again?" },
      { status: 502 },
    );
  }

  const voiced = parseVoicedDraft(voicedText) ?? {
    reply: stripEmDash(voicedText),
    noticed: "",
    followUp: "",
  };

  return NextResponse.json({
    generic: stripEmDash(genericText),
    yours: voiced.reply,
    noticed: voiced.noticed,
    followUp: voiced.followUp,
  });
}
