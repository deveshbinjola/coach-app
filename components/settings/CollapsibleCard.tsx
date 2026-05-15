"use client";

// CollapsibleCard — the row-shaped wrapper used by every settings panel.
//
// Each section collapses to a single readable row with: status pip, title,
// one-line summary, expand chevron. Click anywhere on the row to expand
// and reveal the panel beneath. Completed sections start collapsed; rows
// that need attention start expanded.
//
// Status drives ordering at the page level (see app/settings/page.tsx).

import { useState } from "react";
import type { ReactNode } from "react";

export type SettingsStatus = "attention" | "set_up" | "done" | "neutral";

const STATUS_LABEL: Record<SettingsStatus, string> = {
  attention: "Needs attention",
  set_up:    "Set up",
  done:      "Done",
  neutral:   "",
};

const STATUS_DOT: Record<SettingsStatus, string> = {
  attention: "var(--danger)",
  set_up:    "var(--warning, #F59E0B)",
  done:      "var(--brand-strong)",
  neutral:   "var(--text-faint)",
};

const STATUS_PILL_BG: Record<SettingsStatus, string> = {
  attention: "color-mix(in srgb, var(--danger) 14%, transparent)",
  set_up:    "color-mix(in srgb, #F59E0B 14%, transparent)",
  done:      "color-mix(in srgb, var(--brand) 14%, transparent)",
  neutral:   "var(--surface)",
};

const STATUS_PILL_FG: Record<SettingsStatus, string> = {
  attention: "var(--danger)",
  set_up:    "#B45309",
  done:      "var(--brand-strong)",
  neutral:   "var(--text-faint)",
};

type Props = {
  /** Section title — the kicker shown in the row. */
  title: string;
  /** One-line summary of what's currently set. Hidden when expanded. */
  summary?: string;
  /** Status drives the dot color + pill label + page-level sort order. */
  status: SettingsStatus;
  /** Optional override of the pill label (e.g. "Connect", "Pick your audience"). */
  ctaLabel?: string;
  /** Start expanded? Defaults: attention=open, set_up=closed, done=closed. */
  defaultOpen?: boolean;
  /** The panel content shown when expanded. */
  children: ReactNode;
  /** Stable section id for in-page anchors. */
  id?: string;
};

export default function CollapsibleCard({
  title, summary, status, ctaLabel, defaultOpen, children, id,
}: Props) {
  const initialOpen = defaultOpen ?? status === "attention";
  const [open, setOpen] = useState(initialOpen);
  const dot = STATUS_DOT[status];
  const pillBg = STATUS_PILL_BG[status];
  const pillFg = STATUS_PILL_FG[status];
  const pillLabel = ctaLabel ?? STATUS_LABEL[status];

  return (
    <div
      id={id}
      className={`group cc rounded-[var(--r-lg)] border bg-[var(--surface-elevated)] transition-colors ${
        open
          ? "border-[var(--border-strong)]"
          : "border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-4 px-4 sm:px-5 py-3.5 text-left"
      >
        {/* Status pip */}
        <span
          className="flex-shrink-0 inline-flex w-2.5 h-2.5 rounded-full"
          style={{
            background: dot,
            boxShadow: `0 0 0 4px color-mix(in srgb, ${dot} 22%, transparent)`,
          }}
          aria-hidden
        />

        {/* Title + summary */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-[length:var(--t-body)] font-extrabold tracking-tight text-[color:var(--text)]">
              {title}
            </h3>
            {pillLabel && (
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ background: pillBg, color: pillFg }}
              >
                {pillLabel}
              </span>
            )}
          </div>
          {summary && !open && (
            <p className="mt-0.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)] truncate">
              {summary}
            </p>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`flex-shrink-0 transition-transform duration-200 text-[color:var(--text-faint)] ${open ? "rotate-180" : ""}`}
          width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-[var(--border-faint)] p-3 sm:p-4 bg-[var(--surface)]">
          {children}
        </div>
      )}
    </div>
  );
}
