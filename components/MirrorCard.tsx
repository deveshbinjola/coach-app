"use client";

import { useState } from "react";
import { Loader2, ArrowRight, Check } from "lucide-react";
import type { MirrorRead, SystemType } from "@/lib/mirror";

const TYPE_META: Record<SystemType, { emoji: string; label: string; tint: string; soft: string }> = {
  recipe: { emoji: "🍳", label: "A Recipe", tint: "var(--success)", soft: "var(--success-soft)" },
  puzzle: { emoji: "🧩", label: "A Puzzle", tint: "var(--info)", soft: "var(--info-soft)" },
  garden: { emoji: "🌱", label: "A Garden", tint: "var(--brand)", soft: "var(--brand-soft)" },
  fire:   { emoji: "🔥", label: "A Fire",   tint: "var(--danger)", soft: "var(--danger-soft)" },
};

type Phase = "idle" | "loading" | "result" | "error";

export default function MirrorCard() {
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [read, setRead] = useState<MirrorRead | null>(null);
  const [readId, setReadId] = useState<string | null>(null);
  const [tapped, setTapped] = useState<"yes" | "not_quite" | null>(null);
  const [errMsg, setErrMsg] = useState("");

  async function submit() {
    if (input.trim().length < 10) {
      setErrMsg("Tell me a little more about what you're working through.");
      setPhase("error");
      return;
    }
    setPhase("loading");
    setErrMsg("");
    try {
      const res = await fetch("/api/mirror", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrMsg(data?.error ?? "Something went wrong.");
        setPhase("error");
        return;
      }
      setRead(data.read as MirrorRead);
      setReadId(data.id ?? null);
      setTapped(null);
      setPhase("result");
    } catch {
      setErrMsg("Could not reach the Mirror. Try again.");
      setPhase("error");
    }
  }

  async function tap(value: "yes" | "not_quite") {
    setTapped(value);
    if (!readId) return;
    try {
      await fetch("/api/mirror", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: readId, tap: value }),
      });
    } catch {
      /* the read still stands even if the tap didn't save */
    }
  }

  function reset() {
    setInput("");
    setRead(null);
    setReadId(null);
    setTapped(null);
    setPhase("idle");
  }

  // ── Result ──────────────────────────────────────────────────────────
  if (phase === "result" && read) {
    // Clarification path: one question, no label.
    if (read.needs_clarification && read.clarifying_question) {
      return (
        <div className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-md)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">One thing first</p>
          <p className="mt-2 font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--text)]">
            {read.clarifying_question}
          </p>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={3}
            className="mt-4 w-full resize-none rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)] outline-none focus:border-[var(--brand)]"
          />
          <button onClick={submit} className="mt-3 inline-flex items-center gap-2 rounded-[var(--r-pill)] bg-[var(--brand)] px-5 py-2.5 text-sm font-bold text-[var(--text-inverse)]">
            Answer <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      );
    }

    // Crisis path: framework suppressed, human voice only.
    if (read.is_crisis) {
      return (
        <div className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-md)]">
          <p className="font-[family-name:var(--font-display)] text-xl leading-snug text-[var(--text)]">
            {read.mirror_line ?? "This sounds heavy. Step back from the work for a moment, and reach a real person you trust."}
          </p>
          <button onClick={reset} className="mt-5 text-sm font-semibold text-[var(--text-muted)] underline-offset-4 hover:underline">
            Start over
          </button>
        </div>
      );
    }

    const meta = read.system_type ? TYPE_META[read.system_type] : null;
    return (
      <div className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-md)]">
        {meta && (
          <span
            className="inline-flex items-center gap-2 rounded-[var(--r-pill)] px-3 py-1.5 text-sm font-bold"
            style={{ background: meta.soft, color: meta.tint }}
          >
            {meta.emoji} {meta.label}
          </span>
        )}

        {read.mirror_line && (
          <p className="mt-4 font-[family-name:var(--font-display)] text-[1.45rem] font-semibold leading-[1.35] text-[var(--text)]">
            {read.mirror_line}
          </p>
        )}

        {read.the_mistake && (
          <div className="mt-4 rounded-[var(--r-md)] border-l-[3px] border-[var(--warning)] bg-[var(--warning-soft)] p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">The mistake</p>
            <p className="mt-1 text-[0.95rem] leading-relaxed text-[var(--text)]">{read.the_mistake}</p>
          </div>
        )}

        {read.the_move && (
          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-faint)]">The move</p>
            <p className="mt-1 text-[0.95rem] leading-relaxed text-[var(--text-muted)]">{read.the_move}</p>
          </div>
        )}

        {/* The investment tap */}
        <div className="mt-6 flex items-center gap-2.5">
          {tapped ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-muted)]">
              <Check className="h-4 w-4 text-[var(--brand)]" /> Logged
            </span>
          ) : (
            <>
              <button onClick={() => tap("yes")} className="flex-1 rounded-[var(--r-md)] bg-[var(--brand-soft)] py-2.5 text-sm font-bold text-[var(--brand)] transition-opacity hover:opacity-80">
                That&apos;s me
              </button>
              <button onClick={() => tap("not_quite")} className="flex-1 rounded-[var(--r-md)] border border-[var(--border)] py-2.5 text-sm font-bold text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)]">
                Not quite
              </button>
            </>
          )}
          <button onClick={reset} className="px-2 text-sm font-semibold text-[var(--text-faint)] hover:text-[var(--text-muted)]">
            New
          </button>
        </div>
      </div>
    );
  }

  // ── Input ───────────────────────────────────────────────────────────
  return (
    <div className="rounded-[var(--r-xl)] border border-[var(--border)] bg-[var(--surface-elevated)] p-6 shadow-[var(--shadow-md)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">◇ The Mirror</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl leading-tight text-[var(--text)]">
        What are you working through right now?
      </h2>
      <textarea
        value={input}
        onChange={(e) => { setInput(e.target.value); if (phase === "error") setPhase("idle"); }}
        rows={4}
        placeholder="One stuck thing, in your own words..."
        disabled={phase === "loading"}
        className="mt-4 w-full resize-none rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] p-3.5 text-[0.95rem] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--brand)] disabled:opacity-60"
      />
      {phase === "error" && <p className="mt-2 text-sm text-[var(--danger)]">{errMsg}</p>}
      <button
        onClick={submit}
        disabled={phase === "loading"}
        className="mt-4 inline-flex items-center gap-2 rounded-[var(--r-pill)] bg-[var(--brand)] px-6 py-3 text-sm font-bold text-[var(--text-inverse)] transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {phase === "loading" ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Holding it up...</>
        ) : (
          <>Hold it up to the mirror <ArrowRight className="h-4 w-4" /></>
        )}
      </button>
    </div>
  );
}
