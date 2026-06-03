import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { getDharaContext } from "@/lib/dhara/context";
import { buildDharaSystemPrompt } from "@/lib/dhara/persona";
import { toAnthropicMessages } from "@/lib/dhara/conversation";
import { userFirstName } from "@/lib/user-display";

export const runtime = "edge";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// Non-streaming on purpose: streamed ReadableStream responses do not deliver
// reliably through Cloudflare Pages / next-on-pages (every other edge AI route
// in this app is request/response and works). Returns the full reply as JSON.

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "dhara/chat", 20, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Slow down a moment." }, { status: 429 });

  let body: { message?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const message = (body.message ?? "").trim().slice(0, 4000);
  if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI unavailable" }, { status: 503 });

  const admin = createAdminClient();
  const now = Date.now();

  await admin.from("cp_dhara_messages").insert({ coach_id: user.id, role: "user", content: message });
  const [{ data: recent }, grounding] = await Promise.all([
    supabase.from("cp_dhara_messages").select("role, content").eq("coach_id", user.id)
      .order("created_at", { ascending: false }).limit(12),
    getDharaContext(user.id, now),
  ]);

  const system = buildDharaSystemPrompt({
    coachFirstName: userFirstName(user.email, user.user_metadata),
    identityText: grounding.identityText,
    snapshotText: grounding.snapshotText,
    memories: grounding.memories.map((m) => ({ text: m.text, confidence: m.confidence })),
  });

  const rows = ((recent ?? []) as Array<{ role: "user" | "assistant"; content: string }>).reverse();
  let messages = toAnthropicMessages(rows);
  if (messages.length === 0) messages = [{ role: "user", content: message }];

  let reply = "";
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1024, system, messages }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return NextResponse.json({ error: "AI error", detail: detail.slice(0, 300) }, { status: 502 });
    }
    const json = await res.json();
    reply = String(json?.content?.[0]?.text ?? "").trim();
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }

  if (!reply) {
    return NextResponse.json({ error: "Dhara had nothing to say. Try rephrasing?" }, { status: 502 });
  }

  await admin.from("cp_dhara_messages").insert({ coach_id: user.id, role: "assistant", content: reply });

  return NextResponse.json({ reply });
}
