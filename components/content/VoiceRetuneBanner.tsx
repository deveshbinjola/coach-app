"use client";

// VoiceRetuneBanner — appears at top of /content when the coach has
// imported new voice samples since their last overlay save. Hitting
// "Re-tune" POSTs to /api/brand-os/retune-from-voice which refreshes
// the overlay's voice DNA from the newest samples. Banner disappears
// after success (corpus baseline gets reset).

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { Mic } from "lucide-react";

type Props = {
  newSources: number;
  newChars: number;
};

type Result = {
  added_yes: string[];
  added_no: string[];
  samples_used: number;
};

const DISMISS_KEY = "voice-retune-dismissed";

function wasDismissedRecently(): boolean {
  try {
    const ts = localStorage.getItem(DISMISS_KEY);
    if (!ts) return false;
    return Date.now() - Number(ts) < 24 * 60 * 60 * 1000;
  } catch { return false; }
}

export default function VoiceRetuneBanner({ newSources, newChars }: Props) {
  const [open, setOpen] = useState(() => !wasDismissedRecently());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function dismiss() {
    setOpen(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
  }

  if (!open) return null;

  async function retune() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/brand-os/retune-from-voice", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message ?? data?.error ?? `HTTP ${res.status}`);
      setResult(data.diff as Result);
      try { localStorage.removeItem(DISMISS_KEY); } catch {}
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not re-tune.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    // Success state — show what changed, dismiss button.
    const nothingNew = result.added_yes.length === 0 && result.added_no.length === 0;
    return (
      <Card className="p-4 sm:p-5 space-y-3 border-[var(--brand-strong)]">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge tone="brand" size="xs" uppercase>Voice re-tuned</Badge>
          <button onClick={dismiss} className="text-[color:var(--text-faint)] hover:text-[color:var(--text)] text-lg leading-none">×</button>
        </div>
        {nothingNew ? (
          <p className="text-[color:var(--text)]">
            Your voice is already aligned with your new samples — nothing meaningful changed. Future drafts will keep using your current DNA.
          </p>
        ) : (
          <>
            <p className="text-[color:var(--text)]">
              Refined from <strong>{result.samples_used} samples</strong>. The next draft you generate will use this:
            </p>
            {result.added_yes.length > 0 && (
              <div className="space-y-1">
                <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--brand-strong)]">New ✓</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.added_yes.map((v, i) => (
                    <span key={i} className="font-mono text-[length:var(--t-caption)] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--brand-soft)] text-[color:var(--success)]">{v}</span>
                  ))}
                </div>
              </div>
            )}
            {result.added_no.length > 0 && (
              <div className="space-y-1">
                <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--danger)]">New ✕</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.added_no.map((v, i) => (
                    <span key={i} className="font-mono text-[length:var(--t-caption)] px-2 py-0.5 rounded-[var(--r-sm)] bg-[var(--danger-soft)] text-[#B42318] line-through">{v}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5 space-y-3 border-[var(--warning)] bg-[var(--warning-soft)]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Mic size={19} strokeWidth={1.9} className="shrink-0 text-[color:var(--brand)]" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="font-bold text-[color:var(--text)]">
              Your voice has new material — re-tune?
            </p>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
              {newSources > 0 && <><strong>{newSources}</strong> new sample{newSources === 1 ? "" : "s"}</>}
              {newSources > 0 && newChars > 0 && " · "}
              {newChars >= 1000 && <><strong>{Math.round(newChars / 1000)}k</strong> new chars</>}
              {" "}imported since your last voice DNA update. A re-tune sharpens vocab + tone for every future draft.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={retune} disabled={busy}>
            {busy ? "Re-tuning… ~15s" : "Re-tune voice →"}
          </Button>
          <button
            onClick={dismiss}
            className="text-[color:var(--text-faint)] hover:text-[color:var(--text)] text-lg leading-none px-2"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
      {err && <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">{err}</p>}
    </Card>
  );
}
