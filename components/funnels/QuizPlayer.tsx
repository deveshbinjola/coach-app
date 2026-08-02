"use client";

// QuizPlayer — the public-facing quiz experience.
//
// Flow: Intro -> Q1 -> Q2 -> Q3 -> Q4 -> Q5 -> Email gate -> Result
//
// Scoring: Each choice has scores like { pillar_1: 2, pillar_2: 0, pillar_3: 0 }.
// After all 5 questions, sum scores per pillar. Highest pillar = result key.
//
// Email gate: shown after last question, before result. Optional — visitor
// can skip to see result, but entering email creates a lead.
//
// Light/dark adaptive: detects background luminance and flips all text/border
// colors accordingly. Coaches with light brand bg get dark text; dark bg get white.
//
// "Powered by ElevateAI" always shown in footer.

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_PAPER_HEX } from "@/lib/brand-kit";

type Choice = {
  key: string;
  text: string;
  scores: Record<string, number>;
};

type Question = {
  id: string;
  text: string;
  choices: Choice[];
};

type Result = {
  key: string;
  pillar_name: string;
  headline: string;
  body: string;
  cta_text: string;
  cta_url: string;
};

type FunnelConfig = {
  intro: {
    headline: string;
    subhead: string;
    cta_label: string;
  };
  questions: Question[];
  results: Result[];
  branding: {
    primary_hex: string;
    accent_hex: string;
    background_hex: string;
    font_family: string;
  };
};

type Props = {
  funnelId: string;
  config: FunnelConfig;
};

type Step = "intro" | "question" | "email" | "result";

// ── Helpers ──────────────────────────────────────────────────

/** Parse hex to relative luminance (0 = black, 1 = white). */
function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  // sRGB luminance
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5;
}

// ── Component ────────────────────────────────────────────────

export default function QuizPlayer({ funnelId, config }: Props) {
  const [step, setStep] = useState<Step>("intro");
  const [questionIdx, setQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<Array<{ q_id: string; choice: string }>>([]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [resultKey, setResultKey] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const startTracked = useRef(false);

  const { branding, questions, results, intro } = config;
  const currentQuestion = questions[questionIdx] ?? null;
  const totalQuestions = questions.length;

  // Track start when visitor begins Q1
  useEffect(() => {
    if (step === "question" && questionIdx === 0 && !startTracked.current) {
      startTracked.current = true;
      fetch("/api/funnels/public", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ funnel_id: funnelId }),
      }).catch(() => {});
    }
  }, [step, questionIdx, funnelId]);

  // Compute result when all questions answered.
  // On ties (two pillars score equally), randomly pick one so the
  // outcome isn't silently dictated by Object.entries() iteration order.
  const computeResult = useCallback(
    (finalScores: Record<string, number>) => {
      let maxScore = -1;
      let topKeys: string[] = [];
      for (const [key, score] of Object.entries(finalScores)) {
        if (score > maxScore) {
          maxScore = score;
          topKeys = [key];
        } else if (score === maxScore) {
          topKeys.push(key);
        }
      }
      const winner = topKeys[Math.floor(Math.random() * topKeys.length)] || "";
      setResultKey(winner);
    },
    []
  );

  function handleStart() {
    setStep("question");
    setQuestionIdx(0);
  }

  function handleChoiceSelect(choice: Choice) {
    setSelectedChoice(choice.key);

    setTimeout(() => {
      const newAnswers = [...answers, { q_id: currentQuestion!.id, choice: choice.key }];
      setAnswers(newAnswers);

      const newScores = { ...scores };
      for (const [pillar, pts] of Object.entries(choice.scores)) {
        newScores[pillar] = (newScores[pillar] || 0) + pts;
      }
      setScores(newScores);
      setSelectedChoice(null);

      if (questionIdx < totalQuestions - 1) {
        setQuestionIdx(questionIdx + 1);
      } else {
        computeResult(newScores);
        setStep("email");
      }
    }, 300);
  }

  async function handleSubmit(skipEmail: boolean) {
    const finalResultKey = resultKey;
    if (!finalResultKey) return;

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        funnel_id: funnelId,
        answers,
        result_key: finalResultKey,
      };
      if (!skipEmail && email.trim()) {
        body.email = email.trim();
        body.name = name.trim() || undefined;
      }
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        if (params.get("utm_source")) body.utm_source = params.get("utm_source");
        if (params.get("utm_medium")) body.utm_medium = params.get("utm_medium");
        if (params.get("utm_campaign")) body.utm_campaign = params.get("utm_campaign");
      }

      await fetch("/api/funnels/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {}
    setSubmitting(false);
    setSubmitted(true);
    setStep("result");
  }

  // ── Adaptive palette from branding ────────────────────────

  const bgColor = branding.background_hex || DEFAULT_PAPER_HEX;
  const primaryColor = branding.primary_hex || "#0B6E23";
  const fontFamily = branding.font_family || "Plus Jakarta Sans, sans-serif";

  const light = isLightColor(bgColor);
  const textColor = light ? "#0A0F1C" : "#FFFFFF";
  const textMuted = light ? "rgba(10,15,28,0.50)" : "rgba(255,255,255,0.55)";
  const border = light ? "rgba(10,15,28,0.12)" : "rgba(255,255,255,0.12)";
  const borderStrong = light ? "rgba(10,15,28,0.25)" : "rgba(255,255,255,0.25)";
  const surface = light ? "rgba(10,15,28,0.03)" : "rgba(255,255,255,0.04)";
  const inputBg = light ? "#FFFFFF" : "rgba(255,255,255,0.08)";
  const inputBorder = light ? "rgba(10,15,28,0.18)" : "rgba(255,255,255,0.12)";
  // CTA text: use dark text on primary if primary is bright, else white
  const ctaTextColor = isLightColor(primaryColor) ? "#0A0F1C" : "#FFFFFF";

  const result = results.find((r) => r.key === resultKey) ?? results[0];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: bgColor, fontFamily, color: textColor }}
    >
      {/* Progress bar */}
      {step === "question" && (
        <div className="fixed top-0 left-0 right-0 z-50 h-1" style={{ backgroundColor: `${primaryColor}20` }}>
          <div
            className="h-full transition-all duration-500 ease-out"
            style={{
              width: `${((questionIdx + 1) / totalQuestions) * 100}%`,
              backgroundColor: primaryColor,
            }}
          />
        </div>
      )}

      <div className="flex-1 flex items-center justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-lg">

          {/* ── INTRO ────────────────────────────────────── */}
          {step === "intro" && (
            <div className="text-center animate-fadeIn">
              <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">
                {intro.headline}
              </h1>
              <p className="mt-4 text-lg" style={{ color: textMuted }}>
                {intro.subhead}
              </p>
              <button
                onClick={handleStart}
                className="mt-8 px-8 py-4 rounded-[var(--r-lg)] text-lg font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0"
                style={{ backgroundColor: primaryColor, color: ctaTextColor }}
              >
                {intro.cta_label || "Start"}
              </button>
            </div>
          )}

          {/* ── QUESTION ─────────────────────────────────── */}
          {step === "question" && currentQuestion && (
            <div key={currentQuestion.id} className="animate-fadeIn">
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: textMuted }}>
                Question {questionIdx + 1} of {totalQuestions}
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold leading-snug">
                {currentQuestion.text}
              </h2>
              <div className="mt-8 space-y-3">
                {currentQuestion.choices.map((choice) => {
                  const isSelected = selectedChoice === choice.key;
                  return (
                    <button
                      key={choice.key}
                      onClick={() => handleChoiceSelect(choice)}
                      disabled={selectedChoice !== null}
                      className="w-full text-left p-4 sm:p-5 rounded-[var(--r-lg)] border-2 transition-all duration-200 hover:-translate-y-0.5"
                      style={{
                        borderColor: isSelected ? primaryColor : border,
                        backgroundColor: isSelected ? `${primaryColor}15` : surface,
                      }}
                    >
                      <span className="flex items-start gap-3">
                        <span
                          className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5"
                          style={{
                            border: `2px solid ${isSelected ? primaryColor : borderStrong}`,
                            color: isSelected ? primaryColor : textMuted,
                          }}
                        >
                          {choice.key.toUpperCase()}
                        </span>
                        <span className="text-base sm:text-lg font-semibold leading-snug">
                          {choice.text}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── EMAIL GATE ───────────────────────────────── */}
          {step === "email" && !submitted && (
            <div className="text-center animate-fadeIn">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-5"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold">
                Your result is ready
              </h2>
              <p className="mt-3 text-base" style={{ color: textMuted }}>
                Enter your email to get your personalized result and tips.
              </p>
              <div className="mt-6 space-y-3 max-w-xs mx-auto">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="First name (optional)"
                  className="w-full px-4 py-3 rounded-[var(--r-lg)] text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-elevated)] focus-visible:rounded-[var(--r-sm)] transition"
                  style={{ backgroundColor: inputBg, border: `2px solid ${inputBorder}`, color: textColor }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Your email"
                  className="w-full px-4 py-3 rounded-[var(--r-lg)] text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--surface-elevated)] focus-visible:rounded-[var(--r-sm)] transition"
                  style={{ backgroundColor: inputBg, border: `2px solid ${inputBorder}`, color: textColor }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && email.trim()) handleSubmit(false);
                  }}
                />
                <button
                  onClick={() => handleSubmit(false)}
                  disabled={submitting || !email.trim()}
                  className="w-full py-3.5 rounded-[var(--r-lg)] text-base font-bold transition-all duration-200 disabled:opacity-40"
                  style={{ backgroundColor: primaryColor, color: ctaTextColor }}
                >
                  {submitting ? "Loading..." : "See my result"}
                </button>
                <button
                  onClick={() => handleSubmit(true)}
                  disabled={submitting}
                  className="w-full py-2 text-sm font-medium transition"
                  style={{ color: textMuted }}
                >
                  Skip, just show me
                </button>
              </div>
            </div>
          )}

          {/* ── RESULT ───────────────────────────────────── */}
          {step === "result" && result && (
            <div className="text-center animate-fadeIn">
              <div
                className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <h2
                className="text-3xl sm:text-4xl font-extrabold leading-tight"
                style={{ color: primaryColor }}
              >
                {result.headline}
              </h2>
              <p className="mt-5 text-lg leading-relaxed max-w-md mx-auto" style={{ color: textMuted }}>
                {result.body}
              </p>
              {result.cta_url && (
                <a
                  href={result.cta_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block mt-8 px-8 py-4 rounded-[var(--r-lg)] text-lg font-bold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
                  style={{ backgroundColor: primaryColor, color: ctaTextColor }}
                >
                  {result.cta_text || "Learn more"}
                </a>
              )}
              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  onClick={() => {
                    setStep("intro");
                    setQuestionIdx(0);
                    setAnswers([]);
                    setScores({});
                    setResultKey("");
                    setEmail("");
                    setName("");
                    setSubmitted(false);
                    startTracked.current = false;
                  }}
                  className="text-sm font-medium transition underline"
                  style={{ color: textMuted }}
                >
                  Retake quiz
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Powered by footer */}
      <footer className="py-4 text-center">
        <a
          href="https://elevateaisystem.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium transition"
          style={{ color: textMuted, opacity: 0.6 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={primaryColor}>
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
          </svg>
          Powered by ElevateAI
        </a>
      </footer>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
