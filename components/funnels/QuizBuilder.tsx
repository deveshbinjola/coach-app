"use client";

// QuizBuilder — full-page quiz editor. This is the "platform" experience.
//
// Layout:
//   Top bar: ← Back | title | unsaved badge | Preview | Save
//   Tab bar: Content | Style | Settings
//   Content tab: Intro → Questions (collapsible Q1-Q5) → Results (collapsible)
//   Style tab: Color pickers + font selector + live preview
//   Settings tab: Title, slug, publish toggle
//
// Preview: inline iframe with srcDoc rendering the intro screen using
// the coach's current branding settings. Full interactive preview
// opens in a new tab via the Preview button.

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  Save,
  ChevronDown,
  ChevronRight,
  Type,
  Palette,
  Settings,
  GripVertical,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

// ── Types ──────────────────────────────────────────────────

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

export type QuizBuilderConfig = {
  intro: { headline: string; subhead: string; cta_label: string };
  questions: Question[];
  results: Result[];
  branding: {
    primary_hex: string;
    accent_hex: string;
    background_hex: string;
    font_family: string;
  };
};

type FunnelData = {
  id: string;
  slug: string;
  title: string;
  config: QuizBuilderConfig;
  published: boolean;
};

type Props = {
  funnel: FunnelData;
};

type Tab = "content" | "style" | "settings";

// ── Helpers ────────────────────────────────────────────────

function isLightColor(hex: string): boolean {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Main Component ─────────────────────────────────────────

export default function QuizBuilder({ funnel: initial }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Funnel metadata
  const [title, setTitle] = useState(initial.title);
  const [slug, setSlug] = useState(initial.slug);
  const [published, setPublished] = useState(initial.published);

  // Config state (split for granular updates)
  const [intro, setIntro] = useState(initial.config.intro);
  const [questions, setQuestions] = useState(initial.config.questions);
  const [results, setResults] = useState(initial.config.results);
  const [branding, setBranding] = useState(initial.config.branding);

  // UI state
  const [activeTab, setActiveTab] = useState<Tab>("content");
  const [expandedQ, setExpandedQ] = useState<string | null>(
    initial.config.questions[0]?.id || null
  );
  const [expandedR, setExpandedR] = useState<string | null>(
    initial.config.results[0]?.key || null
  );
  const [showPreview, setShowPreview] = useState(false);

  // Pillar keys derived from results
  const pillarKeys = useMemo(() => results.map((r) => r.key), [results]);

  // Mark dirty on any change
  const markDirty = useCallback(() => {
    setSaved(false);
    setSuccessMsg("");
  }, []);

  // ── Update helpers ───────────────────────────────────────

  function updateIntro(field: keyof typeof intro, value: string) {
    setIntro((prev) => ({ ...prev, [field]: value }));
    markDirty();
  }

  function updateQuestionText(qIdx: number, text: string) {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[qIdx] = { ...updated[qIdx], text };
      return updated;
    });
    markDirty();
  }

  function updateChoiceText(qIdx: number, cIdx: number, text: string) {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = { ...updated[qIdx] };
      q.choices = [...q.choices];
      q.choices[cIdx] = { ...q.choices[cIdx], text };
      updated[qIdx] = q;
      return updated;
    });
    markDirty();
  }

  function setChoicePillar(qIdx: number, cIdx: number, targetPillar: string) {
    setQuestions((prev) => {
      const updated = [...prev];
      const q = { ...updated[qIdx] };
      q.choices = [...q.choices];
      const scores: Record<string, number> = {};
      pillarKeys.forEach((pk) => {
        scores[pk] = pk === targetPillar ? 2 : 0;
      });
      q.choices[cIdx] = { ...q.choices[cIdx], scores };
      updated[qIdx] = q;
      return updated;
    });
    markDirty();
  }

  function updateResult(rIdx: number, field: string, value: string) {
    setResults((prev) => {
      const updated = [...prev];
      updated[rIdx] = { ...updated[rIdx], [field]: value };
      return updated;
    });
    markDirty();
  }

  function updateBranding(
    field: keyof typeof branding,
    value: string
  ) {
    setBranding((prev) => ({ ...prev, [field]: value }));
    markDirty();
  }

  // ── Get which pillar a choice maps to ───────────────────

  function getChoicePillar(choice: Choice): string {
    let maxPillar = "";
    let maxScore = 0;
    for (const [pk, score] of Object.entries(choice.scores)) {
      if (score > maxScore) {
        maxScore = score;
        maxPillar = pk;
      }
    }
    return maxPillar;
  }

  function pillarDisplayName(key: string): string {
    return results.find((r) => r.key === key)?.pillar_name || key;
  }

  // ── Save ─────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    setError("");
    setSuccessMsg("");
    try {
      const config: QuizBuilderConfig = { intro, questions, results, branding };
      const res = await fetch("/api/funnels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: initial.id,
          title: title.trim(),
          slug: slug.trim().toLowerCase(),
          config,
          published,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save.");
        return;
      }
      setSaved(true);
      setSuccessMsg("Saved successfully");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Preview HTML (style approximation only) ──────────────
  //
  // ⚠️ This generates a standalone HTML page for the sidebar style preview.
  // It is NOT the real QuizPlayer and WILL drift if QuizPlayer changes.
  // Its purpose is showing branding changes (colors/font) in real-time
  // while editing. For an accurate interactive preview, use the "Preview"
  // button which opens /funnels/[id]/preview rendering the real QuizPlayer.

  function buildPreviewHtml(): string {
    const bg = branding.background_hex || "#FAFAF8";
    const primary = branding.primary_hex || "#00FF41";
    const font = branding.font_family || "Plus Jakarta Sans";
    const light = isLightColor(bg);
    const textColor = light ? "#0A0F1C" : "#FFFFFF";
    const textMuted = light ? "rgba(10,15,28,0.5)" : "rgba(255,255,255,0.55)";
    const ctaText = isLightColor(primary) ? "#0A0F1C" : "#FFFFFF";
    const borderColor = light ? "rgba(10,15,28,0.12)" : "rgba(255,255,255,0.12)";
    const surfaceColor = light ? "rgba(10,15,28,0.03)" : "rgba(255,255,255,0.04)";

    const q = questions[0];
    const r = results[0];

    return `<!DOCTYPE html>
<html>
<head>
<link href="https://fonts.googleapis.com/css2?family=${font.replace(/ /g, "+")}&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: ${bg}; font-family: '${font}', sans-serif; color: ${textColor}; }
  .page { min-height: 100vh; display: flex; flex-direction: column; }
  .screen { display: none; flex: 1; align-items: center; justify-content: center; padding: 32px 20px; }
  .screen.active { display: flex; }
  .container { max-width: 420px; width: 100%; }
  .text-center { text-align: center; }
  h1 { font-size: 24px; font-weight: 800; line-height: 1.2; }
  h2 { font-size: 20px; font-weight: 800; line-height: 1.3; }
  .sub { margin-top: 12px; font-size: 14px; color: ${textMuted}; }
  .btn { margin-top: 24px; display: inline-block; padding: 12px 28px; border-radius: 12px; font-weight: 700; font-size: 14px; background: ${primary}; color: ${ctaText}; cursor: pointer; border: none; text-decoration: none; }
  .btn:hover { opacity: 0.9; }
  .label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: ${textMuted}; margin-bottom: 10px; }
  .choice { width: 100%; text-align: left; padding: 14px 16px; border-radius: 12px; border: 2px solid ${borderColor}; background: ${surfaceColor}; margin-bottom: 10px; cursor: pointer; font-size: 14px; font-weight: 600; color: ${textColor}; font-family: '${font}', sans-serif; }
  .choice:hover { border-color: ${primary}; background: ${primary}15; }
  .nav-dots { display: flex; gap: 8px; justify-content: center; margin-top: 20px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: ${borderColor}; cursor: pointer; border: none; }
  .dot.active { background: ${primary}; }
  .result-icon { width: 64px; height: 64px; border-radius: 50%; background: ${primary}20; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; }
  .result-headline { color: ${primary}; }
  .powered { text-align: center; padding: 12px; font-size: 10px; color: ${textMuted}; opacity: 0.6; }
</style>
</head>
<body>
<div class="page">
  <div class="screen active text-center" id="screen-intro">
    <div class="container">
      <h1>${escapeHtml(intro.headline || "Your Quiz Headline")}</h1>
      <p class="sub">${escapeHtml(intro.subhead || "5 questions. ~60 seconds.")}</p>
      <button class="btn" onclick="showScreen('question')">${escapeHtml(intro.cta_label || "Start")}</button>
    </div>
  </div>
  <div class="screen" id="screen-question">
    <div class="container">
      <p class="label">Question 1 of ${questions.length}</p>
      <h2>${escapeHtml(q?.text || "Sample question text")}</h2>
      <div style="margin-top: 20px;">
        ${(q?.choices || [])
          .map(
            (c) =>
              `<button class="choice" onclick="showScreen('result')"><span style="display:inline-flex;align-items:center;gap:10px;"><span style="width:24px;height:24px;border-radius:50%;border:2px solid ${borderColor};display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:${textMuted};flex-shrink:0;">${escapeHtml(c.key.toUpperCase())}</span> ${escapeHtml(c.text)}</span></button>`
          )
          .join("")}
      </div>
    </div>
  </div>
  <div class="screen text-center" id="screen-result">
    <div class="container">
      <div class="result-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${primary}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      </div>
      <h1 class="result-headline">${escapeHtml(r?.headline || "You're a [type].")}</h1>
      <p class="sub" style="max-width:360px;margin:12px auto 0;">${escapeHtml(r?.body || "Result description goes here.")}</p>
      ${r?.cta_url ? `<a href="#" class="btn" onclick="event.preventDefault();showScreen('intro')">${escapeHtml(r.cta_text || "Learn more")}</a>` : ""}
      <div style="margin-top:16px;"><button onclick="showScreen('intro')" style="background:none;border:none;color:${textMuted};font-size:12px;cursor:pointer;text-decoration:underline;font-family:'${font}',sans-serif;">Retake quiz</button></div>
    </div>
  </div>
  <div class="nav-dots">
    <button class="dot active" onclick="showScreen('intro')"></button>
    <button class="dot" onclick="showScreen('question')"></button>
    <button class="dot" onclick="showScreen('result')"></button>
  </div>
  <div class="powered">Powered by ElevateAI</div>
</div>
<script>
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
  document.querySelectorAll('.dot').forEach((d,i) => {
    d.classList.toggle('active', ['intro','question','result'][i] === name);
  });
}
</script>
</body>
</html>`;
  }

  // ── Render ───────────────────────────────────────────────

  return (
    <div>
      {/* ── Top bar ──────────────────────────────────────── */}
      <div className="sticky top-[57px] z-30 bg-[var(--surface-elevated)] border-b border-[var(--border-faint)]">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push("/funnels")}
              className="shrink-0 p-2 -ml-2 rounded-lg hover:bg-[var(--surface-deep)] transition"
              aria-label="Back to funnels"
            >
              <ArrowLeft size={18} className="text-[color:var(--text-muted)]" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-extrabold text-[color:var(--text)] truncate">
                {title || "Untitled Quiz"}
              </h1>
              <p className="text-[10px] text-[color:var(--text-muted)] font-mono truncate">
                /q/{slug}
              </p>
            </div>
            {!saved && (
              <span className="shrink-0 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                Unsaved
              </span>
            )}
            {successMsg && (
              <span className="shrink-0 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                {successMsg}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {published && (
              <Button
                size="sm"
                variant="ghost"
                leadingIcon={<ExternalLink size={14} />}
                onClick={() => window.open(`/q/${slug}`, "_blank")}
              >
                View live
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Eye size={14} />}
              onClick={() => window.open(`/funnels/${initial.id}/preview`, "_blank")}
            >
              Preview
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Palette size={14} />}
              onClick={() => setShowPreview(!showPreview)}
              className="hidden lg:inline-flex"
            >
              {showPreview ? "Hide style" : "Style"}
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || saved}
              leadingIcon={<Save size={14} />}
            >
              {saving ? "Saving..." : saved ? "Saved" : "Save"}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Tab bar ──────────────────────────────────────── */}
      <div className="border-b border-[var(--border-faint)] bg-[var(--surface-elevated)]">
        <div className="max-w-6xl mx-auto px-4 flex gap-0">
          {(
            [
              { key: "content", label: "Content", icon: <Type size={14} /> },
              { key: "style", label: "Style", icon: <Palette size={14} /> },
              { key: "settings", label: "Settings", icon: <Settings size={14} /> },
            ] as { key: Tab; label: string; icon: React.ReactNode }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={[
                "flex items-center gap-1.5 px-4 py-3 text-xs font-bold uppercase tracking-wider transition border-b-2",
                activeTab === tab.key
                  ? "border-[var(--brand)] text-[color:var(--brand-strong)]"
                  : "border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text)]",
              ].join(" ")}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────── */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 mt-4">
          <div className="p-3 rounded-[var(--r-md)] bg-red-50 text-red-700 text-sm font-semibold border border-red-100">
            {error}
          </div>
        </div>
      )}

      {/* ── Content area ─────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div
          className={
            showPreview
              ? "grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6"
              : ""
          }
        >
          {/* ── Editor column ────────────────────────────── */}
          <div className={showPreview ? "" : "max-w-3xl"}>
            {/* ── Content tab ────────────────────────────── */}
            {activeTab === "content" && (
              <div className="space-y-6">
                {/* Intro */}
                <SectionCard
                  title="Intro Screen"
                  subtitle="First thing visitors see before starting"
                >
                  <div className="space-y-3">
                    <FieldInput
                      label="Headline"
                      value={intro.headline}
                      onChange={(v) => updateIntro("headline", v)}
                      placeholder="e.g. What kind of leader are you?"
                    />
                    <FieldInput
                      label="Subhead"
                      value={intro.subhead}
                      onChange={(v) => updateIntro("subhead", v)}
                      placeholder="e.g. 5 questions. ~60 seconds. See how you show up."
                    />
                    <FieldInput
                      label="Start Button Text"
                      value={intro.cta_label}
                      onChange={(v) => updateIntro("cta_label", v)}
                      placeholder="Start"
                    />
                  </div>
                </SectionCard>

                {/* Questions */}
                <SectionCard
                  title="Questions"
                  subtitle={`${questions.length} questions, each with 3 choices mapped to a pillar`}
                >
                  <div className="space-y-2">
                    {questions.map((q, qIdx) => {
                      const isExpanded = expandedQ === q.id;
                      return (
                        <div
                          key={q.id}
                          className="rounded-[var(--r-md)] border border-[var(--border-faint)] overflow-hidden"
                        >
                          {/* Question header — click to expand */}
                          <button
                            onClick={() =>
                              setExpandedQ(isExpanded ? null : q.id)
                            }
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-deep)] transition"
                          >
                            <span className="shrink-0 w-7 h-7 rounded-lg bg-[var(--brand-soft)] flex items-center justify-center text-xs font-extrabold text-[color:var(--brand-strong)]">
                              {qIdx + 1}
                            </span>
                            <span className="flex-1 min-w-0 text-sm font-semibold text-[color:var(--text)] truncate">
                              {q.text || `Question ${qIdx + 1}`}
                            </span>
                            {isExpanded ? (
                              <ChevronDown
                                size={16}
                                className="text-[color:var(--text-muted)] shrink-0"
                              />
                            ) : (
                              <ChevronRight
                                size={16}
                                className="text-[color:var(--text-muted)] shrink-0"
                              />
                            )}
                          </button>

                          {/* Expanded content */}
                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-4 border-t border-[var(--border-faint)] bg-[var(--surface)]">
                              <div className="pt-3">
                                <FieldTextarea
                                  label="Question Text"
                                  value={q.text}
                                  onChange={(v) =>
                                    updateQuestionText(qIdx, v)
                                  }
                                  placeholder="e.g. When things get overwhelming, what do you reach for first?"
                                  rows={2}
                                />
                              </div>
                              <div className="space-y-3">
                                <p className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
                                  Choices
                                </p>
                                {q.choices.map((c, cIdx) => {
                                  const mappedPillar = getChoicePillar(c);
                                  return (
                                    <div
                                      key={c.key}
                                      className="rounded-lg border border-[var(--border-faint)] p-3 bg-[var(--surface-elevated)]"
                                    >
                                      <div className="flex items-start gap-3">
                                        <span className="shrink-0 w-6 h-6 rounded-full border-2 border-[var(--border)] flex items-center justify-center text-[10px] font-bold text-[color:var(--text-muted)] mt-1">
                                          {c.key.toUpperCase()}
                                        </span>
                                        <div className="flex-1 space-y-2">
                                          <input
                                            type="text"
                                            value={c.text}
                                            onChange={(e) =>
                                              updateChoiceText(
                                                qIdx,
                                                cIdx,
                                                e.target.value
                                              )
                                            }
                                            placeholder={`Choice ${c.key.toUpperCase()} text`}
                                            className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] text-sm focus:outline-none focus:border-[var(--brand)] transition"
                                          />
                                          <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider whitespace-nowrap">
                                              Maps to:
                                            </span>
                                            <select
                                              value={mappedPillar}
                                              onChange={(e) =>
                                                setChoicePillar(
                                                  qIdx,
                                                  cIdx,
                                                  e.target.value
                                                )
                                              }
                                              className="flex-1 px-2 py-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] text-xs focus:outline-none focus:border-[var(--brand)] transition"
                                            >
                                              <option value="">
                                                None
                                              </option>
                                              {pillarKeys.map((pk) => (
                                                <option key={pk} value={pk}>
                                                  {pillarDisplayName(pk)}
                                                </option>
                                              ))}
                                            </select>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>

                {/* Results */}
                <SectionCard
                  title="Result Archetypes"
                  subtitle="What visitors see based on their quiz answers"
                >
                  <div className="space-y-2">
                    {results.map((r, rIdx) => {
                      const isExpanded = expandedR === r.key;
                      return (
                        <div
                          key={r.key}
                          className="rounded-[var(--r-md)] border border-[var(--border-faint)] overflow-hidden"
                        >
                          <button
                            onClick={() =>
                              setExpandedR(isExpanded ? null : r.key)
                            }
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-deep)] transition"
                          >
                            <span className="shrink-0 w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                              <Sparkles
                                size={14}
                                className="text-emerald-600"
                              />
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-semibold text-[color:var(--text)] truncate block">
                                {r.pillar_name || r.key}
                              </span>
                              <span className="text-[10px] text-[color:var(--text-muted)] truncate block">
                                {r.headline || "No headline set"}
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronDown
                                size={16}
                                className="text-[color:var(--text-muted)] shrink-0"
                              />
                            ) : (
                              <ChevronRight
                                size={16}
                                className="text-[color:var(--text-muted)] shrink-0"
                              />
                            )}
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-4 space-y-3 border-t border-[var(--border-faint)] bg-[var(--surface)]">
                              <div className="pt-3">
                                <FieldInput
                                  label="Pillar Name"
                                  value={r.pillar_name}
                                  onChange={(v) =>
                                    updateResult(rIdx, "pillar_name", v)
                                  }
                                  placeholder="e.g. The Embodied Leader"
                                />
                              </div>
                              <FieldInput
                                label="Result Headline"
                                value={r.headline}
                                onChange={(v) =>
                                  updateResult(rIdx, "headline", v)
                                }
                                placeholder='e.g. You&apos;re an Embodied Leader.'
                              />
                              <FieldTextarea
                                label="Result Body"
                                value={r.body}
                                onChange={(v) =>
                                  updateResult(rIdx, "body", v)
                                }
                                placeholder="2-3 sentences describing this archetype..."
                                rows={3}
                              />
                              <div className="grid grid-cols-2 gap-3">
                                <FieldInput
                                  label="CTA Button Text"
                                  value={r.cta_text}
                                  onChange={(v) =>
                                    updateResult(rIdx, "cta_text", v)
                                  }
                                  placeholder="Learn more"
                                />
                                <FieldInput
                                  label="CTA URL"
                                  value={r.cta_url}
                                  onChange={(v) =>
                                    updateResult(rIdx, "cta_url", v)
                                  }
                                  placeholder="https://..."
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </SectionCard>
              </div>
            )}

            {/* ── Style tab ──────────────────────────────── */}
            {activeTab === "style" && (
              <div className="space-y-6">
                <SectionCard
                  title="Colors"
                  subtitle="Customize how your quiz looks to visitors"
                >
                  <div className="space-y-4">
                    <ColorField
                      label="Primary / CTA Color"
                      value={branding.primary_hex}
                      onChange={(v) => updateBranding("primary_hex", v)}
                    />
                    <ColorField
                      label="Background Color"
                      value={branding.background_hex}
                      onChange={(v) => updateBranding("background_hex", v)}
                    />
                    <ColorField
                      label="Accent Color"
                      value={branding.accent_hex}
                      onChange={(v) => updateBranding("accent_hex", v)}
                    />
                  </div>
                </SectionCard>
                <SectionCard
                  title="Typography"
                  subtitle="Choose a font for your quiz"
                >
                  <select
                    value={branding.font_family}
                    onChange={(e) =>
                      updateBranding("font_family", e.target.value)
                    }
                    className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] text-sm focus:outline-none focus:border-[var(--brand)] transition"
                  >
                    {[
                      "Plus Jakarta Sans",
                      "Inter",
                      "DM Sans",
                      "Space Grotesk",
                      "Outfit",
                      "Sora",
                      "Poppins",
                      "Montserrat",
                    ].map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </SectionCard>
              </div>
            )}

            {/* ── Settings tab ───────────────────────────── */}
            {activeTab === "settings" && (
              <div className="space-y-6">
                <SectionCard title="Quiz Details">
                  <div className="space-y-3">
                    <FieldInput
                      label="Title"
                      value={title}
                      onChange={(v) => {
                        setTitle(v);
                        markDirty();
                      }}
                      placeholder="Your Brand Quiz"
                    />
                    <div>
                      <label className="block text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1.5">
                        URL Slug
                      </label>
                      <div className="flex items-center">
                        <span className="shrink-0 px-3 py-2 text-xs font-mono text-[color:var(--text-muted)] bg-[var(--surface-deep)] border border-r-0 border-[var(--border)] rounded-l-[var(--r-md)]">
                          /q/
                        </span>
                        <input
                          type="text"
                          value={slug}
                          onChange={(e) => {
                            setSlug(
                              e.target.value
                                .toLowerCase()
                                .replace(/[^a-z0-9-]/g, "")
                            );
                            markDirty();
                          }}
                          maxLength={60}
                          className="flex-1 min-w-0 px-3 py-2 rounded-r-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--brand)] transition"
                          placeholder="my-quiz-slug"
                        />
                      </div>
                      <p className="text-[10px] text-[color:var(--text-muted)] mt-1">
                        3-60 chars. Lowercase letters, numbers, hyphens only.
                      </p>
                    </div>
                  </div>
                </SectionCard>
                <SectionCard title="Publishing">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[color:var(--text)]">
                        {published ? "Quiz is live" : "Quiz is a draft"}
                      </p>
                      <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                        {published
                          ? "Anyone with the link can take this quiz."
                          : "Only you can see it. Publish when ready."}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setPublished(!published);
                        markDirty();
                      }}
                      className={[
                        "relative w-11 h-6 rounded-full transition-colors",
                        published
                          ? "bg-[var(--brand)]"
                          : "bg-[var(--border)]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
                          published
                            ? "translate-x-[22px]"
                            : "translate-x-0.5",
                        ].join(" ")}
                      />
                    </button>
                  </div>
                </SectionCard>
              </div>
            )}
          </div>

          {/* ── Preview panel ────────────────────────────── */}
          {showPreview && (
            <div className="hidden lg:block">
              <div className="sticky top-[145px]">
                <div className="rounded-[var(--r-xl)] border border-[var(--border)] overflow-hidden shadow-sm">
                  {/* Browser chrome */}
                  <div className="px-3 py-2.5 bg-[var(--surface-deep)] border-b border-[var(--border-faint)] flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-300" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-300" />
                      <div className="w-2.5 h-2.5 rounded-full bg-green-300" />
                    </div>
                    <div className="flex-1 mx-4 px-3 py-1 rounded-md bg-[var(--surface)] text-[10px] font-mono text-[color:var(--text-muted)] text-center truncate border border-[var(--border-faint)]">
                      yoursite.com/q/{slug}
                    </div>
                  </div>
                  {/* Preview iframe */}
                  <iframe
                    srcDoc={buildPreviewHtml()}
                    className="w-full border-0"
                    style={{ height: "520px" }}
                    sandbox="allow-scripts"
                    title="Quiz Preview"
                  />
                </div>
                <p className="text-[10px] text-[color:var(--text-muted)] text-center mt-2">
                  Style preview — colors &amp; fonts only. Use Preview button for full interactive quiz.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding="none">
      <div className="p-5">
        <h3 className="text-base font-extrabold text-[color:var(--text)]">
          {title}
        </h3>
        {subtitle && (
          <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
            {subtitle}
          </p>
        )}
        <div className="mt-4">{children}</div>
      </div>
    </Card>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] text-sm focus:outline-none focus:border-[var(--brand)] transition"
      />
    </div>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] text-sm resize-none focus:outline-none focus:border-[var(--brand)] transition"
      />
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <div className="relative">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="w-10 h-10 rounded-lg border-2 border-[var(--border)] cursor-pointer shadow-sm"
            style={{ backgroundColor: value }}
          />
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{0,6}$/.test(v) || v === "") {
              onChange(v);
            }
          }}
          maxLength={7}
          className="w-28 px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[color:var(--text)] text-sm font-mono focus:outline-none focus:border-[var(--brand)] transition"
          placeholder="#000000"
        />
      </div>
    </div>
  );
}
