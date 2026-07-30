type Summary = {
  activeCount: number;
  clientValueCents: number;
  pipelineValueCents: number;
  bookedValueCents: number;
};

type Props = {
  summary: Summary;
  rescueCount: number;
  draftCount: number;
  reachCount: number;
  reachTarget: number;
  voiceTrustPct: number | null;
  now: number;
  bookedCount: number;
};

export default function CommandHero({
  summary,
  rescueCount,
  draftCount,
  reachCount,
  reachTarget,
  voiceTrustPct,
  now,
  bookedCount,
}: Props) {
  const hasMoney =
    summary.clientValueCents > 0 ||
    summary.pipelineValueCents > 0 ||
    summary.bookedValueCents > 0;
  const primaryValue = hasMoney
    ? formatMoney(summary.pipelineValueCents)
    : String(summary.activeCount);
  const primaryLabel = hasMoney ? "open pipeline" : "active leads";
  const headline =
    rescueCount > 0
      ? `Rescue ${rescueCount} conversation${rescueCount === 1 ? "" : "s"} first.`
      : draftCount > 0
        ? `Review ${draftCount} fresh draft${draftCount === 1 ? "" : "s"}.`
        : "The room is clean.";
  const subline =
    rescueCount > 0
      ? "The app found the conversations most likely to slip. Start there, then move through the rest."
      : draftCount > 0
        ? "New leads already have draft responses waiting. Review them while the signal is warm."
        : "Nothing urgent is leaking right now. Capture new leads, send reach, or sharpen voice.";
  const bookedGoal = 2;
  const bookedProgress = Math.min(100, Math.round((bookedCount / bookedGoal) * 100));
  const focusLabel =
    rescueCount > 0
      ? "Rescue warm conversations"
      : bookedCount < bookedGoal
        ? "Book 2 calls this week"
        : "Keep the board clean";
  const focusHref = rescueCount > 0 ? "/inbox?compose=open&source=rescue" : "/inbox";
  const sessionMinutes =
    rescueCount > 0 ? Math.min(24, Math.max(8, rescueCount * 4)) : draftCount > 0 ? 10 : 12;
  const sessionLabel =
    rescueCount > 0 ? "Lead Rescue" : draftCount > 0 ? "Draft Review" : "Clean Board";
  const sessionSubline =
    rescueCount > 0
      ? `${sessionMinutes} min session · ${rescueCount} priority lead${rescueCount === 1 ? "" : "s"}`
      : draftCount > 0
        ? `${sessionMinutes} min session · approve what is ready`
        : `${sessionMinutes} min session · capture, reach, or sharpen voice`;

  return (
    <section className="space-y-3">
      {/* Status bar */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--shadow-xs)]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-faint)] bg-white/70 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)]">
            Coach OS
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
            Live
          </div>
          <h1 className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
            {headline}
          </h1>
          <div className="flex items-center gap-4 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            <span><b className="text-[color:var(--text)]">{primaryValue}</b> {primaryLabel}</span>
            <span><b className="text-[color:var(--text)]">{draftCount}</b> drafts</span>
            <span><b className="text-[color:var(--text)]">{reachCount}/{reachTarget}</b> reach</span>
          </div>
          <div className="ml-auto hidden lg:flex items-center gap-2 text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
            <span>{formatTimeLeft(now)}</span>
            {voiceTrustPct !== null && <span>· {voiceTrustPct}% voice</span>}
          </div>
        </div>
      </div>

      {/* Session cards + focus CTA */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          <SessionCard
            label="Rescue leads"
            detail={rescueCount > 0 ? `${rescueCount} waiting` : "Board clean"}
            href={focusHref}
            active={rescueCount > 0}
          />
          <SessionCard
            label="Draft replies"
            detail={draftCount > 0 ? `${draftCount} ready` : "Open composer"}
            href="/inbox?compose=open"
            active={rescueCount === 0 && draftCount > 0}
          />
          <SessionCard
            label="Sharpen voice"
            detail={voiceTrustPct === null ? "Learning" : `${voiceTrustPct}% trust`}
            href="/voice"
            active={rescueCount === 0 && draftCount === 0 && voiceTrustPct !== null && voiceTrustPct < 80}
          />
          <SessionCard
            label="Capture leads"
            detail={`${primaryValue} ${primaryLabel}`}
            href="/leads/capture"
            active={rescueCount === 0 && draftCount === 0 && summary.activeCount === 0}
          />
        </div>
        <a
          href={focusHref}
          className="flex items-center justify-between gap-3 rounded-[var(--r-lg)] bg-[var(--navy)] px-4 py-3 text-[color:var(--text-inverse)] shadow-[var(--shadow-md)] transition hover:-translate-y-px hover:shadow-[var(--shadow-lg)]"
        >
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand-bright)]">
              {sessionLabel}
            </div>
            <div className="mt-0.5 text-[length:var(--t-caption)] font-extrabold">
              {focusLabel}
            </div>
            <div className="mt-0.5 text-[length:var(--t-caption)] text-white/50">
              {sessionMinutes} min · {rescueCount > 0 ? `${rescueCount} leads` : bookedCount < bookedGoal ? `${bookedCount}/${bookedGoal} calls` : "board clean"}
            </div>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[color:var(--text-inverse)] font-bold">
            &rarr;
          </span>
        </a>
      </div>
    </section>
  );
}

function SessionCard({
  label,
  detail,
  href,
  active,
}: {
  label: string;
  detail: string;
  href: string;
  active: boolean;
}) {
  return (
    <a
      href={href}
      className={`group rounded-[var(--r-md)] border p-3 transition hover:-translate-y-px hover:shadow-[var(--shadow-sm)] ${
        active
          ? "border-[color-mix(in_srgb,var(--brand)_40%,var(--border))] bg-[var(--navy)] text-[color:var(--text-inverse)]"
          : "border-[var(--border-faint)] bg-white/70 text-[color:var(--text)] hover:border-[var(--border-strong)]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[length:var(--t-caption)] font-extrabold">
          {label}
        </div>
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[length:var(--t-caption)] transition ${
            active
              ? "bg-[var(--brand)] text-[color:var(--text-inverse)]"
              : "bg-[var(--surface-deep)] text-[color:var(--text-muted)] group-hover:bg-[var(--brand)] group-hover:text-[color:var(--text-inverse)]"
          }`}
        >
          &rarr;
        </span>
      </div>
      <div
        className={`mt-1 text-[length:var(--t-caption)] ${
          active ? "text-white/55" : "text-[color:var(--text-muted)]"
        }`}
      >
        {detail}
      </div>
    </a>
  );
}

function formatMoney(cents: number): string {
  if (cents === 0) return "$0";
  const dollars = cents / 100;
  const rounded = Math.round(dollars);
  if (Math.abs(dollars - rounded) < 0.005) {
    return "$" + rounded.toLocaleString();
  }
  return "$" + dollars.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTimeLeft(now: number): string {
  const current = new Date(now);
  const end = new Date(current);
  const day = current.getDay();
  const daysUntilSunday = (7 - day) % 7;
  end.setDate(current.getDate() + daysUntilSunday);
  end.setHours(23, 59, 59, 999);
  const hours = Math.max(0, Math.round((end.getTime() - now) / 3_600_000));
  if (hours < 24) return `${hours}h left`;
  return `${Math.ceil(hours / 24)}d left`;
}
