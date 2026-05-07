"use client";

// Badge that surfaces the response-time SLA state on a lead card/row.
// Compact mode drops the "New ·" / "Active ·" / "Silent ·" prefix and shows
// just the elapsed time — good for tight table cells. Full mode shows the
// whole label.
//
// Hidden for terminal states (client / closed_lost) — SLA doesn't apply there
// and an empty row column reads cleaner than a gray "N/A" pill.

import type { Lead } from "@/lib/types";
import { assessSla, SLA_STATE_CLASS, type SlaState } from "@/lib/lead-sla";

type Props = {
  lead: Lead;
  compact?: boolean;
};

// Small inline SVG icons — one import-free, no lucide dep surprises.
function IconClock({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function IconAlert({ size = 10 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export default function SlaBadge({ lead, compact = false }: Props) {
  const sla = assessSla(lead);
  if (sla.state === "not_applicable") return null;

  const Icon = sla.state === "overdue" ? IconAlert : IconClock;
  // Compact: strip the "New · " / "Active · " / "Silent · " prefix, keep only elapsed
  const label = compact
    ? sla.label.includes("·")
      ? sla.label.split("·").pop()?.trim() ?? sla.label
      : sla.label
    : sla.label;

  return (
    <span
      title={sla.tip}
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${SLA_STATE_CLASS[sla.state as SlaState]}`}
    >
      <Icon />
      {label}
    </span>
  );
}
