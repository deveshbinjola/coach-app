// lib/dhara/context.ts
// Assembles Dhara's live grounding: Brand OS identity + business snapshot + memories + lead names.

import { createClient } from "@/lib/supabase-server";
import { getBusinessPulse } from "@/lib/ambient";
import type { CoachMemory } from "@/lib/dhara/memory";
import { hasBeenInterviewed } from "@/lib/dhara/interview";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export type DharaGrounding = {
  identityText: string;
  snapshotText: string;
  memories: CoachMemory[];
  leads: Array<{ id: string; name: string }>;
  /** False when the assistant has not been introduced to this coach yet;
   *  turns on interview mode. See lib/dhara/interview.ts. */
  interviewed: boolean;
};

export async function getDharaContext(coachId: string, now: number): Promise<DharaGrounding> {
  const supabase = createClient();

  const [{ data: runRows }, { data: memRows }, { data: leadRows }, pulse] = await Promise.all([
    supabase.from("cp_brand_os_runs").select("synthesis_json").eq("coach_id", coachId)
      .not("synthesis_json", "is", null).eq("state", "complete")
      .order("synthesized_at", { ascending: false }).limit(1),
    supabase.from("cp_coach_memory").select("*").eq("coach_id", coachId).eq("status", "active")
      .order("confidence", { ascending: false }).order("last_seen_at", { ascending: false }).limit(200),
    supabase.from("cp_leads").select("id, full_name").eq("coach_id", coachId).limit(500),
    getBusinessPulse(coachId, now),
  ]);

  const synth = (runRows?.[0]?.synthesis_json ?? {}) as Record<string, unknown>;
  const pillars = Array.isArray(synth.pillars)
    ? (synth.pillars as Array<Record<string, unknown>>).map((p) => String(p.name ?? p.title ?? "")).filter(Boolean)
    : [];
  const avatarRaw = synth.avatar;
  const avatar = typeof avatarRaw === "string" ? avatarRaw
    : (avatarRaw && typeof (avatarRaw as Record<string, unknown>).summary === "string")
      ? String((avatarRaw as Record<string, unknown>).summary) : "";
  const identityText = [
    avatar ? `Avatar: ${avatar}` : "",
    pillars.length ? `Pillars: ${pillars.join(", ")}` : "",
  ].filter(Boolean).join("\n") || "(Brand OS not set up yet)";

  const m = pulse.metrics;
  const slipping = pulse.quietList.concat(pulse.heroItem ? [pulse.heroItem] : [])
    .filter((i) => i.source === "overdue").map((i) => i.leadName).filter(Boolean);
  const snapshotText = [
    `Revenue this month: ${usd(m.revenue.amount)} (${m.revenue.trend}).`,
    `Active members: ${m.activeMembers}. Sessions this month: ${m.sessionsThisMonth}.`,
    `Drafts ready: ${pulse.daySummary.draftsReady}. Leads waiting: ${pulse.daySummary.leadsWaiting}.`,
    slipping.length ? `Quiet clients: ${slipping.join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  const memories = (memRows ?? []).map((r) => ({
    id: r.id, coachId: r.coach_id, kind: r.kind, text: r.text, source: r.source,
    sourceRef: r.source_ref, confidence: r.confidence, status: r.status,
  })) as CoachMemory[];

  const leads = (leadRows ?? []).map((l) => ({ id: l.id as string, name: (l.full_name as string) ?? "" }));

  return { identityText, snapshotText, memories, leads, interviewed: hasBeenInterviewed(memories) };
}
