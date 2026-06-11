// components/sessions/SessionDistillStatus.tsx
"use client";
// Felt deposit: on mount (after landing on /sessions/[id]), fire the on-demand
// distill and show the accrual landing.
import { useEffect, useState } from "react";

export default function SessionDistillStatus({ sessionId, clientName }: { sessionId: string; clientName: string }) {
  const [state, setState] = useState<"working" | "done" | "idle">("working");
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/distill`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!alive) return;
        if (res.ok) { setCount(data.deposited ?? 0); setState("done"); }
        else setState("idle");
      } catch { if (alive) setState("idle"); }
    })();
    return () => { alive = false; };
  }, [sessionId]);

  if (state === "idle") return null;
  return (
    <div className="rounded-[var(--r-md)] bg-[var(--brand-soft)] border border-[var(--brand)] px-4 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
      {state === "working"
        ? <>Captured. Adding to {clientName}&rsquo;s memory&hellip;</>
        : <>Remembered {count} thing{count === 1 ? "" : "s"} about {clientName}.</>}
    </div>
  );
}
