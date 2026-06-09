"use client";

// PublicSnapshotRunner · the free, no-auth Snapshot quiz
//
// Five questions. Persists each answer to /api/snapshot/answer. After Q5
// fires /api/snapshot/finish (server-side Anthropic) then routes to the
// public reveal page. No Supabase client — all I/O through the public
// /api/snapshot/* endpoints.

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button } from "@/components/ui";
import {
  getQuestion,
  SNAPSHOT_QUESTION_IDS,
  pick,
  type Audience,
  type Question,
} from "@/lib/brand-os/questions";

type Props = {
  runId: string;
  audience: Audience;
  firstName?: string | null;
  startQuestionId?: string;
};

type AnswerMap = Record<string, string>;

export default function PublicSnapshotRunner({
  runId,
  audience,
  firstName,
  startQuestionId,
}: Props) {
  const router = useRouter();

  const initialId = startQuestionId && SNAPSHOT_QUESTION_IDS.includes(startQuestionId)
    ? startQuestionId
    : SNAPSHOT_QUESTION_IDS[0];

  const [currentId, setCurrentId] = useState<string>(initialId);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q: Question | null = useMemo(() => getQuestion(currentId), [currentId]);
  const idx = SNAPSHOT_QUESTION_IDS.indexOf(currentId);
  const isLast = idx === SNAPSHOT_QUESTION_IDS.length - 1;

  const handleNext = useCallback(async () => {
    if (!q || busy) return;
    const text = (answers[currentId] ?? "").trim();
    if (text.length < 5) {
      setError("A sentence or two. We need something to read.");
      return;
    }
    setError(null);
    setBusy(true);

    try {
      // 1. Persist the answer
      const persistRes = await fetch("/api/snapshot/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, question_id: currentId, raw_text: text }),
      });
      const persistJson = (await persistRes.json()) as { ok: boolean; nextQuestionId?: string | null; error?: string };
      if (!persistJson.ok) {
        setError(persistJson.error ?? "Could not save. Try again.");
        setBusy(false);
        return;
      }

      // 2. If not last, advance
      if (!isLast && persistJson.nextQuestionId) {
        setCurrentId(persistJson.nextQuestionId);
        setBusy(false);
        return;
      }

      // 3. Last question. Fire the generator.
      const finishRes = await fetch("/api/snapshot/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId }),
      });
      const finishJson = (await finishRes.json()) as { ok: boolean; error?: string };
      if (!finishJson.ok) {
        setError(finishJson.error ?? "Could not generate your Snapshot. Try again in a moment.");
        setBusy(false);
        return;
      }

      router.push(`/snapshot/reveal/${runId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error. Try again.");
      setBusy(false);
    }
  }, [q, busy, answers, currentId, isLast, runId, router]);

  const handleBack = useCallback(() => {
    if (idx === 0) return;
    setError(null);
    setCurrentId(SNAPSHOT_QUESTION_IDS[idx - 1]);
  }, [idx]);

  if (!q) return null;

  return (
    <div className="snapshot-runner mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <Badge tone="muted">Snapshot · Q{idx + 1} of {SNAPSHOT_QUESTION_IDS.length}</Badge>
        <span className="font-mono text-xs text-[color:var(--text-faint)]">free · ~3 min</span>
      </div>

      {firstName && idx === 0 && (
        <p className="mb-3 text-sm text-[color:var(--text-muted)]">
          Hey {firstName}. Read each question slow. The first answer that comes is usually the right one.
        </p>
      )}

      <h2 className="mb-4 font-display text-2xl leading-tight text-[color:var(--text)]">
        {pick(q.prompt, audience)}
      </h2>

      {q.hint && (
        <p className="mb-6 text-sm italic text-[color:var(--text-muted)]">{pick(q.hint, audience)}</p>
      )}

      <textarea
        className="mb-3 w-full rounded-md border border-[var(--border)] bg-[var(--surface-elevated)] p-4 font-sans text-base text-[color:var(--text)] focus:border-[var(--brand)] focus:outline-none"
        rows={6}
        value={answers[currentId] ?? ""}
        onChange={(e) => setAnswers((s) => ({ ...s, [currentId]: e.target.value }))}
        placeholder={q.placeholder ? pick(q.placeholder, audience) : undefined}
        autoFocus
      />

      {error && (
        <p className="mb-3 text-sm text-[color:var(--danger)]">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={handleBack} disabled={idx === 0 || busy}>
          ← Back
        </Button>
        <Button variant="primary" onClick={handleNext} disabled={busy}>
          {busy && isLast ? "Reading you…" : busy ? "Saving…" : isLast ? "Read my Snapshot →" : "Continue →"}
        </Button>
      </div>
    </div>
  );
}
