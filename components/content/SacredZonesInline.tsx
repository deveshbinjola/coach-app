"use client";

// SacredZonesInline — toggle row for sacred content kinds, rendered on
// /content (where the toggles actually matter). Moved out of Settings.
//
// "Sacred" means the AI won't generate net-new in that kind — only
// repurpose. See lib/brand-os/sacred-zones.ts for the server-side rule
// enforced in /api/content/draft.

import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui";
import {
  SACRED_ZONE_KINDS,
  SACRED_ZONE_LABEL,
  type SacredZoneKind,
} from "@/lib/brand-os/sacred-zones";
import { Lock, Pencil } from "lucide-react";

export default function SacredZonesInline() {
  const [sacred, setSacred] = useState<SacredZoneKind[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/coach/sacred-zones");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (!cancelled) setSacred(Array.isArray(d?.sacred_zones) ? d.sacred_zones : []);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Could not load.");
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function toggle(kind: SacredZoneKind) {
    const next = sacred.includes(kind) ? sacred.filter((k) => k !== kind) : [...sacred, kind];
    setSacred(next);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/coach/sacred-zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sacred_zones: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      // Roll back optimistic update
      setSacred(sacred);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)]">Sacred zones</h2>
            <Badge tone="brand" size="xs" uppercase>The moat</Badge>
          </div>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed max-w-2xl">
            Mark a kind <strong>sacred</strong> and the AI refuses to write it from scratch — it can still <em>repurpose</em> something you wrote into it. You write the source, the platform fans it out.
          </p>
        </div>
      </div>

      {err && <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">{err}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {SACRED_ZONE_KINDS.map((kind) => {
          const on = sacred.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggle(kind)}
              disabled={!loaded || busy}
              aria-pressed={on}
              className={`group flex items-center justify-between text-left px-3 py-2.5 rounded-[var(--r-md)] border transition ${
                on
                  ? "bg-[var(--brand-soft)] border-[var(--brand-strong)]"
                  : "bg-[var(--surface)] border-[var(--border)] hover:border-[var(--text-faint)]"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden
                  className={`text-[14px] leading-none ${on ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text-faint)]"}`}
                >
                  {on ? <Lock size={13} strokeWidth={2} aria-hidden /> : <Pencil size={13} strokeWidth={2} aria-hidden />}
                </span>
                <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)] truncate">
                  {SACRED_ZONE_LABEL[kind]}
                </span>
              </span>
              <span className={`text-[length:var(--t-eyebrow)] uppercase tracking-[var(--tracking-eyebrow)] font-bold ${on ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text-faint)]"}`}>
                {on ? "Sacred" : "Open"}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
