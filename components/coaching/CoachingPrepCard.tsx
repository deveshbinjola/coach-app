// components/coaching/CoachingPrepCard.tsx
"use client";
// Push card shown when a coach opens a client / starts a session. Glanceable,
// tap-to-source, dismissible. Empty state is a forward-promise.
import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import type { CoachingPrep } from "@/lib/coaching-prep";

export default function CoachingPrepCard({ prep, clientName }: { prep: CoachingPrep; clientName: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const empty = prep.lastRecap.length === 0 && prep.openCommitments.length === 0 && prep.formingPatterns.length === 0;
  if (empty) {
    return (
      <Card padding="md" className="bg-[var(--surface-elevated)]">
        <Badge tone="brand" size="xs" uppercase>Coaching prep</Badge>
        <p className="mt-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          First session with {clientName}. Save it, and the prep writes itself for next time.
        </p>
      </Card>
    );
  }

  const idFor = (text: string) => prep.items.find((i) => i.text === text)?.id ?? text;
  const evidenceFor = (text: string) => prep.items.find((i) => i.text === text)?.evidence ?? null;

  async function dismiss(text: string) {
    const id = idFor(text);
    setDismissed((p) => new Set(p).add(id));
    try { await fetch(`/api/signals/${id}/dismiss`, { method: "POST" }); } catch { /* optimistic */ }
  }

  function Row({ text }: { text: string }) {
    const id = idFor(text);
    if (dismissed.has(id)) return null;
    const ev = evidenceFor(text);
    return (
      <li className="text-[length:var(--t-caption)] text-[color:var(--text)]">
        <button type="button" className="text-left" onClick={() => setOpen(open === id ? null : id)}>• {text}</button>
        <button type="button" onClick={() => dismiss(text)} className="ml-2 text-[color:var(--text-faint)] hover:text-[color:var(--danger)]" title="Not relevant">×</button>
        {open === id && ev && (
          <div className="mt-1 ml-3 text-[color:var(--text-muted)] italic">from your notes: &ldquo;{ev}&rdquo;</div>
        )}
      </li>
    );
  }

  return (
    <Card padding="md" className="border-[var(--border)] bg-[var(--surface-elevated)]">
      <Badge tone="brand" size="xs" uppercase>Coaching prep · {clientName}</Badge>
      {prep.lastRecap.length > 0 && (
        <div className="mt-2">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">Last time</div>
          <ul className="mt-1 space-y-1">{prep.lastRecap.map((t) => <Row key={t} text={t} />)}</ul>
        </div>
      )}
      {prep.openCommitments.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">Open commitments</div>
          <ul className="mt-1 space-y-1">{prep.openCommitments.map((t) => <Row key={t} text={t} />)}</ul>
        </div>
      )}
      {prep.formingPatterns.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">Pattern forming</div>
          <ul className="mt-1 space-y-1">{prep.formingPatterns.map((t) => <Row key={t} text={t} />)}</ul>
        </div>
      )}
    </Card>
  );
}
