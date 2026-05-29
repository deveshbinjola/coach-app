// components/command-center/BusinessPulseStrip.tsx
"use client";

import type { BusinessPulse } from "@/lib/ambient";

type Props = {
  metrics: BusinessPulse["metrics"];
};

export default function BusinessPulseStrip({ metrics }: Props) {
  const items: Array<{ label: string; value: string; warning: boolean } | null> = [
    metrics.revenue.amount > 0 || metrics.revenue.trend !== "flat"
      ? {
          label: "This Month",
          value: `$${(metrics.revenue.amount / 100).toLocaleString()}${
            metrics.revenue.trend === "up" ? " ↑" : metrics.revenue.trend === "down" ? " ↓" : ""
          }`,
          warning: metrics.revenue.trend === "down",
        }
      : null,
    metrics.activeMembers > 0
      ? {
          label: "",
          value: `${metrics.activeMembers} member${metrics.activeMembers === 1 ? "" : "s"}`,
          warning: false,
        }
      : null,
    metrics.sessionsThisMonth >= 0
      ? {
          label: "",
          value: metrics.sessionsThisMonth === 0
            ? "0 sessions"
            : `${metrics.sessionsThisMonth} session${metrics.sessionsThisMonth === 1 ? "" : "s"}`,
          warning: metrics.sessionsThisMonth === 0,
        }
      : null,
    metrics.trustRate !== null
      ? {
          label: "",
          value: `${metrics.trustRate}% trust`,
          warning: metrics.trustRate < 60,
        }
      : null,
  ];

  const visible = items.filter((i): i is NonNullable<typeof i> => i !== null);
  if (visible.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 flex-wrap rounded-[var(--r-md)] bg-[var(--surface-deep)] px-4 py-2.5"
      aria-label="Business pulse"
    >
      {visible.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && item.label === "" && (
            <span className="text-[color:var(--text-faint)]">·</span>
          )}
          {item.label && (
            <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] font-bold">
              {item.label}
            </span>
          )}
          <span
            className={`text-[length:var(--t-caption)] font-bold tabular-nums ${
              item.warning
                ? "text-[color:var(--warning)]"
                : "text-[color:var(--text)]"
            }`}
          >
            {item.value}
          </span>
        </span>
      ))}
    </div>
  );
}
