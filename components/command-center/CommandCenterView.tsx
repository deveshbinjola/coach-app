// components/command-center/CommandCenterView.tsx
"use client";

import type { BusinessPulse } from "@/lib/ambient";
import RightNowList from "@/components/command-center/RightNowList";
import BusinessPulseStrip from "@/components/command-center/BusinessPulseStrip";
import FirstRunCommandCenter from "@/components/command-center/FirstRunCommandCenter";
import MirrorCard from "@/components/MirrorCard";

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
  toggle?: React.ReactNode;
  /** True once the coach has any lead or a voice profile — i.e. they've started. */
  hasActivity?: boolean;
};

export default function CommandCenterView({ pulse, coachFirstName, toggle, hasActivity }: Props) {
  // First-run: a brand-new coach who has not started yet. Once they have a
  // lead or a voice profile, they're past the setup hero even if no urgent
  // business signals exist yet. Rather than a dead-end, show the welcome hero
  // with a concrete activation path — but only before they've done anything.
  const isFirstRun =
    !hasActivity &&
    !pulse.heroItem &&
    pulse.quietList.length === 0 &&
    pulse.metrics.revenue.amount === 0 &&
    pulse.metrics.activeMembers === 0 &&
    pulse.metrics.sessionsThisMonth === 0 &&
    pulse.metrics.trustRate === null;

  if (isFirstRun) {
    return (
      <div className="max-w-3xl space-y-7">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
              Welcome, {coachFirstName}.
            </h1>
            <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
              Take a breath. &nbsp;In through the nose&hellip; slow exhale.
            </p>
          </div>
          {toggle}
        </header>

        <FirstRunCommandCenter />
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-7">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            Hey, {coachFirstName}.
          </h1>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
            Take a breath before you start. &nbsp;In through the nose&hellip; slow exhale.
          </p>
        </div>
        {toggle}
      </header>

      <RightNowList
        heroItem={pulse.heroItem}
        quietList={pulse.quietList}
        daySummary={pulse.daySummary}
      />

      <BusinessPulseStrip metrics={pulse.metrics} />

      {/* One reflective moment, and it closes the page rather than opening
          it. The Mirror used to sit above the greeting with its own open
          textarea while this prompt asked a second question below, so the
          screen posed two reflective questions before showing any work.
          Now: the prompt is the thought, the Mirror is the quiet door out
          of it, and neither competes with the day's actual list. */}
      <section
        className="space-y-3 border-l-2 border-[var(--brand)] pl-5 py-1"
        aria-label="Today's coaching prompt"
      >
        <div>
          <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)]">
            Today&apos;s prompt
          </div>
          <p className="text-[length:var(--t-h3)] italic text-[color:var(--text)] mt-1.5 leading-[var(--leading-relaxed)] max-w-2xl">
            {pulse.honestQuestion}
          </p>
        </div>
        <div className="max-w-2xl">
          <MirrorCard variant="inline" />
        </div>
      </section>
    </div>
  );
}
