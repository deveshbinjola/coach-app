// Response-time SLA — answers the question "is this lead going cold on me?"
//
// Thresholds are intentionally asymmetric:
//   NEW leads expect fast response (a cold inbound that sits >24h is effectively dead)
//   ACTIVE leads (contacted/qualified/booked) run on a conversation cadence
//
// We don't try to be clever about business hours or timezones here. The goal is a
// felt signal — "this has been sitting too long" — not a contractual SLA clock.
//
// Ship-v1 note: anchor is created_at (for new) or last_contact_at (for active).
// Once inbound email/DM ingestion is wired, switch to "time since latest inbound
// message without a matching outbound response" — strictly a better signal.

import type { Lead } from "./types";

export type SlaState = "on_pace" | "warning" | "overdue" | "not_applicable";

// Thresholds in hours. Tuned loose for v1 — we'll tighten once we see real usage.
const NEW_WARNING_H = 2;
const NEW_OVERDUE_H = 24;
const ACTIVE_WARNING_H = 72;   // 3 days
const ACTIVE_OVERDUE_H = 168;  // 7 days

export type SlaAssessment = {
  state: SlaState;
  hoursElapsed: number | null;
  /** Which timestamp drove the calculation — useful for tooltips */
  clockAnchor: "created_at" | "last_contact_at" | null;
  /** Short human label — e.g. "New · 3h", "Silent · 5d" */
  label: string;
  /** Longer tooltip — why this is the state */
  tip: string;
};

function hoursSince(iso: string | null, now: number = Date.now()): number | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms / (1000 * 60 * 60);
}

export function assessSla(lead: Lead, now: number = Date.now()): SlaAssessment {
  // Guard against undefined/null — can happen when Supabase returns partial rows
  if (!lead || typeof lead.status !== "string") return neutral();

  // Terminal states — SLA doesn't apply
  if (lead.status === "client" || lead.status === "closed_lost") {
    return {
      state: "not_applicable",
      hoursElapsed: null,
      clockAnchor: null,
      label: lead.status === "client" ? "Client" : "Closed",
      tip: "Not in the active pipeline — SLA doesn't apply.",
    };
  }

  if (lead.status === "new") {
    const h = hoursSince(lead.created_at, now);
    if (h === null) return neutral();
    const state: SlaState =
      h < NEW_WARNING_H ? "on_pace" : h < NEW_OVERDUE_H ? "warning" : "overdue";
    return {
      state,
      hoursElapsed: h,
      clockAnchor: "created_at",
      label: `New · ${formatElapsed(h)}`,
      tip:
        state === "on_pace"
          ? "Within the 2-hour response window."
          : state === "warning"
          ? "Getting stale. Respond today."
          : "Past 24h with no first touch. Respond now or write this off.",
    };
  }

  // contacted / qualified / booked — use last_contact_at; fall back to created_at
  const anchor = lead.last_contact_at ?? lead.created_at;
  const clockAnchor = lead.last_contact_at ? "last_contact_at" : "created_at";
  const h = hoursSince(anchor, now);
  if (h === null) return neutral();
  const state: SlaState =
    h < ACTIVE_WARNING_H ? "on_pace" : h < ACTIVE_OVERDUE_H ? "warning" : "overdue";
  return {
    state,
    hoursElapsed: h,
    clockAnchor,
    label: state === "on_pace" ? `Active · ${formatElapsed(h)}` : `Silent · ${formatElapsed(h)}`,
    tip:
      state === "on_pace"
        ? "Healthy conversation cadence."
        : state === "warning"
        ? "Going quiet. Send a warm check-in today."
        : "Over 7 days silent. Break the loop now or it dies here.",
  };
}

function neutral(): SlaAssessment {
  return {
    state: "on_pace",
    hoursElapsed: null,
    clockAnchor: null,
    label: "—",
    tip: "No timestamp available.",
  };
}

function formatElapsed(hours: number): string {
  if (hours < 1) return `${Math.max(0, Math.round(hours * 60))}m`;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  const remH = Math.round(hours - days * 24);
  return remH > 0 && days < 7 ? `${days}d ${remH}h` : `${days}d`;
}

// Tailwind classes per state — kept here so every SLA-aware component looks identical.
export const SLA_STATE_CLASS: Record<SlaState, string> = {
  on_pace: "bg-[#00FF41]/15 text-green-900 border-[#00FF41]/40",
  warning: "bg-amber-50 text-amber-900 border-amber-300",
  overdue: "bg-red-50 text-red-800 border-red-300",
  not_applicable: "bg-gray-50 text-gray-500 border-gray-200",
};

// Sort helper — overdue first, then warning, then on_pace, not_applicable last.
// Ties within a state broken by longest elapsed first.
const STATE_RANK: Record<SlaState, number> = {
  overdue: 0,
  warning: 1,
  on_pace: 2,
  not_applicable: 3,
};

export function sortBySla(leads: Lead[]): Lead[] {
  return [...leads]
    .map((l) => ({ l, sla: assessSla(l) }))
    .sort((a, b) => {
      const r = STATE_RANK[a.sla.state] - STATE_RANK[b.sla.state];
      if (r !== 0) return r;
      return (b.sla.hoursElapsed ?? 0) - (a.sla.hoursElapsed ?? 0);
    })
    .map(({ l }) => l);
}

export function slaStateOf(lead: Lead): SlaState {
  return assessSla(lead).state;
}
