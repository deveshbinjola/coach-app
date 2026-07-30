"use client";

// VoiceTrustCard: the screenshot moment.
//
// One number a coach defends: "X% of last week's drafts went out in my
// voice without changing a word." Plus a 4-week sparkline showing the
// trend, and an honest confidence label.
//
// Design rules (because word-of-mouth is the bar):
//   - The headline number is the biggest thing on the screen: display
//     type, bold, defensible at a glance.
//   - Sparkline below tells the story over 4 weeks. If trend is up,
//     that's the growth story. If flat-high, that's the proof story.
//   - Confidence chip is honest. "Preliminary" when N<10. Hidden card
//     when N<3 (no signal worth defending, render the empty state).
//   - Auto-send affordance appears ONLY when threshold met (>= 90%, N>=20).
//     Otherwise: don't tease.
//
// Three sizes via `size` prop:
//   - "summary":  inline strip cell. One line, sparkline. For Command Center.
//   - "card":     full card with explainer copy. For Decisions.
//   - "embedded": no chrome. For composing into a wider dashboard.

import type { LeadMessage } from "@/lib/types";
import { summarizeTrust } from "@/lib/voice-trust";

type Props = {
  messages: LeadMessage[];
  size?: "summary" | "card" | "embedded";
  /** Optional click handler for the whole card, e.g. open the deeper view. */
  onClick?: () => void;
  /** Override `now` for testing/storybook. */
  now?: number;
};

export default function VoiceTrustCard({
  messages,
  size = "card",
  onClick,
  now,
}: Props) {
  const trust = summarizeTrust(messages, now);
  const hasSignal = trust.confidence !== "none";

  // Empty state (N<3): keep it honest, don't fake a trend.
  if (!hasSignal) {
    if (size === "summary") {
      return (
        <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          <div className="text-[length:var(--t-h3)] font-extrabold text-[color:var(--text)] tabular-nums">
            ·
          </div>
          <div className="mt-0.5">
            Voice trust · need {3 - (trust.last28.asIs + trust.last28.edited)} more send
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
        <div className="text-[length:var(--t-label)] uppercase tracking-widest font-bold text-[color:var(--text-faint)]">
          Voice trust
        </div>
        <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-2 leading-[var(--leading-relaxed)]">
          Send {3 - (trust.last28.asIs + trust.last28.edited)} more AI-drafted messages and we'll start
          tracking how often you ship in your voice without editing.
        </p>
      </div>
    );
  }

  const pct = trust.asIsPct28 ?? 0;
  const isPreliminary = trust.confidence === "preliminary";
  const knownSample = trust.last28.asIs + trust.last28.edited;

  // Summary mode (Command Center strip cell).
  if (size === "summary") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="text-left w-full block group"
        title="Open Voice Trust"
      >
        <div className="flex items-baseline gap-1.5">
          <span className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] tabular-nums leading-none">
            {pct}%
          </span>
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] font-bold">
            in your voice
          </span>
        </div>
        <div className="mt-2 flex items-end gap-3">
          <Sparkline data={trust.weeklyAsIsPct} className="flex-1" />
          {isPreliminary && (
            <span className="text-[length:var(--t-label)] uppercase tracking-widest font-bold text-[color:var(--text-faint)] whitespace-nowrap">
              Early
            </span>
          )}
        </div>
      </button>
    );
  }

  // Card mode (Decisions page proof).
  return (
    <div
      className={`rounded-[var(--r-xl)] p-6 sm:p-8 bg-[var(--surface-dark)] text-[color:var(--text-inverse)] shadow-[var(--shadow-md)] ${
        size === "embedded" ? "p-0 bg-transparent shadow-none text-[color:var(--text)]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="text-[length:var(--t-label)] uppercase tracking-widest font-bold text-[color:var(--brand-bright)]">
          Voice trust · last 28 days
        </div>
        {isPreliminary ? (
          <span className="text-[length:var(--t-label)] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-[color-mix(in_srgb,var(--text-inverse)_15%,transparent)] text-[color:var(--text-inverse)]">
            Preliminary · {knownSample} sends
          </span>
        ) : (
          <span className="text-[length:var(--t-label)] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full bg-[var(--brand)] text-[color:var(--text-inverse)]">
            {knownSample} sends · real signal
          </span>
        )}
      </div>

      {/* Hero: circular gauge dial wraps the percentage. The screenshot
          moment. The ring fills from 0 → pct on mount via stroke-dashoffset
          transition, so coaches see the number land instead of just
          reading it. */}
      <div className="mt-5 flex items-center gap-6 flex-wrap">
        <Gauge pct={pct} size={172} />
        <div className="min-w-0 flex-1">
          <div className="text-[length:var(--t-h3)] font-bold text-[color:var(--text-inverse)] leading-tight">
            went out in your voice
          </div>
          <div className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] mt-1 leading-[var(--leading-relaxed)]">
            without changing a word
          </div>

          {/* Sparkline tucked under the explainer — supports the hero
              number without competing for size. */}
          <div className="mt-5">
            <Sparkline
              data={trust.weeklyAsIsPct}
              className="w-full h-12"
              tone="dark"
            />
            <div className="mt-1 flex justify-between text-[10px] uppercase tracking-widest font-bold text-[color:var(--text-faint)]">
              <span>4w ago</span>
              <span>3w</span>
              <span>2w</span>
              <span>last 7d</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-stats */}
      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-[color-mix(in_srgb,var(--text-inverse)_15%,transparent)] pt-5">
        <SubStat label="Sent as-is" value={trust.last28.asIs} dark />
        <SubStat label="Edited" value={trust.last28.edited} dark />
        <SubStat label="Total drafts" value={trust.last28.total} dark />
      </div>

      {/* Auto-send threshold affordance: only when actually unlocked. */}
      {trust.autoSendReady && (
        <div className="mt-6 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-extrabold text-[length:var(--t-caption)] uppercase tracking-widest">
              Threshold reached
            </div>
            <div className="text-[length:var(--t-caption)] font-bold leading-[var(--leading-relaxed)]">
              Your AI is dialed in. Want it to auto-send drafts above your
              voice-match bar?
            </div>
          </div>
          <button
            type="button"
            disabled
            title="Coming next ship: turn on auto-send for high-confidence drafts"
            className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] bg-[var(--navy)] text-[color:var(--brand-bright)] text-[length:var(--t-caption)] font-extrabold disabled:opacity-50 whitespace-nowrap"
          >
            Configure auto-send
          </button>
        </div>
      )}
    </div>
  );
}

// Gauge: circular progress dial. The Voice Trust hero. Stroke-dashoffset
// animates from full (empty ring) to pct% on mount, so the number lands
// visually instead of just appearing. Brand glow softens the edge.

function Gauge({ pct, size = 160 }: { pct: number; size?: number }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Clamp to [0, 100] so weird values don't break the ring math.
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c * (1 - clamped / 100);

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped}% of recent AI drafts went out as-is`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <defs>
          <filter id="voice-trust-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="color-mix(in srgb, var(--text-inverse) 12%, transparent)"
          strokeWidth={stroke}
        />
        {/* Progress ring — animates via the dashoffset transition below */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--brand)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          filter="url(#voice-trust-glow)"
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.2, 0.8, 0.2, 1)",
          }}
        />
      </svg>
      {/* Center label — absolute-positioned on top of the ring */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-5xl font-bold tabular-nums leading-none text-[color:var(--text-inverse)]">
          {clamped}
          <span className="text-2xl text-[color:var(--brand-bright)] font-bold ml-0.5">%</span>
        </div>
        <div className="mt-2 text-[10px] font-extrabold uppercase tracking-widest text-[color:var(--brand-bright)]">
          Voice trust
        </div>
      </div>
    </div>
  );
}

// Sparkline: pure SVG, no external lib needed.

function Sparkline({
  data,
  className = "",
  tone = "light",
}: {
  /** Most recent first; we reverse internally for left-to-right time. */
  data: number[];
  className?: string;
  tone?: "light" | "dark";
}) {
  // Reverse so x=0 is oldest, x=last is now. Matches reading left-to-right.
  const series = [...data].reverse();
  const w = 100;
  const h = 24;
  const max = 100;
  const stroke = tone === "dark" ? "var(--brand)" : "var(--brand-strong)";
  const fill =
    tone === "dark"
      ? "color-mix(in srgb, var(--brand) 20%, transparent)"
      : "var(--brand-soft)";

  if (series.every((v) => v === 0)) {
    return (
      <div
        className={`text-[length:var(--t-label)] uppercase tracking-widest font-bold text-[color:var(--text-faint)] ${className}`}
      >
        No data yet
      </div>
    );
  }

  // Build a polyline path with an area-fill underneath.
  const stepX = w / Math.max(series.length - 1, 1);
  const points = series.map((v, i) => `${i * stepX},${h - (v / max) * h}`);
  const linePath = `M ${points.join(" L ")}`;
  const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;

  // Last-point dot to anchor the eye on the most recent week.
  const last = series[series.length - 1] ?? 0;
  const lastX = (series.length - 1) * stepX;
  const lastY = h - (last / max) * h;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={className}
      aria-label={`Weekly sent-as-is rate: ${series.join("%, ")}%`}
    >
      <path d={areaPath} fill={fill} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2.5} fill={stroke} />
    </svg>
  );
}

function SubStat({
  label,
  value,
  dark = false,
}: {
  label: string;
  value: number;
  dark?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-[length:var(--t-label)] uppercase tracking-widest font-bold ${
          dark ? "text-[color:var(--text-faint)]" : "text-[color:var(--text-faint)]"
        }`}
      >
        {label}
      </div>
      <div
        className={`text-[length:var(--t-h2)] font-extrabold tabular-nums mt-1 leading-none ${
          dark ? "text-[color:var(--text-inverse)]" : "text-[color:var(--text)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
