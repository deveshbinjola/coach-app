// lib/coaching-prep.ts
//
// Assembles the coaching-prep brief from a client's signals. Confidence-gates
// what surfaces as a firm commitment/pattern vs a "possible". Pure assembler
// (assemblePrep) + a thin DB loader (getCoachingPrep).

import type { SupabaseClient } from "@supabase/supabase-js";

export type PrepSignal = {
  id: string;
  kind: "topic" | "commitment" | "pattern" | "somatic" | "goal" | "note";
  text: string;
  evidence: string | null;
  confidence: "candidate" | "repeated" | "confirmed";
  status: "active" | "dismissed";
  created_at: string;
};

export type PrepItem = { id: string; text: string; evidence: string | null };
export type CoachingPrep = {
  lastRecap: string[];
  openCommitments: string[];
  formingPatterns: string[];
  possible: string[];
  items: PrepItem[];
};

const firm = (c: PrepSignal["confidence"]) => c === "repeated" || c === "confirmed";

export function assemblePrep(signals: PrepSignal[]): CoachingPrep {
  const active = signals.filter((s) => s.status === "active");
  const byNewest = [...active].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const lastRecap = byNewest.filter((s) => s.kind === "topic").slice(0, 5).map((s) => s.text);
  const commitments = byNewest.filter((s) => s.kind === "commitment");
  const patterns = byNewest.filter((s) => s.kind === "pattern");

  const openCommitments = commitments.filter((s) => firm(s.confidence)).map((s) => s.text);
  const possible = commitments.filter((s) => !firm(s.confidence)).map((s) => s.text);
  const formingPatterns = patterns.filter((s) => firm(s.confidence)).map((s) => s.text);

  const items = byNewest.map((s) => ({ id: s.id, text: s.text, evidence: s.evidence }));
  return { lastRecap, openCommitments, formingPatterns, possible, items };
}

export async function getCoachingPrep(
  supabase: SupabaseClient,
  coachId: string,
  clientId: string,
): Promise<CoachingPrep> {
  const { data } = await supabase
    .from("cp_signals")
    .select("id, kind, text, evidence, confidence, status, created_at")
    .eq("coach_id", coachId)
    .eq("subject_id", clientId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(200);
  return assemblePrep((data ?? []) as PrepSignal[]);
}
