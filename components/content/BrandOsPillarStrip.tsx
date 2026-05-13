"use client";

// BrandOsPillarStrip — sits above the Content workspace.
//
// Surfaces the coach's 3 pillars (display) + 5 resonance hooks (clickable)
// from their latest Brand OS run. Clicking a hook fills the draft angle
// field and scrolls to the Draft room so they can ship the piece in one
// click. Renders nothing if Brand OS hasn't been run — the workspace
// breathes normally for new coaches.

import { Badge, Card } from "@/components/ui";

export type StripPillar = { name: string; enemy: string };
export type ResonanceHook = { headline: string; angle: string; pillar: string };

type Props = {
  pillars: StripPillar[];
  hooks: ResonanceHook[];
  /** Coach hasn't run Brand OS yet — show a soft prompt instead of nothing. */
  hasRunBrandOs: boolean;
  onPickHook: (hook: ResonanceHook) => void;
};

export default function BrandOsPillarStrip({ pillars, hooks, hasRunBrandOs, onPickHook }: Props) {
  // ── Empty state — coach hasn't run Brand OS ──────────────
  if (!hasRunBrandOs) {
    return (
      <Card className="p-4 sm:p-5 space-y-2 border-dashed">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge tone="muted" size="xs" uppercase>Brand OS not run yet</Badge>
          <a
            href="/brand-os"
            className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand-strong)] hover:underline"
          >
            Run Brand OS →
          </a>
        </div>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
          When you finish the Brand OS quiz, your <strong>pillars</strong> and <strong>5 ready-to-draft hooks</strong> show up here. Every draft below also starts using your distilled voice DNA — vocab, signature moves, your avatar by name.
        </p>
      </Card>
    );
  }

  // ── Loaded — show pillars + hooks ────────────────────────
  return (
    <Card className="p-4 sm:p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Badge tone="brand" size="xs" uppercase>Your Brand OS · pillars + ready hooks</Badge>
        <a
          href="/brand-os"
          className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
        >
          Tune ↗
        </a>
      </div>

      {pillars.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-3">
          {pillars.map((p, i) => (
            <div
              key={i}
              className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3 space-y-1"
            >
              <p className="font-mono text-[length:var(--t-label)] uppercase tracking-wider text-[color:var(--text-faint)]">
                Pillar {i + 1}
              </p>
              <p className="font-display font-extrabold text-[color:var(--text)] leading-tight">{p.name}</p>
              {p.enemy && (
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-snug">
                  vs <em>{p.enemy}</em>
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {hooks.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-[var(--border)]">
          <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
            Ship this week · click to load into Draft room
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {hooks.map((h, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPickHook(h)}
                className="text-left rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--brand-strong)] hover:bg-[var(--brand-soft)] p-3 space-y-1 transition group"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <h4 className="font-display font-extrabold text-[color:var(--text)] leading-snug text-[length:var(--t-body)]">
                    {h.headline}
                  </h4>
                  <Badge tone="muted" size="xs" uppercase>{h.pillar}</Badge>
                </div>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed line-clamp-2">
                  {h.angle}
                </p>
                <p className="text-[length:var(--t-caption)] text-[color:var(--brand-strong)] font-bold opacity-0 group-hover:opacity-100 transition">
                  Draft this →
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
