"use client";

// HoldScreen · Brand OS v5 · the 24-hour Tartt integration check
//
// After Full Round generation, the calendar is built but the .md export is
// locked. Coach can browse the output inline, cannot copy or download.
//
// Counts down to hold_until (cp_brand_os_runs.hold_until). At hour 24, fires
// the unlock check email and shows the "open the unlock check" CTA, which
// routes to UnlockCheck.
//
// Pause is the product. Do not make this skippable.

import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

type HoldScreenProps = {
  runId: string;
  holdUntil: string;             // ISO timestamp
  onUnlockReady: () => void;     // routes to UnlockCheck when timer hits 0
};

function diff(from: Date, to: Date) {
  const ms = Math.max(0, to.getTime() - from.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { h, m, s, done: ms === 0 };
}

export default function HoldScreen({ runId, holdUntil, onUnlockReady }: HoldScreenProps) {
  const target = useMemo(() => new Date(holdUntil), [holdUntil]);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { h, m, s, done } = diff(now, target);

  useEffect(() => {
    if (done) onUnlockReady();
  }, [done, onUnlockReady]);

  return (
    <div className="hold-screen mx-auto max-w-2xl px-6 py-20 text-center">
      <div className="mb-6">
        <Badge variant="amber">Held · the pause is the product</Badge>
      </div>

      <h1 className="mb-4 font-serif text-4xl font-bold leading-tight text-ink">
        Your calendar is built. <em className="italic text-green">We are holding it.</em>
      </h1>
      <p className="mx-auto mb-10 max-w-lg text-muted">
        The .md export unlocks in twenty-four hours. Sleep on it. Sit with the draft. At
        hour 24 you will get an email with one question. Answer it and the file is yours.
      </p>

      <Card className="mb-10 inline-block px-12 py-8">
        <div className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
          Time remaining
        </div>
        <div className="font-serif text-6xl font-bold text-green">
          {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
        </div>
      </Card>

      <div className="mb-6 text-sm italic text-muted">
        You can read the draft right now. You cannot copy it. You cannot download it.
        <br />
        Tomorrow at this time, you will know if it is still the post you want to ship.
      </div>

      {done && (
        <Button variant="neon" onClick={onUnlockReady}>
          Open the unlock check →
        </Button>
      )}
    </div>
  );
}
