"use client";

// Thin client wrapper for HoldScreen · routes to unlock check when timer expires.

import { useRouter } from "next/navigation";
import HoldScreen from "./HoldScreen";

type Props = {
  runId: string;
  holdUntil: string;
};

export default function HoldScreenClient({ runId, holdUntil }: Props) {
  const router = useRouter();
  return (
    <HoldScreen
      runId={runId}
      holdUntil={holdUntil}
      onUnlockReady={() => router.push(`/brand-os/unlock/${runId}`)}
    />
  );
}
