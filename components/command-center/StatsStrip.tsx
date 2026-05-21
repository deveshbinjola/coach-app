"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui";
import type { OfferingRevenueSummary } from "./RevenueCard";

type Props = {
  offerings: OfferingRevenueSummary[];
  reachCount: number;
  reachTarget: number;
  clientCount: number;
  pipelineValueCents: number;
};

function fmtUSD(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  return "$" + Math.round(dollars).toLocaleString();
}

export default function StatsStrip({
  offerings,
  reachCount,
  reachTarget,
  clientCount,
  pipelineValueCents,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const priced = offerings.filter((o) => o.price_cents != null && o.price_cents > 0);
  const enrolledRevenue = priced.reduce(
    (sum, o) => sum + (o.enrolled * o.price_cents!) / 100,
    0
  );
  const hasRevenue = enrolledRevenue > 0 || pipelineValueCents > 0;
  const reachHit = reachCount >= reachTarget;

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full rounded-[var(--r-lg)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] px-4 py-3 hover:border-[var(--border)] transition"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-5 text-[length:var(--t-caption)]">
            {hasRevenue && (
              <span>
                <b className="font-extrabold text-[color:var(--text)]">
                  {enrolledRevenue > 0 ? `$${Math.round(enrolledRevenue).toLocaleString()}` : fmtUSD(pipelineValueCents)}
                </b>
                <span className="text-[color:var(--text-muted)]">
                  {" "}{enrolledRevenue > 0 ? "enrolled" : "pipeline"}
                </span>
              </span>
            )}
            <span>
              <b className="font-extrabold text-[color:var(--text)]">{clientCount}</b>
              <span className="text-[color:var(--text-muted)]"> client{clientCount === 1 ? "" : "s"}</span>
            </span>
            <span>
              <b className={`font-extrabold ${reachHit ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text)]"}`}>
                {reachCount}/{reachTarget}
              </b>
              <span className="text-[color:var(--text-muted)]"> reach</span>
            </span>
          </div>
          <ChevronDown
            size={14}
            className={`text-[color:var(--text-faint)] transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Card padding="md">
            <div className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)] mb-2">
              Revenue
            </div>
            {priced.length === 0 ? (
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                Add offerings with pricing to track revenue.
              </p>
            ) : (
              <div className="space-y-1.5">
                {priced.map((o) => {
                  const rev = (o.enrolled * o.price_cents!) / 100;
                  return (
                    <div key={o.name} className="flex items-baseline justify-between gap-2">
                      <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] truncate">
                        {o.name}
                      </span>
                      <span className="font-mono text-[length:var(--t-caption)] font-bold text-[color:var(--text)] whitespace-nowrap">
                        {o.enrolled} × ${Math.round(o.price_cents! / 100).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <a
              href="/clients?tab=offerings"
              className="block mt-3 text-[length:var(--t-caption)] text-[color:var(--brand-strong)] font-bold hover:underline"
            >
              Manage offerings →
            </a>
          </Card>

          <Card padding="md">
            <div className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)] mb-2">
              Weekly reach
            </div>
            <p className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] tabular-nums">
              {reachCount}
              <span className="text-[length:var(--t-caption)] font-normal text-[color:var(--text-faint)]">
                {" "}/ {reachTarget}
              </span>
            </p>
            <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              {reachHit
                ? "Target hit. Keep going."
                : `${reachTarget - reachCount} more to hit ${reachTarget}.`}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
