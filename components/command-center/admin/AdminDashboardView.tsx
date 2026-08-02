// components/command-center/admin/AdminDashboardView.tsx
"use client";

import type { AdminDashboard } from "@/lib/admin-dashboard";
import VitalTile from "@/components/command-center/admin/VitalTile";
import ThingsToHandle from "@/components/command-center/admin/ThingsToHandle";
import ContentPipeline from "@/components/command-center/admin/ContentPipeline";
import RevenueByOffering from "@/components/command-center/admin/RevenueByOffering";
import LeadPipeline from "@/components/command-center/admin/LeadPipeline";
import ThisWeek from "@/components/command-center/admin/ThisWeek";
import { PageHeader } from "@/components/ui";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function Eyebrow({ children, count, alert }: { children: React.ReactNode; count?: number; alert?: boolean }) {
  return (
    // Same size and tracking as the shared SectionLabel, kept as its own
    // component only because it carries a count badge. It used to run at
    // 0.08em tracking and extrabold against the shared 0.12em semibold, which
    // read as sloppiness rather than as a distinction. mt-[34px] was a magic
    // number; mt-8 is on the spacing scale.
    <div className="flex items-center gap-2 text-[length:var(--t-eyebrow)] font-semibold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)] mb-3 mt-8 first:mt-0">
      {children}
      {count != null && (
        <span className={`rounded-full px-2 py-px text-[length:var(--t-eyebrow)] tracking-normal ${alert ? "bg-[var(--danger-soft)] text-[color:var(--danger)]" : "bg-[var(--surface-deep)] text-[color:var(--text-muted)]"}`}>{count}</span>
      )}
    </div>
  );
}

export default function AdminDashboardView({ data, toggle }: { data: AdminDashboard; toggle: React.ReactNode }) {
  const v = data.vitals;
  const isEmptyBusiness =
    v.revenue.thisMonthCents === 0 && v.members.active === 0 &&
    v.sessions.thisMonth === 0 && data.attention.length === 0 &&
    data.leadPipeline.new + data.leadPipeline.contacted + data.leadPipeline.qualified + data.leadPipeline.booked + data.leadPipeline.won === 0;

  return (
    // No inner max-width. This dashboard is 4-column tile grids, so it should
    // fill the max-w-6xl frame; the old max-w-5xl had no mx-auto either, so it
    // sat left with a dead gutter, the same defect coach mode had.
    <div>
      <div className="mb-2">
        <PageHeader
          title="Your business."
          meta={`${data.monthLabel} · updated moments ago`}
          actions={toggle}
        />
      </div>

      {isEmptyBusiness ? (
        <div className="mt-6 rounded-[var(--r-lg)] border-l-[3px] border-[var(--brand)] bg-[var(--surface-elevated)] shadow-[var(--shadow-sm)] p-5 text-[length:var(--t-body)] text-[color:var(--text-muted)]">
          Your business dashboard fills in as you add clients, log sessions, and make sales. Nothing to show yet.
        </div>
      ) : (
        <>
          <Eyebrow>Vital signs</Eyebrow>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <VitalTile label="Revenue this month" value={usd(v.revenue.thisMonthCents)}
              delta={v.revenue.pctChange != null ? { text: `${Math.abs(v.revenue.pctChange)}%`, dir: v.revenue.trend } : undefined}
              context={v.revenue.lastMonthCents > 0 ? `vs ${usd(v.revenue.lastMonthCents)} last month` : "first month with revenue"}
              sparkline={v.revenue.sparkline} />
            <VitalTile label="Active members" value={`${v.members.active}`}
              delta={v.members.newThisMonth > 0 ? { text: `+${v.members.newThisMonth}`, dir: "up" } : undefined}
              context={`${v.members.newThisMonth} new this month · ${v.members.offeringCount} offering${v.members.offeringCount === 1 ? "" : "s"}`} />
            <VitalTile label="Sessions this month" value={`${v.sessions.thisMonth}`}
              context={`${v.sessions.upcomingThisWeek} coming up this week`} />
            <VitalTile label="Voice trust" value={v.trust.rate != null ? `${v.trust.rate}%` : "—"}
              context={v.trust.rate != null ? "how often you ship as-is" : "build your voice to unlock"}
              ringPct={v.trust.rate ?? undefined} />
          </div>

          <Eyebrow count={data.attention.length} alert={data.attention.length > 0}>Needs attention</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-3">
            <ThingsToHandle items={data.attention} />
            <ContentPipeline content={data.content} />
          </div>

          <Eyebrow>Where the money is</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-3">
              <RevenueByOffering offerings={data.revenueByOffering} />
              <ThisWeek events={data.thisWeek} />
            </div>
            <LeadPipeline pipeline={data.leadPipeline} />
          </div>
        </>
      )}
    </div>
  );
}
