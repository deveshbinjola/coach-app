"use client";

// MeetQuiz — the public "assistant interview" teaser at /meet.
//
// Framing: the assistant is interviewing for the job of working for this
// coach. Three taps, instant reactions, an archetype result, then signup.
// Answers persist to localStorage so the /welcome interview step imports
// them after account creation — the coach never answers twice.

import { useEffect, useRef, useState } from "react";
import {
  TIME_DRAIN_OPTIONS,
  HAND_OFF_OPTIONS,
  DESIRE_OPTIONS,
  deriveArchetype,
  saveInterviewAnswers,
  type TimeDrain,
  type HandOffFirst,
  type Desire,
  type Option,
} from "@/lib/assistant-interview";
import { renderArchetypeCard } from "@/lib/meet-share-card";
import { shareOrDownload } from "@/lib/share-card";
import ArchetypeMark from "@/components/meet/ArchetypeMark";
import BrandLogo, { LEAF_PATH, LEAF_STEM_PATH } from "@/components/BrandLogo";

type Screen = "intro" | "q1" | "q2" | "q3" | "result";

// The circle background is on .mq-reaction-av in CSS, so this renders the
// leaf paths only, from the shared source rather than a second copy.
const AssistantAvatar = () => (
  <span className="mq-reaction-av" aria-hidden>
    <svg viewBox="0 0 48 48" fill="none">
      <path d={LEAF_PATH} fill="#FAF8F3" />
      <path d={LEAF_STEM_PATH} stroke="#FAF8F3" strokeWidth="2.7" strokeLinecap="round" />
    </svg>
  </span>
);

// The assistant "types" for a beat before the reaction lands. Makes the
// auto-advance rhythm legible: tap, watch it think, read, move on.
function Reaction({ text }: { text: string }) {
  const [typing, setTyping] = useState(true);
  useEffect(() => {
    setTyping(true);
    const t = setTimeout(() => setTyping(false), 450);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <div className="mq-reaction" role="status">
      <AssistantAvatar />
      <div className="mq-reaction-bubble">
        {typing ? (
          <span className="mq-typing" aria-label="Assistant is typing">
            <span /><span /><span />
          </span>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function SingleChoice<V extends string>({
  options,
  picked,
  onPick,
}: {
  options: Option<V>[];
  picked: V | null;
  onPick: (v: V) => void;
}) {
  return (
    <div className="mq-options">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`mq-opt${picked === o.value ? " picked" : ""}`}
          onClick={() => onPick(o.value)}
        >
          <span className="mq-opt-check">{picked === o.value ? "✓" : ""}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function MeetQuiz() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [timeDrain, setTimeDrain] = useState<TimeDrain | null>(null);
  const [handOffFirst, setHandOffFirst] = useState<HandOffFirst | null>(null);
  const [desires, setDesires] = useState<Desire[]>([]);
  const [sharing, setSharing] = useState(false);
  const [leadEmail, setLeadEmail] = useState("");
  const [leadState, setLeadState] = useState<"idle" | "sending" | "sent" | "saved">("idle");
  const [leadError, setLeadError] = useState<string | null>(null);

  const stepIndex = { intro: 0, q1: 1, q2: 2, q3: 3, result: 4 }[screen];

  const q1Reaction = TIME_DRAIN_OPTIONS.find((o) => o.value === timeDrain)?.reaction;
  const q2Reaction = HAND_OFF_OPTIONS.find((o) => o.value === handOffFirst)?.reaction;

  // Auto-advance: tap an answer, the reaction lands, and after a beat long
  // enough to read it the next question arrives on its own. Re-tapping a
  // different answer restarts the beat. Back/finish cancel it.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function clearAdvance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }
  useEffect(() => clearAdvance, []);

  function go(next: Screen) {
    clearAdvance();
    setScreen(next);
  }

  function pickTimeDrain(v: TimeDrain) {
    setTimeDrain(v);
    clearAdvance();
    advanceTimer.current = setTimeout(() => setScreen("q2"), 2400);
  }

  function pickHandOff(v: HandOffFirst) {
    setHandOffFirst(v);
    clearAdvance();
    advanceTimer.current = setTimeout(() => setScreen("q3"), 2400);
  }

  function toggleDesire(d: Desire) {
    setDesires((cur) =>
      cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d],
    );
  }

  function finish() {
    clearAdvance();
    saveInterviewAnswers({ timeDrain, handOffFirst, desires });
    setScreen("result");
  }

  const archetype = deriveArchetype({ timeDrain, handOffFirst });

  async function share() {
    setSharing(true);
    try {
      const blob = await renderArchetypeCard(archetype);
      await shareOrDownload(blob, `my-assistant-${archetype.slug}.png`);
    } catch {
      /* canvas/share failure is non-fatal — button just does nothing */
    } finally {
      setSharing(false);
    }
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    if (leadState === "sending") return;
    setLeadError(null);
    setLeadState("sending");
    try {
      const res = await fetch("/api/meet/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: leadEmail,
          archetype: archetype.slug,
          answers: { timeDrain, handOffFirst, desires },
          referrer: document.referrer || undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; emailed?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setLeadError(data?.error ?? "Couldn't send that. Try again.");
        setLeadState("idle");
        return;
      }
      // emailed=false means the lead saved but delivery didn't happen
      // (e.g. no key in dev) — say "saved", never claim a send that didn't.
      setLeadState(data.emailed ? "sent" : "saved");
    } catch {
      setLeadError("Couldn't send that. Try again.");
      setLeadState("idle");
    }
  }

  return (
    <div className="mq">
      <div className="mq-inner">
        {/* The shared mark, not a fifth inlined copy of the leaf. */}
        <a href="/login" className="mq-logo" aria-label="Coach Assistant home">
          <BrandLogo iconSize={28} />
        </a>

        {/* key={screen} remounts the block so each question slides in fresh. */}
        <div className="mq-body mq-screen" key={screen}>
        {screen !== "intro" && screen !== "result" && (
          <div className="mq-progress" aria-hidden>
            {[1, 2, 3].map((n) => (
              <div key={n} className={`mq-dot${stepIndex >= n ? " on" : ""}`} />
            ))}
          </div>
        )}

        {screen === "intro" && (
          <div>
            <p className="mq-kicker">The 60-second interview</p>
            <h1 className="mq-hero-title">
              Your assistant is applying <em>for the job.</em>
            </h1>
            <p className="mq-sub">
              Three questions. You&apos;re the boss, it&apos;s the interview.
              By the end you&apos;ll know exactly what kind of assistant your
              coaching business needs. And it&apos;ll know you.
            </p>
            <div className="mq-cta-row">
              <a href="/login" className="mq-back">Sign in</a>
              <button type="button" className="mq-next" onClick={() => go("q1")}>
                Start the interview
              </button>
            </div>
          </div>
        )}

        {screen === "q1" && (
          <div>
            <p className="mq-kicker">Question 1 of 3</p>
            <h1 className="mq-q">What&apos;s eating most of your week?</h1>
            <p className="mq-sub">Tap one. Be honest, it stays between us.</p>
            <SingleChoice options={TIME_DRAIN_OPTIONS} picked={timeDrain} onPick={pickTimeDrain} />
            {q1Reaction && <Reaction text={q1Reaction} />}
            <div className="mq-cta-row">
              <button type="button" className="mq-back" onClick={() => go("intro")}>Back</button>
            </div>
          </div>
        )}

        {screen === "q2" && (
          <div>
            <p className="mq-kicker">Question 2 of 3</p>
            <h1 className="mq-q">You hire a great assistant tomorrow. What do you hand off first?</h1>
            <p className="mq-sub">First thing off your plate, day one.</p>
            <SingleChoice options={HAND_OFF_OPTIONS} picked={handOffFirst} onPick={pickHandOff} />
            {q2Reaction && <Reaction text={q2Reaction} />}
            <div className="mq-cta-row">
              <button type="button" className="mq-back" onClick={() => go("q1")}>Back</button>
            </div>
          </div>
        )}

        {screen === "q3" && (
          <div>
            <p className="mq-kicker">Question 3 of 3</p>
            <h1 className="mq-q">What do you want from your ideal assistant?</h1>
            <p className="mq-sub">Pick everything that&apos;s true. This becomes its job description.</p>
            <div className="mq-options">
              {DESIRE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  className={`mq-opt${desires.includes(o.value) ? " picked" : ""}`}
                  onClick={() => toggleDesire(o.value)}
                >
                  <span className="mq-opt-check">{desires.includes(o.value) ? "✓" : ""}</span>
                  {o.label}
                </button>
              ))}
            </div>
            {desires.length > 0 && (
              <Reaction text={desires.length >= 3 ? "High standards. Good. I work best for coaches who expect a lot." : "Noted. Anything else? Don't be shy."} />
            )}
            <div className="mq-cta-row">
              <button type="button" className="mq-back" onClick={() => go("q2")}>Back</button>
              <button type="button" className="mq-next" disabled={desires.length === 0} onClick={finish}>
                Show me my assistant
              </button>
            </div>
          </div>
        )}

        {screen === "result" && (
          <div>
            <p className="mq-kicker">Interview complete</p>
            <h1 className="mq-hero-title">You need <em>{archetype.name}.</em></h1>

            <div className="mq-result-card">
              <div className="mq-result-head">
                <p className="mq-result-kicker">Your assistant archetype</p>
                <ArchetypeMark slug={archetype.slug} size={40} />
              </div>
              <p className="mq-result-name">{archetype.name}</p>
              <p className="mq-result-tagline">{archetype.tagline}</p>
              <p className="mq-week-label">In week one, your assistant will</p>
              {archetype.weekOne.map((item) => (
                <div key={item} className="mq-week-item">
                  <span className="mq-week-dot" />
                  {item}
                </div>
              ))}
            </div>

            <div className="mq-result-actions">
              <a
                href="/login"
                className="mq-next"
                style={{ width: "100%", textDecoration: "none", textAlign: "center", display: "block" }}
              >
                Meet your assistant. Create your account
              </a>
              <button type="button" className="mq-share" onClick={share} disabled={sharing}>
                {sharing ? "Rendering…" : "Share my archetype"}
              </button>
            </div>

            {leadState === "sent" ? (
              <div className="mq-reaction" role="status">
                <AssistantAvatar />
                <div className="mq-reaction-bubble">
                  Sent. Check your inbox for {archetype.name} and its week-one plan.
                </div>
              </div>
            ) : leadState === "saved" ? (
              <div className="mq-reaction" role="status">
                <AssistantAvatar />
                <div className="mq-reaction-bubble">
                  Saved. Your archetype is waiting for you when you sign up with this email.
                </div>
              </div>
            ) : (
              <form className="mq-lead" onSubmit={submitLead}>
                <p className="mq-lead-label">Not ready yet? Email yourself the result.</p>
                <div className="mq-lead-row">
                  <input
                    type="email"
                    className="mq-lead-input"
                    placeholder="you@yourcoachingbiz.com"
                    value={leadEmail}
                    onChange={(e) => setLeadEmail(e.target.value)}
                    required
                    aria-label="Email address"
                  />
                  <button type="submit" className="mq-share" disabled={leadState === "sending" || !leadEmail}>
                    {leadState === "sending" ? "Sending…" : "Email me my archetype"}
                  </button>
                </div>
                {leadError && <p className="mq-lead-error" role="alert">{leadError}</p>}
              </form>
            )}
            <p className="mq-fine">Free to start. No credit card. Your answers travel with you.</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
