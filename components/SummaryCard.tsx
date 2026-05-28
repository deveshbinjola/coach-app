// components/SummaryCard.tsx
"use client";

import type { ContactSummary } from "@/lib/timeline";

export default function SummaryCard({ summary }: { summary: ContactSummary }) {
  const dollars = summary.totalPaidCents > 0
    ? `$${(summary.totalPaidCents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
    : "$0";

  const brandLabel =
    summary.brandOsStatus === "complete"
      ? "Complete ✓"
      : summary.brandOsStatus === "in_progress"
        ? `Step ${summary.brandOsStep}/4`
        : "Not started";

  const brandColor =
    summary.brandOsStatus === "complete"
      ? "var(--brand)"
      : summary.brandOsStatus === "in_progress"
        ? "var(--info)"
        : "var(--text-faint)";

  return (
    <div className="rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_4%,var(--surface-elevated))] p-3 mb-3">
      <div className="text-[length:var(--t-caption)] leading-relaxed">
        <span className="font-bold text-[color:var(--brand)]">{summary.totalSessions}</span>
        <span className="text-[color:var(--text-muted)]"> sessions · </span>
        <span className="font-bold text-[color:var(--brand)]">{dollars}</span>
        <span className="text-[color:var(--text-muted)]"> paid</span>
      </div>
      <div className="text-[length:var(--t-caption)] mt-1">
        <span className="text-[color:var(--text-muted)]">Brand OS: </span>
        <span style={{ color: brandColor }} className="font-bold">{brandLabel}</span>
      </div>
      {summary.clientSince && (
        <div className="text-[10px] text-[color:var(--text-faint)] mt-1">
          Client since {new Date(summary.clientSince).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </div>
      )}
      {summary.nextSessionDate && (
        <div className="text-[10px] text-[color:var(--text-faint)] mt-0.5">
          Next: {new Date(summary.nextSessionDate).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </div>
      )}
    </div>
  );
}
