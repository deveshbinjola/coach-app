"use client";

// Thin client wrapper for SnapshotReveal. Brand OS is free now — clicking
// "Continue" promotes the run to Full Round and bounces into the runner.
// No Stripe, no payment.

import { useState } from "react";
import { useRouter } from "next/navigation";
import SnapshotReveal, { type SnapshotPayload } from "./SnapshotReveal";

type Props = {
  runId: string;
  payload: SnapshotPayload;
};

export default function SnapshotRevealClient({ runId, payload }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <SnapshotReveal
      payload={payload}
      onContinueToFullRound={async () => {
        if (busy) return;
        setBusy(true);
        try {
          // Promote tier='snapshot' → 'full_round' on this run (free).
          // The runner page picks up the next question automatically.
          await fetch("/api/brand-os/v5/promote-to-full-round", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ run_id: runId }),
          });
        } catch {
          // Best effort; the runner page will re-resolve state on land.
        }
        router.push(`/brand-os/run/${runId}`);
      }}
    />
  );
}
