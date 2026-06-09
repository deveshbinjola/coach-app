"use client";

// FullRoundRunner · Brand OS v5 · Tier 2 · $7 paid
//
// Walks the coach through the 11 Full Round questions (round.* + the
// rewritten stance / funnel / distribution prompts). Triggered after a
// successful $7 checkout, which updates cp_brand_os_runs.tier = 'full_round'.
//
// After the final question (distribution.q1) locks, generate the .md output
// and set hold_until = NOW() + INTERVAL '24 hours'. Transition to HoldScreen.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import {
  getQuestion,
  FULL_ROUND_QUESTION_IDS,
  nextQuestionId,
  previousQuestionId,
  pick,
  type Audience,
  type Question,
} from "@/lib/brand-os/questions";
import { generateFullRound } from "@/lib/brand-os/full-round-generator";
import VoiceMicInput from "@/components/VoiceMicInput";

type FullRoundRunnerProps = {
  runId: string;
  audience: Audience;
  onHoldStarted: () => void; // routes to HoldScreen once final question is locked
};

type AnswerMap = Record<string, string>;

export default function FullRoundRunner({
  runId,
  audience,
  onHoldStarted,
}: FullRoundRunnerProps) {
  const [currentId, setCurrentId] = useState<string>(FULL_ROUND_QUESTION_IDS[0]);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [busy, setBusy] = useState(false);

  const q: Question | null = useMemo(() => getQuestion(currentId), [currentId]);
  const idx = FULL_ROUND_QUESTION_IDS.indexOf(currentId);

  // TODO: hydrate from cp_brand_os_answers.
  // TODO: debounced autosave.
  // TODO: real-time push-back + adaptive depth.
  // TODO: per-question agent reflection in Sunny voice.

  const handleNext = useCallback(async () => {
    if (!q) return;
    setBusy(true);
    // TODO: persist + lock answer.
    const next = nextQuestionId(currentId, "full_round");
    if (next) {
      setCurrentId(next);
    } else {
      // Last Full Round question locked. Generate the output + start the 24h hold.
      await generateFullRound(runId);
      onHoldStarted();
    }
    setBusy(false);
  }, [q, currentId, runId, onHoldStarted]);

  const handleBack = useCallback(() => {
    const prev = previousQuestionId(currentId, "full_round");
    if (prev) setCurrentId(prev);
  }, [currentId]);

  if (!q) return null;

  return (
    <div className="full-round-runner mx-auto max-w-2xl px-6 py-12">
      <div className="mb-4 flex items-center justify-between">
        <Badge variant="ghost">
          Full Round · Q{idx + 1} of {FULL_ROUND_QUESTION_IDS.length}
        </Badge>
        <span className="font-mono text-xs text-muted">$7 · 24h hold at end</span>
      </div>

      <h2 className="mb-4 font-serif text-2xl leading-tight text-ink">
        {pick(q.prompt, audience)}
      </h2>

      {q.hint && (
        <p className="mb-6 text-sm italic text-muted">{pick(q.hint, audience)}</p>
      )}

      {(q.kind === "longtext" || q.kind === "pasteBlock") && (
        <VoiceMicInput
          onTranscript={(t) => setAnswers((s) => ({ ...s, [currentId]: t }))}
        />
      )}

      {/* TODO: render kind-specific UI (list, choice, pillarScore, etc) like BrandOsRunner. */}
      <textarea
        className="mb-4 w-full rounded-md border p-4 font-sans text-base text-ink"
        rows={8}
        value={answers[currentId] ?? ""}
        onChange={(e) => setAnswers((s) => ({ ...s, [currentId]: e.target.value }))}
        placeholder={q.placeholder ? pick(q.placeholder, audience) : undefined}
      />

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} disabled={idx === 0 || busy}>
          ← Back
        </Button>
        <Button variant="primary" onClick={handleNext} disabled={busy}>
          {idx === FULL_ROUND_QUESTION_IDS.length - 1
            ? "Generate my Full Round →"
            : "Continue →"}
        </Button>
      </div>
    </div>
  );
}
