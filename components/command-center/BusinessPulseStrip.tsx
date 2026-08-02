// components/command-center/BusinessPulseStrip.tsx
"use client";

import type { BusinessPulse } from "@/lib/ambient";

type Props = {
  metrics: BusinessPulse["metrics"];
};

export default function BusinessPulseStrip({ metrics }: Props) {
  // Each metric is a stat tile: a value to land on + a label beneath it.
  // Splitting value from label (instead of "12 members" in one string) is
  // what makes the strip scannable at a glance.
  const items: Array<{ label: string; value: string; trend?: "up" | "down"; warning: boolean } | null> = [
    metrics.revenue.amount > 0 || metrics.revenue.trend !== "flat"
      ? {
          label: "This month",
          value: `$${(metrics.revenue.amount / 100).toLocaleString()}`,
          trend: metrics.revenue.trend === "flat" ? undefined : metrics.revenue.trend,
          warning: metrics.revenue.trend === "down",
        }
      : null,
    metrics.activeMembers > 0
      ? {
          label: metrics.activeMembers === 1 ? "Active member" : "Active members",
          value: `${metrics.activeMembers}`,
          warning: false,
        }
      : null,
    // > 0, not >= 0. The old test was always true, so on a quiet month this
    // was the ONE tile that survived the filter — a zero, alone in a
    // four-column grid, and the only number anywhere on the coach's home
    // screen. A month with no sessions yet is not a stat worth leading with.
    metrics.sessionsThisMonth > 0
      ? {
          label: "Sessions this month",
          value: `${metrics.sessionsThisMonth}`,
          warning: false,
        }
      : null,
    metrics.trustRate !== null
      ? {
          label: "Voice trust",
          value: `${metrics.trustRate}%`,
          warning: metrics.trustRate < 60,
        }
      : null,
  ];

  const visible = items.filter((i): i is NonNullable<typeof i> => i !== null);
  if (visible.length === 0) return null;

  return (
    // flex-wrap, not a fixed 4-column grid. The grid left an orphan tile at
    // quarter width whenever fewer than four metrics were real. Tiles now
    // share whatever row they're on, so one, two or four all look deliberate.
    <div
      className="flex flex-wrap gap-2.5"
      aria-label="Business pulse"
    >
      {visible.map((item, i) => (
        <div
          key={i}
          className="flex-1 basis-[calc(50%-0.3125rem)] sm:basis-0 min-w-[9.5rem] rounded-[var(--r-md)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] px-4 py-3"
        >
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-[length:var(--t-h3)] font-bold tabular-nums leading-none text-[color:var(--text)]">
              {item.value}
            </span>
            {item.trend && (
              <span
                className={`text-[length:var(--t-caption)] font-bold leading-none ${
                  item.trend === "up" ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text-faint)]"
                }`}
                aria-label={item.trend === "up" ? "trending up" : "trending down"}
              >
                {item.trend === "up" ? "↑" : "↓"}
              </span>
            )}
          </div>
          <div
            className={`mt-2 text-[length:var(--t-caption)] ${
              item.warning ? "text-[color:var(--text-muted)] font-semibold" : "text-[color:var(--text-faint)]"
            }`}
          >
            {item.label}
          </div>
        </div>
      ))}
    </div>
  );
}
