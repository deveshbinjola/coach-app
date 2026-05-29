// components/command-center/admin/ThisWeek.tsx
"use client";

type WeekEvent = { id: string; title: string; startsAt: string; clientName: string | null; meetingUrl: string | null };

function dayTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function ThisWeek({ events }: { events: WeekEvent[] }) {
  return (
    <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center justify-between px-[18px] pt-4 pb-3">
        <span className="text-[14px] font-extrabold tracking-[-0.01em]">This week</span>
        <span className="text-[11px] font-bold text-[color:var(--text-muted)] bg-[var(--surface-deep)] rounded-full px-2.5 py-0.5">{events.length}</span>
      </div>
      {events.length === 0 ? (
        <div className="px-[18px] py-4 border-t border-[var(--border-faint)] text-[length:var(--t-caption)] text-[color:var(--text-faint)]">No sessions on the calendar this week.</div>
      ) : (
        events.map((e) => (
          <div key={e.id} className="flex items-center gap-3 px-[18px] py-[11px] border-t border-[var(--border-faint)]">
            <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] w-[78px] shrink-0 tabular-nums">{dayTime(e.startsAt)}</span>
            <span className="flex-1 min-w-0 truncate text-[length:var(--t-body)] font-semibold">{e.clientName ?? e.title}</span>
            <a href={e.meetingUrl ?? "/clients?tab=sessions"} className="shrink-0 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
              {e.meetingUrl ? "Join →" : "Prep →"}
            </a>
          </div>
        ))
      )}
    </div>
  );
}
