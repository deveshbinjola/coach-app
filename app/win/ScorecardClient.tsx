// The Positioned-to-Win Scorecard — public, no auth. Dark product surface.
//
// One self-contained client flow: intro -> eight questions -> result. Scoring
// is client-side (see scorecard-data). On completion we POST the result to
// /api/win (creates a lead row, even without an email), then attach the email
// when the coach asks for their moves. The CTA hands off to the Brand OS,
// carrying the gap axis so the blueprint can open on the module that closes it.

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  QUESTIONS,
  AXIS_ORDER,
  AXIS_SHORT,
  AXIS_LABEL,
  TIERS,
  GAP_COPY,
  QUICK_WINS,
  AXIS_TO_MODULE,
  scoreAnswers,
  type AxisKey,
  type ScoreResult,
} from "./scorecard-data";

type Phase = "intro" | "quiz" | "result";

type Utm = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
};

// Radar geometry. Six spokes, top-clockwise, matching AXIS_ORDER.
const CENTER = 140;
const RADIUS = 108;
const UNIT: Record<AxisKey, [number, number]> = {
  pov: [0, -1],
  methodology: [0.866, -0.5],
  niche: [0.866, 0.5],
  proof: [0, 1],
  audience: [-0.866, 0.5],
  category: [-0.866, -0.5],
};

function point(axis: AxisKey, value01: number): [number, number] {
  const [ux, uy] = UNIT[axis];
  return [CENTER + RADIUS * value01 * ux, CENTER + RADIUS * value01 * uy];
}

function ring(value01: number): string {
  return AXIS_ORDER.map((a) => point(a, value01).join(",")).join(" ");
}

function Radar({ scores, gapAxis }: { scores: Record<AxisKey, number>; gapAxis: AxisKey }) {
  const poly = AXIS_ORDER.map((a) => point(a, scores[a] / 100).join(",")).join(" ");
  const [gx, gy] = point(gapAxis, scores[gapAxis] / 100);
  return (
    <svg viewBox="0 0 280 280" className="sc-radar-svg" role="img" aria-label="Positioning radar">
      <polygon points={ring(1)} fill="none" stroke="#C9C9BD" strokeWidth="1.2" />
      <polygon points={ring(0.667)} fill="none" stroke="#E5E5DD" strokeWidth="1" />
      <polygon points={ring(0.333)} fill="none" stroke="#E5E5DD" strokeWidth="1" />
      {AXIS_ORDER.map((a) => {
        const [x, y] = point(a, 1);
        return <line key={a} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="#E5E5DD" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="rgba(11,110,35,0.12)" stroke="#0B6E23" strokeWidth="2" />
      {AXIS_ORDER.map((a) => {
        const [x, y] = point(a, scores[a] / 100);
        if (a === gapAxis) return null;
        return <circle key={a} cx={x} cy={y} r="3" fill="#0B6E23" />;
      })}
      <circle cx={gx} cy={gy} r="6.5" fill="none" stroke="#9A6A12" strokeWidth="2.5" />
      <circle cx={gx} cy={gy} r="3.5" fill="#9A6A12" />
      {AXIS_ORDER.map((a) => {
        const [x, y] = point(a, 1.18);
        return (
          <text
            key={a}
            x={x}
            y={y}
            className="sc-radar-label"
            fill={a === gapAxis ? "#9A6A12" : "#5A5A6E"}
            textAnchor="middle"
            dominantBaseline="middle"
          >
            {AXIS_SHORT[a]}
          </text>
        );
      })}
    </svg>
  );
}

export default function ScorecardClient() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<ScoreResult | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emailDone, setEmailDone] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const leadId = useRef<string | null>(null);
  const utm = useRef<Utm>({});
  const answerLog = useRef<Array<{ q_id: string; choice: string; points: number }>>([]);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      utm.current = {
        utm_source: p.get("utm_source") || undefined,
        utm_medium: p.get("utm_medium") || undefined,
        utm_campaign: p.get("utm_campaign") || undefined,
        referrer: document.referrer || undefined,
      };
    } catch {
      /* no-op */
    }
  }, []);

  const total = QUESTIONS.length;

  async function createLead(r: ScoreResult) {
    try {
      const res = await fetch("/api/win", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: answerLog.current,
          axis_scores: r.axisScores,
          total: r.total,
          tier: r.tier,
          gap_axis: r.gapAxis,
          ...utm.current,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      if (data.id) leadId.current = data.id;
    } catch {
      /* completion still shows; capture is best-effort */
    }
  }

  function choose(c: { key: string; points: number }) {
    const q = QUESTIONS[idx];
    const nextAnswers = { ...answers, [q.id]: c.points };
    answerLog.current = [
      ...answerLog.current.filter((a) => a.q_id !== q.id),
      { q_id: q.id, choice: c.key, points: c.points },
    ];
    setAnswers(nextAnswers);

    if (idx + 1 < total) {
      setIdx(idx + 1);
    } else {
      const r = scoreAnswers(nextAnswers);
      setResult(r);
      setPhase("result");
      void createLead(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function back() {
    if (idx > 0) setIdx(idx - 1);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setEmailErr(null);
    const clean = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      setEmailErr("Enter a valid email.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/win", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: leadId.current, email: clean, name: name.trim() || undefined }),
      });
      if (!res.ok) throw new Error();
      setEmailDone(true);
    } catch {
      setEmailErr("Could not save. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  }

  const gapLabel = result ? AXIS_LABEL[result.gapAxis] : "";
  const gapModule = result ? AXIS_TO_MODULE[result.gapAxis] : "";
  const moves = useMemo(
    () => (result ? QUICK_WINS[result.gapAxis] : []),
    [result],
  );

  return (
    <div className="sc-root">
      <style>{CSS}</style>

      {/* ── INTRO ───────────────────────────────────────── */}
      {phase === "intro" && (
        <div className="sc-wrap sc-intro">
          <div className="sc-eyebrow">— Free Scorecard · 2 minutes</div>
          <h1 className="sc-h1">
            Are you still positioned to win, or about to get erased by an AI-native coach?
          </h1>
          <p className="sc-sub">
            Eight questions score your brand on the six things AI cannot copy. Then you see the one
            gap holding you back, and three moves to close it.
          </p>
          <ul className="sc-get">
            <li><span className="sc-gk">1</span>Your positioning score, and a map of where you are strong and where you are exposed.</li>
            <li><span className="sc-gk">2</span>The one gap to fix first, named in plain words.</li>
            <li><span className="sc-gk">3</span>Three specific moves to close it this week. Free, yours to keep.</li>
          </ul>
          <button className="sc-cta" onClick={() => setPhase("quiz")}>
            Take the scorecard →
            <small>Free · 8 questions · about 2 minutes</small>
          </button>
          <p className="sc-trust">
            Built for coaches doing deep inner, transformational, embodiment work, at $10K to $30K a
            month. No call. No pitch. See your score, keep the moves.
          </p>
        </div>
      )}

      {/* ── QUIZ ────────────────────────────────────────── */}
      {phase === "quiz" && (
        <div className="sc-wrap sc-quiz">
          <div className="sc-progress">
            <div className="sc-progress-fill" style={{ width: `${(idx / total) * 100}%` }} />
          </div>
          <div className="sc-qmeta">
            <span>Question {idx + 1} of {total}</span>
            {idx > 0 && <button className="sc-back" onClick={back}>← Back</button>}
          </div>
          <h2 className="sc-qtext">{QUESTIONS[idx].text}</h2>
          <div className="sc-opts">
            {QUESTIONS[idx].choices.map((c) => {
              const selected = answers[QUESTIONS[idx].id] === c.points;
              return (
                <button
                  key={c.key}
                  className={`sc-opt${selected ? " sc-opt-on" : ""}`}
                  onClick={() => choose(c)}
                >
                  {c.text}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RESULT ──────────────────────────────────────── */}
      {phase === "result" && result && (
        <div className="sc-wrap sc-result">
          <div className="sc-eyebrow">— Your Positioned-to-Win score</div>
          <div className="sc-score">
            {result.total}<small>/100</small>
          </div>
          <div className={`sc-tier sc-tier-${result.tier}`}>
            {TIERS[result.tier].symbol} {TIERS[result.tier].label.toUpperCase()}
          </div>
          <p className="sc-tier-line">{TIERS[result.tier].line}</p>

          <Radar scores={result.axisScores} gapAxis={result.gapAxis} />

          <div className="sc-gap">
            <div className="sc-gap-l">Your single leverage point</div>
            <div className="sc-gap-t">{gapLabel} · {result.axisScores[result.gapAxis]}/100</div>
            <div className="sc-gap-d">{GAP_COPY[result.gapAxis]}</div>
          </div>

          <div className="sc-moves">
            <div className="sc-moves-l">Your 3 moves · free, do this week</div>
            {moves.map((m, i) => (
              <div key={i} className="sc-move"><span className="sc-move-n">{i + 1}</span><span>{m}</span></div>
            ))}
          </div>

          {/* Email capture — value is already on screen; this saves it + warms the lead */}
          {!emailDone ? (
            <form className="sc-email" onSubmit={submitEmail}>
              <div className="sc-email-l">Want these emailed to you?</div>
              <input
                className="sc-input"
                type="text"
                placeholder="First name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <input
                className="sc-input"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {emailErr && <div className="sc-email-err">{emailErr}</div>}
              <button className="sc-email-btn" type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Email me my moves"}
              </button>
            </form>
          ) : (
            <div className="sc-email-done">On its way. Check your inbox.</div>
          )}

          <a className="sc-cta sc-cta-handoff" href={`/brand-os?from=scorecard&gap=${result.gapAxis}`}>
            Close the gap with your Brand OS Blueprint
            <small>Free · 10 minutes · built to fix your {gapModule.toLowerCase()}</small>
          </a>
          <p className="sc-restart">
            <button onClick={() => { setPhase("intro"); setIdx(0); setAnswers({}); setResult(null); answerLog.current = []; }}>
              Retake the scorecard
            </button>
          </p>
        </div>
      )}
    </div>
  );
}

const CSS = `
.sc-root{min-height:100vh;background:#FAFAF8;color:#0A0F1C;font-family:"Plus Jakarta Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.sc-root *{box-sizing:border-box}
.sc-wrap{max-width:560px;margin:0 auto;padding:48px 22px 72px}
.sc-eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:.66rem;letter-spacing:.16em;text-transform:uppercase;color:#0B6E23;margin-bottom:16px}

/* intro */
.sc-h1{font-family:"Fraunces","Plus Jakarta Sans",Georgia,serif;font-size:2.1rem;line-height:1.14;font-weight:800;color:#0A0F1C;margin:0 0 16px}
.sc-sub{font-size:1rem;line-height:1.6;color:#5A5A6E;margin:0 0 26px}
.sc-get{list-style:none;padding:0;margin:0 0 30px;display:flex;flex-direction:column;gap:14px}
.sc-get li{display:flex;gap:12px;align-items:flex-start;font-size:.94rem;line-height:1.45;color:#0A0F1C}
.sc-gk{flex:0 0 auto;width:22px;height:22px;border-radius:50%;background:rgba(11,110,35,.12);color:#0B6E23;font-weight:800;font-size:.74rem;display:flex;align-items:center;justify-content:center;font-family:ui-monospace,monospace}
.sc-cta{display:block;width:100%;text-align:center;background:#0B6E23;color:#FAF8F3;border:none;cursor:pointer;font-family:inherit;font-weight:800;font-size:1.02rem;padding:16px;border-radius:14px;box-shadow:0 8px 22px -10px rgba(11,110,35,.5);transition:transform .12s ease,background .12s ease}
.sc-cta:hover{background:#085119;transform:translateY(-1px)}
.sc-cta small{display:block;font-weight:500;font-size:.72rem;color:#0a3315;margin-top:3px}
.sc-trust{font-size:.8rem;line-height:1.55;color:#9CA3AF;margin:18px 0 0;text-align:center}

/* quiz */
.sc-progress{height:4px;background:#E5E5DD;border-radius:2px;overflow:hidden;margin-bottom:22px}
.sc-progress-fill{height:100%;background:linear-gradient(90deg,#0B6E23,#13a23c);border-radius:2px;transition:width .3s ease}
.sc-qmeta{display:flex;align-items:center;justify-content:space-between;font-family:ui-monospace,monospace;font-size:.7rem;letter-spacing:.06em;color:#5A5A6E;text-transform:uppercase;margin-bottom:14px}
.sc-back{background:none;border:none;color:#5A5A6E;font-family:inherit;font-size:.7rem;cursor:pointer;letter-spacing:.04em}
.sc-back:hover{color:#0A0F1C}
.sc-qtext{font-family:"Fraunces","Plus Jakarta Sans",Georgia,serif;font-size:1.45rem;line-height:1.28;font-weight:700;color:#0A0F1C;margin:0 0 24px}
.sc-opts{display:flex;flex-direction:column;gap:10px}
.sc-opt{text-align:left;background:#FFFFFF;border:1px solid #E5E5DD;color:#0A0F1C;font-family:inherit;font-size:.95rem;line-height:1.4;padding:16px 18px;border-radius:12px;cursor:pointer;box-shadow:0 1px 2px rgba(10,15,28,.04);transition:border-color .12s ease,background .12s ease,transform .08s ease}
.sc-opt:hover{border-color:#0B6E23;background:#F4F8F2;transform:translateX(2px)}
.sc-opt-on{border-color:#0B6E23;background:rgba(11,110,35,.07)}

/* result */
.sc-result{text-align:center}
.sc-result .sc-eyebrow{text-align:left}
.sc-score{font-family:"Fraunces",Georgia,serif;font-size:4rem;font-weight:800;color:#0A0F1C;line-height:1;margin:2px 0 8px}
.sc-score small{font-size:1.2rem;color:#9CA3AF;font-weight:500}
.sc-tier{display:inline-block;font-family:ui-monospace,monospace;font-size:.72rem;font-weight:600;padding:4px 14px;border-radius:20px;letter-spacing:.06em}
.sc-tier-positioned_to_win{color:#0B6E23;background:rgba(11,110,35,.10);border:1px solid rgba(11,110,35,.35)}
.sc-tier-at_risk{color:#9A6A12;background:rgba(154,106,18,.12);border:1px solid rgba(154,106,18,.4)}
.sc-tier-commodity_zone{color:#B23A2E;background:rgba(178,58,46,.08);border:1px solid rgba(178,58,46,.35)}
.sc-tier-line{font-size:.92rem;line-height:1.5;color:#5A5A6E;max-width:420px;margin:14px auto 6px}
.sc-radar-svg{width:100%;max-width:260px;display:block;margin:6px auto 4px}
.sc-radar-label{font-family:ui-monospace,monospace;font-size:8.5px;letter-spacing:.04em}
.sc-gap{text-align:left;background:#FFFFFF;border:1px solid rgba(11,110,35,.30);border-radius:16px;padding:20px;margin:16px 0;box-shadow:0 4px 14px rgba(10,15,28,.06)}
.sc-gap-l{font-family:ui-monospace,monospace;font-size:.6rem;color:#0B6E23;letter-spacing:.12em;text-transform:uppercase;margin-bottom:7px}
.sc-gap-t{color:#0A0F1C;font-weight:700;font-size:1.08rem;margin-bottom:5px}
.sc-gap-d{color:#5A5A6E;font-size:.9rem;line-height:1.5}
.sc-moves{text-align:left;margin:0 0 20px}
.sc-moves-l{font-family:ui-monospace,monospace;font-size:.62rem;color:#5A5A6E;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px}
.sc-move{display:flex;gap:12px;align-items:flex-start;font-size:.92rem;line-height:1.45;color:#0A0F1C;margin-bottom:12px}
.sc-move-n{flex:0 0 auto;width:22px;height:22px;border-radius:6px;background:rgba(11,110,35,.12);color:#0B6E23;font-family:ui-monospace,monospace;font-weight:700;font-size:.74rem;display:flex;align-items:center;justify-content:center}
.sc-email{text-align:left;background:#FFFFFF;border:1px solid #E5E5DD;border-radius:14px;padding:18px;margin-bottom:16px;display:flex;flex-direction:column;gap:10px;box-shadow:0 4px 14px rgba(10,15,28,.06)}
.sc-email-l{font-weight:700;color:#0A0F1C;font-size:.95rem}
.sc-input{background:#F2F2EE;border:1px solid #C9C9BD;color:#0A0F1C;font-family:inherit;font-size:.92rem;padding:12px 14px;border-radius:10px;outline:none}
.sc-input:focus{border-color:#0B6E23}
.sc-input::placeholder{color:#9CA3AF}
.sc-email-err{color:#B23A2E;font-size:.8rem}
.sc-email-btn{background:#FFFFFF;border:1px solid #0B6E23;color:#0B6E23;font-family:inherit;font-weight:700;font-size:.92rem;padding:12px;border-radius:10px;cursor:pointer}
.sc-email-btn:hover{background:rgba(11,110,35,.07)}
.sc-email-btn:disabled{opacity:.6;cursor:default}
.sc-email-done{text-align:left;color:#0B6E23;font-size:.9rem;background:rgba(11,110,35,.08);border:1px solid rgba(11,110,35,.25);border-radius:12px;padding:14px 18px;margin-bottom:16px}
.sc-cta-handoff{margin-top:4px}
.sc-restart{margin:16px 0 0}
.sc-restart button{background:none;border:none;color:#9CA3AF;font-family:inherit;font-size:.82rem;text-decoration:underline;cursor:pointer}
.sc-restart button:hover{color:#5A5A6E}

@media(max-width:480px){
  .sc-h1{font-size:1.8rem}.sc-qtext{font-size:1.28rem}.sc-score{font-size:3.4rem}
}
`;
