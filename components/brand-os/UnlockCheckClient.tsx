"use client";

// Thin client wrapper for UnlockCheck · POSTs the choice + routes to output.

import { useRouter } from "next/navigation";
import UnlockCheck from "./UnlockCheck";

type Props = {
  runId: string;
  threeSentences: string;
  agentDraft: string;
};

export default function UnlockCheckClient({ runId, threeSentences, agentDraft }: Props) {
  const router = useRouter();
  return (
    <UnlockCheck
      runId={runId}
      threeSentences={threeSentences}
      agentDraft={agentDraft}
      onUnlocked={async (winner) => {
        try {
          await fetch(`/api/brand-os/v5/unlock`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ run_id: runId, winner }),
          });
        } catch {
          // even if the API call fails, the user has chosen; route forward.
        }
        router.push(`/brand-os/run/${runId}/output`);
      }}
    />
  );
}
