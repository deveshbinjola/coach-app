"use client";

// CommandCenterView — the coach's home page, refactored Session 2 onto
// the design system.
//
// Granola energy throughout: AI output (the just-landed band) is the
// hero, calm pacing between sections, no 4-KPI strip competing for
// attention. Linear's left-spine + right-rail layout for density
// without noise.
//
// Page surface in order:
//   1. Just-landed band — auto-drafted first responses pending review.
//      Sits at the top because the 21x conversion lift on fast first
//      contact only happens if the coach acts in minutes, not hours.
//   2. Two-column body:
//      LEFT  — content pipeline (Brand OS-powered + manual)
//              + Voice Trust
//      RIGHT — weekly reach progress
//              + honest question (rotating coaching prompt)
//
// What's NOT here on purpose: the old 4-KPI stats row (reach / scheduled /
// posts-30d / leads-in-pipeline). All four numbers are visible elsewhere
// on the page already, just not stacked in a chart-blob at the top.

import { useMemo, useState } from "react";
import {
  type Lead,
  type LeadMessage,
  type Content,
  type ContentStatus,
  type VoiceProfile,
  PLATFORM_LABEL,
  TEMPERATURE_LABEL,
  NEXT_ACTION_LABEL,
  PAIN_SIGNAL_LABEL,
} from "@/lib/types";
import { computeLeadScore } from "@/lib/lead-score";
import { assessSla } from "@/lib/lead-sla";
import { getContentPushBack, getContentPushBackQueue } from "@/lib/pushback";
import { summarizeTrust, voiceMemoryRules } from "@/lib/voice-trust";
import { Badge, Card, LeadAvatar } from "@/components/ui";
import SlaBadge from "@/components/SlaBadge";
import VoiceTrustCard from "@/components/VoiceTrustCard";
import CommandHero from "@/components/command-center/CommandHero";
import RevenueCard, { type OfferingRevenueSummary } from "@/components/command-center/RevenueCard";
import StatsStrip from "@/components/command-center/StatsStrip";
import ModeToggle, { type Mode } from "@/components/command-center/ModeToggle";
import FirstRunCommandCenter from "@/components/command-center/FirstRunCommandCenter";

// ── Types ──────────────────────────────────────────────────────────────────

export type JustLandedItem = {
  draft_id:     string;
  lead_id:      string;
  lead_name:    string;
  source:       string;
  source_detail: string | null;
  preview:      string;
  created_at:   string;
};

type Props = {
  leads:          Lead[];
  content:        Content[];
  reachCount:     number;
  reachTarget:    number;
  /** Distinct leads contacted per UTC day for the past 7 days, oldest →
   *  today. Drives the pill bars in ReachCard. Length is always 7. */
  dailyReach:     number[];
  honestQuestion: string;
  now:            number;
  justLanded:     JustLandedItem[];
  /** AI-drafted SENT messages over the last 28 days. Drives the Voice
   *  Trust insight card. Empty array is fine — card shows empty state. */
  trustMessages:  LeadMessage[];
  voiceProfile:   VoiceProfile | null;
  /** Used for the display-size greeting at the top of the page
   *  ("Hey, Sunny."). */
  coachFirstName: string;
  offeringRevenue: OfferingRevenueSummary[];
};

// Tiny derived summary that drives the top-of-page strip.
// Computed inline so we don't have to thread another prop through the page.
//
// Money flows through cents → dollars at the render boundary; the summarize
// function returns cents and the component formats. If no leads have
// deal_value set, the money totals will be 0 and we render the count-only
// fallback ("8 clients" instead of "$24,000 · 8 clients").
function summarize(leads: Lead[]) {
  const active = leads.filter(
    (l) => l.status !== "client" && l.status !== "closed_lost"
  );
  const clients = leads.filter((l) => l.status === "client");
  const booked = leads.filter((l) => l.status === "booked");

  const sum = (xs: Lead[]): number =>
    xs.reduce((acc, l) => acc + (l.deal_value ?? 0), 0);

  return {
    activeCount:  active.length,
    clientCount:  clients.length,
    bookedCount:  booked.length,
    clientValueCents:   sum(clients),
    pipelineValueCents: sum(active),
    bookedValueCents:   sum(booked),
  };
}

type RescueItem = {
  lead: Lead;
  score: number;
  sla: ReturnType<typeof assessSla>;
  reason: string;
  action: string;
};

type InsightLane = "investigate" | "fix" | "double_down" | "ignore";

type InsightConfidence = "New" | "Early" | "Real";

type InsightItem = {
  lane: InsightLane;
  title: string;
  why: string;
  action: string;
  href: string;
  confidence: InsightConfidence;
};

// Render cents → "$24,000" or "$1,250.50" — drops trailing .00 on round
// dollar amounts so the strip reads cleaner.
function formatMoney(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  const rounded = Math.round(dollars);
  if (Math.abs(dollars - rounded) < 0.005) {
    return "$" + rounded.toLocaleString();
  }
  return "$" + dollars.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Constants ──────────────────────────────────────────────────────────────

const RESCUE_MAX = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

// Map content status → Badge tone. Semantic, not color-named.
function statusBadgeTone(status: ContentStatus): "warning" | "info" | "brand" | "danger" {
  switch (status) {
    case "draft":     return "warning";
    case "scheduled": return "info";
    case "published": return "brand";
    case "failed":    return "danger";
  }
}

function statusBadgeLabel(status: ContentStatus): string {
  switch (status) {
    case "draft":     return "Draft";
    case "scheduled": return "Scheduled";
    case "published": return "Live";
    case "failed":    return "Failed";
  }
}

function platformIcon(platform: string): string {
  const icons: Record<string, string> = {
    linkedin:  "in",
    instagram: "ig",
    twitter:   "tw",
    facebook:  "fb",
  };
  return icons[platform] ?? "··";
}

function formatSchedule(item: Content): string {
  if (item.status === "published" && item.published_at) {
    return new Date(item.published_at).toLocaleDateString("en-US", {
      month: "short",
      day:   "numeric",
    });
  }
  if (item.status === "scheduled" && item.scheduled_at) {
    const d       = new Date(item.scheduled_at);
    const isToday = new Date().toDateString() === d.toDateString();
    if (isToday) {
      return (
        "Today " +
        d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      );
    }
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month:   "short",
      day:     "numeric",
    });
  }
  return "Draft";
}

function performanceSummary(item: Content): string | null {
  if (item.status !== "published") return null;
  const p = item.performance;
  if (!p || Object.keys(p).length === 0) return null;
  const views = p.views ?? 0;
  return views > 0 ? `${views.toLocaleString()} views` : null;
}

// Sort content: scheduled (soonest first) → drafts (newest first) → published (newest first)
function sortContent(content: Content[]): Content[] {
  const order: Record<ContentStatus, number> = {
    scheduled: 0,
    draft:     1,
    published: 2,
    failed:    3,
  };
  return [...content].sort((a, b) => {
    if (order[a.status] !== order[b.status])
      return order[a.status] - order[b.status];
    if (a.status === "scheduled") {
      return (
        new Date(a.scheduled_at!).getTime() -
        new Date(b.scheduled_at!).getTime()
      );
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function formatLandedAgo(iso: string, now: number): string {
  const diffMs  = now - new Date(iso).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1)  return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return "1d+ ago";
}

function buildRescueItems(leads: Lead[], now: number): RescueItem[] {
  return leads
    .filter((lead) => lead.status !== "client" && lead.status !== "closed_lost")
    .map((lead) => {
      const score = computeLeadScore(lead, now);
      const sla = assessSla(lead, now);
      const followupAt = lead.next_followup_at
        ? new Date(lead.next_followup_at).getTime()
        : null;
      const promisedFollowup = followupAt !== null && followupAt <= now;

      let rescueWeight = score;
      if (sla.state === "overdue") rescueWeight += 180;
      if (sla.state === "warning") rescueWeight += 90;
      if (promisedFollowup) rescueWeight += 140;
      if (lead.next_honest_action === "invite_to_call") rescueWeight += 45;
      if (lead.next_honest_action === "close_loop") rescueWeight += 30;
      if ((lead.deal_value ?? 0) > 0) rescueWeight += 20;

      return {
        lead,
        score,
        sla,
        rescueWeight,
        reason: rescueReason(lead, sla, promisedFollowup),
        action: rescueAction(lead),
      };
    })
    .filter((item) => {
      if (item.sla.state === "overdue" || item.sla.state === "warning") return true;
      if (item.lead.next_followup_at) {
        return new Date(item.lead.next_followup_at).getTime() <= now;
      }
      return item.lead.next_honest_action === "invite_to_call";
    })
    .sort((a, b) => {
      if (b.rescueWeight !== a.rescueWeight) return b.rescueWeight - a.rescueWeight;
      return (b.sla.hoursElapsed ?? 0) - (a.sla.hoursElapsed ?? 0);
    })
    .slice(0, RESCUE_MAX)
    .map(({ rescueWeight: _rescueWeight, ...item }) => item);
}

function rescueReason(
  lead: Lead,
  sla: ReturnType<typeof assessSla>,
  promisedFollowup: boolean
): string {
  if (promisedFollowup) return "Follow-up was promised";
  if (lead.status === "new" && sla.state === "overdue") return "No first touch yet";
  if (sla.state === "overdue") return "Conversation is going cold";
  if (sla.state === "warning") return "Needs a reply today";
  if (lead.next_honest_action === "invite_to_call") return "Ready for a call invite";
  return "Worth your next message";
}

function rescueAction(lead: Lead): string {
  if (lead.next_honest_action) return NEXT_ACTION_LABEL[lead.next_honest_action];
  if (lead.status === "new") return "Send first touch";
  return "Draft follow-up";
}

function firstPainLabel(lead: Lead): string | null {
  const first = lead.pain_signal?.[0];
  return first ? PAIN_SIGNAL_LABEL[first] : null;
}

type RiskItem = {
  label: string;
  count: number;
  action: string;
  href: string;
};

function buildRiskItems(
  leads: Lead[],
  messages: LeadMessage[],
  now: number
): RiskItem[] {
  const active = leads.filter(
    (lead) => lead.status !== "client" && lead.status !== "closed_lost"
  );
  const staleHot = active.filter((lead) => {
    if (lead.temperature !== "on_fire" && lead.temperature !== "hot") return false;
    const anchor = lead.last_contact_at ?? lead.created_at;
    const days = (now - new Date(anchor).getTime()) / 86_400_000;
    return Number.isFinite(days) && days >= 3;
  }).length;
  const noNextAction = active.filter((lead) => !lead.next_honest_action).length;
  const missingSourceDetail = active.filter((lead) => !lead.source_detail).length;
  const heavyEdits = messages.filter(
    (message) => message.ai_drafted && message.was_edited === true
  ).length;

  return [
    {
      label: "Stale hot leads",
      count: staleHot,
      action: "Rescue now",
      href: "/inbox",
    },
    {
      label: "No next action",
      count: noNextAction,
      action: "Clean pipeline",
      href: "/inbox",
    },
    {
      label: "Missing source detail",
      count: missingSourceDetail,
      action: "Fix attribution",
      href: "/inbox",
    },
    {
      label: "Heavy AI edits",
      count: heavyEdits,
      action: "Tune voice",
      href: "/voice",
    },
  ].filter((item) => item.count > 0);
}

function buildInsightQueue({
  leads,
  content,
  risks,
  rescueItems,
  memoryCount,
  trustPct,
  reachCount,
  reachTarget,
  bookedCount,
  now,
}: {
  leads: Lead[];
  content: Content[];
  risks: RiskItem[];
  rescueItems: RescueItem[];
  memoryCount: number;
  trustPct: number | null;
  reachCount: number;
  reachTarget: number;
  bookedCount: number;
  now: number;
}): InsightItem[] {
  const active = leads.filter(
    (lead) => lead.status !== "client" && lead.status !== "closed_lost"
  );
  const topSource = topActiveLeadSource(active);
  const topContent = [...content]
    .filter((item) => item.status === "published" && (item.performance?.views ?? 0) > 0)
    .sort((a, b) => (b.performance?.views ?? 0) - (a.performance?.views ?? 0))[0];
  const coldQuiet = active.filter((lead) => {
    if (lead.temperature !== "cold" && lead.temperature !== "dormant") return false;
    if (lead.next_followup_at) return false;
    const anchor = lead.last_contact_at ?? lead.created_at;
    const days = (now - new Date(anchor).getTime()) / 86_400_000;
    return Number.isFinite(days) && days >= 7;
  }).length;
  const rescueIds = rescueItems.map((item) => item.lead.id).join(",");
  const firstRisk = risks[0];
  const heavyEdits = risks.find((risk) => risk.label === "Heavy AI edits");
  const noNextAction = risks.find((risk) => risk.label === "No next action");
  const reachGap = Math.max(0, reachTarget - reachCount);

  const investigate: InsightItem = heavyEdits
    ? {
        lane: "investigate",
        title: "Investigate edited AI drafts",
        why: `${heavyEdits.count} AI draft${heavyEdits.count === 1 ? "" : "s"} needed edits. Find the voice rule before scaling automation.`,
        action: "Review voice",
        href: "/voice",
        confidence: heavyEdits.count >= 3 ? "Real" : "Early",
      }
    : topSource && topSource.count >= 2
    ? {
        lane: "investigate",
        title: `Investigate ${topSource.label} leads`,
        why: `${topSource.count} active leads came from this source. Check if they are warmer, cheaper, or just noisier.`,
        action: "Review source",
        href: "/inbox",
        confidence: topSource.count >= 4 ? "Real" : "Early",
      }
    : {
        lane: "investigate",
        title: "Investigate attribution quality",
        why: "Source detail is what turns lead capture into a repeatable channel. Start by cleaning the next few active leads.",
        action: "Open inbox",
        href: "/inbox",
        confidence: "New",
      };

  const fix: InsightItem =
    rescueItems.length > 0
      ? {
          lane: "fix",
          title: `Fix ${rescueItems.length} leaking conversation${rescueItems.length === 1 ? "" : "s"}`,
          why: "These leads are closest to going cold. The fastest win is a clean next message.",
          action: "Rescue leads",
          href: rescueIds
            ? `/inbox?compose=open&source=rescue&ids=${encodeURIComponent(rescueIds)}`
            : "/inbox",
          confidence: rescueItems.length >= 3 ? "Real" : "Early",
        }
      : noNextAction
      ? {
          lane: "fix",
          title: "Fix the next action gap",
          why: `${noNextAction.count} active lead${noNextAction.count === 1 ? "" : "s"} lack a clear next move. This is where pipeline gets fuzzy.`,
          action: "Clean pipeline",
          href: "/inbox",
          confidence: noNextAction.count >= 5 ? "Real" : "Early",
        }
      : firstRisk
      ? {
          lane: "fix",
          title: `Fix ${firstRisk.label.toLowerCase()}`,
          why: `${firstRisk.count} item${firstRisk.count === 1 ? "" : "s"} need attention before the system can stay simple.`,
          action: firstRisk.action,
          href: firstRisk.href,
          confidence: firstRisk.count >= 3 ? "Real" : "Early",
        }
      : {
          lane: "fix",
          title: "Fix nothing urgent",
          why: "No obvious leak is demanding attention. Protect the day from busywork.",
          action: "Open inbox",
          href: "/inbox",
          confidence: "Real",
        };

  const doubleDown: InsightItem =
    memoryCount > 0
      ? {
          lane: "double_down",
          title: "Double down on approved voice memory",
          why: `${memoryCount} approved rule${memoryCount === 1 ? "" : "s"} can make every draft feel more like the coach before another prompt is written.`,
          action: "Open memory",
          href: "/memory",
          confidence: memoryCount >= 3 ? "Real" : "Early",
        }
      : topContent
      ? {
          lane: "double_down",
          title: `Double down on ${PLATFORM_LABEL[topContent.platform]}`,
          why: `${topContent.title} has ${(topContent.performance?.views ?? 0).toLocaleString()} views. Turn the winning angle into a lead capture asset.`,
          action: "Review content",
          href: "/command-center",
          confidence: (topContent.performance?.views ?? 0) >= 500 ? "Real" : "Early",
        }
      : bookedCount > 0
      ? {
          lane: "double_down",
          title: "Double down on booked-call path",
          why: `${bookedCount} booked call${bookedCount === 1 ? "" : "s"} show the path is working. Repeat the source and message that got them there.`,
          action: "Review leads",
          href: "/inbox",
          confidence: bookedCount >= 2 ? "Real" : "Early",
        }
      : {
          lane: "double_down",
          title: "Double down on reach habit",
          why: reachGap > 0
            ? `${reachGap} reach action${reachGap === 1 ? "" : "s"} remain this week. More clean inputs will make the whole system smarter.`
            : "Reach is on pace. Keep the habit light and consistent instead of adding more reporting.",
          action: "Log reach",
          href: "/command-center",
          confidence: reachCount > 0 ? "Early" : "New",
        };

  const ignore: InsightItem =
    coldQuiet > 0
      ? {
          lane: "ignore",
          title: `Ignore ${coldQuiet} cold lead${coldQuiet === 1 ? "" : "s"} this week`,
          why: "They are not the constraint while rescue leads, calls, or voice memory work exists.",
          action: "Open inbox",
          href: "/inbox",
          confidence: coldQuiet >= 5 ? "Real" : "Early",
        }
      : trustPct !== null && trustPct >= 80 && risks.length === 0
      ? {
          lane: "ignore",
          title: "Ignore voice tweaking today",
          why: `${trustPct}% of recent AI drafts went out as-is. Use that trust to move faster, not to keep polishing.`,
          action: "Draft message",
          href: "/compose",
          confidence: "Real",
        }
      : {
          lane: "ignore",
          title: "Ignore vanity reporting",
          why: "Views, counts, and charts only matter when they change the next move. Stay with the queue.",
          action: "Start focus",
          href: rescueItems.length > 0 ? "/inbox?compose=open&source=rescue" : "/inbox",
          confidence: "New",
        };

  return [investigate, fix, doubleDown, ignore];
}

function topActiveLeadSource(leads: Lead[]): { label: string; count: number } | null {
  const counts = new Map<Lead["source"], number>();
  leads.forEach((lead) => {
    counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1);
  });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  return { label: sourceLabel(top[0]), count: top[1] };
}

function sourceLabel(source: Lead["source"]): string {
  const labels: Record<Lead["source"], string> = {
    ig: "Instagram",
    linkedin: "LinkedIn",
    referral: "Referral",
    quiz: "Quiz",
    in_person: "In-person",
    podcast: "Podcast",
    newsletter: "Newsletter",
    other: "Other",
  };
  return labels[source];
}

// ── Component ──────────────────────────────────────────────────────────────

export default function CommandCenterView({
  leads,
  content,
  reachCount,
  reachTarget,
  dailyReach,
  honestQuestion,
  now,
  justLanded,
  trustMessages,
  voiceProfile,
  coachFirstName,
  offeringRevenue,
}: Props) {
  const [contentItems, setContentItems] = useState<Content[]>(content ?? []);
  const [fixingContentId, setFixingContentId] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === "undefined") return "coach";
    return (localStorage.getItem("command-center-mode") as Mode) ?? "coach";
  });

  function handleModeChange(m: Mode) {
    setMode(m);
    localStorage.setItem("command-center-mode", m);
  }

  const sortedContent = useMemo(() => sortContent(contentItems), [contentItems]);
  const summary = useMemo(() => summarize(leads), [leads]);
  const rescueItems = useMemo(() => buildRescueItems(leads, now), [leads, now]);
  const risks = useMemo(
    () => buildRiskItems(leads, trustMessages, now),
    [leads, trustMessages, now]
  );
  const trust = useMemo(() => summarizeTrust(trustMessages, now), [trustMessages, now]);
  const memoryRules = useMemo(() => voiceMemoryRules(voiceProfile), [voiceProfile]);
  const insightItems = useMemo(
    () =>
      buildInsightQueue({
        leads,
        content: contentItems,
        risks,
        rescueItems,
        memoryCount: memoryRules.length,
        trustPct: trust.asIsPct28,
        reachCount,
        reachTarget,
        bookedCount: summary.bookedCount,
        now,
      }),
    [
      leads,
      contentItems,
      risks,
      rescueItems,
      memoryRules.length,
      trust.asIsPct28,
      reachCount,
      reachTarget,
      summary.bookedCount,
      now,
    ]
  );
  async function fixContent(item: Content) {
    if (item.status === "published") return;
    setFixingContentId(item.id);
    try {
      const res = await fetch("/api/content/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.content) {
        alert(`Content fix failed: ${json.error ?? "unknown"}`);
        return;
      }
      setContentItems((current) =>
        current.map((contentItem) =>
          contentItem.id === item.id ? (json.content as Content) : contentItem
        )
      );
    } finally {
      setFixingContentId(null);
    }
  }

  // First-run = no leads. Voice setup alone doesn't make the dashboard
  // useful — there's nothing to act on until a real conversation lands.
  // Catches the post-/welcome state where a coach finished voice but
  // hasn't captured anyone yet.
  if (leads.length === 0) {
    return <FirstRunCommandCenter />;
  }

  // State-aware subline under the greeting. Mirrors CommandHero's headline
  // logic but at a quieter weight, so the greeting stays personal while
  // still signaling what the day looks like.
  const greetingSubline =
    rescueItems.length > 0
      ? `${rescueItems.length} conversation${rescueItems.length === 1 ? "" : "s"} need${rescueItems.length === 1 ? "s" : ""} a reply today.`
      : justLanded.length > 0
        ? `${justLanded.length} fresh draft${justLanded.length === 1 ? "" : "s"} waiting in your voice.`
        : "Quiet board. Send reach or sharpen voice.";

  return (
    <div className="space-y-7">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="font-display text-[length:var(--t-h1)] font-bold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]"
          >
            Hey, {coachFirstName}.
          </h1>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
            {mode === "admin"
              ? "Time to check the numbers."
              : <>Take a breath before you start. &nbsp;In through the nose&hellip; slow exhale.</>}
          </p>
        </div>
        <ModeToggle mode={mode} onModeChange={handleModeChange} />
      </header>

      <InsightQueue items={insightItems} defaultExpanded={mode === "admin"} />

      {mode === "coach" && (
        <>
          <CommandHero
            summary={summary}
            rescueCount={rescueItems.length}
            draftCount={justLanded.length}
            reachCount={reachCount}
            reachTarget={reachTarget}
            voiceTrustPct={trust.asIsPct28}
            now={now}
            bookedCount={summary.bookedCount}
          />

          <LeadRescueCard items={rescueItems} />

          {justLanded.length > 0 && (
            <JustLandedBand items={justLanded} now={now} />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 opacity-[0.85] hover:opacity-100 transition-opacity duration-300">
            <div className="space-y-5 min-w-0">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                <ContentPipeline
                  items={sortedContent}
                  fixingId={fixingContentId}
                  onFix={fixContent}
                />
                <VoiceTrustCard messages={trustMessages} size="card" now={now} />
              </div>
            </div>

            <div className="space-y-5">
              <StatsStrip
                offerings={offeringRevenue}
                reachCount={reachCount}
                reachTarget={reachTarget}
                clientCount={summary.clientCount}
                pipelineValueCents={summary.pipelineValueCents}
              />

              {sidebarExpanded ? (
                <>
                  <HonestQuestion question={honestQuestion} />
                  <BillboardCard now={now} />
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setSidebarExpanded(true)}
                  className="w-full rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] px-3 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:border-[var(--border)] hover:text-[color:var(--text)] transition"
                >
                  More details →
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {mode === "admin" && (
        <>
          <StatsStrip
            offerings={offeringRevenue}
            reachCount={reachCount}
            reachTarget={reachTarget}
            clientCount={summary.clientCount}
            pipelineValueCents={summary.pipelineValueCents}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <HonestQuestion question={honestQuestion} />
            <BillboardCard now={now} />
          </div>
        </>
      )}
    </div>
  );
}

function InsightQueue({ items, defaultExpanded }: { items: InsightItem[]; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(() => {
    if (defaultExpanded) return true;
    if (typeof window === "undefined") return false;
    return localStorage.getItem("cc-insights-expanded") === "true";
  });

  function toggle() {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("cc-insights-expanded", String(next));
      return next;
    });
  }

  const actionableCount = items.filter(
    (item) => item.lane !== "ignore" && item.confidence !== "New"
  ).length;

  return (
    <section aria-label="Insight queue">
      <button
        type="button"
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] px-4 py-3 hover:border-[var(--border)] transition text-left"
      >
        <div className="flex items-center gap-3">
          <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
            Insight queue
          </div>
          {actionableCount > 0 && (
            <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-[var(--brand)] text-[color:var(--navy)] text-[10px] font-extrabold">
              {actionableCount}
            </span>
          )}
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            What to do, what to skip.
          </span>
        </div>
        <span
          className={`text-[color:var(--text-faint)] transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {items.map((item) => (
            <InsightQueueCard key={item.lane} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

function InsightQueueCard({ item }: { item: InsightItem }) {
  const config: Record<
    InsightLane,
    { label: string; tone: string; accent: string; dot: string }
  > = {
    investigate: {
      label: "Investigate",
      tone: "text-[color:var(--info)] bg-[var(--info-soft)] border-[color-mix(in_srgb,var(--info)_25%,var(--border))]",
      accent: "before:bg-[var(--info)]",
      dot: "bg-[var(--info)]",
    },
    fix: {
      label: "Fix",
      tone: "text-[color:var(--danger)] bg-[var(--danger-soft)] border-[color-mix(in_srgb,var(--danger)_25%,var(--border))]",
      accent: "before:bg-[var(--danger)]",
      dot: "bg-[var(--danger)]",
    },
    double_down: {
      label: "Double down",
      tone: "text-[color:var(--success)] bg-[var(--brand-soft)] border-[color-mix(in_srgb,var(--brand)_30%,var(--border))]",
      accent: "before:bg-[var(--brand)]",
      dot: "bg-[var(--brand)]",
    },
    ignore: {
      label: "Ignore",
      tone: "text-[color:var(--text-muted)] bg-[var(--surface-deep)] border-[var(--border-faint)]",
      accent: "before:bg-[var(--border-strong)]",
      dot: "bg-[var(--border-strong)]",
    },
  };
  const lane = config[item.lane];

  return (
    <a
      href={item.href}
      className={`group relative min-h-[250px] overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-xs)] transition hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${lane.accent}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${lane.tone}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${lane.dot}`} />
          {lane.label}
        </span>
        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
          {item.confidence}
        </span>
      </div>

      <h3 className="mt-4 text-[length:var(--t-h3)] font-extrabold leading-[var(--leading-tight)] text-[color:var(--text)]">
        {item.title}
      </h3>
      <p className="mt-3 text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
        {item.why}
      </p>

      <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-3 border-t border-[var(--border-faint)] pt-3">
        <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
          {item.action}
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-deep)] text-[color:var(--text-muted)] transition group-hover:bg-[var(--brand)] group-hover:text-[color:var(--navy)]">
          &rarr;
        </span>
      </div>
    </a>
  );
}

function LeadRescueCard({ items }: { items: RescueItem[] }) {
  const totalValue = items.reduce((acc, item) => acc + (item.lead.deal_value ?? 0), 0);
  const ids = items.map((item) => item.lead.id).join(",");
  const composeHref = ids
    ? `/inbox?compose=open&source=rescue&ids=${encodeURIComponent(ids)}`
    : "/inbox";

  return (
    <section aria-label="Lead rescue">
      <Card
        variant="elevated"
        padding="none"
        className="overflow-hidden border border-[color-mix(in_srgb,var(--brand)_28%,transparent)]"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1.35fr]">
          <div className="bg-[var(--navy)] text-[color:var(--text-inverse)] p-6 sm:p-7 flex flex-col justify-between gap-8">
            <div>
              <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand)]">
                Lead Rescue
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight leading-[var(--leading-tight)] mt-2">
                No money leaks today.
              </h2>
              <p className="text-[length:var(--t-caption)] text-white/70 leading-[var(--leading-relaxed)] mt-3 max-w-sm">
                The app found the conversations most likely to die without a clean next move.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-3xl font-bold tabular-nums leading-none">
                  {items.length}
                </div>
                <div className="text-[length:var(--t-caption)] text-white/60 mt-1">
                  needs action
                </div>
              </div>
              <div>
                <div className="text-3xl font-bold tabular-nums leading-none">
                  {totalValue > 0 ? formatMoney(totalValue) : "Live"}
                </div>
                <div className="text-[length:var(--t-caption)] text-white/60 mt-1">
                  {totalValue > 0 ? "pipeline at risk" : "pipeline watch"}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[var(--surface-elevated)]">
            {items.length === 0 ? (
              <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center p-8">
                <h3 className="text-[length:var(--t-h2)] font-bold text-[color:var(--text)]">
                  Nothing is slipping.
                </h3>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)] mt-2 max-w-sm">
                  Active leads are on pace. Capture new conversations or send reach while the board is clean.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                  <a
                    href="/leads/capture"
                    className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
                  >
                    Capture leads
                  </a>
                  <a
                    href="/inbox?compose=open"
                    className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] transition"
                  >
                    Send reach
                  </a>
                </div>
              </div>
            ) : (
              <>
                <ul>
                  {items.map(({ lead, sla, reason, action }, i) => {
                    const isLast = i === items.length - 1;
                    const pain = firstPainLabel(lead);
                    return (
                      <li
                        key={lead.id}
                        className={isLast ? "" : "border-b border-[var(--border-faint)]"}
                      >
                        <a
                          href={`/leads/${lead.id}`}
                          className="group grid grid-cols-[auto_1fr_auto] gap-3 px-5 py-4 hover:bg-[var(--brand-soft)] transition"
                        >
                          <LeadAvatar name={lead.full_name} size="md" />

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-bold text-[length:var(--t-body)] text-[color:var(--text)] truncate">
                                {lead.full_name}
                              </p>
                              <SlaBadge lead={lead} compact />
                            </div>
                            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 truncate">
                              {reason}
                              {pain ? ` · ${pain}` : ""}
                              {lead.deal_value ? ` · ${formatMoney(lead.deal_value)}` : ""}
                            </p>
                          </div>

                          <div className="self-center text-right">
                            <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)] whitespace-nowrap">
                              {action}
                            </div>
                            <div className="text-[11px] text-[color:var(--text-faint)] mt-0.5 whitespace-nowrap">
                              {sla.label}
                            </div>
                          </div>
                        </a>
                      </li>
                    );
                  })}
                </ul>

                <div className="px-5 py-4 border-t border-[var(--border-faint)] flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                    Start here. Draft what they actually need, then move on.
                  </p>
                  <a
                    href={composeHref}
                    className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
                  >
                    Rescue these leads
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>
    </section>
  );
}

// ── Just-landed band ───────────────────────────────────────────────────────
//
// The visual hero. AI output as the centerpiece (italic blockquote with
// brand left border) — coaches feel "the AI sounds like me." Surrounding
// chrome stays restrained.

function JustLandedBand({
  items,
  now,
}: {
  items: JustLandedItem[];
  now:   number;
}) {
  return (
    <section aria-label="New leads with drafts pending review">
      <header className="mb-3 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[length:var(--t-h2)] font-bold tracking-tight">
            Just landed
          </h2>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-0.5">
            {items.length} {items.length === 1 ? "draft" : "drafts"} ready in
            your voice. Review and send — every minute counts.
          </p>
        </div>
      </header>

      <Card variant="elevated" padding="none">
        <ul>
          {items.map((item, i) => (
            <li
              key={item.draft_id}
              className={
                i > 0 ? "border-t border-[var(--border-faint)]" : ""
              }
            >
              <a
                href={`/leads/${item.lead_id}`}
                className="flex items-start gap-4 p-5 hover:bg-[var(--brand-soft)] transition group"
              >
                <LeadAvatar name={item.lead_name} size="md" className="mt-0.5" />

                <div className="min-w-0 flex-1">
                  {/* Name + source line + time-since */}
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-bold text-[length:var(--t-body)] text-[color:var(--text)]">
                      {item.lead_name}
                    </span>
                    <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                      via {item.source}
                      {item.source_detail ? ` · ${item.source_detail}` : ""}
                    </span>
                    <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)] tabular-nums">
                      · {formatLandedAgo(item.created_at, now)}
                    </span>
                  </div>

                  {/* AI draft preview — the magic moment */}
                  <blockquote className="mt-2 pl-3 border-l-2 border-[var(--brand)] text-[color:var(--text)] italic text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] line-clamp-2">
                    {item.preview}
                    {item.preview.length >= 140 ? "…" : ""}
                  </blockquote>
                </div>

                <div className="shrink-0 self-center">
                  <span className="inline-flex items-center text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] group-hover:text-[color:var(--text)] transition whitespace-nowrap">
                    Review →
                  </span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

// ── Content pipeline ───────────────────────────────────────────────────────

function ContentPipeline({
  items,
  fixingId,
  onFix,
}: {
  items: Content[];
  fixingId: string | null;
  onFix: (item: Content) => void;
}) {
  const pushBackQueue = getContentPushBackQueue(items, 3);

  return (
    <section aria-label="Content pipeline">
      <header className="mb-3 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[length:var(--t-h2)] font-bold tracking-tight">
            Content pipeline
          </h2>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-0.5">
            {items.length === 0
              ? "Drafts, scheduled posts, and recent publishes."
              : `${items.length} ${items.length === 1 ? "post" : "posts"} in flight — drafted, scheduled, and live.`}
          </p>
        </div>
        <Badge tone="brand" size="xs" uppercase>
          Brand OS powered
        </Badge>
      </header>

      {pushBackQueue.length > 0 && (
        <div className="mb-3 rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                Content critic
              </p>
              <h3 className="mt-1 text-[length:var(--t-h3)] font-bold text-[color:var(--text)]">
                Fix these before they become invisible posts.
              </h3>
            </div>
            <Badge tone="warning" size="xs" uppercase>
              {pushBackQueue.length} to fix
            </Badge>
          </div>

          <div className="mt-3 grid gap-2">
            {pushBackQueue.map(({ content, pushBack }) => (
              <div
                key={content.id}
                className="flex items-start justify-between gap-3 rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                    {content.title}
                  </p>
                  <p className="mt-0.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
                    {pushBack.items[0]?.action}
                  </p>
                </div>
                {content.status === "published" ? (
                  <span className={`mt-1 h-2 w-2 rounded-full shrink-0 ${pushBackDot(pushBack.tone)}`} />
                ) : (
                  <button
                    type="button"
                    onClick={() => onFix(content)}
                    disabled={fixingId === content.id}
                    className="shrink-0 h-8 px-3 rounded-[var(--r-sm)] bg-[var(--navy)] text-[color:var(--brand)] text-[11px] font-extrabold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition"
                  >
                    {fixingId === content.id ? "Fixing" : "Fix it"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Card padding="none">
        {items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <h3 className="text-[length:var(--t-h3)] font-bold text-[color:var(--text)]">
              No content yet.
            </h3>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2 max-w-md mx-auto leading-[var(--leading-base)]">
              Use Brand OS to generate your first 30 days — in your voice.
            </p>
            <a
              href="/voice"
              className="inline-flex items-center justify-center mt-5 h-10 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] font-bold text-[length:var(--t-caption)] hover:bg-[var(--brand-strong)] transition"
            >
              Open Brand OS →
            </a>
          </div>
        ) : (
          <ul>
            {items.map((item, i) => {
              const perf  = performanceSummary(item);
              const critic = getContentPushBack(item);
              const isLast = i === items.length - 1;
              return (
                <li
                  key={item.id}
                  className={
                    isLast ? "" : "border-b border-[var(--border-faint)]"
                  }
                >
                  <div className="flex items-start gap-3 px-5 py-4">
                    {/* Platform chip */}
                    <div className="shrink-0 w-8 h-8 rounded-[var(--r-md)] bg-[var(--surface-deep)] flex items-center justify-center text-[10px] font-bold text-[color:var(--text-muted)] uppercase">
                      {platformIcon(item.platform)}
                    </div>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[length:var(--t-body)] font-bold text-[color:var(--text)] truncate">
                        {item.title}
                      </p>
                      <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <span>{PLATFORM_LABEL[item.platform]}</span>
                        <span className="text-[color:var(--text-faint)]">·</span>
                        <span>{formatSchedule(item)}</span>
                        {perf && (
                          <>
                            <span className="text-[color:var(--text-faint)]">·</span>
                            <span className="text-[color:var(--brand-strong)] font-bold">
                              {perf}
                            </span>
                          </>
                        )}
                      </p>
                      {critic.tone !== "clear" && (
                        <div className="mt-2 flex max-w-full items-center gap-2">
                        <p className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-[var(--surface-deep)] px-2 py-1 text-[11px] font-bold text-[color:var(--text-muted)]">
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${pushBackDot(critic.tone)}`} />
                          <span className="truncate">{critic.verdict}</span>
                        </p>
                        {item.status !== "published" && (
                          <button
                            type="button"
                            onClick={() => onFix(item)}
                            disabled={fixingId === item.id}
                            className="shrink-0 h-6 px-2 rounded-[var(--r-sm)] border border-[var(--border-faint)] text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text)] hover:bg-[var(--surface-deep)] disabled:opacity-50 transition"
                          >
                            {fixingId === item.id ? "Fixing" : "Fix"}
                          </button>
                        )}
                        </div>
                      )}
                    </div>

                    {/* Status badge */}
                    <div className="shrink-0">
                      <Badge tone={statusBadgeTone(item.status)} size="xs">
                        {statusBadgeLabel(item.status)}
                      </Badge>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

function pushBackDot(tone: "blocker" | "warning" | "opportunity" | "clear") {
  switch (tone) {
    case "blocker":
      return "bg-[var(--danger)]";
    case "warning":
      return "bg-[var(--warning)]";
    case "opportunity":
      return "bg-[var(--brand-strong)]";
    case "clear":
      return "bg-[var(--brand)]";
  }
}

// ── Reach card ─────────────────────────────────────────────────────────────
//
// Weekly reach as 7 vertical pill bars instead of a flat horizontal bar.
// Each pill is a frame at "daily pace" height, with the day's actual
// reach filled in solid green from the bottom. Frame uses the .fill-pending
// striped pattern so unfilled portions read as "you haven't hit pace
// here yet" without needing a second color.
//
// Bars are ordered oldest → today (rightmost). The today bar gets a brand
// ring so the eye lands on the in-progress day. Single-letter day labels
// mirror the Donezo dashboard's S M T W T F S strip.

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;

function ReachCard({
  count,
  target,
  dailyReach,
  now,
}: {
  count:      number;
  target:     number;
  dailyReach: number[];
  now:        number;
}) {
  const hit = count >= target;
  const remaining = Math.max(0, target - count);
  // Daily pace = target spread evenly across 7 days. Round up so a target
  // of 15 reads as a pace of 3 (not 2, which would mark every full day
  // as overshooting).
  const dailyPace = Math.max(1, Math.ceil(target / 7));
  // Day labels for past-7 window. Index 0 = oldest (6 days ago), index 6 = today.
  const labels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return DAY_LETTERS[d.getDay()];
  });

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)]">
          Weekly reach
        </p>
        <span className="text-[length:var(--t-body)] font-bold text-[color:var(--text)] tabular-nums">
          {count}
          <span className="text-[color:var(--text-faint)] font-normal text-[length:var(--t-caption)]">
            {" "}
            / {target}
          </span>
        </span>
      </div>

      {/* Pill bar grid. h-24 leaves headroom for tall days; pills fill from
          the bottom so empty days collapse to the floor instead of floating
          mid-frame. */}
      <div className="grid grid-cols-7 gap-1.5 h-24">
        {dailyReach.map((value, i) => {
          const isToday = i === 6;
          // Cap visual at 1.4x pace so a single great day doesn't squash
          // the rest. Anything above pace still reads as "above target."
          const fillFrac = Math.min(1.4, value / dailyPace) / 1.4;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <div
                className={`relative w-full flex-1 rounded-full overflow-hidden fill-pending ${
                  isToday
                    ? "ring-2 ring-[color-mix(in_srgb,var(--brand)_55%,transparent)] ring-offset-2 ring-offset-[var(--surface-elevated)]"
                    : ""
                }`}
                aria-label={`${value} lead${value === 1 ? "" : "s"} contacted${isToday ? " today" : ""}`}
              >
                {value > 0 && (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-full bg-[var(--brand)] transition-[height] duration-[var(--t-slow)]"
                    style={{ height: `${Math.max(8, fillFrac * 100)}%` }}
                  />
                )}
              </div>
              <span
                className={`text-[10px] font-bold tabular-nums ${
                  isToday ? "text-[color:var(--text)]" : "text-[color:var(--text-faint)]"
                }`}
              >
                {labels[i]}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-3 text-right">
        {hit
          ? "Target hit. Keep going."
          : `${remaining} more to hit ${target}.`}
      </p>
    </Card>
  );
}

// ── Honest question ────────────────────────────────────────────────────────

function HonestQuestion({ question }: { question: string }) {
  return (
    <section
      className="border-l-2 border-[var(--brand)] pl-5 py-1"
      aria-label="Today's coaching prompt"
    >
      <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)]">
        Today's prompt
      </div>
      <p className="text-[length:var(--t-h3)] italic text-[color:var(--text)] mt-1.5 leading-[var(--leading-relaxed)] max-w-2xl">
        {question}
      </p>
    </section>
  );
}

// ── Billboard slot ─────────────────────────────────────────────────────────
//
// Right-rail mini-card that rotates personality content into the dashboard
// without bloating the data surfaces. Pattern lifted from Donezo's
// "Download mobile app" card. Three slots rotate by ISO week so the card
// changes about once a week (long enough to feel intentional, short enough
// to feel alive). Each slot points somewhere the coach should care about.

type BillboardSlot = {
  eyebrow: string;
  title:   string;
  body:    string;
  cta:     string;
  href:    string;
};

const BILLBOARD_SLOTS: BillboardSlot[] = [
  {
    eyebrow: "Cross-sell",
    title:   "Build the brand under your voice.",
    body:    "Avatar, voice, pillars, 30 days of content — in one cohort.",
    cta:     "See Build Your Brand →",
    href:    "https://elevateaisystem.com/build-your-brand",
  },
  {
    eyebrow: "Read",
    title:   "The Signal — last week's edition.",
    body:    "3 technologies, 2 ideas, 1 tool. Built for coaches who ship.",
    cta:     "Open the latest →",
    href:    "https://elevateaisystem.com/blog",
  },
  {
    eyebrow: "Refer",
    title:   "Know a coach who needs this?",
    body:    "Send them the link. We'll keep your name on the message.",
    cta:     "Get your referral link →",
    href:    "/settings",
  },
];

function pickBillboardSlot(now: number): BillboardSlot {
  // ISO-week-ish bucket — close enough that the card rotates ~weekly
  // without pinning to a specific calendar week boundary.
  const weekIndex = Math.floor(now / (7 * 24 * 60 * 60 * 1000));
  return BILLBOARD_SLOTS[weekIndex % BILLBOARD_SLOTS.length]!;
}

function BillboardCard({ now }: { now: number }) {
  const slot = pickBillboardSlot(now);
  const external = slot.href.startsWith("http");
  return (
    <a
      href={slot.href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="group relative block overflow-hidden rounded-[var(--r-lg)] bg-[var(--navy)] p-5 text-[color:var(--text-inverse)] shadow-[var(--shadow-md)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]"
    >
      {/* Brand glow corner — adds atmosphere without color noise */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[color-mix(in_srgb,var(--brand)_40%,transparent)] blur-2xl"
      />
      <div className="relative">
        <div className="text-[10px] font-extrabold uppercase tracking-widest text-[color:var(--brand)]">
          {slot.eyebrow}
        </div>
        <h3 className="font-display mt-3 text-xl font-bold leading-[var(--leading-tight)]">
          {slot.title}
        </h3>
        <p className="mt-2 text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-white/65">
          {slot.body}
        </p>
        <div className="mt-4 inline-flex items-center text-[length:var(--t-caption)] font-extrabold text-[color:var(--brand)] group-hover:text-[var(--text-inverse)] transition">
          {slot.cta}
        </div>
      </div>
    </a>
  );
}
