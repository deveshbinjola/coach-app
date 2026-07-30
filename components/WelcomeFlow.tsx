"use client";

// WelcomeFlow — 4-step choreographed onboarding.
//
// Design rules (so a 5-year-old could use it):
//   - One thing per screen. Never two CTAs of equal weight.
//   - Big type. Short sentences. Minimal copy. No paragraphs.
//   - Progress dots top-center. Skip in the corner. That's it for chrome.
//   - The CTA is always in the same place (bottom right) so the eye learns
//     where to go next without searching.
//   - Errors live next to the action that caused them, not at the page top.
//
// The four steps:
//   1. HELLO   — name + 3-line pitch. One button: "Let's go".
//   2. VOICE   — embedded VoiceSetupFlow (existing component, unchanged).
//                onComplete advances to step 3.
//   3. MAGIC   — paste a sample inbound message. Click "Show me." AI calls
//                voice-demo-draft, returns a reply in their voice. Coach
//                reads it. Single CTA: "Continue".
//   4. DONE    — "this is what happens for every real lead." Two CTAs:
//                "Add my first lead" (primary) -> /leads/capture, or
//                "Just take me to the app" (ghost) -> /command-center.
//
// The flow auto-skips Voice if the coach already has a profile (force=1
// case where they came back to replay activation but already had voice).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2 } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import VoiceSetupFlow from "@/components/VoiceSetupFlow";
import { createClient } from "@/lib/supabase-browser";
import { readInvokeError } from "@/lib/voice/invoke-error";
import { renderShareCard, shareOrDownload } from "@/lib/share-card";
import type { VoiceProfile } from "@/lib/types";
import {
  getVoiceProfile,
  deriveProfileSlug,
  type VoiceProfileSlug,
  type AudienceSelf,
  type AudienceServes,
} from "@/lib/voice-profiles";
import {
  EMPTY_ANSWERS,
  NICHE_OPTIONS,
  STAGE_OPTIONS,
  TONE_OPTIONS,
  DESIRE_OPTIONS,
  loadInterviewAnswers,
  clearInterviewAnswers,
  reflectionLine,
  type InterviewAnswers,
  type Desire,
} from "@/lib/assistant-interview";

type Step = "audience" | "interview" | "hello" | "voice" | "magic" | "done";
type OnboardingImportSource = "instagram" | "linkedin" | "newsletter";
type ImportedVoiceSignal = {
  source: OnboardingImportSource;
  label: string;
  units: number;
  patterns: Array<{ label: string; text: string }>;
};

type Props = {
  startingProfile: VoiceProfile | null;
  coachFirstName: string;
  voiceProfileSlug: VoiceProfileSlug;
  hasAudienceAnswered: boolean;
};

export default function WelcomeFlow({
  startingProfile,
  coachFirstName,
  voiceProfileSlug,
  hasAudienceAnswered,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const initialImportedSignal = startingProfile ? importedSignalFromProfile(startingProfile) : null;

  // Audience-aware: load the profile so demo presets, greetings, and copy
  // branch by the coach's answers. Updates in-flight when the audience step
  // submits.
  const [currentSlug, setCurrentSlug] = useState<VoiceProfileSlug>(voiceProfileSlug);
  const profile = getVoiceProfile(currentSlug);
  const SAMPLE_INBOUND_PRESETS = profile.demoInboundPresets;

  // Step order:
  //   1. audience (if not answered yet) — sets voice_profile_slug
  //   2. interview — the assistant's getting-to-know-you questions
  //   3. hello → voice → magic → done
  // If audience IS answered + voice profile exists (force=1 replay path),
  // skip straight to magic.
  const initialStep: Step =
    !hasAudienceAnswered ? "audience"
    : startingProfile  ? "magic"
    : "interview";
  const [step, setStep] = useState<Step>(initialStep);

  // Set when the interview completes — the Hello step reflects the coach's
  // own answers back so personalization is felt immediately, not claimed.
  const [reflection, setReflection] = useState<string | null>(null);

  // Audience-question state (only used during 'audience' step).
  const [audienceSelf, setAudienceSelf] = useState<AudienceSelf | null>(null);
  const [audienceServes, setAudienceServes] = useState<AudienceServes | null>(null);
  const [savingAudience, setSavingAudience] = useState(false);
  const [audienceError, setAudienceError] = useState<string | null>(null);

  async function submitAudience() {
    if (!audienceSelf || !audienceServes) {
      setAudienceError("Pick one in each row to continue.");
      return;
    }
    setAudienceError(null);
    setSavingAudience(true);
    const slug = deriveProfileSlug(audienceSelf, audienceServes);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setAudienceError("You're signed out. Refresh and try again.");
      setSavingAudience(false);
      return;
    }
    const { error: updateErr } = await supabase
      .from("cp_coaches")
      .update({
        audience_self: audienceSelf,
        audience_serves: audienceServes,
        voice_profile_slug: slug,
      })
      .eq("id", user.id);
    setSavingAudience(false);
    if (updateErr) {
      setAudienceError(updateErr.message);
      return;
    }
    setCurrentSlug(slug);
    // Advance to the rest of onboarding.
    setStep(startingProfile ? "magic" : "interview");
  }

  // Magic-moment state. Two drafts now — generic + voice — so the coach
  // sees the contrast that makes this a screenshot moment.
  const [inbound, setInbound] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [genericDraft, setGenericDraft] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [importComplete, setImportComplete] = useState(Boolean(initialImportedSignal));
  const [importedSignal, setImportedSignal] = useState<ImportedVoiceSignal | null>(
    initialImportedSignal
  );

  function skipForNow() {
    router.push("/command-center");
  }

  async function generateDemoDraft() {
    if (inbound.trim().length < 10) {
      setDraftError("Add a sentence or two. What would a lead actually say?");
      return;
    }
    setDraftError(null);
    setDrafting(true);
    setDraft(null);
    setGenericDraft(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "voice-demo-draft",
        { body: { inbound_message: inbound.trim() } }
      );
      if (invokeErr) {
        setDraftError(await readInvokeError(invokeErr, "Couldn't draft right now. Try again, or skip the proof for now."));
        return;
      }
      const r = data as {
        draft?: string;
        generic_draft?: string;
        error?: string;
      };
      if (r.error) {
        setDraftError(r.error);
        return;
      }
      if (!r.draft) {
        setDraftError("AI didn't return a draft. Try again.");
        return;
      }
      setDraft(r.draft);
      // generic_draft is optional — if the second call failed for any
      // reason, we still show the voice version (don't block the moment).
      // The reveal layout adapts: with both, side-by-side; with only
      // voice, fall back to single-card display.
      setGenericDraft(r.generic_draft ?? null);
    } catch (err) {
      setDraftError(String(err));
    } finally {
      setDrafting(false);
    }
  }

  // ── render scaffolding ──────────────────────────────────────────────────

  return (
    <div className="space-y-8 min-h-[calc(100vh-132px)]">
      {/* Top bar — progress dots + skip. Same layout every step. */}
      <div className="flex items-center justify-between gap-4">
        <ProgressDots step={step} />
        <button
          type="button"
          onClick={skipForNow}
          className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] underline decoration-dotted underline-offset-4"
        >
          Skip for now
        </button>
      </div>

      {step === "audience" && (
        <AudienceStep
          firstName={coachFirstName}
          audienceSelf={audienceSelf}
          audienceServes={audienceServes}
          onAudienceSelf={setAudienceSelf}
          onAudienceServes={setAudienceServes}
          onContinue={submitAudience}
          saving={savingAudience}
          error={audienceError}
        />
      )}

      {step === "interview" && (
        <InterviewStep
          firstName={coachFirstName}
          onDone={(answers) => {
            setReflection(answers ? reflectionLine(answers) : null);
            setStep("hello");
          }}
        />
      )}

      {step === "hello" && (
        <HelloStep
          firstName={coachFirstName}
          reflection={reflection}
          onContinue={() => setStep("voice")}
        />
      )}

      {step === "voice" && (
        <div className="space-y-5">
          <Badge tone="brand" size="xs" uppercase>
            Step 3 of 5 · Build your voice
          </Badge>
          <div>
            <h2 className="text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
              Start with the voice you already published.
            </h2>
            <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] max-w-2xl leading-[var(--leading-relaxed)] mt-2">
              Import Instagram first. Then answer the questions only if you
              want to sharpen the asset before the proof moment.
            </p>
          </div>

          {!importComplete && (
            <OnboardingInstagramImport
              onImported={(signal) => {
                setImportComplete(true);
                setImportedSignal(signal);
              }}
              onContinue={() => setStep("magic")}
            />
          )}

          <div className={importComplete ? "space-y-4" : "pt-2"}>
            <VoiceSetupFlow
              variant="embedded"
              profileSlug={currentSlug}
              onComplete={() => setStep("magic")}
            />
          </div>

          {importComplete && (
            <ImportedVoiceFooter onContinue={() => setStep("magic")} />
          )}
        </div>
      )}

      {step === "magic" && (
        <MagicStep
          firstName={coachFirstName}
          inbound={inbound}
          setInbound={setInbound}
          presets={SAMPLE_INBOUND_PRESETS}
          drafting={drafting}
          draft={draft}
          genericDraft={genericDraft}
          importedSignal={importedSignal}
          error={draftError}
          onGenerate={generateDemoDraft}
          onContinue={() => setStep("done")}
          onTryAgain={() => {
            setDraft(null);
            setGenericDraft(null);
            setInbound("");
            setDraftError(null);
          }}
          coachFirstName={coachFirstName}
        />
      )}

      {step === "done" && <DoneStep firstName={coachFirstName} />}
    </div>
  );
}

// ── Step 0: Audience ──────────────────────────────────────────────────────
//
// Two questions that derive the coach's voice_profile_slug. Drives every
// downstream default (seed phrases, demo DMs, greetings, placeholders,
// objection-pattern register).

function AudienceStep({
  firstName,
  audienceSelf,
  audienceServes,
  onAudienceSelf,
  onAudienceServes,
  onContinue,
  saving,
  error,
}: {
  firstName: string;
  audienceSelf: AudienceSelf | null;
  audienceServes: AudienceServes | null;
  onAudienceSelf: (v: AudienceSelf) => void;
  onAudienceServes: (v: AudienceServes) => void;
  onContinue: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Badge tone="brand" size="xs" uppercase>Welcome · let's tune your voice</Badge>
        <h2 className="text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
          Hey {firstName}. Two quick questions.
        </h2>
        <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] max-w-2xl leading-[var(--leading-relaxed)]">
          The platform branches its defaults by the answers. Every seed phrase,
          demo, and reply template comes from these two choices. You can change
          them anytime in Settings.
        </p>
      </div>

      {/* Question 1 — Coach's own embodiment lens */}
      <div className="space-y-3">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
          1 · How do you describe your own work?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            { v: "masculine",  label: "Masculine embodiment", hint: "Purpose, edge, integrity, action" },
            { v: "feminine",   label: "Feminine embodiment",  hint: "Somatic, nervous system, attachment, flow" },
            { v: "integrated", label: "Integrated / Both",     hint: "Neither dominates the work" },
          ] as const).map((opt) => {
            const active = audienceSelf === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => onAudienceSelf(opt.v)}
                className={`text-left p-4 rounded-[var(--r-lg)] border transition ${
                  active
                    ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] ring-2 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]"
                    : "border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--text-muted)]"
                }`}
              >
                <div className="font-bold text-[length:var(--t-body)] text-[color:var(--text)] mb-1">{opt.label}</div>
                <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">{opt.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Question 2 — Audience served */}
      <div className="space-y-3">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
          2 · Who do you primarily work with?
        </p>
        <div className="grid grid-cols-3 gap-3">
          {([
            { v: "men",   label: "Men" },
            { v: "women", label: "Women" },
            { v: "both",  label: "Both" },
          ] as const).map((opt) => {
            const active = audienceServes === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => onAudienceServes(opt.v)}
                className={`text-center p-4 rounded-[var(--r-lg)] border transition font-bold ${
                  active
                    ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] ring-2 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)] text-[color:var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--text-muted)] text-[color:var(--text)]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]" role="alert">{error}</p>
      )}

      <div className="flex justify-end">
        <Button
          onClick={onContinue}
          disabled={saving || !audienceSelf || !audienceServes}
          className="h-12 px-6"
        >
          {saving ? "Saving…" : "Continue →"}
        </Button>
      </div>
    </div>
  );
}

// ── Step: Interview ────────────────────────────────────────────────────────
//
// The assistant's getting-to-know-you questions. One question per screen,
// auto-advance on single-choice taps so it feels like a conversation, not a
// form. Pre-filled from the /meet teaser (localStorage) when present, so a
// coach who took the public quiz never answers the same thing twice.
// Answers post to /api/onboarding/interview → confirmed Dhara memories +
// nav emphasis flags.

type InterviewSub = "niche" | "stage" | "tone" | "desires";
const INTERVIEW_SUBS: InterviewSub[] = ["niche", "stage", "tone", "desires"];

function InterviewStep({
  firstName,
  onDone,
}: {
  firstName: string;
  /** null = skipped; answers = completed (drives the Hello reflection). */
  onDone: (answers: InterviewAnswers | null) => void;
}) {
  const [answers, setAnswers] = useState<InterviewAnswers>(EMPTY_ANSWERS);
  const [sub, setSub] = useState<InterviewSub>("niche");
  const [cameFromTeaser, setCameFromTeaser] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Import the /meet teaser answers once, client-side.
  useEffect(() => {
    const stored = loadInterviewAnswers();
    if (stored) {
      setAnswers((cur) => ({ ...cur, ...stored }));
      if (stored.timeDrain || stored.handOffFirst || stored.desires.length > 0) {
        setCameFromTeaser(true);
      }
    }
  }, []);

  const subIdx = INTERVIEW_SUBS.indexOf(sub);

  function advance() {
    const next = INTERVIEW_SUBS[subIdx + 1];
    if (next) setSub(next);
  }

  function pickAndAdvance<K extends "niche" | "stage" | "tone">(key: K, value: InterviewAnswers[K]) {
    setAnswers((cur) => ({ ...cur, [key]: value }));
    advance();
  }

  function toggleDesire(d: Desire) {
    setAnswers((cur) => ({
      ...cur,
      desires: cur.desires.includes(d)
        ? cur.desires.filter((x) => x !== d)
        : [...cur.desires, d],
    }));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Couldn't save your answers. Try again, or continue. You can redo this in Settings.");
        setSaving(false);
        return;
      }
      clearInterviewAnswers();
      onDone(answers);
    } catch {
      setError("Couldn't save your answers. Try again, or continue. You can redo this in Settings.");
      setSaving(false);
    }
  }

  const QUESTION: Record<InterviewSub, { kicker: string; title: string; sub: string }> = {
    niche: {
      kicker: "Getting to know you · 1 of 4",
      title: "What kind of coach are you?",
      sub: "Your assistant tunes everything it writes and suggests to your lane.",
    },
    stage: {
      kicker: "Getting to know you · 2 of 4",
      title: "Where's the business right now?",
      sub: "No wrong answer. It just changes what your assistant pushes first.",
    },
    tone: {
      kicker: "Getting to know you · 3 of 4",
      title: "How should your assistant talk to you?",
      sub: "It works for you. It should sound the way you want it to.",
    },
    desires: {
      kicker: "Getting to know you · 4 of 4",
      title: "What do you want from your ideal assistant?",
      sub: cameFromTeaser
        ? "You told us some of this already, it carried over. Adjust or confirm."
        : "Pick everything that's true. This becomes its job description.",
    },
  };

  const q = QUESTION[sub];

  return (
    // Same rhythm as /meet: one question, optically centered, each sub-step
    // rising in fresh (key remount). Single-choice taps auto-advance.
    <div key={sub} className="rise-in space-y-8 max-w-2xl mx-auto flex flex-col justify-center min-h-[calc(100dvh-320px)] w-full">
      <div className="space-y-3">
        <Badge tone="brand" size="xs" uppercase>Step 1 of 5 · The interview</Badge>
        <h2 className="text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
          {subIdx === 0 ? `${firstName ? `${firstName}, your` : "Your"} assistant has a few questions.` : q.title}
        </h2>
        {subIdx === 0 && (
          <h3 className="text-[length:var(--t-h3)] font-bold text-[color:var(--text)] pt-2">{q.title}</h3>
        )}
        <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)]">
          {q.sub}
        </p>
        <p className="text-[length:var(--t-caption)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
          {q.kicker}
        </p>
      </div>

      {sub === "niche" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {NICHE_OPTIONS.map((o) => (
            <InterviewChoice
              key={o.value}
              label={o.label}
              active={answers.niche === o.value}
              onClick={() => pickAndAdvance("niche", o.value)}
            />
          ))}
        </div>
      )}

      {sub === "stage" && (
        <div className="grid grid-cols-1 gap-3">
          {STAGE_OPTIONS.map((o) => (
            <InterviewChoice
              key={o.value}
              label={o.label}
              active={answers.stage === o.value}
              onClick={() => pickAndAdvance("stage", o.value)}
            />
          ))}
        </div>
      )}

      {sub === "tone" && (
        <div className="grid grid-cols-1 gap-3">
          {TONE_OPTIONS.map((o) => (
            <InterviewChoice
              key={o.value}
              label={o.label}
              active={answers.tone === o.value}
              onClick={() => pickAndAdvance("tone", o.value)}
            />
          ))}
        </div>
      )}

      {sub === "desires" && (
        <>
          <div className="grid grid-cols-1 gap-3">
            {DESIRE_OPTIONS.map((o) => (
              <InterviewChoice
                key={o.value}
                label={o.label}
                active={answers.desires.includes(o.value)}
                check
                onClick={() => toggleDesire(o.value)}
              />
            ))}
          </div>

          {error && (
            <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]" role="alert">{error}</p>
          )}

          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => onDone(error ? answers : null)}
              className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] underline decoration-dotted underline-offset-4"
            >
              {error ? "Continue anyway" : "Skip this"}
            </button>
            <Button
              onClick={submit}
              disabled={saving || answers.desires.length === 0}
              className="h-12 px-6"
            >
              {saving ? "Briefing your assistant…" : "Hand it the job →"}
            </Button>
          </div>
        </>
      )}

      {sub !== "desires" && (
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={subIdx === 0 ? () => onDone(null) : () => setSub(INTERVIEW_SUBS[subIdx - 1])}
            className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] underline decoration-dotted underline-offset-4"
          >
            {subIdx === 0 ? "Skip this" : "← Back"}
          </button>
          <div className="flex items-center gap-1.5" aria-hidden>
            {INTERVIEW_SUBS.map((s, i) => (
              <div
                key={s}
                className={`h-1.5 rounded-full transition-all ${
                  i < subIdx ? "w-5 bg-[var(--brand)]" : i === subIdx ? "w-8 bg-[var(--brand-strong)]" : "w-5 bg-[var(--border)]"
                }`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InterviewChoice({
  label,
  active,
  check = false,
  onClick,
}: {
  label: string;
  active: boolean;
  check?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-4 rounded-[var(--r-lg)] border transition font-bold text-[length:var(--t-body)] flex items-center gap-3 ${
        active
          ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] ring-2 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)] text-[color:var(--text)]"
          : "border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--text-muted)] text-[color:var(--text)]"
      }`}
    >
      {check && (
        <span
          className={`w-5 h-5 rounded-[var(--r-sm)] border flex items-center justify-center text-xs font-extrabold shrink-0 ${
            active
              ? "bg-[var(--brand)] border-[var(--brand-strong)] text-[color:var(--text-inverse)]"
              : "border-[var(--border)] text-transparent"
          }`}
          aria-hidden
        >
          ✓
        </span>
      )}
      {label}
    </button>
  );
}

// ── Step 1: Hello ──────────────────────────────────────────────────────────

function HelloStep({
  firstName,
  reflection,
  onContinue,
}: {
  firstName: string;
  /** The interview echoed back ("You said X, so that's where we start"). */
  reflection: string | null;
  onContinue: () => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-6 lg:gap-8 items-stretch">
      <section className="flex flex-col justify-between gap-8 min-h-[520px] py-4">
        <div>
          <Badge tone="brand" size="xs" uppercase>
            Step 2 of 5 · Welcome
          </Badge>
          <h1 className="font-display text-[length:var(--t-display)] font-bold tracking-tight text-[color:var(--text)] mt-3 leading-[var(--leading-tight)] max-w-2xl">
            No lead slips. No reply sounds fake.
          </h1>
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-5 max-w-xl leading-[var(--leading-relaxed)]">
            Hi{firstName ? `, ${firstName}` : ""}. In a few minutes, this app
            learns your voice and turns new conversations into clean next
            messages you would actually send.
          </p>
          {reflection && (
            <p className="mt-4 max-w-xl rounded-[var(--r-md)] border border-[var(--brand-strong)] bg-[var(--brand-soft)] px-4 py-3 text-[length:var(--t-body)] font-bold text-[color:var(--text)] leading-[var(--leading-relaxed)]">
              {reflection}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <OnboardingPromise n={1} title="Build voice" body="Five sharp answers." />
          <OnboardingPromise n={2} title="See proof" body="Generic AI vs you." />
          <OnboardingPromise n={3} title="Rescue leads" body="Start with revenue." />
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="self-start inline-flex items-center justify-center h-12 px-6 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] text-[length:var(--t-body)] font-extrabold hover:bg-[var(--brand-strong)] transition"
        >
          Let's go →
        </button>
      </section>

      <section className="rounded-[var(--r-lg)] bg-[var(--navy)] text-[color:var(--text-inverse)] p-6 sm:p-7 flex flex-col justify-between min-h-[520px] shadow-[var(--shadow-lg)]">
        <div>
          <div className="inline-flex items-center h-7 px-2.5 rounded-[var(--r-pill)] bg-white/10 text-[length:var(--t-caption)] font-bold text-white/70">
            Home inside the app
          </div>
          <div className="mt-8 space-y-4">
            <div className="rounded-[var(--r-md)] bg-white/[0.06] border border-white/10 p-4">
              <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand-bright)]">
                Lead Rescue
              </div>
              <div className="text-3xl font-bold tracking-tight mt-2">
                5 conversations need you.
              </div>
              <p className="text-[length:var(--t-caption)] text-white/60 mt-2 leading-[var(--leading-base)]">
                Follow-up was promised. Two are going cold. One is ready for a
                call invite.
              </p>
            </div>

            <div className="rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] p-4">
              <div className="text-[length:var(--t-caption)] font-extrabold">
                Draft ready
              </div>
              <p className="text-[length:var(--t-body)] font-bold leading-[var(--leading-snug)] mt-2">
                "You do not need more pressure here. You need one honest next
                move."
              </p>
            </div>
          </div>
        </div>

        <p className="text-[length:var(--t-caption)] text-white/55 leading-[var(--leading-base)]">
          The CRM disappears. The next real message stays.
        </p>
      </section>
    </div>
  );
}

function OnboardingPromise({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4">
      <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--brand-soft)] text-[color:var(--text)] font-extrabold text-[length:var(--t-caption)]">
        {n}
      </div>
      <div className="text-[length:var(--t-body)] font-bold text-[color:var(--text)] mt-3">
        {title}
      </div>
      <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">
        {body}
      </div>
    </div>
  );
}

// Poll the async Instagram import job until it finishes. The Apify scrape
// (~55s) runs server-side; we poll the status endpoint instead of blocking
// one long request.
async function pollInstagramImport(
  importId: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<
  | { ok: true; units: number; patterns: Array<{ label: string; text: string }> }
  | { ok: false; error: string }
> {
  const intervalMs = opts.intervalMs ?? 3000;
  const maxAttempts = opts.maxAttempts ?? 30; // ~90s ceiling
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    let json: {
      status?: string;
      itemsImported?: number;
      learnedPatterns?: Array<{ label: string; text: string }>;
      error?: string;
    };
    try {
      const res = await fetch(`/api/onboarding/import/${encodeURIComponent(importId)}/status`);
      json = await res.json();
    } catch {
      continue; // transient — keep polling
    }
    if (json.status === "complete") {
      return {
        ok: true,
        units: Number(json.itemsImported ?? 0),
        patterns: Array.isArray(json.learnedPatterns) ? json.learnedPatterns : [],
      };
    }
    if (json.status === "failed") {
      return { ok: false, error: String(json.error ?? "Instagram import failed.") };
    }
    // status === "processing" → keep polling
  }
  return { ok: false, error: "Instagram import is taking longer than expected. Try again in a moment." };
}

function OnboardingInstagramImport({
  onImported,
  onContinue,
}: {
  onImported: (signal: ImportedVoiceSignal) => void;
  onContinue: () => void;
}) {
  const [sourceType, setSourceType] = useState<OnboardingImportSource>("instagram");
  const [linkedinMode, setLinkedinMode] = useState<"handle" | "paste">("handle");
  const [newsletterMode, setNewsletterMode] = useState<"url" | "paste">("url");
  const [handle, setHandle] = useState("");
  const [newsletterUrl, setNewsletterUrl] = useState("");
  const [limit, setLimit] = useState("18");
  const [title, setTitle] = useState("");
  const [textImport, setTextImport] = useState("");
  const [loading, setLoading] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [result, setResult] = useState<{
    handle: string;
    captions: number;
    patterns: Array<{ label: string; text: string }>;
  } | null>(null);
  const importReady =
    sourceType === "instagram"
      ? normalizeInstagramHandleForWelcome(handle).length > 0
      : sourceType === "linkedin" && linkedinMode === "handle"
        ? normalizeLinkedInHandleForWelcome(handle).length > 0
        : sourceType === "newsletter" && newsletterMode === "url"
          ? newsletterUrl.trim().length > 0
      : textImport.trim().length >= 120;
  const limitValue = Math.max(3, Math.min(50, Math.round(Number(limit) || 18)));

  async function importVoice() {
    setError(null);
    setResult(null);
    setUpgradeRequired(false);
    if (!importReady) {
      setError(
        sourceType === "instagram"
          ? "Add an Instagram handle or profile URL."
          : sourceType === "linkedin" && linkedinMode === "handle"
            ? "Add a LinkedIn handle or profile URL."
            : sourceType === "newsletter" && newsletterMode === "url"
              ? "Add a beehiiv publication URL or RSS feed URL."
          : "Paste at least a few real paragraphs."
      );
      return;
    }

    setLoading(true);
    try {
      // Instagram → async start + poll. The ~55s Apify scrape runs server-
      // side; we never block one long request. LinkedIn/text stay sync.
      if (sourceType === "instagram") {
        const startRes = await fetch("/api/onboarding/import/instagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle, limit: limitValue }),
        });
        const startPayload = await startRes.json();
        if (!startRes.ok || !startPayload?.importId) {
          setUpgradeRequired(Boolean(startPayload?.upgrade_required));
          setError(String(startPayload?.error ?? "Could not start Instagram import."));
          return;
        }
        const polled = await pollInstagramImport(String(startPayload.importId));
        if (!polled.ok) {
          setError(polled.error);
          return;
        }
        const igHandle = String(startPayload.handle ?? normalizeInstagramHandleForWelcome(handle));
        const next = { handle: igHandle, captions: polled.units, patterns: polled.patterns };
        setResult(next);
        onImported({ source: "instagram", label: igHandle, units: polled.units, patterns: polled.patterns });
        return;
      }

      // LinkedIn / text → existing synchronous routes (unchanged).
      const response = await fetch(
        sourceType === "linkedin" && linkedinMode === "handle"
          ? "/api/voice/import/linkedin"
          : "/api/voice/import/text",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          sourceType === "linkedin" && linkedinMode === "handle"
            ? { handle, limit: limitValue }
            : {
                source_type: sourceType,
                title: title.trim(),
                url: sourceType === "newsletter" && newsletterMode === "url" ? newsletterUrl.trim() : undefined,
                text: textImport.trim(),
              }
        ),
      });
      const payload = await response.json();
      if (!response.ok) {
        setUpgradeRequired(Boolean(payload?.upgrade_required));
        setError(String(payload?.error ?? "Could not import voice."));
        return;
      }

      const next = {
        handle:
          sourceType === "linkedin" && linkedinMode === "handle"
            ? String(payload.handle ?? normalizeLinkedInHandleForWelcome(handle))
            : onboardingImportLabel(sourceType),
        captions: Number(payload.captions_used ?? payload.imported_units ?? 0),
        patterns: Array.isArray(payload.learned_patterns) ? payload.learned_patterns : [],
      };
      setResult(next);
      onImported({
        source: sourceType,
        label: next.handle,
        units: next.captions,
        patterns: next.patterns,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function startUpgrade() {
    setUpgrading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", { method: "POST" });
      const payload = await response.json();
      if (!response.ok || !payload?.url) {
        setError(String(payload?.error ?? "Could not start checkout."));
        return;
      }
      window.location.href = payload.url;
    } catch (err) {
      setError(String(err));
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <Card
      padding="lg"
      className="border-[color-mix(in_srgb,var(--brand)_32%,var(--border))] bg-[linear-gradient(135deg,var(--surface-elevated)_0%,var(--surface-elevated)_66%,var(--brand-soft)_100%)]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-stretch">
        <div>
          <Badge tone="brand" size="xs" uppercase>
            Recommended first
          </Badge>
          <h3 className="mt-2 text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)] leading-[var(--leading-tight)]">
            Import the voice they already trust.
          </h3>
          <p className="mt-1.5 max-w-2xl text-[length:var(--t-caption)] leading-[var(--leading-relaxed)] text-[color:var(--text-muted)]">
            This is the fastest setup path. Instagram, LinkedIn, or newsletter
            writing becomes the first training ledger, so the proof draft starts
            from real language instead of a blank interview.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-[var(--r-md)] bg-[var(--surface-deep)] p-1">
            {(["instagram", "linkedin", "newsletter"] as OnboardingImportSource[]).map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => {
                  setSourceType(source);
                  setError(null);
                  setResult(null);
                  setUpgradeRequired(false);
                }}
                className={[
                  "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                  sourceType === source
                    ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                    : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                ].join(" ")}
              >
                {onboardingImportLabel(source)}
              </button>
            ))}
          </div>

          {sourceType === "instagram" || (sourceType === "linkedin" && linkedinMode === "handle") ? (
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
              {sourceType === "linkedin" && (
                <div className="sm:col-span-2 grid grid-cols-2 gap-2 rounded-[var(--r-md)] bg-[var(--surface-deep)] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setLinkedinMode("handle");
                      setError(null);
                      setResult(null);
                    }}
                    className={[
                      "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                      linkedinMode === "handle"
                        ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                    ].join(" ")}
                  >
                    Handle / URL
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLinkedinMode("paste");
                      setError(null);
                      setResult(null);
                    }}
                    className={[
                      "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                      linkedinMode === "paste"
                        ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                    ].join(" ")}
                  >
                    Paste posts
                  </button>
                </div>
              )}
              <label className="block space-y-1">
                <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                  {sourceType === "instagram" ? "Instagram handle" : "LinkedIn handle"}
                </span>
                <input
                  value={handle}
                  onChange={(event) => {
                    setHandle(event.target.value);
                    setError(null);
                    setResult(null);
                  }}
                  className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                  placeholder={sourceType === "instagram" ? "@coachname" : "handle or linkedin.com/in/profile"}
                />
              </label>
              <label className="block space-y-1">
                <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                  Posts
                </span>
                <input
                  type="number"
                  min="3"
                  max="50"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                />
              </label>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {sourceType === "newsletter" && (
                <div className="grid grid-cols-2 gap-2 rounded-[var(--r-md)] bg-[var(--surface-deep)] p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setNewsletterMode("url");
                      setError(null);
                      setResult(null);
                    }}
                    className={[
                      "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                      newsletterMode === "url"
                        ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                    ].join(" ")}
                  >
                    URL / RSS
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewsletterMode("paste");
                      setError(null);
                      setResult(null);
                    }}
                    className={[
                      "h-9 rounded-[var(--r-sm)] text-[length:var(--t-caption)] font-extrabold transition",
                      newsletterMode === "paste"
                        ? "bg-[var(--surface-elevated)] text-[color:var(--text)] shadow-[var(--shadow-xs)]"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
                    ].join(" ")}
                  >
                    Paste issue
                  </button>
                </div>
              )}
              {sourceType === "newsletter" && newsletterMode === "url" && (
                <label className="block space-y-1">
                  <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                    Newsletter URL
                  </span>
                  <input
                    value={newsletterUrl}
                    onChange={(event) => {
                      setNewsletterUrl(event.target.value);
                      setError(null);
                      setResult(null);
                    }}
                    className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                    placeholder="https://sunnys-newsletter.beehiiv.com/ or RSS feed URL"
                  />
                </label>
              )}
              <label className="block space-y-1">
                <span className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                  Title
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                  placeholder={sourceType === "linkedin" ? "LinkedIn posts from May" : "Newsletter issue or welcome sequence"}
                />
              </label>
              {(sourceType !== "newsletter" || newsletterMode === "paste") && (
              <textarea
                value={textImport}
                onChange={(event) => {
                  setTextImport(event.target.value);
                  setError(null);
                  setResult(null);
                }}
                rows={7}
                className="w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2.5 text-[length:var(--t-body)] text-[color:var(--text)] focus:outline-none focus:border-[var(--brand-strong)]"
                placeholder={
                  sourceType === "linkedin"
                    ? "Paste a few LinkedIn posts with hooks, stories, and CTAs."
                    : "Paste one newsletter, a welcome sequence, or an email that sounds unmistakably like you."
                }
              />
              )}
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-[var(--r-md)] bg-[var(--danger-soft)] px-3 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--danger)]">
              {error}
            </p>
          )}
          {result && (
            <div className="mt-4 rounded-[var(--r-lg)] bg-[var(--brand-soft)] p-4">
              <p className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                Imported {sourceType === "instagram" ? `@${result.handle}` : result.handle}: {result.captions} source unit{result.captions === 1 ? "" : "s"} are now part of the Voice Asset.
              </p>
              {result.patterns.length > 0 && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {result.patterns.map((pattern) => (
                    <div
                      key={`${pattern.label}:${pattern.text}`}
                      className="rounded-[var(--r-md)] bg-[var(--surface-elevated)] p-3"
                    >
                      <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                        {pattern.label}
                      </div>
                      <div className="mt-1 text-[length:var(--t-caption)] font-bold leading-[var(--leading-base)] text-[color:var(--text)]">
                        {pattern.text}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-[var(--r-lg)] bg-[var(--navy)] p-4 text-[color:var(--text-inverse)] flex flex-col justify-between gap-5">
          <div>
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand-bright)]">
              Why this is first
            </div>
            <div className="mt-3 space-y-2">
              <OnboardingImportRow
                label="Published language"
                value={sourceType === "instagram" ? `+${limitValue}` : `+${Math.max(1, textImport.split(/\n{2,}/).filter((block) => block.trim().length >= 40).length)}`}
              />
              <OnboardingImportRow label={`${onboardingImportLabel(sourceType)} mode`} value="Created" />
              <OnboardingImportRow label="Training ledger" value="Visible" />
            </div>
            <p className="mt-3 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-white/55">
              One source import is included each month. Upgrade when you
              want to train from more public source material.
            </p>
            {upgradeRequired && (
              <div className="mt-3 rounded-[var(--r-md)] bg-white/[0.06] p-3">
                <div className="text-[length:var(--t-caption)] font-extrabold text-white">
                  Monthly import used
                </div>
                <p className="mt-1 text-[length:var(--t-caption)] text-white/60 leading-[var(--leading-base)]">
                  Upgrade to unlock more imports this month.
                </p>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Button
              onClick={importVoice}
              disabled={loading || !importReady}
              block
            >
              {loading ? "Importing..." : `Import ${onboardingImportLabel(sourceType)} voice`}
            </Button>
            {result && (
              <Button variant="ghost" onClick={onContinue} block>
                Continue to proof
              </Button>
            )}
            {upgradeRequired && (
              <Button variant="ghost" onClick={startUpgrade} disabled={upgrading} block>
                {upgrading ? "Opening checkout..." : "Upgrade for more imports"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ImportedVoiceFooter({ onContinue }: { onContinue: () => void }) {
  return (
    <Card padding="md" className="border-[var(--border-faint)] bg-[var(--surface-elevated)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Badge tone="brand" size="xs" uppercase>
            Instagram trained
          </Badge>
          <p className="mt-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
            Import is complete, so it moves down here. The questions above are
            now optional sharpening, not the primary setup path.
          </p>
        </div>
        <Button onClick={onContinue}>
          Continue to proof
        </Button>
      </div>
    </Card>
  );
}

function onboardingImportLabel(source: OnboardingImportSource): string {
  if (source === "instagram") return "Instagram";
  if (source === "linkedin") return "LinkedIn";
  return "Newsletter";
}

function OnboardingImportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--r-md)] bg-white/[0.06] px-3 py-2">
      <span className="text-[length:var(--t-caption)] font-bold text-white/60">
        {label}
      </span>
      <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--brand-bright)] tabular-nums">
        {value}
      </span>
    </div>
  );
}

function normalizeInstagramHandleForWelcome(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
}

function normalizeLinkedInHandleForWelcome(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?linkedin\.com\/(in|company)\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim();
}

function importedSignalFromProfile(profile: VoiceProfile): ImportedVoiceSignal | null {
  const voiceJson = profile.voice_json as Record<string, unknown>;
  const training = (voiceJson.training_signal ?? {}) as Record<string, unknown>;
  const modes = (voiceJson.voice_modes ?? {}) as Record<string, unknown>;
  const source: OnboardingImportSource | null =
    typeof training.instagram_imports === "number" && training.instagram_imports > 0
      ? "instagram"
      : typeof training.linkedin_imports === "number" && training.linkedin_imports > 0
        ? "linkedin"
        : typeof training.newsletter_imports === "number" && training.newsletter_imports > 0
          ? "newsletter"
          : null;
  if (!source) return null;
  const mode = (modes[source] ?? {}) as Record<string, unknown>;
  const fingerprint = (mode.fingerprint ?? {}) as Record<string, unknown>;
  return {
    source,
    label: source === "instagram" && typeof mode.handle === "string"
      ? `@${mode.handle}`
      : onboardingImportLabel(source),
    units:
      typeof mode.captions_used === "number"
        ? mode.captions_used
        : typeof mode.imported_units === "number"
          ? mode.imported_units
          : 1,
    patterns: Array.isArray(fingerprint.learned_patterns)
      ? fingerprint.learned_patterns as Array<{ label: string; text: string }>
      : [],
  };
}

// ── Step 3: Magic moment ───────────────────────────────────────────────────

function MagicStep({
  firstName,
  inbound,
  setInbound,
  presets,
  drafting,
  draft,
  genericDraft,
  importedSignal,
  error,
  onGenerate,
  onContinue,
  onTryAgain,
  coachFirstName,
}: {
  firstName: string;
  inbound: string;
  setInbound: (s: string) => void;
  presets: Array<{ label: string; text: string }>;
  drafting: boolean;
  draft: string | null;
  genericDraft: string | null;
  importedSignal: ImportedVoiceSignal | null;
  error: string | null;
  onGenerate: () => void;
  onContinue: () => void;
  onTryAgain: () => void;
  coachFirstName: string;
}) {
  // Share state, scoped to this step. We render the side-by-side reveal
  // into a 1080x1500 PNG and either fire the system share sheet or fall
  // back to a download. Only relevant in the post-reveal branch.
  const [sharing, setSharing] = useState(false);
  const [shareConfirm, setShareConfirm] = useState<null | "share" | "download">(
    null
  );
  const [shareError, setShareError] = useState<string | null>(null);

  async function onShare() {
    if (!draft || !genericDraft) return;
    setShareError(null);
    setSharing(true);
    try {
      const blob = await renderShareCard({
        inbound: inbound.trim(),
        generic: genericDraft,
        voice: draft,
        coachFirstName,
      });
      const result = await shareOrDownload(blob);
      setShareConfirm(result.method);
      // Clear the toast after a moment so it doesn't overstay.
      setTimeout(() => setShareConfirm(null), 4000);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : String(err));
    } finally {
      setSharing(false);
    }
  }

  if (draft) {
    // Reveal — the moment that converts the price tag.
    //
    // Layout strategy (the screenshot bar):
    //   - Inbound message at the top, quoted and dimmed.
    //   - Two cards underneath. On desktop they sit side-by-side; on
    //     mobile they stack with Generic on top, Voice on bottom (so the
    //     LAST thing the coach reads is the version that's theirs — the
    //     one that earns the share).
    //   - Generic side: muted gray, smaller label, neutral.
    //     Voice side:   brand-green border + soft-green wash, "↓ this one"
    //                   accent so the eye lands here second.
    //   - "vs" divider in the middle communicates the comparison without
    //     adding chrome.
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Badge tone="brand" size="xs" uppercase>
              Step 4 of 5 · The proof
            </Badge>
            <h2 className="text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] mt-2 leading-[var(--leading-tight)]">
              This is the share moment.
            </h2>
            <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-2 max-w-xl leading-[var(--leading-relaxed)]">
              Same lead. Same model. The only difference is whether the AI knows
              how you actually sound.
            </p>
            {importedSignal && (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--brand)_32%,var(--border))] bg-[var(--brand-soft)] px-3 py-1 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
                Using {onboardingImportLabel(importedSignal.source)} mode
                <span className="h-1 w-1 rounded-full bg-[var(--brand)]" />
                trained on {importedSignal.units} source unit{importedSignal.units === 1 ? "" : "s"}
              </div>
            )}
          </div>
          {genericDraft && (
            <button
              type="button"
              onClick={onShare}
              disabled={sharing}
              className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] transition disabled:opacity-50"
              title="Save this side-by-side as an image you can send to a coach friend"
            >
              <Share2 size={16} aria-hidden />
              {sharing ? "Rendering" : "Share proof"}
            </button>
          )}
        </div>

        {/* Side-by-side reveal. When generic_draft is present, render the
            comparison; otherwise (rare — Edge Function fallback) show the
            voice card alone so the moment never feels broken. */}
        {genericDraft ? (
          <section className="rounded-[var(--r-lg)] bg-[var(--navy)] text-[color:var(--text-inverse)] p-4 sm:p-6 shadow-[var(--shadow-lg)]">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
              <div>
                <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand-bright)]">
                  Inbound message
                </div>
                <p className="text-[length:var(--t-body)] text-white/78 leading-[var(--leading-relaxed)] italic mt-1 max-w-3xl">
                  &ldquo;{inbound.trim()}&rdquo;
                </p>
              </div>
              <div className="rounded-[var(--r-pill)] bg-white/10 px-3 py-1 text-[length:var(--t-caption)] font-bold text-white/65">
                side by side
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
              <div className="rounded-[var(--r-md)] bg-white/[0.06] border border-white/10 p-5 flex flex-col">
                <div className="text-[length:var(--t-caption)] text-white/45 font-bold mb-3">
                  Generic AI
                </div>
                <p className="text-[length:var(--t-body)] text-white/62 leading-[var(--leading-relaxed)] whitespace-pre-wrap flex-1">
                  {genericDraft}
                </p>
                <div className="text-[length:var(--t-caption)] font-bold text-white/38 mt-4 pt-3 border-t border-white/10">
                  Polite. Usable. Forgettable.
                </div>
              </div>

              <div className="hidden md:flex items-center justify-center px-1" aria-hidden>
                <span className="text-[length:var(--t-h3)] font-extrabold text-white/30 tracking-tight">
                  vs
                </span>
              </div>

              <div className="rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] p-5 flex flex-col shadow-[var(--shadow-md)]">
                <div className="text-[length:var(--t-caption)] font-extrabold mb-3 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--navy)]" />
                  Your voice
                </div>
                {importedSignal && (
                  <div className="mb-3 rounded-[var(--r-pill)] bg-[color-mix(in_srgb,var(--navy)_10%,transparent)] px-3 py-1 text-[length:var(--t-caption)] font-extrabold">
                    Using imported {onboardingImportLabel(importedSignal.source)} voice
                  </div>
                )}
                <p className="text-[length:var(--t-body)] leading-[var(--leading-relaxed)] whitespace-pre-wrap font-semibold flex-1">
                  {draft}
                </p>
                <div className="text-[length:var(--t-caption)] font-extrabold mt-4 pt-3 border-t border-[color-mix(in_srgb,var(--navy)_18%,transparent)]">
                  Sounds like a message you would actually send.
                </div>
              </div>
            </div>
          </section>
        ) : (
          // Fallback — generic call failed; still show the voice version.
          <Card
            padding="lg"
            className="bg-[var(--brand-soft)] border-2 border-[var(--brand)]"
          >
            <div className="text-[length:var(--t-label)] uppercase tracking-widest text-[color:var(--text)] font-bold mb-3">
              Your voice
            </div>
            <p className="text-[length:var(--t-body)] text-[color:var(--text)] leading-[var(--leading-relaxed)] whitespace-pre-wrap">
              {draft}
            </p>
          </Card>
        )}

        <div className="flex items-center justify-between flex-wrap gap-3">
          <button
            type="button"
            onClick={onTryAgain}
            className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] underline decoration-dotted underline-offset-4"
          >
            Try a different message
          </button>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={onContinue}
              className="inline-flex items-center justify-center h-12 px-6 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] text-[length:var(--t-body)] font-extrabold hover:bg-[var(--brand-strong)] transition"
            >
              That&rsquo;s me. Continue →
            </button>
          </div>
        </div>

        {shareConfirm && (
          <div
            role="status"
            className="rounded-[var(--r-md)] bg-[var(--brand-soft)] border border-[var(--brand)] px-4 py-3 text-[length:var(--t-caption)] font-bold text-[color:var(--text)]"
          >
            {shareConfirm === "share"
              ? "Opened share sheet. Send it."
              : "Saved to your downloads. The image is yours to send."}
          </div>
        )}

        {shareError && (
          <p
            className="text-[length:var(--t-caption)] text-[#B42318]"
            role="alert"
          >
            Couldn&rsquo;t render the image: {shareError}
          </p>
        )}
      </div>
    );
  }

  // Input — paste or pick a preset.
  return (
    <div className="space-y-6">
      <div>
        <Badge tone="brand" size="xs" uppercase>
          Step 4 of 5 · Watch your voice work
        </Badge>
        {importedSignal && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--brand)_32%,var(--border))] bg-[var(--brand-soft)] px-3 py-1 text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
            Drafting with imported {onboardingImportLabel(importedSignal.source)} voice
            <span className="h-1 w-1 rounded-full bg-[var(--brand)]" />
            {importedSignal.units} source unit{importedSignal.units === 1 ? "" : "s"}
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-end mt-2">
          <div>
            <h2 className="text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
              Give it one lead message.
            </h2>
            <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-2 max-w-xl leading-[var(--leading-relaxed)]">
              Paste a real DM, a Calendly line, or use a preset. The next
              screen is the proof.
            </p>
          </div>
          <div className="rounded-[var(--r-md)] bg-[var(--surface-deep)] border border-[var(--border)] p-4">
            <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
              Good input sounds like
            </div>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)] mt-1">
              Human, messy, specific. Not a polished prompt.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setInbound(p.text)}
            className="inline-flex items-center h-9 px-3 rounded-[var(--r-pill)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text-muted)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] hover:text-[color:var(--text)] transition"
          >
            {p.label}
          </button>
        ))}
      </div>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border-faint)] flex items-center justify-between gap-3">
          <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
            Lead message
          </span>
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
            {inbound.trim().length} chars
          </span>
        </div>
        <textarea
          value={inbound}
          onChange={(e) => setInbound(e.target.value)}
          rows={7}
          placeholder="Hey, saw your post. Really hit. Curious what working with you looks like?"
          className="w-full p-5 text-[length:var(--t-body)] font-medium leading-[var(--leading-relaxed)] bg-[var(--surface-elevated)] focus:outline-none resize-none"
        />
        {error && (
          <p className="text-[length:var(--t-caption)] text-[#B42318] px-5 pb-4">
            {error}
          </p>
        )}
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onGenerate}
          disabled={drafting || inbound.trim().length < 10}
          className="inline-flex items-center gap-2 justify-center h-12 px-6 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] text-[length:var(--t-body)] font-extrabold hover:bg-[var(--brand-strong)] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {drafting ? (
            <>
              <span
                className="inline-block w-2 h-2 rounded-full bg-current animate-pulse"
                aria-hidden
              />
              Writing in your voice…
            </>
          ) : (
            <>Show me →</>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Step 4: Done ───────────────────────────────────────────────────────────

function DoneStep({ firstName }: { firstName: string }) {
  return (
    <div className="space-y-6">
      <div>
        <Badge tone="brand" size="xs" uppercase>
          Step 5 of 5 · You're set up
        </Badge>
        <h1 className="font-display text-[length:var(--t-display)] font-bold tracking-tight text-[color:var(--text)] mt-2 leading-[var(--leading-tight)]">
          That's it{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="text-[length:var(--t-body)] text-[color:var(--text)] mt-4 max-w-xl leading-[var(--leading-relaxed)]">
          From now on, every time a real lead lands, the AI writes back in
          your voice automatically. You review. You edit. You send. Or you
          let it ship as-is when it's right.
        </p>
      </div>

      <Card padding="lg" className="bg-[var(--surface-elevated)]">
        <div className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-bold uppercase tracking-wider mb-3">
          What's next
        </div>
        <ul className="space-y-3 text-[length:var(--t-body)] text-[color:var(--text)] leading-[var(--leading-relaxed)]">
          <li className="flex gap-3">
            <Bullet />
            <span>
              <strong>Add your first lead.</strong> Voice it in, paste a
              screenshot, or import a CSV.
            </span>
          </li>
          <li className="flex gap-3">
            <Bullet />
            <span>
              <strong>Watch your inbox fill.</strong> Each new lead gets an
              auto-draft within ~30 seconds.
            </span>
          </li>
          <li className="flex gap-3">
            <Bullet />
            <span>
              <strong>Refine your voice anytime.</strong> Voice page →
              Refine. New version, old versions kept.
            </span>
          </li>
        </ul>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
        <a
          href="/command-center"
          className="inline-flex items-center justify-center h-12 px-5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-body)] font-bold hover:border-[var(--border-strong)] transition"
        >
          Just take me to the app
        </a>
        <a
          href="/leads/capture"
          className="inline-flex items-center justify-center h-12 px-6 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--text-inverse)] text-[length:var(--t-body)] font-extrabold hover:bg-[var(--brand-strong)] transition"
        >
          Add my first lead →
        </a>
      </div>
    </div>
  );
}

function Bullet() {
  return (
    <span
      className="shrink-0 inline-block w-2 h-2 rounded-full bg-[var(--brand)] mt-2"
      aria-hidden
    />
  );
}

// ── Progress dots ──────────────────────────────────────────────────────────

function ProgressDots({ step }: { step: Step }) {
  const order: Step[] = ["interview", "hello", "voice", "magic", "done"];
  const idx = order.indexOf(step);
  return (
    <div className="flex items-center gap-1.5" aria-label="Onboarding progress">
      {order.map((s, i) => (
        <div
          key={s}
          className={`h-1.5 rounded-full transition-all ${
            i < idx
              ? "w-6 bg-[var(--brand)]"
              : i === idx
              ? "w-10 bg-[var(--brand-strong)]"
              : "w-6 bg-[var(--border)]"
          }`}
          aria-current={i === idx ? "step" : undefined}
        />
      ))}
    </div>
  );
}
