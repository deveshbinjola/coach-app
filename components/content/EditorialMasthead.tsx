"use client";

// EditorialMasthead — compact inline bar for /content.
//
// Single-row bar: wordmark + dateline on the left, three signal chips on the
// right. ~60px total instead of the old 400px magazine-cover hero. Gets the
// coach straight to the drafting surface.

type Tile = {
  label: string;
  value: string;
  detail: string;
};

type Props = {
  /** ISO date for the dateline. Defaults to today on the client. */
  date?: string;
  /** Issue number — defaults to a stable week-of-year stamp. */
  issueNumber?: string | number;
  /** Three signal stamps (voice / imported / market). */
  tiles: [Tile, Tile, Tile];
};

const fmtDate = (d: Date) =>
  d
    .toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();

const weekNumber = (d: Date) => {
  const start = new Date(d.getFullYear(), 0, 1);
  const days = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
  return String(Math.ceil((days + start.getDay() + 1) / 7)).padStart(2, "0");
};

export default function EditorialMasthead({ date, issueNumber, tiles }: Props) {
  const d = date ? new Date(date) : new Date();
  const dateline = fmtDate(d);
  const issue = issueNumber ?? `${d.getFullYear()}.W${weekNumber(d)}`;

  return (
    <section
      aria-label="Content desk masthead"
      className="em relative overflow-hidden rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 sm:px-5 sm:py-3.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        {/* Left — wordmark + dateline */}
        <div className="flex items-center gap-3 text-[length:var(--t-eyebrow)] uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)]">
          <span className="inline-flex items-baseline gap-1.5">
            <span className="font-extrabold text-[color:var(--text)]">Elevate</span>
            <span className="opacity-40">·</span>
            <span className="font-light">Signal Desk</span>
          </span>
          <span className="hidden sm:inline opacity-30">|</span>
          <span className="hidden sm:inline">W{weekNumber(d)} · {dateline}</span>
        </div>

        {/* Right — signal chips */}
        <div className="flex items-center gap-2">
          {tiles.map((t) => (
            <div
              key={t.label}
              className="flex items-center gap-1.5 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5"
              title={`${t.label}: ${t.value} — ${t.detail}`}
            >
              <span className="text-[length:var(--t-eyebrow)] font-bold uppercase tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)] hidden sm:inline">
                {t.label}
              </span>
              <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                {t.value}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
