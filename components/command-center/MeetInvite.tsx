"use client";

// The assistant has not met this coach yet, and says so where they will
// actually see it.
//
// The conversational interview (lib/dhara/interview.ts) only fires once a
// coach opens Dhara. Coaches who joined before the interview existed have
// no reason to open it, so the assistant sat there claiming to know them
// and never asked. This is the invitation.
//
// Trust ladder, Visibility rung (docs/assistant-principles.md): it shows
// the gap and offers the door. It does not redirect, modal, nag, or count
// how long you have ignored it.

import { ArrowRight } from "lucide-react";
import { useDhara } from "@/components/dhara/DharaProvider";

export default function MeetInvite() {
  const { setOpen } = useDhara();
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="group mt-3 flex w-full max-w-2xl items-center justify-between gap-4 rounded-[var(--r-md)] border border-[var(--brand)] bg-[var(--brand-soft)] px-4 py-3 text-left transition hover:bg-[color-mix(in_srgb,var(--brand)_14%,transparent)]"
    >
      <span className="text-[length:var(--t-body)] text-[color:var(--text)]">
        We have not properly met. Two minutes and I can stop guessing.
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[length:var(--t-caption)] font-bold text-[color:var(--brand)]">
        Introduce yourself
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </span>
    </button>
  );
}
