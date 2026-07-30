// components/command-center/RightNowList.tsx
"use client";

import type { RightNowItem, BusinessPulse } from "@/lib/ambient";
import PersonName from "@/components/ambient/PersonName";
import { Card } from "@/components/ui";

type Props = {
  heroItem: RightNowItem | null;
  quietList: RightNowItem[];
  daySummary: BusinessPulse["daySummary"];
};

export default function RightNowList({ heroItem, quietList, daySummary }: Props) {
  if (!heroItem) {
    return (
      <section aria-label="Right now">
        <Card variant="elevated" padding="md">
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-soft)]">
              <span className="h-2 w-2 rounded-full bg-[var(--brand)]" />
            </span>
            <p className="text-[length:var(--t-body)] font-semibold text-[color:var(--text)]">
              You&apos;re all clear.
            </p>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] max-w-xs">
              Nothing needs you right now. When a lead, message, or session needs attention, it&apos;ll show up here.
            </p>
          </div>
        </Card>
      </section>
    );
  }

  return (
    <section aria-label="Right now" className="space-y-3">
      {/* Hero item */}
      <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border-l-[3px] border-l-[var(--brand)] shadow-[var(--shadow-sm)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              {heroItem.leadId && heroItem.leadName ? (
                <PersonName leadId={heroItem.leadId} name={heroItem.leadName} />
              ) : (
                <span className="font-bold text-[length:var(--t-body)] text-[color:var(--text)]">
                  {heroItem.leadName ?? heroItem.reason}
                </span>
              )}
              <span className="text-[length:var(--t-body)] text-[color:var(--text)]">
                {heroItem.leadName ? `· ${heroItem.reason}` : ""}
              </span>
            </div>
            {heroItem.context && (
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">
                {heroItem.context}
              </p>
            )}
          </div>
          <ActionButton action={heroItem.action} />
        </div>
      </div>

      {/* Quiet list — a grouped object, not floating lines. Hairline
          separators + an anchor dot per row give the eye something to
          land on, and the readable body-size text fixes the "I can't
          see anything" problem. */}
      {quietList.length > 0 && (
        <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] divide-y divide-[var(--border-faint)] overflow-hidden">
          {quietList.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface-deep)] transition"
            >
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--border-strong)]" aria-hidden />
                <div className="flex items-baseline gap-1.5 min-w-0 flex-1 text-[length:var(--t-body)]">
                  {item.leadId && item.leadName ? (
                    <>
                      <PersonName leadId={item.leadId} name={item.leadName} />
                      <span className="text-[color:var(--text-muted)] truncate">
                        — {item.reason}
                      </span>
                    </>
                  ) : (
                    <span className="text-[color:var(--text)] truncate">{item.reason}</span>
                  )}
                </div>
              </div>
              <ActionLink action={item.action} />
            </div>
          ))}
        </div>
      )}

      {/* Day summary */}
      {(daySummary.sessions > 0 || daySummary.draftsReady > 0 || daySummary.leadsWaiting > 0) && (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] px-1.5">
          <span className="font-semibold text-[color:var(--text-faint)]">Today &middot; </span>
          {[
            daySummary.sessions > 0 && `${daySummary.sessions} session${daySummary.sessions === 1 ? "" : "s"}`,
            daySummary.draftsReady > 0 && `${daySummary.draftsReady} draft${daySummary.draftsReady === 1 ? "" : "s"} ready`,
            daySummary.leadsWaiting > 0 && `${daySummary.leadsWaiting} lead${daySummary.leadsWaiting === 1 ? "" : "s"} waiting`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </section>
  );
}

function ActionButton({ action }: { action: RightNowItem["action"] }) {
  if (action.href) {
    return (
      <a
        href={action.href}
        className="shrink-0 inline-flex items-center justify-center h-9 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
      >
        {action.label}
      </a>
    );
  }
  return (
    <span className="shrink-0 text-[length:var(--t-caption)] font-bold text-[color:var(--brand)]">
      {action.label}
    </span>
  );
}

function ActionLink({ action }: { action: RightNowItem["action"] }) {
  if (action.href) {
    return (
      <a
        href={action.href}
        className="shrink-0 text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] transition whitespace-nowrap"
      >
        {action.label} →
      </a>
    );
  }
  return null;
}
