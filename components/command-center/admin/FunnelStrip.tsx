// components/command-center/admin/FunnelStrip.tsx
"use client";

// "Where men fall off" — the 30-day lead funnel as one horizontal strip.
// Distinct leads per stage with the drop between stages named out loud.
// Fed by the lead_funnel DB triggers (P0 slice 5); renders a quiet
// explainer until the migration has run and events exist.

import { leadStageLabel, type LeadFunnelStageStat } from "@/lib/funnel";

export default function FunnelStrip({ stages }: { stages: LeadFunnelStageStat[] }) {
  const hasData = stages.some((s) => s.leads > 0);

  return (
    <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em] text-[color:var(--text)]">Where men fall off</span>
        <span className="text-[11px] font-bold text-[color:var(--text-muted)]">last 30 days</span>
      </div>

      {!hasData ? (
        <div className="px-[18px] py-4 border-t border-[var(--border-faint)] text-[length:var(--t-body)] text-[color:var(--text-muted)]">
          Fills in as leads move: created, contacted, booked, client, paid. No movement recorded yet.
        </div>
      ) : (
        <div className="flex items-stretch border-t border-[var(--border-faint)]">
          {stages.map((s, i) => (
            <div
              key={s.stage}
              className={`flex-1 min-w-0 px-3 py-3 ${i > 0 ? "border-l border-[var(--border-faint)]" : ""}`}
            >
              <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[color:var(--text-faint)] truncate">
                {leadStageLabel(s.stage)}
              </div>
              <div className="text-[20px] font-extrabold text-[color:var(--text)] leading-tight">{s.leads}</div>
              {i > 0 && s.dropFromPrev > 0 && (
                <div className="text-[11px] font-bold text-[color:var(--danger)]">-{s.dropFromPrev}%</div>
              )}
              {i > 0 && s.dropFromPrev <= 0 && (
                <div className="text-[11px] font-bold text-[color:var(--text-muted)]">held</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
