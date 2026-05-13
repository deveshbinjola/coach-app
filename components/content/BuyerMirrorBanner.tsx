"use client";

// BuyerMirrorBanner — small ambient strip pinned to the top of the Draft
// room. Reminds the coach (and re-anchors their writing brain) that every
// piece of content is addressed to ONE named person, not a "you" plural.
//
// Collapsed by default — just shows name + one-line portrait. Click to
// expand and see body state at 6am + the 11pm friend sentence + graveyard.
// Eliminates the slop drift where coaches default to writing for "coaches"
// instead of for Marcus.

import { useState } from "react";
import { Badge } from "@/components/ui";

export type BuyerMirror = {
  name: string;
  one_line_portrait: string;
  body_state: string;
  secret_sentence: string;
  graveyard: string;
};

type Props = { mirror: BuyerMirror | null };

export default function BuyerMirrorBanner({ mirror }: Props) {
  const [open, setOpen] = useState(false);
  if (!mirror || (!mirror.name && !mirror.one_line_portrait)) return null;

  return (
    <div
      className={`rounded-[var(--r-md)] border bg-[var(--surface-elevated)] transition ${
        open ? "border-[var(--brand-strong)]" : "border-[var(--border)]"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left p-3 sm:p-4 flex items-start gap-3 hover:bg-[var(--brand-soft)] transition rounded-[var(--r-md)]"
        aria-expanded={open}
      >
        <span className="font-mono text-[length:var(--t-label)] uppercase tracking-wider text-[color:var(--brand-strong)] font-bold shrink-0 mt-0.5">
          ✏ WRITING TO
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-[color:var(--text)] leading-snug">
            <strong className="font-bold">{mirror.name || "(unnamed)"}</strong>
            {mirror.one_line_portrait && (
              <span className="text-[color:var(--text-muted)]"> · {mirror.one_line_portrait}</span>
            )}
          </p>
        </div>
        <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] shrink-0 font-mono">
          {open ? "▲ collapse" : "▼ details"}
        </span>
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-4 pt-1 space-y-3 border-t border-[var(--border)]">
          {mirror.body_state && (
            <DetailRow
              label="Body state · 6am Tuesday"
              tone="dim"
              text={mirror.body_state}
            />
          )}
          {mirror.secret_sentence && (
            <DetailRow
              label="The line they'd say at 11pm, one trusted friend"
              tone="quote"
              text={mirror.secret_sentence}
            />
          )}
          {mirror.graveyard && (
            <DetailRow
              label="What they've already tried"
              tone="dim"
              text={mirror.graveyard}
            />
          )}
          <div className="pt-1 flex items-center justify-between flex-wrap gap-2">
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] italic">
              Address them by name. Write the post they'd screenshot.
            </p>
            <a
              href="/brand-os"
              className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand-strong)] hover:underline whitespace-nowrap"
            >
              Edit avatar ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, text, tone }: { label: string; text: string; tone: "dim" | "quote" }) {
  return (
    <div className="space-y-1">
      <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
        {label}
      </p>
      {tone === "quote" ? (
        <blockquote className="border-l-4 border-[var(--brand-strong)] pl-3 py-1 italic text-[color:var(--text)] leading-relaxed">
          {text}
        </blockquote>
      ) : (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">{text}</p>
      )}
    </div>
  );
}
