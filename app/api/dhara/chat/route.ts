import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { getDharaContext } from "@/lib/dhara/context";
import { buildDharaSystemPrompt } from "@/lib/dhara/persona";
import { toAnthropicMessages } from "@/lib/dhara/conversation";
import { matchIntent, type DharaIntent } from "@/lib/dhara/intents";
import { userFirstName } from "@/lib/user-display";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "edge";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

// Answer common questions straight from the database — no LLM, no API key.
async function answerIntent(
  intent: DharaIntent,
  coachId: string,
  supabase: SupabaseClient,
  now: number,
): Promise<{ reply: string; navigateTo?: string }> {
  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const countOf = async (table: string, build?: (q: any) => any) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("coach_id", coachId);
    if (build) q = build(q);
    const { count } = await q;
    return count ?? 0;
  };

  switch (intent.type) {
    case "navigate":
      return { reply: "Taking you there.", navigateTo: intent.route };
    case "count_leads": {
      const n = await countOf("cp_leads");
      return { reply: `You have ${n} lead${n === 1 ? "" : "s"}.` };
    }
    case "count_clients": {
      const n = await countOf("cp_leads", (q) => q.eq("status", "client"));
      return { reply: `You have ${n} active client${n === 1 ? "" : "s"}.` };
    }
    case "count_quizzes": {
      const total = await countOf("cp_funnels");
      const live = await countOf("cp_funnels", (q) => q.eq("published", true));
      return { reply: `You have ${total} quiz${total === 1 ? "" : "zes"}, ${live} live.` };
    }
    case "count_sessions": {
      const n = await countOf("cp_coaching_sessions", (q) => q.gte("session_date", monthStart.toISOString()));
      return { reply: `${n} session${n === 1 ? "" : "s"} logged this month.` };
    }
    case "revenue": {
      const { data } = await supabase.from("cp_payments")
        .select("amount_cents, status, created_at").eq("coach_id", coachId)
        .gte("created_at", monthStart.toISOString());
      const cents = ((data ?? []) as Array<{ amount_cents: number; status: string }>)
        .filter((p) => p.status === "completed").reduce((s, p) => s + p.amount_cents, 0);
      return { reply: `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} this month.` };
    }
    case "pain_points": {
      const { data: leads } = await supabase.from("cp_leads")
        .select("primary_pain_point_id").eq("coach_id", coachId).not("primary_pain_point_id", "is", null);
      const tally = new Map<string, number>();
      for (const l of (leads ?? []) as Array<{ primary_pain_point_id: string }>) {
        tally.set(l.primary_pain_point_id, (tally.get(l.primary_pain_point_id) ?? 0) + 1);
      }
      if (tally.size === 0) return { reply: "No pain points are tagged on your leads yet." };
      const { data: pts } = await supabase.from("cp_pain_points").select("id, name").eq("coach_id", coachId);
      const nameById = new Map(((pts ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([id, n]) => `${nameById.get(id) ?? "Unknown"} (${n})`);
      return { reply: `Most common pain points: ${top.join(", ")}.` };
    }
  }
}

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

  const admin = createAdminClient();
  const now = Date.now();

  await admin.from("cp_dhara_messages").insert({ coach_id: user.id, role: "user", content: message });

  // ── Deterministic first: answer counts / revenue / pain points / navigation
  //    straight from the database. No LLM, no API key, instant. ──
  const intent = matchIntent(message);
  if (intent) {
    const { reply, navigateTo } = await answerIntent(intent, user.id, supabase, now);
    await admin.from("cp_dhara_messages").insert({ coach_id: user.id, role: "assistant", content: reply });
    return NextResponse.json({ reply, navigateTo: navigateTo ?? null, source: "data" });
  }

  // ── Fallback: open-ended conversation needs the model. ──
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
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
    interviewMode: !grounding.interviewed,
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

  return NextResponse.json({ reply, navigateTo: null, source: "ai" });
}
