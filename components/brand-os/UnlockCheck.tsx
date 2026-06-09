"use client";

// UnlockCheck · Brand OS v5 · the hour-24 Kahneman question
//
// After hold_until expires, this screen poses the Kahneman question. The
// coach reads two pieces (their three sentences they wrote yesterday, and
// the agent-polished draft) and picks which one is more them.
//
// On submit, set cp_brand_os_runs.unlocked_at = NOW(). From that moment the
// .md export endpoint returns the file. Soap Opera Sequence begins.

import { useCallback, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

type UnlockCheckProps = {
  runId: string;
  threeSentences: string;        // coach's handwritten-then-pasted sentences (Plan tier capture)
  agentDraft: string;            // the polished draft we built from round.unsaid
  onUnlocked: (winner: "three_sentences" | "agent_draft") => void;
};

export default function UnlockCheck({
  runId,
  threeSentences,
  agentDraft,
  onUnlocked,
}: UnlockCheckProps) {
  const [busy, setBusy] = useState(false);

  const handlePick = useCallback(
    async (winner: "three_sentences" | "agent_draft") => {
      setBusy(true);
      // TODO: POST /api/brand-os/v5/unlock { run_id, winner }
      //   → sets unlocked_at = NOW(), logs the winner, triggers Soap Opera Day 1.
      onUnlocked(winner);
    },
    [runId, onUnlocked]
  );

  return (
    <div className="unlock-check mx-auto max-w-3xl px-6 py-16">
      <div className="mb-6 text-center">
        <Badge tone="muted">Twenty-four hours later · the unlock check</Badge>
      </div>

      <h1 className="mb-4 text-center font-serif text-3xl font-bold leading-tight text-ink">
        Two pieces. <em className="italic text-green">Which one is more you?</em>
      </h1>
      <p className="mx-auto mb-12 max-w-xl text-center text-muted">
        Read both slow. Pick whichever feels closer to your real voice. That is the one
        we will ship. The other becomes a draft you can revisit.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="px-7 py-8">
          <div className="mb-3 font-mono text-xs uppercase tracking-widest text-green">
            A · Your three sentences
          </div>
          <p className="mb-6 whitespace-pre-line font-serif text-base italic leading-relaxed text-ink">
            {threeSentences}
          </p>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => handlePick("three_sentences")}
          >
            Ship this one →
          </Button>
        </Card>

        <Card className="px-7 py-8">
          <div className="mb-3 font-mono text-xs uppercase tracking-widest text-green">
            B · The polished draft
          </div>
          <p className="mb-6 whitespace-pre-line font-serif text-base italic leading-relaxed text-ink">
            {agentDraft}
          </p>
          <Button
            variant="primary"
            disabled={busy}
            onClick={() => handlePick("agent_draft")}
          >
            Ship this one →
          </Button>
        </Card>
      </div>

      <p className="mt-10 text-center text-sm italic text-muted">
        Either choice unlocks the calendar and the .md file. The choice itself is the work.
      </p>
    </div>
  );
}
