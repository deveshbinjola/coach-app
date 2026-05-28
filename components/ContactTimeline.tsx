// components/ContactTimeline.tsx
"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui";
import type { TimelineEvent, TimelineEventKind, DayGroup } from "@/lib/timeline";
import { groupByDay } from "@/lib/timeline";

// ── Filter types ──────────────────────────────────────────────────────

type FilterKey = "all" | "messages" | "sessions" | "payments" | "brand_os";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "messages", label: "Messages" },
  { key: "sessions", label: "Sessions" },
  { key: "payments", label: "Payments" },
  { key: "brand_os", label: "Brand OS" },
];

const FILTER_KINDS: Record<FilterKey, TimelineEventKind[] | null> = {
  all: null,
  messages: ["message_outbound", "message_inbound"],
  sessions: ["session"],
  payments: ["payment"],
  brand_os: ["brand_os", "quiz"],
};

// Structural events always show (lead_created, status_change)
const STRUCTURAL: TimelineEventKind[] = ["lead_created", "status_change"];

// ── Main component ────────────────────────────────────────────────────

export default function ContactTimeline({ events }: { events: TimelineEvent[] }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
    const kinds = FILTER_KINDS[filter];
    if (!kinds) return events;
    return events.filter(
      (e) => kinds.includes(e.kind) || STRUCTURAL.includes(e.kind),
    );
  }, [events, filter]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  if (events.length === 0) {
    return (
      <div className="py-12 text-center text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
        No activity yet. Events will appear here as you interact with this lead.
      </div>
    );
  }

  return (
    <div>
      {/* Filter chips */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={[
              "px-3 py-1 rounded-full text-[11px] font-bold transition-colors",
              filter === f.key
                ? "bg-[var(--brand-soft)] text-[color:var(--brand)] border border-[color-mix(in_srgb,var(--brand)_30%,transparent)]"
                : "border border-[var(--border-faint)] text-[color:var(--text-muted)] hover:border-[var(--border)]",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Day groups */}
      {groups.map((group) => (
        <div key={group.date} className="mb-5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--text-faint)] pb-1.5 mb-3 border-b border-[var(--border-faint)]">
            {group.label}
          </div>
          <div className="space-y-2">
            {group.events.map((ev) => (
              <EventCard key={ev.id} event={ev} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Event card renderer ───────────────────────────────────────────────

const ICONS: Record<TimelineEventKind, string> = {
  session: "🧠",
  payment: "💳",
  brand_os: "📊",
  quiz: "📝",
  message_outbound: "↑",
  message_inbound: "↓",
  status_change: "⟳",
  lead_created: "+",
};

const ACCENT_BORDER: Record<TimelineEvent["accent"], string> = {
  green: "border-l-[3px] border-l-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_4%,var(--surface-elevated))]",
  indigo: "border-l-[3px] border-l-[#6366f1] bg-[color-mix(in_srgb,#6366f1_4%,var(--surface-elevated))]",
  amber: "border-l-[3px] border-l-[#fbbf24] bg-[color-mix(in_srgb,#fbbf24_4%,var(--surface-elevated))]",
  blue: "border-l-[3px] border-l-[var(--info)] bg-[color-mix(in_srgb,var(--info)_4%,var(--surface-elevated))]",
  none: "bg-[var(--surface-deep)]",
};

const ICON_BG: Record<TimelineEvent["accent"], string> = {
  green: "bg-[color-mix(in_srgb,var(--brand)_10%,var(--surface-elevated))] text-[color:var(--brand)]",
  indigo: "bg-[color-mix(in_srgb,#6366f1_10%,var(--surface-elevated))] text-[#6366f1]",
  amber: "bg-[color-mix(in_srgb,#fbbf24_10%,var(--surface-elevated))] text-[#fbbf24]",
  blue: "bg-[color-mix(in_srgb,var(--info)_10%,var(--surface-elevated))] text-[color:var(--info)]",
  none: "bg-[var(--surface-deep)] text-[color:var(--text-faint)]",
};

function EventCard({ event }: { event: TimelineEvent }) {
  const isMinimal = event.kind === "status_change" || event.kind === "lead_created";
  const icon = ICONS[event.kind];
  const time = formatTime(event.timestamp);

  if (isMinimal) {
    return (
      <div className="flex gap-3 items-center px-3 py-1.5">
        <div className="w-7 h-7 rounded-md bg-[var(--surface-deep)] flex items-center justify-center text-[13px] text-[color:var(--text-faint)] shrink-0">
          {icon}
        </div>
        <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] flex-1">
          {event.title}
          {event.subtitle && (
            <span className="text-[color:var(--text-faint)]"> {event.subtitle}</span>
          )}
        </div>
        <div className="text-[11px] text-[color:var(--text-faint)] whitespace-nowrap">{time}</div>
      </div>
    );
  }

  const accent = event.accent;

  return (
    <div className={`flex gap-3 items-start p-3 rounded-[var(--r-md)] ${ACCENT_BORDER[accent]}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[15px] shrink-0 ${ICON_BG[accent]}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline gap-2">
          <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
            {event.title}
          </div>
          <div className="text-[11px] text-[color:var(--text-faint)] whitespace-nowrap">{time}</div>
        </div>
        {event.subtitle && (
          <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-relaxed">
            {event.subtitle}
          </div>
        )}
        {/* Session-specific badges */}
        {event.kind === "session" && event.metadata && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {(event.metadata.commitments_count as number) > 0 && (
              <Badge tone="brand" size="xs">
                {event.metadata.commitments_count as number} commitment{(event.metadata.commitments_count as number) !== 1 ? "s" : ""}
              </Badge>
            )}
            {(event.metadata.somatic_count as number) > 0 && (
              <Badge tone="info" size="xs">
                {event.metadata.somatic_count as number} somatic note{(event.metadata.somatic_count as number) !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        )}
        {/* Quiz answer grid */}
        {event.kind === "quiz" && event.metadata && (
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {Object.entries(event.metadata)
              .filter(([k]) => typeof event.metadata![k] === "string" || typeof event.metadata![k] === "number")
              .slice(0, 4)
              .map(([key, val]) => (
                <div
                  key={key}
                  className="text-[11px] px-2 py-1 rounded bg-[var(--surface-deep)]"
                >
                  <span className="text-[color:var(--text-faint)]">
                    {key.replace(/_/g, " ")}:
                  </span>{" "}
                  <span className="text-[color:var(--text)]">{String(val)}</span>
                </div>
              ))}
          </div>
        )}
        {/* Brand OS progress dots */}
        {event.kind === "brand_os" && event.metadata && (
          <div className="flex gap-1 mt-2">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`w-4 h-1 rounded-full ${
                  step <= (event.metadata!.step as number)
                    ? "bg-[#6366f1]"
                    : "bg-[var(--border-faint)]"
                }`}
              />
            ))}
          </div>
        )}
        {event.linkTo && (
          <a
            href={event.linkTo}
            className="text-[11px] font-bold mt-2 inline-block transition-colors"
            style={{ color: accent === "indigo" ? "#6366f1" : accent === "amber" ? "#fbbf24" : "var(--brand)" }}
          >
            → View details
          </a>
        )}
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
