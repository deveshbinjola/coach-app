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
          <p className="text-center text-[length:var(--t-body)] text-[color:var(--text-muted)] py-4">
            Nothing needs you right now.
          </p>
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

      {/* Quiet list */}
      {quietList.length > 0 && (
        <div className="space-y-0.5">
          {quietList.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--r-md)] hover:bg-[var(--surface-elevated)] transition"
            >
              <div className="flex items-baseline gap-2 min-w-0 flex-1 text-[length:var(--t-caption)]">
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
              <ActionLink action={item.action} />
            </div>
          ))}
        </div>
      )}

      {/* Day summary */}
      {(daySummary.sessions > 0 || daySummary.draftsReady > 0 || daySummary.leadsWaiting > 0) && (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] px-3">
          Your day:{" "}
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
        className="shrink-0 inline-flex items-center justify-center h-9 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
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
