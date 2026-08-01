"use client";

// The live demo. A visitor pastes a message they actually got and a few lines
// they actually wrote, and watches the same model answer it twice.
//
// The reveal is staged after the response lands rather than dumped at once:
// the generic reply, a beat, then theirs. Both are already in hand, so nothing
// is being faked; the pause is there because reading them side by side at the
// same instant flattens the only thing worth noticing.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EXAMPLE_MESSAGES,
  MESSAGE_MAX,
  VOICE_MAX,
  validateDemoInput,
} from "@/lib/landing/demo";

type Result = { generic: string; yours: string; noticed: string; followUp: string };
type Phase = "idle" | "working" | "generic" | "beat" | "yours" | "done";

const WORKING_LINES = [
  "Reading what they actually asked",
  "Writing the reply anyone would send",
  "Learning how you write",
  "Writing the one that sounds like you",
];

export default function LiveDemo() {
  const [message, setMessage] = useState("");
  const [voiceSample, setVoiceSample] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [workingLine, setWorkingLine] = useState(0);

  // Every pending timer, so a reset or unmount mid-reveal cannot land a
  // setState on a torn-down component or leave a stale phase behind.
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
      1400,
    );
    return () => clearInterval(id);
  }, [phase]);

  const ready = validateDemoInput({ message, voiceSample }).ok;

  async function run() {
    const validated = validateDemoInput({ message, voiceSample });
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
      const res = await fetch("/api/demo/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated.value),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "That did not come back. Try again?");
        setPhase("idle");
        return;
      }

      setResult(data as Result);
      setPhase("generic");
      timers.current.push(setTimeout(() => setPhase("beat"), 900));
      timers.current.push(setTimeout(() => setPhase("yours"), 2100));
      timers.current.push(setTimeout(() => setPhase("done"), 3000));
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

  const showGeneric = phase === "generic" || phase === "beat" || phase === "yours" || phase === "done";
  const showYours = phase === "yours" || phase === "done";

  return (
    <div className="ln-live">
      {!result && (
        <div className="ln-live-form">
          <label className="ln-live-label" htmlFor="ln-msg">
            A message someone actually sent you
          </label>
          <textarea
            id="ln-msg"
            className="ln-live-input"
            rows={3}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Paste it here. A DM, an email, the one still sitting unanswered."
          />
          <div className="ln-live-chips">
            <span className="ln-live-chips-lead">Or use one of these:</span>
            {EXAMPLE_MESSAGES.map((ex) => (
              <button
                key={ex.label}
                type="button"
                className="ln-live-chip"
                onClick={() => setMessage(ex.text)}
              >
                {ex.label}
              </button>
            ))}
          </div>

          <label className="ln-live-label ln-live-label-2" htmlFor="ln-voice">
            Now a few lines you have actually written
          </label>
          <p className="ln-live-hint">
            Any old reply, a caption, a note to a client. This is the only thing
            the second draft gets that the first one does not.
          </p>
          <textarea
            id="ln-voice"
            className="ln-live-input"
            rows={4}
            maxLength={VOICE_MAX}
            value={voiceSample}
            onChange={(e) => setVoiceSample(e.target.value)}
            placeholder="Paste something in your own words. Copy it straight out of your phone."
          />

          {error && <p className="ln-live-error">{error}</p>}

          <button
            type="button"
            className="ln-btn ln-btn-lg ln-live-go"
            onClick={run}
            disabled={!ready || phase === "working"}
          >
            {phase === "working" ? "Working" : "Write both replies"}
          </button>

          {phase === "working" && (
            <div className="ln-live-working" aria-live="polite">
              <span className="ln-typing"><span /><span /><span /></span>
              <span className="ln-live-working-text">{WORKING_LINES[workingLine]}</span>
            </div>
          )}

          <p className="ln-live-fine">
            Nothing you paste is stored. Same model writes both. The only
            difference is one of them read your words.
          </p>
        </div>
      )}

      {result && (
        <div className="ln-live-out">
          <div className={`ln-draft ln-draft-bad ln-live-reveal ${showGeneric ? "is-in" : ""}`}>
            <div className="ln-draft-label">Without your words</div>
            {result.generic}
          </div>

          {phase === "beat" && (
            <div className="ln-live-beat" aria-hidden>
              <span className="ln-typing"><span /><span /><span /></span>
            </div>
          )}

          <div className={`ln-draft ln-draft-good ln-live-reveal ${showYours ? "is-in" : ""}`}>
            <div className="ln-draft-label">In your words</div>
            {result.yours}
          </div>

          {result.noticed && (
            <div className={`ln-live-noticed ln-live-reveal ${phase === "done" ? "is-in" : ""}`}>
              <p className="ln-live-noticed-h">It also noticed</p>
              <p className="ln-live-noticed-b">{result.noticed}</p>
              {result.followUp && <p className="ln-live-noticed-b">{result.followUp}</p>}
            </div>
          )}

          <div className={`ln-live-after ln-live-reveal ${phase === "done" ? "is-in" : ""}`}>
            <button type="button" className="ln-live-again" onClick={reset}>
              Try another message
            </button>
            <a href="/meet" className="ln-btn">Get this for your inbox</a>
          </div>
        </div>
      )}
    </div>
  );
}
