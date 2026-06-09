"use client";

// Thin client wrapper for SnapshotReveal · handles the "Continue · $7" handler.

import { useRouter } from "next/navigation";
import SnapshotReveal, { type SnapshotPayload } from "./SnapshotReveal";

type Props = {
  runId: string;
  payload: SnapshotPayload;
};

export default function SnapshotRevealClient({ runId, payload }: Props) {
  const router = useRouter();
  return (
    <SnapshotReveal
      payload={payload}
      onContinueToFullRound={() => {
        // Route to the $7 checkout. tripwire-provision then flips tier='full_round'
        // on this run and the coach lands back at /brand-os/run/[runId].
        router.push(`/brand-os/checkout?run=${runId}`);
      }}
    />
  );
}
