// lib/distill/run-session-distill.ts
//
// Impure runner shared by the on-demand route and the cron sweep. Loads a
// session, distills it (cheap model), deposits signals, and upserts durable
// facts into cp_coach_memory. Idempotent: skips a session already distilled.

import type { SupabaseClient } from "@supabase/supabase-js";
import { callLLM } from "@/lib/llm";
import { buildDistillPrompt, parseDistillResponse, toSignals } from "@/lib/distill/session-distill";
import { depositSignal } from "@/lib/signals";
import { mergeOrInsert, normalizeMemoryText, type CoachMemory, type MemoryKind } from "@/lib/dhara/memory";

export type DistillResult = { sessionId: string; deposited: number; skipped: boolean; error?: string };

// cp_coach_memory rows are snake_case; CoachMemory (the dedupe shape) is camelCase.
type MemoryRow = {
  id: string;
  coach_id: string;
  kind: CoachMemory["kind"];
  text: string;
  source: CoachMemory["source"];
  source_ref: string | null;
  confidence: CoachMemory["confidence"];
  status: CoachMemory["status"];
};

function toCoachMemory(row: MemoryRow): CoachMemory {
  return {
    id: row.id,
    coachId: row.coach_id,
    kind: row.kind,
    text: row.text,
    source: row.source,
    sourceRef: row.source_ref,
    confidence: row.confidence,
    status: row.status,
  };
}

export async function runSessionDistill(admin: SupabaseClient, sessionId: string): Promise<DistillResult> {
  const { data: session } = await admin
    .from("cp_coaching_sessions")
    .select("id, coach_id, client_id, raw_notes, transcript")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { sessionId, deposited: 0, skipped: true, error: "session not found" };

  // Idempotency: already distilled?
  const { count } = await admin
    .from("cp_signals")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", session.coach_id).eq("source", "session").eq("ref_id", session.id);
  if ((count ?? 0) > 0) return { sessionId, deposited: 0, skipped: true };

  const text = [session.raw_notes, session.transcript].filter(Boolean).join("\n\n").trim();
  if (!text) return { sessionId, deposited: 0, skipped: true, error: "empty session" };

  let parsed;
  try {
    const out = await callLLM({ task: "distill", system: "Return only the JSON described.", user: buildDistillPrompt(text), maxTokens: 1400 });
    parsed = parseDistillResponse(out);
  } catch (err) {
    return { sessionId, deposited: 0, skipped: false, error: err instanceof Error ? err.message : String(err) };
  }

  const signals = toSignals(parsed, { sessionId: session.id, subjectId: session.client_id ?? null });
  let deposited = 0;
  for (const s of signals) {
    const { error } = await depositSignal(admin, session.coach_id, s);
    if (!error) deposited++;
  }

  // Durable facts: commitments -> goal, patterns -> fact. Reuse Dhara dedupe.
  const { data: memRows } = await admin.from("cp_coach_memory").select("*").eq("coach_id", session.coach_id).eq("status", "active");
  const existing: CoachMemory[] = ((memRows ?? []) as MemoryRow[]).map(toCoachMemory);
  const durable: Array<{ kind: MemoryKind; text: string }> = [
    ...parsed.commitments.map((c) => ({ kind: "goal" as MemoryKind, text: c.text })),
    ...parsed.patterns.map((p) => ({ kind: "fact" as MemoryKind, text: p.text })),
  ];
  for (const cand of durable) {
    const r = mergeOrInsert(existing, cand);
    if (r.action === "insert") {
      const { data: ins } = await admin.from("cp_coach_memory").insert({
        coach_id: session.coach_id, kind: cand.kind, text: cand.text,
        source: "session", source_ref: session.id, confidence: r.confidence, status: "active",
      }).select("*").single();
      if (ins) existing.push(toCoachMemory(ins as MemoryRow));
    } else {
      await admin.from("cp_coach_memory")
        .update({ confidence: r.confidence, last_seen_at: new Date(Date.now()).toISOString() })
        .eq("id", r.targetId).eq("coach_id", session.coach_id);
      const hit = existing.find((m) => normalizeMemoryText(m.text) === normalizeMemoryText(cand.text));
      if (hit) hit.confidence = r.confidence;
    }
  }

  return { sessionId, deposited, skipped: false };
}
