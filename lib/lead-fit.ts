// Lead fit scoring — separate from pipeline score.
//
// Pipeline score (lib/lead-score.ts) answers: "how hot is this lead right now?"
// Fit score answers: "should we even be having this conversation?"
//
// The distinction matters because coaches burn hours on discovery calls with
// leads who were never going to buy (wrong income band, tire-kicker readiness,
// or an explicit disqualify). Fit score surfaces that BEFORE the call, so the
// coach can either qualify harder, drop, or reframe the offer.
//
// Scoring is deterministic + transparent — no ML, no magic. The coach can
// always see which fields drove the band and override if their gut disagrees.

import type {
  Lead,
  LeadIncomeBand,
  LeadReadiness,
  LeadSource,
} from "./types";

export type FitBand = "strong" | "decent" | "weak" | "disqualified";

export type FitAssessment = {
  score: number;       // 0–100
  band: FitBand;
  reasons: string[];   // one-line "why this band" bullets (shown in the UI)
  missingSignals: string[]; // what's not yet captured (prompts to fill in)
};

// Weights — chosen so a "strong" lead roughly requires income band above
// floor + readiness at comparing/ready + completed discovery or warm signal.
// Tweak these when real data shows what actually correlates with closes.
const INCOME_WEIGHT: Record<LeadIncomeBand, number> = {
  under_10k_mo: 5,    // low — offer may be out of reach
  "10k_30k_mo": 28,   // sweet-spot for the $2K cohort
  "30k_plus_mo": 35,  // strong fit for $12K flagship
  unknown: 10,        // neutral — not penalized for not knowing yet
};

const READINESS_WEIGHT: Record<LeadReadiness, number> = {
  researching: 8,
  comparing: 22,
  ready_now: 32,
  dormant_explorer: 6,
  tire_kicker: -15, // actively subtracts — be honest
};

// High-trust sources bias the fit slightly — not a huge bump, but the
// signal-to-noise is real (referrals convert 3–5× cold sources).
const SOURCE_TRUST_BUMP: Record<LeadSource, number> = {
  referral: 12,
  in_person: 10,
  podcast: 6,
  newsletter: 5,
  quiz: 4,
  ig: 2,
  linkedin: 2,
  other: 0,
};

export function assessFit(lead: Lead): FitAssessment {
  // Hard disqualification overrides everything.
  if (lead.disqualified_reason && lead.disqualified_reason.trim()) {
    return {
      score: 0,
      band: "disqualified",
      reasons: [`Disqualified: ${lead.disqualified_reason.trim()}`],
      missingSignals: [],
    };
  }

  const reasons: string[] = [];
  const missingSignals: string[] = [];
  let score = 0;

  // Income
  if (lead.income_band) {
    const w = INCOME_WEIGHT[lead.income_band];
    score += w;
    if (lead.income_band === "30k_plus_mo") reasons.push("Income fits $12K flagship");
    else if (lead.income_band === "10k_30k_mo") reasons.push("Income fits $2K cohort");
    else if (lead.income_band === "under_10k_mo") reasons.push("Below the $2K floor, may need a lower offer");
  } else {
    missingSignals.push("Income band not set");
  }

  // Readiness
  if (lead.readiness_signal) {
    const w = READINESS_WEIGHT[lead.readiness_signal];
    score += w;
    if (lead.readiness_signal === "ready_now") reasons.push("Wants to move in <30 days");
    else if (lead.readiness_signal === "comparing") reasons.push("Actively comparing options");
    else if (lead.readiness_signal === "tire_kicker") reasons.push("Pattern of asking but not committing");
    else if (lead.readiness_signal === "dormant_explorer") reasons.push("Long game, not a 30-day close");
  } else {
    missingSignals.push("Readiness not set");
  }

  // Source trust
  const sourceBump = SOURCE_TRUST_BUMP[lead.source] ?? 0;
  score += sourceBump;
  if (sourceBump >= 10) reasons.push(`High-trust source (${lead.source})`);

  // Completed discovery call is a strong positive signal — they showed up,
  // the coach has a direct read, and we've got context to reference.
  if (lead.discovery_call_completed) {
    score += 10;
    reasons.push("Completed discovery call");
  }

  // Client status is the ceiling — already bought.
  if (lead.status === "client") {
    score += 15;
    reasons.push("Already a client");
  }

  // Clamp and banding
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const band: FitBand =
    clamped >= 65 ? "strong" : clamped >= 40 ? "decent" : "weak";

  return { score: clamped, band, reasons, missingSignals };
}

export const FIT_BAND_LABEL: Record<FitBand, string> = {
  strong: "Strong fit",
  decent: "Decent fit",
  weak: "Weak fit",
  disqualified: "Disqualified",
};

// Tailwind classes — brand-aligned. Strong = green (brand accent),
// decent = amber, weak = gray, disqualified = red.
export const FIT_BAND_CLASS: Record<FitBand, string> = {
  strong: "bg-navy text-brand border-navy",
  decent: "bg-amber-50 text-amber-900 border-amber-300",
  weak: "bg-gray-100 text-gray-700 border-gray-300",
  disqualified: "bg-red-50 text-red-800 border-red-300",
};

export const FIT_BAND_TIP: Record<FitBand, string> = {
  strong: "Book the call. This is the lead you should be moving.",
  decent: "Worth a conversation. Qualify harder on the call, don't assume.",
  weak: "Don't force it. Send one value-first touch, or move them to dormant.",
  disqualified: "Closed the loop. Archive or move to dormant.",
};
