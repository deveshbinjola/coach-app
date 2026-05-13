"use client";

// VoiceSetupFlow, native in-app replacement for the Brand OS iframe.
//
// 5 voice-revealing questions, asked one at a time. Coach types or speaks
// (Wispr Flow / dictation works in any textarea). Each answer reveals tone,
// vocabulary, sentence rhythm, signature beliefs, and anti-patterns.
//
// Pipeline:
//   answers → voice-mine Edge Function (interview mode) →
//   voice_json + sample_messages → save as cp_voice_profiles row (active=true)
//
// Used in two places:
//   1. /voice (when no profile yet, replaces the old iframe Brand OS embed)
//   2. /welcome (onboarding magic moment, step 2 of 4)
//
// Both share the same UX so the muscle memory transfers.

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Badge, Button, Card } from "@/components/ui";
import { getVoiceProfile, DEFAULT_VOICE_PROFILE_SLUG, type VoiceProfileSlug } from "@/lib/voice-profiles";

// 5 questions chosen for maximum voice-fidelity-per-second:
//   Q1 → core belief (reveals tone, conviction, the "what they always say")
//   Q2 → relational stance (reveals warmth, directness, who they're for)
//   Q3 → signature phrase (reveals vocabulary, sentence rhythm)
//   Q4 → anti-patterns (reveals do_nots, what they NEVER say)
//   Q5 → the "this is me" gut check (catches anything the first 4 missed)
//
// Each prompt also doubles as a placeholder hint so the coach knows what
// "good" looks like before they start typing.
type Question = { id: string; q: string; hint: string; placeholder: string };

// Build the 5 voice-revealing questions from the coach's voice profile.
// Q1-Q3 pull profile-specific cues from lib/voice-profiles.ts.
// Q4-Q5 are profile-neutral (works for every coach).
function buildQuestions(slug: VoiceProfileSlug): Question[] {
  const profile = getVoiceProfile(slug);
  const c = profile.voiceTrainerCues;
  return [
    { id: "belief",    ...c.belief },
    { id: "afraid",    ...c.afraid },
    { id: "signature", ...c.signature },
    {
      id: "never",
      q: "What do you NEVER say? What's not your voice?",
      hint: "Words, phrases, or vibes that would make you cringe if you saw them under your name.",
      placeholder:
        "Things like 'crushing it', 'dropping value', 'I hope this email finds you well', emojis after every sentence. Whatever's not you.",
    },
    {
      id: "for",
      q: "When a prospective client asks 'is this for me?' — what do you tell them?",
      hint: "Who you're for. Who you're not for. The line you draw without apologizing.",
      placeholder:
        "If they're looking for a quick fix, they're in the wrong place. If they're ready to actually feel something and follow through, they're home.",
    },
  ];
}

type Answer = { id: string; q: string; a: string };

type Props = {
  /** Where to send the coach after a successful save. Default: /voice */
  redirectTo?: string;
  /** Called instead of redirecting. If provided, takes precedence over redirectTo. */
  onComplete?: (versionSaved: number) => void;
  /** Visual mode. "standalone" includes its own header. "embedded" is for use inside an existing page. */
  variant?: "standalone" | "embedded";
  /** Audience-aware voice profile. Drives Q1–Q3 cue copy. Default: Sunny baseline. */
  profileSlug?: VoiceProfileSlug;
};

export default function VoiceSetupFlow({
  redirectTo = "/voice",
  onComplete,
  variant = "standalone",
  profileSlug = DEFAULT_VOICE_PROFILE_SLUG,
}: Props) {
  const supabase = createClient();

  // Questions branch by the coach's voice profile.
  const QUESTIONS = buildQuestions(profileSlug);

  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [building, setBuilding] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion = QUESTIONS[stepIndex];
  const isLast = stepIndex === QUESTIONS.length - 1;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] ?? "" : "";
  const canContinue = currentAnswer.trim().length >= 10;

  // Counts substantive answers (≥10 chars). Coach can skip a question by
  // leaving it blank; we just need 3+ non-empty by the end.
  const substantiveCount = QUESTIONS.filter(
    (q) => (answers[q.id] ?? "").trim().length >= 10
  ).length;

  function setAnswer(id: string, a: string) {
    setAnswers((prev) => ({ ...prev, [id]: a }));
  }

  function next() {
    if (!isLast) {
      setStepIndex((i) => i + 1);
    }
  }

  function back() {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  async function buildVoice() {
    setError(null);
    if (substantiveCount < 3) {
      setError(
        `Need at least 3 substantive answers to extract a voice. Got ${substantiveCount}.`
      );
      return;
    }
    setBuilding(true);
    try {
      // Build the interview payload, only include answered questions.
      const interview: Answer[] = QUESTIONS.map((q) => ({
        id: q.id,
        q: q.q,
        a: (answers[q.id] ?? "").trim(),
      })).filter((item) => item.a.length >= 10);

      const { data, error: invokeErr } = await supabase.functions.invoke(
        "voice-mine",
        { body: { interview: interview.map(({ q, a }) => ({ q, a })) } }
      );
      if (invokeErr) {
        setError(invokeErr.message);
        return;
      }
      const r = data as {
        voice_json?: unknown;
        sample_messages?: string[];
        error?: string;
      };
      if (r.error) {
        setError(r.error);
        return;
      }
      if (!r.voice_json) {
        setError("Voice profile didn't come back. Try again.");
        return;
      }

      // Save to cp_voice_profiles. Same versioning pattern as VoiceMinePanel.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated. Sign in again.");
        return;
      }

      const { data: latest } = await supabase
        .from("cp_voice_profiles")
        .select("version")
        .eq("coach_id", user.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = (latest?.version ?? 0) + 1;

      // Deactivate prior active row, insert new active one.
      await supabase
        .from("cp_voice_profiles")
        .update({ active: false })
        .eq("coach_id", user.id)
        .eq("active", true);

      const { error: insErr } = await supabase
        .from("cp_voice_profiles")
        .insert({
          coach_id: user.id,
          voice_json: {
            ...(r.voice_json as Record<string, unknown>),
            training_signal: {
              ...(((r.voice_json as Record<string, unknown>).training_signal as Record<string, unknown> | undefined) ?? {}),
              interview_answers: substantiveCount,
            },
          },
          sample_messages: r.sample_messages ?? [],
          version: nextVersion,
          active: true,
        });
      if (insErr) {
        setError(insErr.message);
        return;
      }

      setSavedVersion(nextVersion);
      // Hand off to caller (onboarding flow) or default redirect.
      setTimeout(() => {
        if (onComplete) {
          onComplete(nextVersion);
        } else if (typeof window !== "undefined") {
          window.location.href = redirectTo;
        }
      }, 1100);
    } catch (err) {
      setError(String(err));
    } finally {
      setBuilding(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────

  if (savedVersion !== null) {
    return (
      <Card
        padding="lg"
        className="text-center border-2 border-[var(--brand)] bg-[var(--brand-soft)]"
      >
        <div className="text-[length:var(--t-display)] leading-none">✓</div>
        <h2 className="text-[length:var(--t-h2)] font-bold mt-2 text-[color:var(--text)]">
          Your voice is built.
        </h2>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2 max-w-md mx-auto leading-[var(--leading-relaxed)]">
          Saved as version {savedVersion}. Every AI draft from here on writes
          in this voice.
        </p>
      </Card>
    );
  }

  // Question step (one at a time, before the build)
  return (
    <div className="space-y-5">
      {variant === "standalone" && (
        <div>
          <Badge tone="brand" size="xs" uppercase>
            Voice setup · 5 questions · ~90 seconds
          </Badge>
          <h2 className="text-[length:var(--t-h1)] font-extrabold mt-2 text-[color:var(--text)] leading-[var(--leading-tight)]">
            Tell me how you actually talk.
          </h2>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5 max-w-2xl leading-[var(--leading-relaxed)]">
            Speak or type. Use your real words. The AI will pattern-match
            across your answers and build a voice profile every draft routes
            through. Skip any question that doesn&apos;t land. You only need
            three substantive answers.
          </p>
        </div>
      )}

      {/* Step indicator */}
      <div className="flex items-center gap-1.5" aria-label="Progress">
        {QUESTIONS.map((q, i) => (
          <div
            key={q.id}
            className={`h-1 flex-1 rounded-full transition ${
              i < stepIndex
                ? "bg-[var(--brand)]"
                : i === stepIndex
                ? "bg-[var(--brand-strong)]"
                : "bg-[var(--border)]"
            }`}
            aria-current={i === stepIndex ? "step" : undefined}
          />
        ))}
      </div>

      {currentQuestion && (
        <Card padding="lg">
          <div className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-bold uppercase tracking-wider mb-1.5">
            Question {stepIndex + 1} of {QUESTIONS.length}
          </div>
          <h3 className="text-[length:var(--t-h2)] font-bold text-[color:var(--text)] leading-[var(--leading-tight)]">
            {currentQuestion.q}
          </h3>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5 leading-[var(--leading-relaxed)]">
            {currentQuestion.hint}
          </p>

          <textarea
            key={currentQuestion.id}
            value={currentAnswer}
            onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
            rows={6}
            placeholder={currentQuestion.placeholder}
            className="w-full mt-4 p-4 rounded-[var(--r-md)] border border-[var(--border)] text-[length:var(--t-body)] font-medium leading-[var(--leading-relaxed)] bg-[var(--surface-elevated)] focus:outline-none focus:border-[var(--brand-strong)]"
            autoFocus
          />

          <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
            <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              {currentAnswer.trim().length === 0
                ? "Optional. Skip if it doesn't land"
                : canContinue
                ? `${currentAnswer.trim().length} characters · counts as substantive`
                : `${currentAnswer.trim().length} chars · need 10+ to count`}
            </div>
            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={back}
                  className="h-10 px-4 rounded-[var(--r-md)] text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] hover:bg-[var(--surface-deep)] transition"
                >
                  ← Back
                </button>
              )}
              {!isLast ? (
                <Button
                  onClick={next}
                  variant={canContinue ? "primary" : "ghost"}
                >
                  {canContinue ? "Next →" : "Skip →"}
                </Button>
              ) : (
                <Button
                  onClick={buildVoice}
                  disabled={building || substantiveCount < 3}
                >
                  {building ? (
                    <>
                      <span
                        className="inline-block w-2 h-2 rounded-full bg-current animate-pulse"
                        aria-hidden
                      />
                      Building your voice…
                    </>
                  ) : (
                    <>Build my voice ({substantiveCount}/5 answered)</>
                  )}
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {error && (
        <Card
          padding="md"
          className="border-[var(--danger)] bg-[var(--danger-soft)]"
        >
          <p className="text-[length:var(--t-caption)] text-[#B42318]">
            {error}
          </p>
        </Card>
      )}
    </div>
  );
}
