"use client";

// EditorialSectionHeader — numbered editorial break used as the h2 across
// the redesigned /content page. Replaces a bare "Draft room" h2 with:
//
//   ─────── No. 02 / Draft room ───────
//                The room where it happens
//
// Hairline rule + center-justified small-caps + italic display lede. The
// number is for editorial flavor — it's just a section index.

type Props = {
  number: string | number;
  /** Short kicker, e.g. "Draft room". Rendered in small caps. */
  kicker: string;
  /** Optional italic lede beneath the kicker. */
  lede?: string;
  /** Tone — accent vs neutral. Defaults to neutral. */
  tone?: "neutral" | "accent";
  /** Right-side slot for a badge or status pip. */
  right?: React.ReactNode;
  /** Stack id for anchor links. */
  id?: string;
};

export default function EditorialSectionHeader({
  number,
  kicker,
  lede,
  tone = "neutral",
  right,
  id,
}: Props) {
  const isAccent = tone === "accent";
  return (
    <header id={id} className="eh">
      <div className="eh-row">
        <span className="eh-rule" aria-hidden />
        <span
          className="eh-pill"
          style={{
            color: isAccent ? "var(--brand-strong)" : "var(--text-faint)",
            borderColor: isAccent
              ? "color-mix(in srgb, var(--brand) 40%, var(--border))"
              : "var(--border)",
          }}
        >
          <span className="eh-num">No. {String(number).padStart(2, "0")}</span>
          <span className="eh-slash" aria-hidden>/</span>
          <span className="eh-kicker">{kicker}</span>
        </span>
        <span className="eh-rule" aria-hidden />
        {right && <span className="eh-right">{right}</span>}
      </div>
      {lede && <p className="eh-lede">{lede}</p>}
      <style>{`
        .eh { margin-top: 4px; }
        .eh-row {
          display: flex; align-items: center; gap: 14px;
        }
        .eh-rule {
          flex: 1; height: 1px;
          background: linear-gradient(to right, transparent, color-mix(in srgb, var(--text) 20%, transparent), transparent);
        }
        .eh-row > .eh-rule:first-child {
          background: linear-gradient(to right, color-mix(in srgb, var(--text) 20%, transparent), transparent);
        }
        .eh-row > .eh-rule:last-of-type {
          background: linear-gradient(to left, color-mix(in srgb, var(--text) 20%, transparent), transparent);
        }
        .eh-pill {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 4px 10px;
          border: 1px solid var(--border);
          border-radius: 999px;
          background: var(--surface-elevated);
          font-size: 10.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 700;
          white-space: nowrap;
        }
        .eh-num { font-weight: 800; }
        .eh-slash { opacity: 0.4; font-weight: 300; }
        .eh-kicker { font-weight: 600; }
        .eh-right { margin-left: 4px; }
        .eh-lede {
          margin: 14px auto 0;
          max-width: 520px;
          text-align: center;
          font-style: italic;
          font-weight: 300;
          line-height: 1.5;
          font-size: clamp(15px, 1.6vw, 18px);
          color: var(--text-muted);
        }
      `}</style>
    </header>
  );
}
