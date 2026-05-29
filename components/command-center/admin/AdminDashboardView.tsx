// components/command-center/admin/AdminDashboardView.tsx
"use client";

import type { AdminDashboard } from "@/lib/admin-dashboard";
import VitalTile from "@/components/command-center/admin/VitalTile";
import ThingsToHandle from "@/components/command-center/admin/ThingsToHandle";
import ContentPipeline from "@/components/command-center/admin/ContentPipeline";
import RevenueByOffering from "@/components/command-center/admin/RevenueByOffering";
import LeadPipeline from "@/components/command-center/admin/LeadPipeline";
import ThisWeek from "@/components/command-center/admin/ThisWeek";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

function Eyebrow({ children, count, alert }: { children: React.ReactNode; count?: number; alert?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[color:var(--text-faint)] mb-3 mt-[34px] first:mt-0">
      {children}
      {count != null && (
        <span className={`rounded-full px-2 py-px text-[11px] tracking-normal ${alert ? "bg-[var(--danger-soft)] text-[color:var(--danger)]" : "bg-[var(--surface-deep)] text-[color:var(--text-muted)]"}`}>{count}</span>
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
    <div className="max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="font-display text-[34px] font-bold tracking-[-0.02em] leading-[1.1] text-[color:var(--text)]">Your business.</h1>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">{data.monthLabel} · updated moments ago</p>
        </div>
        {toggle}
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
