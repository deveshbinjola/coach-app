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

  const currentQ = useMemo(() => getQuestion(currentId), [currentId]);
  const answerMap = useMemo(() => {
    const m: Record<string, AnswerRow> = {};
    for (const a of props.answers) m[a.question_id] = a;
    return m;
  }, [props.answers]);

  const existing = answerMap[currentId]?.raw_text ?? "";
  const [draft, setDraft] = useState(existing);

  // Reset draft when question changes (resume + advance both).
  useEffect(() => { setDraft(existing); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentId]);

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

  async function lockAndAdvance() {
    if (!currentQ) return;
    setError(null);

    // Pre-flight audience: stash to run + advance immediately.
    if (currentQ.id === "preflight.audience") {
      if (!draft) { setError("Pick one to continue."); return; }
      await setRunAudience(draft as Audience);
      await persistDraft(draft);
      await markLocked();
      return advanceTo(props.nextQuestionId);
    }

    // Min-char gating.
    const min = currentQ.minChars ?? 0;
    if (draft.trim().length < min) {
      setError(`Stay with this. We need at least ${min} characters before you can move on.`);
      return;
    }

    // Push-back trigger detection.
    const trigger = triggerForQuestion(currentQ.id);
    if (trigger) {
      const detection = detectPushBack(trigger, draft, audience);
      if (detection.fired) {
        setPushBackReason(reasonLabel(detection.reason, detection.markersMatched));
        setPushBackOpen(true);
        await generatePushBackOptions();
        return; // wait for user choice
      }
    }

    await persistDraft(draft);
    await markLocked();
    advanceTo(props.nextQuestionId);
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
    setPushBackOpen(false);
    await markLocked();
    advanceTo(props.nextQuestionId);
  }

  async function overridePushBack(reason: string) {
    if (!currentQ) return;
    await supabase.from("cp_brand_os_pushbacks").insert({
      run_id: props.runId,
      module: currentQ.module,
      question_id: currentId,
      user_original: draft,
      option_a: pushBackOptions?.a ?? "",
      option_b: pushBackOptions?.b ?? "",
      action: "override",
      override_reason: reason,
    });
    setPushBackOpen(false);
    await markLocked();
    advanceTo(props.nextQuestionId);
  }

  async function markLocked() {
    if (!currentQ) return;
    await supabase
      .from("cp_brand_os_answers")
      .update({ locked_at: new Date().toISOString() })
      .eq("run_id", props.runId)
      .eq("question_id", currentId);
  }

  function advanceTo(targetId: string | null) {
    setAdvancing(true);
    if (!targetId) {
      // End of variant — go to output.
      void supabase
        .from("cp_brand_os_runs")
        .update({ state: "complete", completed_at: new Date().toISOString() })
        .eq("id", props.runId)
        .then(() => router.push(`/brand-os/run/${props.runId}/output`));
      return;
    }
    const target = getQuestion(targetId);
    void supabase
      .from("cp_brand_os_runs")
      .update({
        current_question_id: targetId,
        current_module: target?.module ?? "preflight",
      })
      .eq("id", props.runId)
      .then(() => {
        setCurrentId(targetId);
        setAdvancing(false);
      });
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
      <Card className="p-5 sm:p-7 space-y-4">
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

        <QuestionInput
          question={currentQ}
          audience={audience}
          value={draft}
          onChange={setDraft}
        />

        {error && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]" role="alert">{error}</p>
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
            {draft ? `${draft.length} chars · auto-saved` : "Take your time. Auto-saves as you type."}
          </span>
          <Button onClick={lockAndAdvance} disabled={advancing}>
            {advancing ? "Advancing…" : props.nextQuestionId ? "Continue →" : "Generate output →"}
          </Button>
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
  question, audience, value, onChange,
}: {
  question: Question;
  audience: Audience;
  value: string;
  onChange: (v: string) => void;
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

  if (question.kind === "scoutTest" || question.kind === "memoryPalace") {
    // Future build: special UIs. For now, treat as longtext so the coach can
    // describe / answer in free-form, and we'll re-render them in the output.
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
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[var(--surface-elevated)] rounded-[var(--r-xl)] max-w-2xl w-full p-6 shadow-[var(--shadow-lg)] space-y-4" onClick={(e) => e.stopPropagation()}>
        <Badge tone="warning" size="xs" uppercase>Stop · Push-back fired</Badge>
        <h3 className="font-display text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
          {reason ?? "What you wrote is the same line every coach in your space writes."}
        </h3>
        <blockquote className="border-l-4 border-[var(--brand-strong)] pl-4 py-1 text-[color:var(--text-muted)] italic">
          {original}
        </blockquote>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          Here are 2 differentiated versions. Pick one, modify it, or override with a reason.
        </p>

        {loading ? (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">Generating alternatives…</p>
        ) : (
          <div className="space-y-3">
            <button
              onClick={onPickA}
              className="w-full text-left p-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand-strong)] transition"
            >
              <div className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--brand-strong)] mb-1">Option A</div>
              <div className="text-[color:var(--text)]">{options?.a}</div>
            </button>
            <button
              onClick={onPickB}
              className="w-full text-left p-4 rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--brand-strong)] transition"
            >
              <div className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--brand-strong)] mb-1">Option B</div>
              <div className="text-[color:var(--text)]">{options?.b}</div>
            </button>
          </div>
        )}

        {!overrideOpen ? (
          <div className="flex justify-between gap-3 pt-2">
            <button onClick={() => setOverrideOpen(true)} className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] underline decoration-dotted underline-offset-2">
              Override and keep my answer
            </button>
            <button onClick={onClose} className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Cancel
            </button>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            <label className="block text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
              Override reason
            </label>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Why are you keeping the original? (This appears as a watermark on the final output.)"
              rows={3}
              className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[length:var(--t-caption)] focus:border-[var(--brand-strong)] focus:outline-none"
            />
            <Button onClick={() => onOverride(overrideReason)} disabled={overrideReason.trim().length < 10} block>
              Override + continue
            </Button>
          </div>
        )}
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
