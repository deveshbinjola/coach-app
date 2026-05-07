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
    <section className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[linear-gradient(135deg,var(--surface-elevated)_0%,var(--surface-elevated)_62%,var(--brand-soft)_100%)] p-6 sm:p-8 overflow-hidden relative shadow-[var(--shadow-xs)]">
      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-7">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-faint)] bg-white/70 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)]">
            Coach OS
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
            Live
          </div>
          <h1 className="mt-4 text-3xl sm:text-5xl font-extrabold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            {headline}
          </h1>
          <p className="mt-3 text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)]">
            {subline}
          </p>
          <div className="mt-7">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
              Choose the next work session
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
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
          </div>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-2xl">
            <CommandMetric label={primaryLabel} value={primaryValue} />
            <CommandMetric label="drafts ready" value={String(draftCount)} />
            <CommandMetric label="reach this week" value={`${reachCount}/${reachTarget}`} />
          </div>
        </div>
        <div className="rounded-[var(--r-lg)] border border-white/10 bg-[var(--navy)] p-4 min-w-full sm:min-w-[390px] lg:min-w-[370px] text-[color:var(--text-inverse)] shadow-[var(--shadow-md)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand)]">
                Active session · {formatTimeLeft(now)}
              </div>
              <div className="mt-1 text-[length:var(--t-h3)] font-extrabold text-[color:var(--text-inverse)]">
                {sessionLabel}
              </div>
            </div>
            <div className="text-right text-[length:var(--t-caption)] text-white/55 font-bold">
              {sessionMinutes} min
            </div>
          </div>
          <p className="mt-3 text-[length:var(--t-caption)] font-bold text-white/65">
            {focusLabel}
          </p>
          <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--brand)]"
              style={{
                width: `${rescueCount > 0 ? Math.min(100, Math.max(12, 100 - rescueCount * 16)) : bookedProgress}%`,
              }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[length:var(--t-caption)] text-white/55">
            <span>
              {sessionSubline}
            </span>
            <span>{voiceTrustPct === null ? "Voice learning" : `${voiceTrustPct}% voice trust`}</span>
          </div>
          <a
            href={focusHref}
            className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-4 text-[length:var(--t-caption)] font-extrabold text-[color:var(--navy)] hover:bg-[var(--brand-strong)] transition"
          >
            Start focus
          </a>
        </div>
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
              ? "bg-[var(--brand)] text-[color:var(--navy)]"
              : "bg-[var(--surface-deep)] text-[color:var(--text-muted)] group-hover:bg-[var(--brand)] group-hover:text-[color:var(--navy)]"
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

function CommandMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-white/70 p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
        {label}
      </div>
      <div className="mt-1 text-xl font-extrabold tabular-nums text-[color:var(--text)] truncate">
        {value}
      </div>
    </div>
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
