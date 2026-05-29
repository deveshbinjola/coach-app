// components/command-center/admin/VitalTile.tsx
"use client";

type Props = {
  label: string;
  value: string;
  delta?: { text: string; dir: "up" | "down" | "flat" };
  context: string;
  sparkline?: number[]; // raw values; rendered as a normalized polyline
  ringPct?: number;     // 0-100; renders a small progress ring
};

export default function VitalTile({ label, value, delta, context, sparkline, ringPct }: Props) {
  return (
    <div className="relative overflow-hidden rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] p-[18px]">
      <div className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-semibold">{label}</div>
      <div className="mt-2.5 flex items-baseline gap-2 font-display text-[30px] font-bold tracking-[-0.03em] leading-none">
        {value}
        {delta && (
          <span className={`text-[length:var(--t-caption)] font-bold ${delta.dir === "up" ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text-faint)]"}`}>
            {delta.dir === "up" ? "▲" : delta.dir === "down" ? "▼" : ""} {delta.text}
          </span>
        )}
      </div>
      <div className="mt-2.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">{context}</div>
      {sparkline && sparkline.length > 1 && <Sparkline values={sparkline} />}
      {ringPct != null && <Ring pct={ringPct} />}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const w = 64, h = 26;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg className="absolute right-3.5 bottom-3.5" width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none" aria-hidden>
      <polyline points={pts} stroke="var(--brand-strong)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Ring({ pct }: { pct: number }) {
  const r = 16, c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="absolute right-3.5 top-4" aria-hidden>
      <svg width="40" height="40" viewBox="0 0 40 40" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--surface-deep)" strokeWidth="5" />
        <circle cx="20" cy="20" r={r} fill="none" stroke="var(--brand-strong)" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
      </svg>
    </div>
  );
}
