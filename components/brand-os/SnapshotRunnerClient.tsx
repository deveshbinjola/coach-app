"use client";

// Thin client wrapper for SnapshotRunner. Owns useRouter so the server
// page that branches on variant_v stays a server component.

import { useRouter } from "next/navigation";
import SnapshotRunner from "./SnapshotRunner";

type Props = {
  runId: string;
  audience: "M" | "W" | "X";
};

export default function SnapshotRunnerClient({ runId, audience }: Props) {
  const router = useRouter();
  return (
    <SnapshotRunner
      runId={runId}
      audience={audience}
      onComplete={(id) => router.push(`/brand-os/reveal/${id}`)}
    />
  );
}
