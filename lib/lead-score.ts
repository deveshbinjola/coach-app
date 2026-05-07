// Lead scoring — purely client-side computation over the Lead row.
// Kept in one file so we can iterate the weights without a migration.
//
// Score = temperature + discovery call + pain signal count + recency of contact.
// Range: roughly 0–150. Higher = more worth your next hour.
//
// Why client-side: the "right" weighting will change as Sunny sees it in practice.
// Baking it into SQL too early locks the UX to a schema change cadence.

import type { Lead, LeadTemperature } from "./types";

const TEMP_WEIGHT: Record<LeadTemperature, number> = {
  on_fire: 100,
  hot: 80,
  warm: 50,
  cold: 20,
  dormant: 5,
};

const DISCOVERY_BONUS = 20;
const PAIN_PER_SIGNAL = 5;
const PAIN_MAX = 20;
const RECENT_7D_BONUS = 10;
const RECENT_30D_BONUS = 5;

export type ScoreBreakdown = {
  total: number;
  temperature: number;
  discovery: number;
  pain: number;
  recency: number;
};

// `now` is injected so SSR and client hydration compute the same recency bonus.
// Without it, `Date.now()` drifts between server render and client hydration,
// which can flip a lead across the 7d/30d boundary and reorder the sorted list —
// which surfaces as a Next.js hydration error ("text content did not match").
// Pages that SSR a scored list MUST pass `now` from the server component.
export function scoreBreakdown(lead: Lead, now: number = Date.now()): ScoreBreakdown {
  if (!lead) return { total: 0, temperature: 0, discovery: 0, pain: 0, recency: 0 };
  const temperature = TEMP_WEIGHT[lead.temperature] ?? 0;
  const discovery = lead.discovery_call_completed ? DISCOVERY_BONUS : 0;
  const painCount = Array.isArray(lead.pain_signal) ? lead.pain_signal.length : 0;
  const pain = Math.min(painCount * PAIN_PER_SIGNAL, PAIN_MAX);

  let recency = 0;
  if (lead.last_contact_at) {
    const msSince = now - new Date(lead.last_contact_at).getTime();
    const days = msSince / (1000 * 60 * 60 * 24);
    if (days <= 7) recency = RECENT_7D_BONUS;
    else if (days <= 30) recency = RECENT_30D_BONUS;
  }

  return {
    total: temperature + discovery + pain + recency,
    temperature,
    discovery,
    pain,
    recency,
  };
}

export function computeLeadScore(lead: Lead, now: number = Date.now()): number {
  return scoreBreakdown(lead, now).total;
}

/**
 * Sort leads by score desc; ties broken by next_followup_at asc (sooner first),
 * then created_at desc (newer first). Stable-ish for UI.
 */
export function sortByScore(leads: Lead[], now: number = Date.now()): Lead[] {
  return [...leads].sort((a, b) => {
    const sa = computeLeadScore(a, now);
    const sb = computeLeadScore(b, now);
    if (sb !== sa) return sb - sa;
    const fa = a.next_followup_at ? new Date(a.next_followup_at).getTime() : Infinity;
    const fb = b.next_followup_at ? new Date(b.next_followup_at).getTime() : Infinity;
    if (fa !== fb) return fa - fb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/**
 * Map a score to a visual tier — used for the score pill color.
 * Thresholds are derived from the weights, not pulled from thin air:
 *   120+ = on_fire or hot + discovery + pain (top priority)
 *   80+  = hot-band or warm + several boosts
 *   40+  = warm-band baseline
 *   <40  = cold/dormant / neglected
 */
export type ScoreTier = "top" | "high" | "mid" | "low";

export function scoreTier(score: number): ScoreTier {
  if (score >= 120) return "top";
  if (score >= 80) return "high";
  if (score >= 40) return "mid";
  return "low";
}

export const SCORE_TIER_CLASS: Record<ScoreTier, string> = {
  top: "bg-[#00FF41] text-[#0A0F1C] border-[#0A0F1C] font-extrabold",
  high: "bg-[#0A0F1C] text-[#00FF41] border-[#0A0F1C] font-bold",
  mid: "bg-amber-50 text-amber-900 border-amber-200 font-semibold",
  low: "bg-gray-100 text-gray-600 border-gray-300 font-medium",
};
