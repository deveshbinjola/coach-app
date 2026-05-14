"use client";

// TrialUpgradeBanner — bottom of the Brand OS deliverable page.
//
// Shown to plan='trial' coaches only (the $7 trip-wire buyers). One-click
// activation of a 14-day free platform trial: flips plan to 'standard',
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
    <Card className="p-6 sm:p-8 border-2 border-[var(--brand-strong)] bg-[linear-gradient(135deg,var(--brand-soft)_0%,var(--surface-elevated)_100%)] space-y-5 print:hidden">
      <Badge tone="brand" size="xs" uppercase>You finished Brand OS</Badge>

      <h2 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-tight">
        Did that feel like you?
      </h2>

      <p className="text-[color:var(--text)] leading-relaxed text-[length:var(--t-body)]">
        If yes, there's more. Your Brand OS is the fuel. The platform is where it does the work — <strong>content in your voice</strong>, <strong>replies to your leads</strong>, <strong>rooms for the clients you already have</strong>.
      </p>

      <div className="grid sm:grid-cols-3 gap-3 pt-2">
        <Bullet
          eyebrow="Content"
          title="Content that runs in your voice."
          body="Drafts for every channel — captions, posts, newsletters, carousels. A library of past pieces to repurpose. Pillar-driven topic suggestions from your Brand OS."
        />
        <Bullet
          eyebrow="Leads"
          title="Reply to leads in your voice."
          body="AI drafts the response from your samples. You edit. You send. Seconds, not hours."
        />
        <Bullet
          eyebrow="Clients"
          title="One room per paying buyer."
          body="Session prep, notes, custom content per client. All in one place. Powered by your DNA."
        />
      </div>

      <div className="pt-3 border-t border-[color-mix(in_srgb,var(--brand)_25%,var(--border))] flex items-center justify-between flex-wrap gap-3">
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          Free for 14 days · No card · Your Brand OS is yours forever
        </p>
        <Button onClick={activate} disabled={submitting} className="!h-11 !px-6">
          {submitting ? "Activating…" : "Explore the platform →"}
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
