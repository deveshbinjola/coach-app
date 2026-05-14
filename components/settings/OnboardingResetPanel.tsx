"use client";

// OnboardingResetPanel — /settings card to redo or adjust the post-Brand-
// OS reality questions. Shows current emphasis state and lets the coach
// re-run /onboarding any time.

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import type { OnboardingState } from "@/lib/onboarding";

export default function OnboardingResetPanel() {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/coach/onboarding");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { state: OnboardingState | null };
      setState(data.state);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function reset() {
    if (!confirm("Re-run onboarding? Your answers will clear and you'll be sent through the reality questions again. Doesn't affect your data.")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/coach/onboarding", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      window.location.href = "/onboarding";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reset.");
      setResetting(false);
    }
  }

  return (
    <Card className="p-5 sm:p-6 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)]">Onboarding</h3>
          <Badge tone="muted" size="xs" uppercase>Reality questions</Badge>
        </div>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
          The 4 questions you answered after Brand OS — what surfaces get emphasized in your platform. Re-run anytime to re-prioritize.
        </p>
      </div>

      {loading ? (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Loading…</p>
      ) : state ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[var(--border)]">
            <Stat label="Past content" value={fmt(state.has_past_content)} />
            <Stat label="Lead list"    value={fmt(state.has_leads_to_import)} />
            <Stat label="Active clients" value={fmt(state.has_active_clients)} />
            <Stat label="Making content" value={fmt(state.creates_content_actively)} />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[var(--border)]">
            <EmphasisStat label="Content" on={state.emphasize_content} />
            <EmphasisStat label="Leads"   on={state.emphasize_leads} />
            <EmphasisStat label="Clients" on={state.emphasize_clients} />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
              {state.completed_at
                ? `Finished ${new Date(state.completed_at).toLocaleDateString()}`
                : "Not yet completed"}
            </p>
            <Button variant="ghost" onClick={reset} disabled={resetting}>
              {resetting ? "Resetting…" : "Re-run onboarding"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">No onboarding state on file.</p>
      )}

      {err && <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">{err}</p>}
    </Card>
  );
}

function fmt(v: boolean | null): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">{label}</p>
      <p className="text-[color:var(--text)] font-bold">{value}</p>
    </div>
  );
}

function EmphasisStat({ label, on }: { label: string; on: boolean }) {
  return (
    <div className={`rounded-[var(--r-md)] border p-2.5 text-center ${on ? "border-[var(--brand-strong)] bg-[var(--brand-soft)]" : "border-[var(--border)] bg-[var(--surface)] opacity-70"}`}>
      <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)] mb-0.5">{label}</p>
      <p className={`text-[length:var(--t-caption)] font-bold ${on ? "text-[color:var(--brand-strong)]" : "text-[color:var(--text-muted)]"}`}>
        {on ? "Emphasized" : "Quiet"}
      </p>
    </div>
  );
}
