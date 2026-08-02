"use client";

import type { VoiceFitScore } from "@/lib/voice-trust";
import { getVoicePushBack } from "@/lib/pushback";

export default function VoiceFitPanel({
  fit,
  onImprove,
  improving = false,
}: {
  fit: VoiceFitScore | null;
  onImprove?: () => void;
  improving?: boolean;
}) {
  if (!fit) return null;

  const pushBack = getVoicePushBack(fit);

  const tone =
    fit.label === "strong"
      ? {
          label: "Ready",
          bar: "bg-[var(--brand)]",
          chip: "bg-[var(--brand)] text-[color:var(--text-inverse)]",
        }
      : fit.label === "needs_edit"
        ? {
            label: "Tune",
            bar: "bg-[#D97706]",
            chip: "bg-[#FFF7ED] text-[#9A3412] border border-[#FED7AA]",
          }
        : {
            label: "Rewrite",
            bar: "bg-[#DC2626]",
            chip: "bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]",
          };

  return (
    <div className="mt-3 rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Voice fit
          </div>
          <div className="mt-1 text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
            {fit.score}% in your voice
          </div>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider ${tone.chip}`}
        >
          {tone.label}
        </span>
      </div>

      <div className="mt-3 h-1.5 rounded-full bg-[var(--surface-elevated)] overflow-hidden">
        <div
          className={`h-full rounded-full ${tone.bar}`}
          style={{ width: `${fit.score}%` }}
        />
      </div>

      {(fit.matched.length > 0 || fit.reasons.length > 0 || fit.fixes.length > 0) && (
        <div className="mt-3 grid gap-2 text-[length:var(--t-caption)] leading-[var(--leading-base)]">
          {fit.matched.slice(0, 2).map((item) => (
            <div key={item} className="text-[color:var(--text)]">
              <span className="font-extrabold text-[color:var(--brand-strong)]">Fits:</span>{" "}
              {item}
            </div>
          ))}
          {fit.reasons.slice(0, 2).map((item) => (
            <div key={item} className="text-[color:var(--text-muted)]">
              <span className="font-extrabold text-[color:var(--text)]">Watch:</span>{" "}
              {item}
            </div>
          ))}
          {fit.fixes.slice(0, 2).map((item) => (
            <div key={item} className="text-[color:var(--text-muted)]">
              <span className="font-extrabold text-[color:var(--text)]">Do:</span>{" "}
              {item}
            </div>
          ))}
        </div>
      )}

      {pushBack && (
        <div className="mt-3 rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-elevated)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                Push back mode
              </div>
              <div className="mt-1 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                {pushBack.verdict}
              </div>
            </div>
            <span className={`h-2 w-2 rounded-full shrink-0 ${pushBackDot(pushBack.tone)}`} />
          </div>

          <div className="mt-3 grid gap-2">
            {pushBack.items.slice(0, 2).map((item) => (
              <div
                key={`${item.title}-${item.action}`}
                className="rounded-[var(--r-sm)] bg-[var(--surface-deep)] px-3 py-2"
              >
                <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                  {item.title}
                </div>
                <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
                  {item.action}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {onImprove && fit.label !== "strong" && (
        <div className="mt-3 pt-3 border-t border-[var(--border-faint)] flex justify-end">
          <button
            type="button"
            onClick={onImprove}
            disabled={improving}
            className="inline-flex items-center justify-center h-8 min-h-11 px-3 rounded-[var(--r-sm)] bg-[var(--navy)] text-[color:var(--brand-bright)] text-[11px] font-extrabold uppercase tracking-wider hover:opacity-90 disabled:opacity-50 transition"
          >
            {improving ? "Fixing..." : "Fix voice"}
          </button>
        </div>
      )}
    </div>
  );
}

function pushBackDot(tone: "blocker" | "warning" | "opportunity" | "clear") {
  switch (tone) {
    case "blocker":
      return "bg-[#DC2626]";
    case "warning":
      return "bg-[#D97706]";
    case "opportunity":
      return "bg-[var(--brand-strong)]";
    case "clear":
      return "bg-[var(--brand)]";
  }
}
