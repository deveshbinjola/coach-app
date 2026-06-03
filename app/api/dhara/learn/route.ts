import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { buildExtractionPrompt, parseExtraction, mergeOrInsert, type CoachMemory } from "@/lib/dhara/memory";
import { deriveSuggestions } from "@/lib/dhara/suggestions";

export const runtime = "edge";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const EXTRACT_MODEL = "claude-haiku-4-5";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimitByUser(user.id, "dhara/learn", 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ newlyLearned: [], suggestions: [] });

  let body: { userMessage?: string; assistantMessage?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const um = (body.userMessage ?? "").slice(0, 4000);
  const am = (body.assistantMessage ?? "").slice(0, 4000);

  const { data: leadRows } = await supabase.from("cp_leads").select("id, full_name").eq("coach_id", user.id).limit(500);
  const leads = (leadRows ?? []).map((l) => ({ id: l.id as string, name: (l.full_name as string) ?? "" }));
  const suggestions = deriveSuggestions(am, leads);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || (!um && !am)) return NextResponse.json({ newlyLearned: [], suggestions });

  let extracted: ReturnType<typeof parseExtraction> = [];
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: EXTRACT_MODEL, max_tokens: 400, messages: [{ role: "user", content: buildExtractionPrompt(um, am) }] }),
    });
    if (res.ok) {
      const json = await res.json();
      extracted = parseExtraction(String(json?.content?.[0]?.text ?? ""));
    }
  } catch { /* best-effort */ }
  if (extracted.length === 0) return NextResponse.json({ newlyLearned: [], suggestions });

  const admin = createAdminClient();
  const { data: existingRows } = await admin.from("cp_coach_memory").select("*").eq("coach_id", user.id).eq("status", "active");
  const existing = (existingRows ?? []).map((r) => ({
    id: r.id, coachId: r.coach_id, kind: r.kind, text: r.text, source: r.source,
    sourceRef: r.source_ref, confidence: r.confidence, status: r.status,
  })) as CoachMemory[];

  const newlyLearned: Array<{ id: string; text: string; kind: string; confidence: string }> = [];
  const nowIso = new Date().toISOString();

  for (const cand of extracted.slice(0, 3)) {
    const r = mergeOrInsert(existing, cand);
    if (r.action === "insert") {
      const { data: ins } = await admin.from("cp_coach_memory").insert({
        coach_id: user.id, kind: cand.kind, text: cand.text, source: "conversation", confidence: "candidate",
      }).select("id, text, kind, confidence").single();
      if (ins) {
        newlyLearned.push(ins);
        existing.push({ id: ins.id, coachId: user.id, kind: cand.kind, text: cand.text, source: "conversation", sourceRef: null, confidence: "candidate", status: "active" });
      }
    } else {
      await admin.from("cp_coach_memory").update({ confidence: r.confidence, last_seen_at: nowIso }).eq("id", r.targetId).eq("coach_id", user.id);
    }
  }

  return NextResponse.json({ newlyLearned, suggestions });
}
