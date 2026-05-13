"use client";

// BrandOsRunner — one-question-at-a-time client UI.
//
// Auto-saves on every keystroke (debounced 800ms). Locks the answer when
// the coach hits Continue. Runs push-back marker detection on lock for
// trigger questions. Advances by writing run.current_question_id.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import { createClient } from "@/lib/supabase-browser";
import {
  getQuestion,
  pick,
  questionsForModule,
  previousQuestionId,
  MODULE_META,
  type Audience,
  type ModuleId,
  type Question,
} from "@/lib/brand-os/questions";
import { detectPushBack, triggerForQuestion } from "@/lib/brand-os/pushback";

type AnswerRow = {
  question_id: string;
  raw_text: string | null;
  refined_text: string | null;
  locked_at: string | null;
};

export type VoiceSourceRow = {
  id: string;
  source_type: string;       // sales_call | voice_note | workshop | instagram | linkedin | newsletter | paste
  title: string;
  transcript: string;
  created_at: string;
};

type Props = {
  runId: string;
  variant: "mvp" | "full";
  audience: Audience;
  currentQuestionId: string;
  nextQuestionId: string | null;
  answers: AnswerRow[];
  totalQuestions: number;
  lockedCount: number;
  progressPct: number;
  moduleOrder: ModuleId[];
  /** Existing voice training sources from /voice setup. Used by Signal
   *  Module to offer "use these" instead of forcing the coach to paste again. */
  voiceSources: VoiceSourceRow[];
};

export default function BrandOsRunner(props: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [currentId, setCurrentId] = useState(props.currentQuestionId);
  const [audience, setAudience] = useState<Audience>(props.audience);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushBackOpen, setPushBackOpen] = useState(false);
  const [pushBackReason, setPushBackReason] = useState<string | null>(null);
  const [pushBackOptions, setPushBackOptions] = useState<{ a: string; b: string } | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  // Anti-loop: once a question has fired push-back, the second Continue click
  // bypasses detection. Coach is never trapped on the same question.
  const [pushBackFiredFor, setPushBackFiredFor] = useState<Set<string>>(new Set());

  const currentQ = useMemo(() => getQuestion(currentId), [currentId]);
  const answerMap = useMemo(() => {
    const m: Record<string, AnswerRow> = {};
    for (const a of props.answers) m[a.question_id] = a;
    return m;
  }, [props.answers]);

  const existing = answerMap[currentId]?.raw_text ?? "";
  const [draft, setDraft] = useState(existing);

  // Reset draft when question changes (resume + advance both). Also clears
  // any pending debounced save timer so we don't accidentally write the OLD
  // question's draft text against the NEW question's row.
  useEffect(() => {
    setDraft(existing);
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    setError(null);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [currentId]);

  // Debounced auto-save.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistDraft = useCallback(async (text: string) => {
    if (!currentQ) return;
    await supabase
      .from("cp_brand_os_answers")
      .upsert({
        run_id: props.runId,
        module: currentQ.module,
        question_id: currentId,
        raw_text: text,
        updated_at: new Date().toISOString(),
      }, { onConflict: "run_id,question_id" });
  }, [supabase, props.runId, currentId, currentQ]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persistDraft(draft); }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [draft, persistDraft]);

  // Pre-flight audience capture writes to run.audience.
  async function setRunAudience(value: Audience) {
    setAudience(value);
    await supabase
      .from("cp_brand_os_runs")
      .update({ audience: value })
      .eq("id", props.runId);
  }

  /** Single lock + advance path. Accepts an optional explicit value so choice
   *  buttons can auto-advance without waiting for the React state-flush race.
   *  Wraps everything in try/catch so errors surface visibly instead of leaving
   *  the Continue button stuck. */
  async function lockAndAdvance(valueOverride?: string) {
    if (!currentQ || advancing) return;
    setError(null);
    const value = valueOverride ?? draft;

    try {
      // Pre-flight audience: stash to run + advance immediately.
      if (currentQ.id === "preflight.audience") {
        if (!value) { setError("Pick one to continue."); return; }
        setAdvancing(true);
        await setRunAudience(value as Audience);
        await persistDraft(value);
        await markLocked();
        await advanceTo(props.nextQuestionId);
        return;
      }

      // Scout Test (signal.q3) has its own gating — the answer is JSON, and
      // we only allow Continue once the coach has revealed their picks.
      if (currentQ.kind === "scoutTest") {
        try {
          const parsed = JSON.parse(value || "{}") as { phase?: string };
          if (parsed.phase !== "revealed") {
            setError("Run the test and reveal your picks before continuing.");
            return;
          }
        } catch {
          setError("Run the Scout Test first.");
          return;
        }
        setAdvancing(true);
        await persistDraft(value);
        await markLocked();
        await advanceTo(props.nextQuestionId);
        return;
      }

      // Min-char gating.
      const min = currentQ.minChars ?? 0;
      if (value.trim().length < min) {
        setError(`Stay with this. We need at least ${min} characters before you can move on. (You have ${value.trim().length}.)`);
        return;
      }

      // Push-back trigger detection — but ONLY if we haven't already pushed
      // back on this question. Anti-loop: second click of Continue bypasses.
      const trigger = triggerForQuestion(currentQ.id);
      const alreadyFired = pushBackFiredFor.has(currentQ.id);
      if (trigger && !alreadyFired) {
        const detection = detectPushBack(trigger, value, audience);
        if (detection.fired) {
          setPushBackFiredFor((prev) => new Set([...prev, currentQ.id]));
          setPushBackReason(reasonLabel(detection.reason, detection.markersMatched));
          setPushBackOpen(true);
          // Fire-and-forget; modal handles its own loading state.
          void generatePushBackOptions();
          return; // wait for user choice in the modal
        }
      }

      setAdvancing(true);
      await persistDraft(value);
      await markLocked();
      await advanceTo(props.nextQuestionId);
    } catch (err) {
      console.error("[brand-os] lockAndAdvance error:", err);
      setError(err instanceof Error ? err.message : "Something went wrong. Check the console and try again.");
      setAdvancing(false);
    }
  }

  async function goBack() {
    if (!currentQ || advancing) return;
    const prevId = previousQuestionId(currentQ.id, props.variant);
    if (!prevId) return;
    setAdvancing(true);
    const prev = getQuestion(prevId);
    const { error: upErr } = await supabase
      .from("cp_brand_os_runs")
      .update({
        current_question_id: prevId,
        current_module: prev?.module ?? "preflight",
      })
      .eq("id", props.runId);
    if (upErr) {
      setError(upErr.message);
      setAdvancing(false);
      return;
    }
    setCurrentId(prevId);
    setAdvancing(false);
    router.refresh();
  }

  async function generatePushBackOptions() {
    setLoadingOptions(true);
    try {
      const res = await fetch("/api/brand-os/pushback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: props.runId,
          questionId: currentId,
          answer: draft,
          audience,
        }),
      });
      if (!res.ok) throw new Error(`Push-back API ${res.status}`);
      const data = await res.json() as { option_a: string; option_b: string };
      setPushBackOptions({ a: data.option_a, b: data.option_b });
    } catch (err) {
      // If the AI endpoint isn't wired yet, fall through to override-only.
      setPushBackOptions({ a: "(Alternatives will appear here once the Brand OS push-back API is wired.)", b: "(Same — placeholder until /api/brand-os/pushback ships.)" });
    } finally {
      setLoadingOptions(false);
    }
  }

  async function pickPushBackOption(which: "a" | "b") {
    if (!pushBackOptions || !currentQ) return;
    try {
      setAdvancing(true);
      setPushBackOpen(false);
      const chosen = which === "a" ? pushBackOptions.a : pushBackOptions.b;
      await supabase.from("cp_brand_os_pushbacks").insert({
        run_id: props.runId,
        module: currentQ.module,
        question_id: currentId,
        user_original: draft,
        option_a: pushBackOptions.a,
        option_b: pushBackOptions.b,
        action: which === "a" ? "pick_a" : "pick_b",
      });
      setDraft(chosen);
      await persistDraft(chosen);
      await markLocked();
      await advanceTo(props.nextQuestionId);
    } catch (err) {
      console.error("[brand-os] pickPushBackOption error:", err);
      setError(err instanceof Error ? err.message : "Could not advance. Try again.");
      setAdvancing(false);
    }
  }

  async function overridePushBack(reason: string) {
    if (!currentQ) return;
    try {
      setAdvancing(true);
      setPushBackOpen(false);
      await supabase.from("cp_brand_os_pushbacks").insert({
        run_id: props.runId,
        module: currentQ.module,
        question_id: currentId,
        user_original: draft,
        option_a: pushBackOptions?.a ?? "",
        option_b: pushBackOptions?.b ?? "",
        action: "override",
        override_reason: reason || "(no reason given)",
      });
      // Make sure the original answer is persisted, then lock + advance.
      await persistDraft(draft);
      await markLocked();
      await advanceTo(props.nextQuestionId);
    } catch (err) {
      console.error("[brand-os] override error:", err);
      setError(err instanceof Error ? err.message : "Could not advance. Try again.");
      setAdvancing(false);
    }
  }

  async function markLocked() {
    if (!currentQ) return;
    await supabase
      .from("cp_brand_os_answers")
      .update({ locked_at: new Date().toISOString() })
      .eq("run_id", props.runId)
      .eq("question_id", currentId);
  }

  /** Move the run to a target question id. Awaits the DB write AND fires
   *  router.refresh() so the server component re-renders with fresh props
   *  (answerMap, lockedCount, progressPct, etc.) — otherwise the progress
   *  bar and answered-count would only update on a full reload, which is
   *  what was making it feel like Continue didn't work without F5. */
  async function advanceTo(targetId: string | null) {
    if (!targetId) {
      // End of variant — mark complete + push to output.
      const { error: completeErr } = await supabase
        .from("cp_brand_os_runs")
        .update({ state: "complete", completed_at: new Date().toISOString() })
        .eq("id", props.runId);
      if (completeErr) {
        setError(completeErr.message);
        setAdvancing(false);
        return;
      }
      router.push(`/brand-os/run/${props.runId}/output`);
      return;
    }
    const target = getQuestion(targetId);
    const { error: upErr } = await supabase
      .from("cp_brand_os_runs")
      .update({
        current_question_id: targetId,
        current_module: target?.module ?? "preflight",
      })
      .eq("id", props.runId);
    if (upErr) {
      setError(upErr.message);
      setAdvancing(false);
      return;
    }
    // Update local state immediately so the question swaps without waiting
    // for the server round-trip…
    setCurrentId(targetId);
    setAdvancing(false);
    // …then ask Next.js to re-fetch the server component so progress count,
    // module breadcrumb, and answerMap reflect the new DB state.
    router.refresh();
  }

  if (!currentQ) return <p>Question not found.</p>;

  const moduleQuestions = questionsForModule(currentQ.module);
  const moduleOrdinal = moduleQuestions.findIndex((q) => q.id === currentQ.id) + 1;
  const meta = MODULE_META[currentQ.module];

  return (
    <div className="space-y-6">
      {/* Header — module + progress */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge tone="brand" size="xs" uppercase>{meta.label} · {meta.minutes}</Badge>
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] font-mono">
            {props.lockedCount}/{props.totalQuestions} answered · {props.progressPct}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-[var(--surface-deep)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--brand-strong)] transition-[width] duration-500"
            style={{ width: `${props.progressPct}%` }}
            aria-hidden
          />
        </div>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">{meta.tagline}</p>
      </div>

      {/* Question card */}
      <Card key={currentQ.id} className="p-5 sm:p-7 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
            {currentQ.module} · Q{moduleOrdinal}
          </span>
          {currentQ.pushBackTrigger && (
            <Badge tone="warning" size="xs" uppercase>Push-back trigger</Badge>
          )}
        </div>
        <h2 className="font-display text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
          {pick(currentQ.prompt, audience)}
        </h2>
        {currentQ.hint && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)]">
            {pick(currentQ.hint, audience)}
          </p>
        )}

        {/* Signal Module smart helpers — avoid forcing coaches to re-paste
            samples they already imported via /voice. Renders above the
            textarea on signal.q1 (beloved writing) only. */}
        {currentQ.id === "signal.q1" && (
          <SignalImportHelper
            voiceSources={props.voiceSources}
            currentDraft={draft}
            onUseExisting={(text) => setDraft(text)}
            onAppend={(text) => setDraft((prev) => (prev ? `${prev}\n\n${text}` : text))}
          />
        )}

        <QuestionInput
          question={currentQ}
          audience={audience}
          value={draft}
          runId={props.runId}
          onChange={(v) => {
            setDraft(v);
            // Auto-advance for single-choice questions — no Continue needed.
            if (currentQ.kind === "choice") {
              void lockAndAdvance(v);
            }
          }}
        />

        {error && (
          <div
            className="rounded-[var(--r-md)] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-4 py-3 text-[length:var(--t-caption)] text-[color:var(--danger)] font-bold flex items-start gap-2"
            role="alert"
          >
            <span aria-hidden>⚠</span>
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
          {/* Back button — disabled on the very first question */}
          <Button
            onClick={goBack}
            variant="ghost"
            disabled={advancing || !previousQuestionId(currentQ.id, props.variant)}
            className="!px-3"
          >
            ← Back
          </Button>

          <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] flex-1 text-center">
            {currentQ.kind === "choice"
              ? "Pick one — we'll advance automatically."
              : draft
                ? `${draft.length} chars · auto-saved`
                : "Take your time. Auto-saves as you type."}
          </span>

          {/* Continue is hidden for choice questions (auto-advance handles it). */}
          {currentQ.kind !== "choice" && (
            <Button onClick={() => lockAndAdvance()} disabled={advancing}>
              {advancing ? "Advancing…" : props.nextQuestionId ? "Continue →" : "Generate output →"}
            </Button>
          )}
        </div>
      </Card>

      {/* Push-back modal */}
      {pushBackOpen && (
        <PushBackModal
          reason={pushBackReason}
          original={draft}
          options={pushBackOptions}
          loading={loadingOptions}
          onPickA={() => pickPushBackOption("a")}
          onPickB={() => pickPushBackOption("b")}
          onOverride={overridePushBack}
          onClose={() => setPushBackOpen(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// QUESTION INPUT (renders by kind)
// ============================================================

function QuestionInput({
  question, audience, value, onChange, runId,
}: {
  question: Question;
  audience: Audience;
  value: string;
  onChange: (v: string) => void;
  runId: string;
}) {
  const placeholder = question.placeholder ? pick(question.placeholder, audience) : undefined;

  if (question.kind === "text") {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] text-[color:var(--text)] focus:border-[var(--brand-strong)] focus:outline-none"
      />
    );
  }

  if (question.kind === "longtext" || question.kind === "summary") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={8}
        className="w-full px-3 py-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] text-[color:var(--text)] focus:border-[var(--brand-strong)] focus:outline-none leading-[var(--leading-relaxed)]"
      />
    );
  }

  if (question.kind === "pasteBlock") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Paste here. Label each piece by container."}
        rows={16}
        className="w-full px-3 py-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] text-[color:var(--text)] focus:border-[var(--brand-strong)] focus:outline-none leading-[var(--leading-relaxed)] font-mono text-[length:var(--t-caption)]"
      />
    );
  }

  if (question.kind === "list") {
    const target = question.listTarget ?? 5;
    return (
      <div className="space-y-2">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? `One per line. Aim for ${target}.`}
          rows={Math.max(4, target)}
          className="w-full px-3 py-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] text-[color:var(--text)] focus:border-[var(--brand-strong)] focus:outline-none leading-[var(--leading-relaxed)]"
        />
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
          {value.split("\n").filter((l) => l.trim().length > 0).length} / {target}
        </p>
      </div>
    );
  }

  if (question.kind === "scale") {
    const n = parseInt(value, 10);
    const safe = Number.isFinite(n) ? n : 5;
    return (
      <div className="space-y-3">
        <input
          type="range"
          min={1}
          max={10}
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          className="w-full"
        />
        <div className="flex items-center justify-between text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          <span>{question.scale?.lowLabel} (1)</span>
          <span className="font-mono font-bold text-[color:var(--text)] text-[length:var(--t-body)]">{safe}</span>
          <span>{question.scale?.highLabel} (10)</span>
        </div>
      </div>
    );
  }

  if (question.kind === "choice") {
    return (
      <div className="grid sm:grid-cols-3 gap-3">
        {(question.choices ?? []).map((c) => {
          const active = value === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              className={`text-left p-4 rounded-[var(--r-lg)] border transition ${
                active
                  ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] ring-2 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]"
                  : "border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--text-muted)]"
              }`}
            >
              <div className="font-bold text-[length:var(--t-body)] text-[color:var(--text)] mb-1">{c.label}</div>
              {c.description && (
                <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)]">
                  {c.description}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.kind === "scoutTest") {
    return <ScoutTestUI runId={runId} value={value} onChange={onChange} />;
  }

  if (question.kind === "memoryPalace") {
    // Memory Palace specialized UI coming in next build.
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="(Specialized UI coming in next build — for now, answer in your own words and the output will be generated from it.)"
        rows={8}
        className="w-full px-3 py-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] text-[color:var(--text)] focus:border-[var(--brand-strong)] focus:outline-none leading-[var(--leading-relaxed)]"
      />
    );
  }

  return null;
}

// ============================================================
// SCOUT TEST UI — Signal Module Q3
// ============================================================
//
// Three phases:
//   1. empty       → "Generate Scout Test" button. POSTs to /api/brand-os/scout-test.
//   2. generated   → 5 sentence cards. Coach picks exactly 2 they think are AI.
//                    "Reveal" button enabled once 2 are picked.
//   3. revealed    → ✓/✗ on each card + score + summary. Continue moves on.
//
// The answer cell stores the full JSON payload (sentences + truth + picks +
// score) so we can re-render the result on resume / output page without
// re-calling the AI.

type ScoutSentence = { id: string; text: string; isAi: boolean };
type ScoutPayload = {
  phase: "generated" | "revealed";
  sentences: ScoutSentence[];
  userPicks?: string[];
  score?: number;
};

function ScoutTestUI({
  runId, value, onChange,
}: {
  runId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const payload = useMemo<ScoutPayload | null>(() => {
    if (!value) return null;
    try { return JSON.parse(value) as ScoutPayload; } catch { return null; }
  }, [value]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>(payload?.userPicks ?? []);

  useEffect(() => {
    setPicks(payload?.userPicks ?? []);
  }, [payload?.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/brand-os/scout-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      onChange(JSON.stringify(data as ScoutPayload));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not generate test.");
    } finally {
      setBusy(false);
    }
  }

  function togglePick(id: string) {
    setPicks((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 2) return cur; // cap at 2
      return [...cur, id];
    });
  }

  async function reveal() {
    if (picks.length !== 2) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/brand-os/scout-test", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, picks }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      onChange(JSON.stringify(data as ScoutPayload));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not reveal.");
    } finally {
      setBusy(false);
    }
  }

  // ── Phase 1: empty ─────────────────────────────────────────
  if (!payload) {
    return (
      <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-5 space-y-4">
        <div className="space-y-2">
          <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--brand-strong)]">
            How this works
          </p>
          <p className="text-[color:var(--text)] leading-[var(--leading-relaxed)]">
            We'll generate <strong>5 short sentences</strong> using your writing samples.
            <strong> 3 are real</strong> (pulled verbatim from what you wrote).
            <strong> 2 are AI-written</strong> in your style.
          </p>
          <p className="text-[color:var(--text-muted)] text-[length:var(--t-caption)] leading-[var(--leading-relaxed)]">
            Your job: pick the 2 you think are AI. This calibrates how distinct your voice is — and shows you exactly where AI can fake you (so you can lean harder into what it can't).
          </p>
        </div>
        <Button onClick={generate} disabled={busy}>
          {busy ? "Generating…" : "Generate Scout Test →"}
        </Button>
        {err && <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">{err}</p>}
      </div>
    );
  }

  const revealed = payload.phase === "revealed";

  // ── Phase 2 & 3: cards ─────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--brand-strong)]">
          {revealed ? "Results" : "Pick the 2 you think are AI"}
        </p>
        {!revealed && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            {picks.length}/2 picked · Click a sentence to toggle.
          </p>
        )}
      </div>

      <div className="space-y-2">
        {payload.sentences.map((s, idx) => {
          const picked = picks.includes(s.id);
          const correct = revealed && picked && s.isAi;
          const wrong   = revealed && picked && !s.isAi;
          const missed  = revealed && !picked && s.isAi;

          return (
            <button
              key={s.id}
              type="button"
              onClick={() => !revealed && togglePick(s.id)}
              disabled={revealed}
              className={`w-full text-left p-4 rounded-[var(--r-lg)] border transition flex items-start gap-3 ${
                revealed
                  ? correct
                    ? "border-[var(--brand-strong)] bg-[var(--brand-soft)]"
                    : wrong
                      ? "border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]"
                      : missed
                        ? "border-[var(--warning,#F59E0B)] bg-[color-mix(in_srgb,#F59E0B_8%,transparent)]"
                        : "border-[var(--border)] bg-[var(--surface)] opacity-70"
                  : picked
                    ? "border-[var(--brand-strong)] bg-[var(--brand-soft)] ring-2 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]"
                    : "border-[var(--border)] bg-[var(--surface-elevated)] hover:border-[var(--text-muted)]"
              }`}
            >
              <span className="font-mono text-[length:var(--t-caption)] text-[color:var(--text-faint)] mt-0.5 shrink-0 w-5">
                {idx + 1}.
              </span>
              <span className="text-[color:var(--text)] leading-[var(--leading-relaxed)] flex-1">
                {s.text}
              </span>
              {revealed && (
                <span className={`shrink-0 font-bold text-[length:var(--t-caption)] uppercase tracking-wider ${
                  s.isAi ? "text-[color:var(--danger)]" : "text-[color:var(--brand-strong)]"
                }`}>
                  {s.isAi ? "AI" : "You"} {correct && "· ✓"} {wrong && "· ✗"} {missed && "· missed"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!revealed && (
        <Button onClick={reveal} disabled={picks.length !== 2 || busy}>
          {busy ? "Revealing…" : "Reveal results →"}
        </Button>
      )}

      {revealed && (
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[length:var(--t-h2)] font-extrabold text-[color:var(--brand-strong)]">
              {payload.score}/2
            </span>
            <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] uppercase tracking-wider font-bold">
              Calibration score
            </span>
          </div>
          <p className="text-[color:var(--text-muted)] text-[length:var(--t-caption)] leading-[var(--leading-relaxed)]">
            {payload.score === 2
              ? "You can tell your voice apart from AI mimicry. Your distinct edges are real — protect them."
              : payload.score === 1
                ? "AI can fake half your voice. Notice which sentence fooled you — that's the part to sharpen."
                : "AI mimicked you cleanly. Your voice has room to get more specific, more felt, more you. We'll work on this in the output."}
          </p>
        </div>
      )}

      {err && <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">{err}</p>}
    </div>
  );
}

// ============================================================
// PUSH-BACK MODAL
// ============================================================

function PushBackModal({
  reason, original, options, loading,
  onPickA, onPickB, onOverride, onClose,
}: {
  reason: string | null;
  original: string;
  options: { a: string; b: string } | null;
  loading: boolean;
  onPickA: () => void;
  onPickB: () => void;
  onOverride: (reason: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4" onClick={onClose}>
      <div
        className="bg-[var(--surface-elevated)] rounded-[var(--r-xl)] max-w-2xl w-full p-6 shadow-[var(--shadow-lg)] space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <Badge tone="warning" size="xs" uppercase>Heads up · push-back</Badge>
          <button
            onClick={onClose}
            className="text-[length:var(--t-h3)] text-[color:var(--text-muted)] hover:text-[color:var(--text)] leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <h3 className="font-display text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
          {reason ?? "This might read generic. Pick A or B, or keep yours and continue."}
        </h3>
        <blockquote className="border-l-4 border-[var(--brand-strong)] pl-4 py-1 text-[color:var(--text-muted)] italic whitespace-pre-wrap">
          {original}
        </blockquote>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          You always have three options. The push-back never traps you.
        </p>

        {loading ? (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">Generating alternatives…</p>
        ) : (
          <div className="space-y-3">
            <button
              onClick={onPickA}
              className="w-full text-left p-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand-strong)] transition"
            >
              <div className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--brand-strong)] mb-1">Option A · use this</div>
              <div className="text-[color:var(--text)] whitespace-pre-wrap">{options?.a}</div>
            </button>
            <button
              onClick={onPickB}
              className="w-full text-left p-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand-strong)] transition"
            >
              <div className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--brand-strong)] mb-1">Option B · use this</div>
              <div className="text-[color:var(--text)] whitespace-pre-wrap">{options?.b}</div>
            </button>
          </div>
        )}

        {/* Primary escape — always available, one click, no reason required.
            Coach is NEVER trapped. Logged as override with default reason. */}
        <div className="pt-2 border-t border-[var(--border)] space-y-2">
          <Button onClick={() => onOverride("")} block variant="ghost">
            Keep my answer and continue →
          </Button>
          <p className="text-center text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
            (Choosing this watermarks your final output. Won't push back again on this question.)
          </p>
        </div>
      </div>
    </div>
  );
}

function reasonLabel(reason: string | null, markers: string[]): string {
  if (reason === "markers") return `Generic markers detected: ${markers.join(", ")}.`;
  if (reason === "too_short") return "Too short to be specific.";
  if (reason === "famous_figure") return "Comparing yourself to a famous figure. The differentiation is hiding somewhere else.";
  if (reason === "template_match") return "This is the standard coach-landing-page sentence. Try the real version.";
  return "Push-back fired — be more specific or different.";
}

// ============================================================
// SIGNAL IMPORT HELPER — renders above the signal.q1 textarea
// ============================================================
//
// Three paths to populate the writing samples without retyping:
//   1. "Use my existing voice samples" — pulls from cp_voice_training_sources
//      (populated by /voice setup, IG/LinkedIn imports, paste-text path)
//   2. URL import — paste a blog/newsletter URL, server fetches + strips HTML
//   3. Manual paste — fall through to the existing textarea
//
// If the coach has zero voice sources, we surface a link to /voice instead.

function SignalImportHelper({
  voiceSources,
  currentDraft,
  onUseExisting,
  onAppend,
}: {
  voiceSources: VoiceSourceRow[];
  currentDraft: string;
  onUseExisting: (text: string) => void;
  onAppend: (text: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [usedExisting, setUsedExisting] = useState(false);

  const hasSources = voiceSources.length > 0;
  const summary = useMemo(() => groupSourcesByType(voiceSources), [voiceSources]);

  function useExisting() {
    if (!hasSources) return;
    // Format as labelled blocks so the LLM downstream sees structure.
    const blocks = voiceSources.map((s) => {
      const label = formatSourceLabel(s.source_type);
      return `[${label.toUpperCase()}${s.title ? ` · ${s.title}` : ""}]\n${(s.transcript ?? "").trim()}`;
    });
    onUseExisting(blocks.join("\n\n"));
    setUsedExisting(true);
  }

  async function importFromUrl() {
    if (!url.trim()) return;
    setFetching(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/brand-os/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json() as { text?: string; error?: string; title?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (!data.text) throw new Error("No text extracted from that URL.");
      const block = `[URL · ${data.title ?? url.trim()}]\n${data.text}`;
      onAppend(block);
      setUrl("");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "URL import failed.");
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">

      {hasSources ? (
        <>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--brand-strong)]">
                ✓ {voiceSources.length} sample{voiceSources.length === 1 ? "" : "s"} already in your Voice Profile
              </p>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">
                {summary} · You don't have to paste anything if these cover it.
              </p>
            </div>
            <Button
              onClick={useExisting}
              variant={usedExisting ? "ghost" : undefined}
              className="!h-9 !px-3 whitespace-nowrap"
            >
              {usedExisting ? "✓ Filled in" : "Use these →"}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
              No voice samples imported yet
            </p>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1">
              Easiest path: import your Instagram or LinkedIn captions first, then come back here. Or paste below.
            </p>
          </div>
          <a
            href="/voice?return=brand-os"
            className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand-strong)] hover:underline whitespace-nowrap"
          >
            Open /voice →
          </a>
        </div>
      )}

      <div className="border-t border-[var(--border)] pt-3 space-y-2">
        <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
          Or import from a URL
        </p>
        <div className="flex gap-2 flex-wrap">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://yourblog.com/post · or any public URL"
            className="flex-1 min-w-[200px] h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-caption)] focus:border-[var(--brand-strong)] focus:outline-none"
          />
          <Button
            onClick={importFromUrl}
            disabled={fetching || !url.trim()}
            variant="ghost"
            className="!h-10 !px-4 whitespace-nowrap"
          >
            {fetching ? "Fetching…" : "Import"}
          </Button>
        </div>
        {fetchError && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">{fetchError}</p>
        )}
        {currentDraft && currentDraft.length > 0 && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
            Current draft: {currentDraft.length} chars
          </p>
        )}
      </div>

    </div>
  );
}

function groupSourcesByType(sources: VoiceSourceRow[]): string {
  const counts: Record<string, number> = {};
  for (const s of sources) {
    counts[s.source_type] = (counts[s.source_type] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([type, n]) => `${n} ${formatSourceLabel(type).toLowerCase()}${n === 1 ? "" : ""}`)
    .join(" · ");
}

function formatSourceLabel(t: string): string {
  if (t === "instagram") return "Instagram";
  if (t === "linkedin") return "LinkedIn";
  if (t === "newsletter") return "Newsletter";
  if (t === "sales_call") return "Sales call";
  if (t === "voice_note") return "Voice note";
  if (t === "workshop") return "Workshop";
  if (t === "paste") return "Pasted text";
  return t;
}
