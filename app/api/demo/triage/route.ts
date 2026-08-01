// POST /api/demo/triage — the inbox triage demo. Public, no auth.
//
// One model call (perception: raw paste to structured leads), then the real
// scoring engines do the ranking. See lib/landing/triage.ts for why that split
// matters. One call, not two, so this costs less than the reply demo despite
// doing more.
//
// Shares cp_demo_runs with /api/demo/reply so a visitor cannot get six runs of
// each. The budget is per person, not per toy.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimit } from "@/lib/rate-limit";
import { buildParsePrompt, parseMessages, triage, validateInbox } from "@/lib/landing/triage";

export const runtime = "edge";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2000;

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
  const salt = process.env.DEMO_IP_SALT ?? "coach-assistant-demo";
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate before rate limiting: refusing a bad body is free, so it should
  // not cost the coach who pasted too little on their first try.
  const validated = validateInbox(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }
  const inbox = validated.value;

  const burst = rateLimit(`demo/triage:${ip}`, 3, 60_000);
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

  const prompt = buildParsePrompt(inbox);
  let text: string | null = null;
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
    if (res.ok) {
      const json = await res.json();
      text = String(json?.content?.[0]?.text ?? "").trim() || null;
    }
  } catch {
    text = null;
  }

  const messages = text ? parseMessages(text) : [];

  // Awaited, not fired and forgotten: on the edge runtime an in-flight promise
  // is cancelled when the response returns, and an unwritten row means the
  // hourly cap counts nothing.
  await admin.from("cp_demo_runs").insert({
    ip_hash: ipHash,
    message_chars: inbox.length,
    voice_chars: 0,
    ok: messages.length > 0,
  });

  if (messages.length === 0) {
    return NextResponse.json(
      { error: "Could not read that as an inbox. Try pasting the messages themselves?" },
      { status: 502 },
    );
  }

  return NextResponse.json(triage(messages));
}
