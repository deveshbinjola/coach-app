// components/content/PolishPanel.tsx
"use client";

// Standalone "polish a rough draft in my voice" panel. Paste -> Sharpen ->
// result polished-forward with a one-tap "what changed" summary. Honest:
// the edit is a suggestion (Use this / Try again / Copy), guardrail flags
// surface as soft "check this" notes, real errors are shown verbatim.

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { MAX_POLISH_CHARS, MIN_POLISH_CHARS, type PolishSteer } from "@/lib/content/polish-core";

type Flag =
  | { kind: "em_dash" }
  | { kind: "numbers_added"; values: string[] }
  | { kind: "ballooned"; rawWords: number; polishedWords: number }
  | { kind: "structure_dropped" };

type PolishResponse = {
  polished: string;
  changes: string[];
  flags: Flag[];
  voice_version: number;
  model: string;
};

const STEER_CHIPS: Array<{ id: PolishSteer; label: string }> = [
  { id: "tighter", label: "Tighter" },
  { id: "warmer", label: "Warmer" },
  { id: "shorter", label: "Shorter" },
  { id: "keep_more", label: "Keep my words" },
];

function flagText(f: Flag): string {
  switch (f.kind) {
    case "em_dash": return "An em-dash slipped in. You may want to swap it.";
    case "numbers_added": return `Double-check this number: ${f.values.join(", ")}. It was not in your draft.`;
    case "ballooned": return "This came back longer than your draft. Skim it before you use it.";
    case "structure_dropped": return "Your line breaks or bullets changed. Check the formatting.";
  }
}

export default function PolishPanel({ hasVoice, weakVoice }: { hasVoice: boolean; weakVoice: boolean }) {
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<PolishResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [copied, setCopied] = useState(false);

  const tooShort = raw.trim().length < MIN_POLISH_CHARS;
  const tooLong = raw.trim().length > MAX_POLISH_CHARS;

  async function polish(steer?: PolishSteer) {
    setError(null);
    setBusy(true);
    setCopied(false);
    try {
      const res = await fetch("/api/content/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: raw.trim(), steer }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error === "no_voice_profile"
          ? "Build your voice first so polish sounds like you."
          : String(data?.error ?? "Something went wrong. Try again."));
        return;
      }
      setResult(data as PolishResponse);
      setShowChanges(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyOut() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.polished);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Could not copy. Select the text and copy manually.");
    }
  }

  if (!hasVoice) {
    return (
      <Card padding="lg" className="text-center">
        <h2 className="text-[length:var(--t-h2)] font-bold text-[color:var(--text)]">Build your voice first</h2>
        <p className="mt-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)] max-w-md mx-auto">
          Polish rewrites your rough drafts in your voice. Set your voice up once and this comes alive.
        </p>
        <a href="/voice" className="inline-flex items-center justify-center h-11 px-5 mt-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] font-extrabold">
          Build my voice
        </a>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Badge tone="brand" size="xs" uppercase>Polish in your voice</Badge>
        <h1 className="text-[length:var(--t-h1)] font-extrabold mt-2 text-[color:var(--text)] leading-[var(--leading-tight)]">
          Paste a rough draft. Get it back sharp, in your voice.
        </h1>
        <p className="mt-1.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)] max-w-xl leading-[var(--leading-relaxed)]">
          Brain-dump it messy. This tightens it without inventing anything or sanding off how you sound.
        </p>
      </div>

      {weakVoice && (
        <Card padding="md" className="border-[var(--border-faint)] bg-[var(--surface-deep)]">
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            Your voice is still a starter. <a href="/voice" className="font-bold underline">Refine it</a> for sharper polish.
          </p>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-faint)] flex items-center justify-between">
          <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">Your rough draft</span>
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">{raw.trim().length} chars</span>
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={9}
          placeholder="ok so i keep telling guys that discipline isnt the real problem its clarity..."
          className="w-full p-4 text-[length:var(--t-body)] leading-[var(--leading-relaxed)] bg-[var(--surface-elevated)] focus:outline-none resize-none"
        />
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          {tooShort ? "Add a sentence or two." : tooLong ? "Too long for now. Trim or split it." : "Looks good."}
        </div>
        <Button onClick={() => polish()} disabled={busy || tooShort || tooLong}>
          {busy ? (<><span className="inline-block w-2 h-2 rounded-full bg-current animate-pulse" aria-hidden /> Polishing…</>) : "Polish in my voice"}
        </Button>
      </div>

      {error && (
        <Card padding="md" className="border-[var(--danger)] bg-[var(--danger-soft)]">
          <p className="text-[length:var(--t-caption)] text-[#B42318]">{error}</p>
        </Card>
      )}

      {result && (
        <Card padding="lg" className="border-2 border-[var(--brand)] bg-[var(--brand-soft)]">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[length:var(--t-label)] uppercase tracking-widest text-[color:var(--text)] font-bold">Polished — your voice</div>
            {result.changes.length > 0 && (
              <button type="button" onClick={() => setShowChanges((v) => !v)} className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
                {showChanges ? "▾ hide changes" : "▸ see what changed"}
              </button>
            )}
          </div>

          <p className="mt-3 text-[length:var(--t-body)] text-[color:var(--text)] leading-[var(--leading-relaxed)] whitespace-pre-wrap">{result.polished}</p>

          {showChanges && result.changes.length > 0 && (
            <ul className="mt-3 space-y-1 border-t border-[color-mix(in_srgb,var(--brand)_25%,transparent)] pt-3">
              {result.changes.map((c, i) => (
                <li key={i} className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">• {c}</li>
              ))}
            </ul>
          )}

          {result.flags.length > 0 && (
            <div className="mt-3 rounded-[var(--r-md)] bg-[var(--surface-elevated)] p-3 space-y-1">
              {result.flags.map((f, i) => (
                <p key={i} className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Heads up: {flagText(f)}</p>
              ))}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Button onClick={copyOut}>{copied ? "Copied ✓" : "Use this"}</Button>
            <Button variant="ghost" onClick={() => polish()} disabled={busy}>Try again</Button>
          </div>

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">Nudge it:</span>
            {STEER_CHIPS.map((chip) => (
              <button key={chip.id} type="button" onClick={() => polish(chip.id)} disabled={busy}
                className="inline-flex items-center h-8 px-3 rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text-muted)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] hover:text-[color:var(--text)] transition disabled:opacity-50">
                {chip.label}
              </button>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
