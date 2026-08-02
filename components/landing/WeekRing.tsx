"use client";

// The week ring.
//
// The copy asks "how much of last week did you actually spend coaching?" and
// then answers it with a list. This lets the reader answer it themselves.
//
// The page rule is no invented statistics, which rules out a chart of made-up
// industry averages. Every number here comes off the reader's own two sliders,
// so the only claim being made is arithmetic they can check. That is also why
// the copy says "went somewhere else" rather than "was admin": we do not know
// what those hours were, and pretending to would be the same lie in a nicer
// font.

import { useState } from "react";

const R = 84;
const CIRC = 2 * Math.PI * R;

export default function WeekRing() {
  const [worked, setWorked] = useState(50);
  const [coached, setCoached] = useState(12);

  // Coaching hours can never exceed hours worked, so the top slider drags the
  // bottom one down with it rather than letting the ring go past full.
  const coachedClamped = Math.min(coached, worked);
  const elsewhere = worked - coachedClamped;
  const pct = worked === 0 ? 0 : Math.round((coachedClamped / worked) * 100);

  return (
    <div className="lx-ring-card">
      <figure className="lx-ring-figure" aria-hidden>
        <svg viewBox="0 0 200 200">
          <circle className="lx-ring-track" cx="100" cy="100" r={R} />
          <circle
            className="lx-ring-arc"
            cx="100"
            cy="100"
            r={R}
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC - (CIRC * pct) / 100}
          />
        </svg>
        <figcaption className="lx-ring-centre">
          <span className="lx-ring-pct">{pct}%</span>
          <span className="lx-ring-pct-label">Coaching</span>
        </figcaption>
      </figure>

      <div className="lx-ring-body">
        <p className="lx-ring-q">Answer it with your own week.</p>

        <div className="lx-ring-field">
          <div className="lx-ring-field-head">
            <label className="lx-ring-field-label" htmlFor="lx-worked">
              Hours you worked
            </label>
            <span className="lx-ring-field-val">{worked}</span>
          </div>
          <input
            id="lx-worked"
            className="lx-range"
            type="range"
            min={10}
            max={80}
            step={1}
            value={worked}
            aria-valuetext={`${worked} hours worked`}
            onChange={(e) => {
              const next = Number(e.target.value);
              setWorked(next);
              if (coached > next) setCoached(next);
            }}
          />
        </div>

        <div className="lx-ring-field">
          <div className="lx-ring-field-head">
            <label className="lx-ring-field-label" htmlFor="lx-coached">
              Hours you were actually coaching
            </label>
            <span className="lx-ring-field-val">{coachedClamped}</span>
          </div>
          <input
            id="lx-coached"
            className="lx-range"
            type="range"
            min={0}
            max={worked}
            step={1}
            value={coachedClamped}
            aria-valuetext={`${coachedClamped} hours coaching`}
            onChange={(e) => setCoached(Number(e.target.value))}
          />
        </div>

        {/* Polite, not assertive: this updates on every drag and should never
            interrupt what a screen reader is already saying. */}
        <p className="lx-ring-read" aria-live="polite">
          You worked <strong>{worked} hours</strong>. {coachedClamped} of them
          were coaching. <em>{elsewhere} went somewhere else.</em>
        </p>
      </div>
    </div>
  );
}
