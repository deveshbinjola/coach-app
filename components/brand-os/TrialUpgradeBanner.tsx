"use client";

// TrialUpgradeBanner — bottom of the Brand OS deliverable page.
//
// Shown to plan='trial' coaches only (the $7 trip-wire buyers). One-click
// activation of a 10-day free platform trial: flips plan to 'standard',
// unlocks Content / Leads / Clients / Command Center. Lands them in
// /onboarding to set up their reality-question state.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";

export default function TrialUpgradeBanner() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function activate() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/coach/start-free-trial", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      // Land on the reality-question onboarding so we can wire up their
      // surfaces. The new plan unlocks everything from this point forward.
      router.push("/onboarding");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not activate trial.");
      setSubmitting(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8 border-2 border-[var(--brand-strong)] bg-[linear-gradient(135deg,var(--brand-soft)_0%,var(--surface-elevated)_100%)] space-y-4 print:hidden">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone="brand" size="xs" uppercase>You finished Brand OS</Badge>
        <Badge tone="muted" size="xs" uppercase>What's next</Badge>
      </div>

      <h2 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-tight">
        Want the rest of the platform free for 10 days?
      </h2>

      <p className="text-[color:var(--text)] leading-relaxed">
        Your Brand OS just gave you the fuel. The platform turns that fuel into <strong>drafts that sound like you</strong>, a <strong>lead inbox</strong> that runs in your voice, and a <strong>client room</strong> for every paying buyer.
      </p>

      <div className="grid sm:grid-cols-3 gap-3 pt-2">
        <Bullet
          eyebrow="Content"
          title="Auto-uses your voice DNA"
          body="Drafts use your vocab, your pillars, address your named avatar — no prompting."
        />
        <Bullet
          eyebrow="Leads"
          title="Reply in your voice"
          body="AI drafts every reply from your real voice samples. Edit + send in seconds."
        />
        <Bullet
          eyebrow="Clients"
          title="Session prep + notes"
          body="Client rooms with session prep, tasks, retention triggers. All in one place."
        />
      </div>

      <div className="pt-3 border-t border-[color-mix(in_srgb,var(--brand)_20%,var(--border))] flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-0.5 min-w-0">
          <p className="font-bold text-[color:var(--text)]">10 days free · no card on file</p>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            After 10 days, choose a plan or stay on Brand OS-only. Either way, your $7 deliverable is yours forever.
          </p>
        </div>
        <Button onClick={activate} disabled={submitting} className="!h-11 !px-6">
          {submitting ? "Activating…" : "Start 10-day free trial →"}
        </Button>
      </div>

      {err && (
        <p className="text-[length:var(--t-caption)] text-[color:var(--danger)] pt-2">
          {err}
        </p>
      )}
    </Card>
  );
}

function Bullet({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--brand-strong)]">
        {eyebrow}
      </p>
      <p className="font-bold text-[color:var(--text)] leading-snug">{title}</p>
      <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
        {body}
      </p>
    </div>
  );
}
