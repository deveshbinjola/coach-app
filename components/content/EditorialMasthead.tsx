"use client";

// EditorialMasthead — magazine-cover header for /content.
//
// One dominant moment. A masthead stamped like an issue cover: ultra-thin
// "ELEVATE / The Signal Desk" wordmark, a dateline, a heavyweight display
// headline that uses weight contrast on the platform font, three signal
// stamps lined up like a publication's stats strip. A hairline rule draws
// across on page load.
//
// Uses platform font (Plus Jakarta Sans) — the look is composition + weight
// contrast + hairlines, not a font swap.

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
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
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
      className="em relative overflow-hidden rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] px-5 py-7 sm:px-10 sm:py-12"
    >
      {/* Top strip — wordmark / issue / dateline */}
      <div className="em-strip flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-faint)]">
        <span className="em-wordmark inline-flex items-baseline gap-2">
          <span className="font-extrabold text-[color:var(--text)]">Elevate</span>
          <span className="opacity-50">·</span>
          <span className="font-light">The Signal Desk</span>
        </span>
        <span className="em-issue inline-flex items-center gap-3">
          <span>Issue {issue}</span>
          <span className="em-dot" aria-hidden />
          <span>{dateline}</span>
        </span>
      </div>

      {/* Hairline rule that draws in */}
      <div className="em-rule mt-3" aria-hidden />

      {/* Headline block — weight contrast on the platform font */}
      <div className="em-headline mt-7 sm:mt-9 max-w-4xl">
        <p className="em-eyebrow text-[10px] font-bold uppercase tracking-[0.22em] text-[color:var(--brand-strong)]">
          The brief
        </p>
        <h1 className="em-display mt-3 break-words text-[clamp(2.2rem,5.4vw,4.4rem)] leading-[0.96] tracking-[-0.02em] text-[color:var(--text)]">
          <span className="font-extralight italic">What your market</span>
          <br />
          <span className="font-black">said today, published.</span>
        </h1>
        <p className="em-lede mt-5 max-w-2xl text-[length:var(--t-body)] leading-[1.55] text-[color:var(--text-muted)]">
          <span className="em-dropcap">D</span>raft from your imported voice, live lead objections, and the
          patterns already showing up in your pipeline. One piece. One person.
          One signal.
        </p>
      </div>

      {/* Stamp strip — three signal tiles like a publication's stats */}
      <div className="em-stamps mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--border)]">
        {tiles.map((t, i) => (
          <div
            key={t.label}
            className="em-stamp flex flex-col gap-1 bg-[var(--surface)] px-4 py-4 sm:px-5"
            style={{ animationDelay: `${380 + i * 90}ms` }}
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--text-faint)]">
              No. {String(i + 1).padStart(2, "0")} · {t.label}
            </span>
            <span className="mt-1 text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)]">
              {t.value}
            </span>
            <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              {t.detail}
            </span>
          </div>
        ))}
      </div>

      {/* Scoped styles — animation + drop cap */}
      <style>{`
        .em-rule {
          height: 1px;
          background: linear-gradient(
            to right,
            transparent,
            color-mix(in srgb, var(--text) 30%, transparent) 4%,
            color-mix(in srgb, var(--text) 30%, transparent) 96%,
            transparent
          );
          transform-origin: left;
          animation: em-rule-in 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        .em-strip { animation: em-fade-up 600ms cubic-bezier(0.2,0.7,0.2,1) both; animation-delay: 60ms; }
        .em-headline { animation: em-fade-up 700ms cubic-bezier(0.2,0.7,0.2,1) both; animation-delay: 180ms; }
        .em-display { animation: em-fade-up 800ms cubic-bezier(0.2,0.7,0.2,1) both; animation-delay: 240ms; }
        .em-lede { animation: em-fade-up 700ms cubic-bezier(0.2,0.7,0.2,1) both; animation-delay: 340ms; }
        .em-stamp { animation: em-fade-up 600ms cubic-bezier(0.2,0.7,0.2,1) both; }

        .em-dropcap {
          float: left;
          font-family: inherit;
          font-weight: 900;
          font-size: 3.2em;
          line-height: 0.86;
          padding: 0.12em 0.12em 0 0;
          margin-right: 0.06em;
          color: var(--text);
          font-style: normal;
        }

        .em-dot {
          display: inline-block;
          width: 5px; height: 5px; border-radius: 50%;
          background: var(--brand-strong);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 20%, transparent);
        }

        @keyframes em-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes em-rule-in {
          from { transform: scaleX(0); opacity: 0; }
          to { transform: scaleX(1); opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .em-strip, .em-headline, .em-display, .em-lede, .em-stamp, .em-rule { animation: none; }
        }
      `}</style>
    </section>
  );
}
