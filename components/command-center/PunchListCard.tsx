"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import type { PunchListItem } from "@/lib/build-punch-list";

type Props = {
  items: PunchListItem[];
  totalGenerated: number;
};

const TYPE_COLORS: Record<PunchListItem["type"], string> = {
  rescue: "#ff6b6b",
  "new-lead": "#74c0fc",
  content: "#ffd43b",
  reach: "#69db7c",
  activation: "#b197fc",
};

function todayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `punch-dismissed-${yyyy}-${mm}-${dd}`;
}

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(todayKey());
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed as string[]);
  } catch {
    // ignore
  }
  return new Set();
}

function saveDismissed(ids: Set<string>): void {
  try {
    localStorage.setItem(todayKey(), JSON.stringify(Array.from(ids)));
  } catch {
    // ignore
  }
}

export default function PunchListCard({ items, totalGenerated }: Props) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setDismissed(loadDismissed());
    setMounted(true);
  }, []);

  const visible = mounted ? items.filter((i) => !dismissed.has(i.id)) : items;
  const doneCount = totalGenerated - visible.length;
  const remaining = visible.length;

  const fillPct =
    totalGenerated > 0
      ? Math.min(100, Math.round((doneCount / totalGenerated) * 100))
      : 0;

  function dismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    saveDismissed(next);
  }

  return (
    <Card variant="elevated" padding="none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--border-faint)]">
        <span
          className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider"
          style={{ color: "var(--brand)" }}
        >
          Today's Actions
        </span>
        <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          {doneCount} done · {remaining} left
        </span>
      </div>

      {/* Items */}
      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-[color:var(--text-muted)]">
          <span className="text-2xl">✓</span>
          <span className="text-[length:var(--t-caption)]">All caught up today</span>
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-faint)]">
          {visible.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--surface-deep)] transition-colors"
              onClick={() => router.push(item.href)}
            >
              {/* Color dot */}
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: TYPE_COLORS[item.type] }}
              />

              {/* Label */}
              <span className="flex-1 min-w-0 truncate text-[length:var(--t-caption)] text-[color:var(--text)]">
                {item.label}
              </span>

              {/* Dismiss */}
              <button
                type="button"
                className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-[color:var(--text-faint)] hover:bg-[var(--border-faint)] hover:text-[color:var(--text-muted)] transition-colors text-xs leading-none"
                onClick={(e) => dismiss(e, item.id)}
                aria-label="Dismiss"
              >
                ✕
              </button>

              {/* Chevron */}
              <span className="shrink-0 text-[color:var(--text-faint)] text-sm leading-none select-none" aria-hidden="true">
                ›
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Progress bar */}
      <div className="px-4 pb-4 pt-3">
        <div className="h-1 w-full rounded-full bg-[var(--border-faint)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${fillPct}%`,
              backgroundColor: "var(--brand)",
            }}
          />
        </div>
      </div>
    </Card>
  );
}
