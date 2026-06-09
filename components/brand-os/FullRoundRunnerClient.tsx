"use client";

// Thin client wrapper for FullRoundRunner. Owns useRouter so the server
// page that branches on variant_v stays a server component.

import { useRouter } from "next/navigation";
import FullRoundRunner from "./FullRoundRunner";

type Props = {
  runId: string;
  audience: "M" | "W" | "X";
};

export default function FullRoundRunnerClient({ runId, audience }: Props) {
  const router = useRouter();
  return (
    <FullRoundRunner
      runId={runId}
      audience={audience}
      onHoldStarted={() => router.push(`/brand-os/hold/${runId}`)}
    />
  );
}
