// components/command-center/admin/ThingsToHandle.tsx
"use client";

import type { RightNowItem } from "@/lib/ambient";
import PersonName from "@/components/ambient/PersonName";

const ALERT_SOURCES = new Set(["overdue", "message", "sequence"]);

export default function ThingsToHandle({ items }: { items: RightNowItem[] }) {
  return (
    <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em] text-[color:var(--text)]">Things to handle</span>
        <span className={`text-[11px] font-bold rounded-full px-2.5 py-0.5 ${items.length > 0 ? "bg-[var(--danger-soft)] text-[color:var(--danger)]" : "bg-[var(--surface-deep)] text-[color:var(--text-muted)]"}`}>
          {items.length} open
        </span>
      </div>
      {items.length === 0 ? (
        <div className="flex items-center gap-2.5 px-[18px] py-4 border-t border-[var(--border-faint)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
          <span className="text-[length:var(--t-body)] text-[color:var(--text-muted)]">You&apos;re all clear — nothing needs you.</span>
        </div>
      ) : (
        items.map((item) => {
          const dot = item.source === "content" || item.source === "content_suggestion"
            ? "bg-[var(--brand)]"
            : ALERT_SOURCES.has(item.source) ? "bg-[var(--danger)]" : "bg-[var(--border-strong)]";
          return (
            <div key={item.id} className="flex items-center gap-3 px-[18px] py-[11px] border-t border-[var(--border-faint)]">
              <span className={`h-[7px] w-[7px] rounded-full shrink-0 ${dot}`} aria-hidden />
              <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                {item.leadId && item.leadName ? (
                  <>
                    <PersonName leadId={item.leadId} name={item.leadName} />
                    <span className="text-[color:var(--text-muted)] text-[length:var(--t-caption)] truncate">— {item.reason}</span>
                  </>
                ) : (
                  <span className="font-bold text-[length:var(--t-body)] text-[color:var(--text)] truncate">{item.reason}</span>
                )}
              </div>
              {item.action.href && (
                <a href={item.action.href} className="shrink-0 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text-muted)] hover:text-[color:var(--text)] whitespace-nowrap">
                  {item.action.label} →
                </a>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
