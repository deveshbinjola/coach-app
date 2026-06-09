"use client";

// SnapshotRunner · Brand OS v5 · Tier 1 · free
//
// Walks the coach through the 5 Snapshot questions (snapshot.audience through
// snapshot.refrain). State stored in cp_brand_os_runs with variant_v = 'v5'
// and tier = 'snapshot'. No auth required; runs anonymously until Q5 lock.
//
// After Q5 locks, transition to SnapshotReveal.

import { useCallback, useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui";
import {
  getQuestion,
  SNAPSHOT_QUESTION_IDS,
  nextQuestionId,
  previousQuestionId,
  pick,
  type Audience,
  type Question,
} from "@/lib/brand-os/questions";
import VoiceMicInput from "@/components/VoiceMicInput";

type SnapshotRunnerProps = {
  runId: string;            // existing cp_brand_os_runs.id (created on landing)
  audience: Audience;       // chosen at landing time or defaulted to "X"
  onComplete: (snapshotRunId: string) => void;
};

type AnswerMap = Record<string, string>;

export default function SnapshotRunner({
  runId,
  audience,
  onComplete,
}: SnapshotRunnerProps) {
  const [currentId, setCurrentId] = useState<string>(SNAPSHOT_QUESTION_IDS[0]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [busy, setBusy] = useState(false);

  const q: Question | null = useMemo(() => getQuestion(currentId), [currentId]);
  const idx = SNAPSHOT_QUESTION_IDS.indexOf(currentId);

  // TODO: hydrate answers from cp_brand_os_answers on mount (for resume).
  // TODO: debounced autosave on each keystroke (reuse BrandOsRunner pattern).
  // TODO: real-time push-back via pushback.detectPushBack for trigger questions.
  // TODO: per-question agent reflection (call reflection-agent after lock).

  const handleNext = useCallback(async () => {
    if (!q) return;
    const text = (answers[currentId] ?? "").trim();
    if (text.length < 5) return;
    setBusy(true);

    try {
      // Persist via the same public endpoint (it accepts any run that's
      // anonymous OR matches a coach via the admin client — the in-app
      // SnapshotRunner uses the legacy auth'd persist below for now).
      await fetch("/api/snapshot/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, question_id: currentId, raw_text: text }),
      });

      const next = nextQuestionId(currentId, "snapshot");
      if (next) {
        setCurrentId(next);
        setBusy(false);
        return;
      }

      // Last question. Fire the generator via API (not direct lib call).
      await fetch("/api/snapshot/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId }),
      });
      onComplete(runId);
    } finally {
      setBusy(false);
    }
  }, [q, currentId, answers, runId, onComplete]);

  const handleBack = useCallback(() => {
    const prev = previousQuestionId(currentId, "snapshot");
    if (prev) setCurrentId(prev);
  }, [currentId]);

  if (!q) return null;

  return (
    <div className="snapshot-runner mx-auto max-w-2xl px-6 py-12">
      <div className="mb-4 flex items-center justify-between">
        <Badge tone="muted">Snapshot · Q{idx + 1} of {SNAPSHOT_QUESTION_IDS.length}</Badge>
        <span className="font-mono text-xs text-muted">free · ~3 min</span>
      </div>

      <h2 className="mb-4 font-serif text-2xl leading-tight text-ink">
        {pick(q.prompt, audience)}
      </h2>

      {q.hint && (
        <p className="mb-6 text-sm italic text-muted">{pick(q.hint, audience)}</p>
      )}

      {/* Multimodal: voice memo accepted for longtext + pasteBlock kinds */}
      {(q.kind === "longtext" || q.kind === "pasteBlock") && (
        <VoiceMicInput
          onTranscript={(t) => setAnswers((s) => ({ ...s, [currentId]: t }))}
        />
      )}

      <textarea
        className="mb-4 w-full rounded-md border p-4 font-sans text-base text-ink"
        rows={6}
        value={answers[currentId] ?? ""}
        onChange={(e) => setAnswers((s) => ({ ...s, [currentId]: e.target.value }))}
        placeholder={q.placeholder ? pick(q.placeholder, audience) : undefined}
      />

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} disabled={idx === 0 || busy}>
          ← Back
        </Button>
        <Button variant="primary" onClick={handleNext} disabled={busy}>
          {idx === SNAPSHOT_QUESTION_IDS.length - 1 ? "Read my Snapshot →" : "Continue →"}
        </Button>
      </div>
    </div>
  );
}
