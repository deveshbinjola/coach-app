// lib/signals.ts
//
// The ONE write path into cp_signals. Every source deposits through
// depositSignal() so the ledger is not shaped around any single source.

import type { SupabaseClient } from "@supabase/supabase-js";

export type SignalSource = "session" | "voice" | "brand_os" | "lead" | "trust";
export type SignalKind = "topic" | "commitment" | "pattern" | "somatic" | "goal" | "note";

export const SIGNAL_KINDS: SignalKind[] = ["topic", "commitment", "pattern", "somatic", "goal", "note"];

export type NewSignal = {
  source: SignalSource;
  kind: SignalKind;
  refTable: string;
  refId?: string | null;
  subjectId?: string | null;
  text: string;
  evidence?: string | null;
  weight?: number;
};

export type SignalRow = {
  coach_id: string;
  source: SignalSource;
  kind: SignalKind;
  ref_table: string;
  ref_id: string | null;
  subject_id: string | null;
  text: string;
  evidence: string | null;
  confidence: "candidate";
  weight: number;
  status: "active";
};

export function buildSignalRow(coachId: string, s: NewSignal): SignalRow {
  if (!SIGNAL_KINDS.includes(s.kind)) throw new Error(`Unknown signal kind: ${s.kind}`);
  const text = (s.text ?? "").trim();
  if (!text) throw new Error("Signal text is required");
  return {
    coach_id: coachId,
    source: s.source,
    kind: s.kind,
    ref_table: s.refTable,
    ref_id: s.refId ?? null,
    subject_id: s.subjectId ?? null,
    text,
    evidence: (s.evidence ?? "").trim() || null,
    confidence: "candidate",
    weight: s.weight ?? 1,
    status: "active",
  };
}

/** Insert one signal. The only place app code writes cp_signals. */
export async function depositSignal(
  client: SupabaseClient,
  coachId: string,
  signal: NewSignal,
): Promise<{ error: string | null }> {
  const { error } = await client.from("cp_signals").insert(buildSignalRow(coachId, signal));
  return { error: error?.message ?? null };
}
