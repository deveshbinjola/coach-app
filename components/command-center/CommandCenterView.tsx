// components/command-center/CommandCenterView.tsx
"use client";

import type { BusinessPulse } from "@/lib/ambient";
import RightNowList from "@/components/command-center/RightNowList";
import BusinessPulseStrip from "@/components/command-center/BusinessPulseStrip";
import FirstRunCommandCenter from "@/components/command-center/FirstRunCommandCenter";
import MirrorCard from "@/components/MirrorCard";
import MeetInvite from "@/components/command-center/MeetInvite";
import { PageHeader } from "@/components/ui";

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
  /** False when the assistant has never actually asked this coach anything.
   *  Shows the introduction invite instead of pretending to know them. */
  interviewed?: boolean;
};

export default function CommandCenterView({ pulse, coachFirstName, toggle, hasActivity, interviewed = true }: Props) {
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
      <div className="max-w-3xl mx-auto space-y-7">
        <PageHeader
          title={<>Welcome, {coachFirstName}.</>}
          meta={<em>Take a breath. &nbsp;In through the nose&hellip; slow exhale.</em>}
          actions={toggle}
        />

        <FirstRunCommandCenter />
      </div>
    );
  }

  return (
    // mx-auto. Without it this 768px column sat hard against the left edge of
    // the 1152px <main>, leaving a 384px dead gutter on the right while admin
    // mode of the same route filled the full width. Centred, the short screen
    // reads as composed rather than unfinished.
    <div className="max-w-3xl mx-auto space-y-7">
      <PageHeader
        title={<>Hey, {coachFirstName}.</>}
        meta={<em>Take a breath before you start. &nbsp;In through the nose&hellip; slow exhale.</em>}
        actions={toggle}
      >
        {!interviewed && <MeetInvite />}
      </PageHeader>

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
