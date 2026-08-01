"use client";

// The inbox triage. A coach pastes a week of messages and gets the read back.
//
// Composed as an editorial note rather than a dashboard: a verdict in display
// type, then two quiet lists under hairlines. No progress bars, no status
// dots, no score gauges. The number the engine produced is deliberately not
// the hero, because "answer Marcus first, here is why" is the useful output
// and "score: 118" is trivia.

import { useCallback, useEffect, useRef, useState } from "react";
// lucide, not Phosphor: the rest of the app already standardizes on it, and
// one icon family per project beats a marginally nicer glyph set.
import { ArrowRight, Ban, Clock } from "lucide-react";
import { EXAMPLE_INBOX, INBOX_MAX, validateInbox } from "@/lib/landing/triage";
import type { TriageResult, TriagedLead } from "@/lib/landing/triage";

type Phase = "idle" | "working" | "verdict" | "cold" | "done";

const WORKING_LINES = [
  "Reading the messages",
  "Working out who is who",
  "Checking who has gone quiet",
  "Deciding where your morning goes",
];

export default function InboxTriage() {
  const [inbox, setInbox] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<TriageResult | null>(null);
  const [error, setError] = useState("");
  const [workingLine, setWorkingLine] = useState(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  useEffect(() => {
    if (phase !== "working") return;
    const id = setInterval(
      () => setWorkingLine((n) => Math.min(n + 1, WORKING_LINES.length - 1)),
      1600,
    );
    return () => clearInterval(id);
  }, [phase]);

  const ready = validateInbox({ inbox }).ok;

  async function run() {
    const validated = validateInbox({ inbox });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }

    clearTimers();
    setError("");
    setResult(null);
    setWorkingLine(0);
    setPhase("working");

    try {
      const res = await fetch("/api/demo/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inbox: validated.value }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "That did not come back. Try again?");
        setPhase("idle");
        return;
      }

      setResult(data as TriageResult);
      setPhase("verdict");
      timers.current.push(setTimeout(() => setPhase("cold"), 1100));
      timers.current.push(setTimeout(() => setPhase("done"), 2000));
    } catch {
      setError("Could not reach the assistant. Try again?");
      setPhase("idle");
    }
  }

  function reset() {
    clearTimers();
    setResult(null);
    setPhase("idle");
    setError("");
  }

  if (result) {
    return (
      <TriageRead result={result} phase={phase} onReset={reset} />
    );
  }

  return (
    <div className="ln-triage-form">
      <label className="ln-live-label" htmlFor="ln-inbox">
        Paste a week of messages
      </label>
      <p className="ln-live-hint">
        DMs, emails, whatever is sitting there. Names and rough dates help. It
        reads them the way a good assistant would on Monday morning.
      </p>
      <textarea
        id="ln-inbox"
        className="ln-live-input ln-triage-input"
        rows={9}
        maxLength={INBOX_MAX}
        value={inbox}
        onChange={(e) => setInbox(e.target.value)}
        placeholder={"Marcus, 2 days ago:\nBeen reading your stuff for months. I'm ready to actually do something.\n\nPriya, 11 days ago:\nThanks for the call! Let me talk to my partner and come back to you."}
      />

      <div className="ln-live-chips">
        <button type="button" className="ln-live-chip" onClick={() => setInbox(EXAMPLE_INBOX)}>
          Use a sample week
        </button>
      </div>

      {error && <p className="ln-live-error">{error}</p>}

      <button
        type="button"
        className="ln-btn ln-btn-lg ln-live-go"
        onClick={run}
        disabled={!ready || phase === "working"}
      >
        {phase === "working" ? "Reading" : "Read my inbox"}
      </button>

      {phase === "working" && (
        <div className="ln-live-working" aria-live="polite">
          <span className="ln-typing"><span /><span /><span /></span>
          <span className="ln-live-working-text">{WORKING_LINES[workingLine]}</span>
        </div>
      )}

      <p className="ln-live-fine">
        Nothing you paste is stored. The ranking is the same code that runs
        inside the product, not a demo version of it.
      </p>
    </div>
  );
}

function TriageRead({
  result,
  phase,
  onReset,
}: {
  result: TriageResult;
  phase: Phase;
  onReset: () => void;
}) {
  const { answerFirst, goingCold, notAFit, ranked } = result;
  const showCold = phase === "cold" || phase === "done";
  const showRest = phase === "done";

  return (
    <div className="ln-triage-out">
      {answerFirst && (
        <div className={`ln-live-reveal ${phase !== "idle" ? "is-in" : ""}`}>
          <p className="ln-triage-kicker">Start here</p>
          <h3 className="ln-triage-verdict">{answerFirst.name}</h3>
          <p className="ln-triage-quote">{answerFirst.quote}</p>
          {answerFirst.underneath && (
            <p className="ln-triage-under">{answerFirst.underneath}</p>
          )}
          <ul className="ln-triage-because">
            {answerFirst.fit.reasons.slice(0, 3).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
            {answerFirst.painLabels.slice(0, 2).map((pain) => (
              <li key={pain}>{pain}</li>
            ))}
          </ul>
        </div>
      )}

      {goingCold.length > 0 && (
        <section className={`ln-triage-block ln-live-reveal ${showCold ? "is-in" : ""}`}>
          <h4 className="ln-triage-h">
            <Clock size={17} strokeWidth={1.8} aria-hidden />
            Going quiet
          </h4>
          {goingCold.slice(0, 3).map((lead) => (
            <PersonRow key={lead.name} lead={lead} note={lead.sla.tip} />
          ))}
        </section>
      )}

      {notAFit.length > 0 && (
        <section className={`ln-triage-block ln-live-reveal ${showRest ? "is-in" : ""}`}>
          <h4 className="ln-triage-h">
            <Ban size={17} strokeWidth={1.8} aria-hidden />
            Not where your morning goes
          </h4>
          {notAFit.slice(0, 3).map((lead) => (
            <PersonRow
              key={lead.name}
              lead={lead}
              note={lead.fit.reasons[0] ?? "Nothing here says they are ready to buy."}
            />
          ))}
          <p className="ln-triage-aside">
            Most tools would have written all of these a lovely reply.
          </p>
        </section>
      )}

      <div className={`ln-triage-foot ln-live-reveal ${showRest ? "is-in" : ""}`}>
        <p className="ln-triage-count">
          {ranked.length} {ranked.length === 1 ? "message" : "messages"} read.{" "}
          {notAFit.length > 0
            ? `${notAFit.length} of them did not need you today.`
            : "Every one of them was worth your time."}
        </p>
        <div className="ln-live-after">
          <button type="button" className="ln-live-again" onClick={onReset}>
            Try another week
          </button>
          <a href="/meet" className="ln-btn">Meet your assistant</a>
        </div>
      </div>
    </div>
  );
}

function PersonRow({ lead, note }: { lead: TriagedLead; note: string }) {
  return (
    <div className="ln-triage-row">
      <div className="ln-triage-row-head">
        <span className="ln-triage-name">{lead.name}</span>
        <span className="ln-triage-when">
          {lead.daysAgo === 0
            ? "today"
            : lead.daysAgo === 1
              ? "yesterday"
              : `${lead.daysAgo} days ago`}
        </span>
      </div>
      <p className="ln-triage-row-quote">{lead.quote}</p>
      <p className="ln-triage-row-note">
        <ArrowRight size={13} strokeWidth={2.2} aria-hidden />
        {note}
      </p>
    </div>
  );
}
