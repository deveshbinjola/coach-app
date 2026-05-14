"use client";

// OnboardingFlow — the 4-card reality-question page that runs once after
// the coach finishes their Brand OS MVP.
//
// One screen, four toggles, optional follow-up actions per card. Skippable
// in full ("Finish later"). Submits a single POST to /api/coach/onboarding
// which derives surface-emphasis flags and marks completed_at.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import type { OnboardingAnswers } from "@/lib/onboarding";

type Props = { initial: OnboardingAnswers };

type CardKey = "content" | "leads" | "clients" | "creating";

export default function OnboardingFlow({ initial }: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<OnboardingAnswers>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const totalAnswered =
    (answers.has_past_content !== null ? 1 : 0) +
    (answers.has_leads_to_import !== null ? 1 : 0) +
    (answers.has_active_clients !== null ? 1 : 0) +
    (answers.creates_content_actively !== null ? 1 : 0);
  const canFinish = totalAnswered === 4;

  function setAnswer(key: keyof OnboardingAnswers, value: boolean) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(skip = false) {
    setSubmitting(true);
    setErr(null);
    try {
      const body = skip
        ? answers // partial OK on skip path — state will be saved as-is and gate re-asks later
        : answers;
      const res = await fetch("/api/coach/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      // Route to the surface most likely to be home for them.
      router.push(landingPathFor(answers));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save.");
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <Badge tone="brand" size="xs" uppercase>✓ Brand OS · MVP complete</Badge>
        <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
          Now let's pull in your reality.
        </h1>
        <p className="text-[color:var(--text-muted)] leading-relaxed">
          Four quick yes-or-no's so the platform shows up with <em>your</em> stuff — not a blank slate.
          Skip anything that doesn't apply. Nothing gets hidden either way.
        </p>
        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 h-1.5 bg-[var(--surface-deep)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--brand-strong)] transition-[width] duration-300"
              style={{ width: `${(totalAnswered / 4) * 100}%` }}
              aria-hidden
            />
          </div>
          <span className="font-mono text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            {totalAnswered}/4
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-3">
        <QuestionCard
          cardKey="content"
          eyebrow="Past content"
          question="Do you already have content out there — IG posts, LinkedIn, a newsletter?"
          why="If yes, we'll import it. It seeds your Content library AND sharpens your voice DNA — you'll see the model get more like you in seconds."
          value={answers.has_past_content}
          onChange={(v) => setAnswer("has_past_content", v)}
          followupYes={{
            label: "Import existing content",
            href: "/voice",
            hint: "Opens Voice → import panel. Instagram, LinkedIn, newsletter, or paste.",
          }}
        />

        <QuestionCard
          cardKey="leads"
          eyebrow="Lead list"
          question="Do you have a list of leads or prospects to import?"
          why="If yes, paste or upload them. Your Lead inbox lands with real people in it instead of empty state."
          value={answers.has_leads_to_import}
          onChange={(v) => setAnswer("has_leads_to_import", v)}
          followupYes={{
            label: "Add leads",
            href: "/leads?new=1",
            hint: "Paste rows, upload CSV, or add manually.",
          }}
        />

        <QuestionCard
          cardKey="clients"
          eyebrow="Active clients"
          question="Do you currently have active paying clients?"
          why="If yes, we'll set up Client rooms for them — session prep, notes, retention. If no, you'll see Leads emphasized instead."
          value={answers.has_active_clients}
          onChange={(v) => setAnswer("has_active_clients", v)}
          followupYes={{
            label: "Add clients",
            href: "/clients?new=1",
            hint: "Paste rows or add manually. You can import later too.",
          }}
        />

        <QuestionCard
          cardKey="creating"
          eyebrow="Content rhythm"
          question="Are you actively making content right now (or want to start this week)?"
          why="If yes, Content gets emphasized — you'll land there with your pillars + 5 ready-to-draft hooks. If no, we'll quiet it down until you're ready."
          value={answers.creates_content_actively}
          onChange={(v) => setAnswer("creates_content_actively", v)}
        />
      </div>

      {err && (
        <div className="rounded-[var(--r-md)] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-3 text-[length:var(--t-caption)] text-[color:var(--danger)] font-bold">
          {err}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-[var(--border)]">
        <Button variant="ghost" onClick={() => void submit(true)} disabled={submitting}>
          Skip and finish later
        </Button>
        <Button onClick={() => void submit(false)} disabled={!canFinish || submitting}>
          {submitting ? "Saving…" : canFinish ? "Finish setup →" : `Answer ${4 - totalAnswered} more`}
        </Button>
      </div>

      <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] text-center">
        You can change any of these anytime in Settings.
      </p>
    </div>
  );
}

function QuestionCard({
  cardKey, eyebrow, question, why, value, onChange, followupYes,
}: {
  cardKey: CardKey;
  eyebrow: string;
  question: string;
  why: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  followupYes?: { label: string; href: string; hint: string };
}) {
  const answered = value !== null;
  return (
    <Card
      key={cardKey}
      className={`p-5 sm:p-6 space-y-3 transition ${
        answered ? "border-[color-mix(in_srgb,var(--brand)_30%,var(--border))]" : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 space-y-1">
          <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
            {eyebrow}
          </p>
          <h3 className="font-display text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)] leading-snug">
            {question}
          </h3>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
            {why}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <ToggleBtn label="Yes" active={value === true} onClick={() => onChange(true)} />
          <ToggleBtn label="No" active={value === false} onClick={() => onChange(false)} />
        </div>
      </div>
      {value === true && followupYes && (
        <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] min-w-0 flex-1">
            {followupYes.hint}
          </p>
          <a
            href={followupYes.href}
            className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand-strong)] hover:underline whitespace-nowrap"
          >
            {followupYes.label} ↗
          </a>
        </div>
      )}
    </Card>
  );
}

function ToggleBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[64px] h-9 px-3 rounded-[var(--r-md)] text-[length:var(--t-caption)] font-bold border transition ${
        active
          ? "border-[var(--brand-strong)] bg-[var(--brand-strong)] text-[color:var(--surface)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[color:var(--text-muted)] hover:border-[var(--text-muted)]"
      }`}
    >
      {label}
    </button>
  );
}

/** Where to land the coach after they finish onboarding. Honors their
 *  primary signal: making content > has leads > has clients > default
 *  to content (because coaches without any of those are early-stage and
 *  need to start posting). */
function landingPathFor(a: OnboardingAnswers): string {
  if (a.creates_content_actively === true) return "/content";
  if (a.has_leads_to_import === true)      return "/leads";
  if (a.has_active_clients === true)       return "/clients";
  if (a.has_past_content === true)         return "/content";
  return "/content";
}
