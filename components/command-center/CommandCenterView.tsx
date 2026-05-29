// components/command-center/CommandCenterView.tsx
"use client";

import type { BusinessPulse } from "@/lib/ambient";
import RightNowList from "@/components/command-center/RightNowList";
import BusinessPulseStrip from "@/components/command-center/BusinessPulseStrip";
import FirstRunCommandCenter from "@/components/command-center/FirstRunCommandCenter";

// ── Backward-compatible type export ─────────────────────────────────
// lib/build-punch-list.ts still imports this type. Keep it exported
// to avoid breaking that module. The old Command Center data flow
// no longer uses it, but the type itself is still referenced.
export type JustLandedItem = {
  draft_id: string;
  lead_id: string;
  lead_name: string;
  source: string | null;
  source_detail: string | null;
  preview: string;
  created_at: string;
};

type Props = {
  pulse: BusinessPulse;
  coachFirstName: string;
};

export default function CommandCenterView({ pulse, coachFirstName }: Props) {
  // First-run: a brand-new coach with no urgent items, no quiet items, and
  // no business signals at all. Rather than a dead-end "nothing here" card,
  // show the welcome hero with a concrete activation path.
  const isFirstRun =
    !pulse.heroItem &&
    pulse.quietList.length === 0 &&
    pulse.metrics.revenue.amount === 0 &&
    pulse.metrics.activeMembers === 0 &&
    pulse.metrics.sessionsThisMonth === 0 &&
    pulse.metrics.trustRate === null;

  if (isFirstRun) {
    return (
      <div className="max-w-3xl space-y-7">
        <header>
          <h1 className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            Welcome, {coachFirstName}.
          </h1>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
            Take a breath. &nbsp;In through the nose&hellip; slow exhale.
          </p>
        </header>

        <FirstRunCommandCenter />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-7">
      <header>
        <h1 className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
          Hey, {coachFirstName}.
        </h1>
        <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
          Take a breath before you start. &nbsp;In through the nose&hellip; slow exhale.
        </p>
      </header>

      <RightNowList
        heroItem={pulse.heroItem}
        quietList={pulse.quietList}
        daySummary={pulse.daySummary}
      />

      <BusinessPulseStrip metrics={pulse.metrics} />

      {/* Honest Question — keep this LAST so it reads as a closing thought, not a to-do */}
      <section
        className="border-l-2 border-[var(--brand)] pl-5 py-1"
        aria-label="Today's coaching prompt"
      >
        <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)]">
          Today&apos;s prompt
        </div>
        <p className="text-[length:var(--t-h3)] italic text-[color:var(--text)] mt-1.5 leading-[var(--leading-relaxed)] max-w-2xl">
          {pulse.honestQuestion}
        </p>
      </section>
    </div>
  );
}
