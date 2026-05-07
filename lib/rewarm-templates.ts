// Re-warm pattern library for the silent-lead bucket.
//
// Design intent: coaches know HOW to break silence — the block is the blank
// textarea. These templates are patterns, not scripts. Each one picks a
// different "reason to reach out" so the message doesn't feel like a template.
//
// Patterns aren't generic "hey checking in" — each one maps to a real human
// intention a coach would have:
//   - break_silence_honest: acknowledge the gap, zero pressure
//   - offer_value: show up with something useful, not an ask
//   - specific_thought: reference something real from their world
//   - close_the_loop: the honest "are we still on, or not?" close
//   - shift_the_frame: after a long silence, re-open with a new angle
//
// Each template uses {name} for first-name interpolation. The coach can
// edit freely after injection — these are meant as a starting kick, not a
// finished draft.

import type { Lead, PainSignal, LeadNextAction } from "./types";

export type RewarmPatternId =
  | "break_silence_honest"
  | "offer_value"
  | "specific_thought"
  | "close_the_loop"
  | "shift_the_frame"
  | "referral_ask";

export type RewarmPattern = {
  id: RewarmPatternId;
  label: string; // coach-facing short name
  blurb: string; // one-line intent description
  tone: string; // dominant emotional register, shown as a small chip
  template: string; // draft body — use {name} for first-name swap
  /** When to suggest this as primary (if lead matches any of these signals) */
  fitsPain?: PainSignal[];
  /** When to suggest this as primary (if lead is in this next-action state) */
  fitsAction?: LeadNextAction[];
};

export const REWARM_PATTERNS: RewarmPattern[] = [
  {
    id: "break_silence_honest",
    label: "Honest silence-break",
    blurb: "Acknowledge the gap. Zero pressure. Opens the door.",
    tone: "grounded",
    template: `Hey {name} —

Realized it's been a minute. No agenda with this note. Just wanted to say your name's been on my mind and I didn't want more time to pass without reaching out.

How are you, actually?`,
    fitsAction: ["follow_up_soft"],
  },
  {
    id: "offer_value",
    label: "Show up with something",
    blurb: "Lead with a resource. No ask, no pitch.",
    tone: "generous",
    template: `{name} —

Came across something this week that made me think of you. Sharing in case it's useful, no strings:

[drop one specific resource — a tool, article, framework, or 2-min thought]

Curious if it lands.`,
    fitsAction: ["send_resource"],
  },
  {
    id: "specific_thought",
    label: "Reference their world",
    blurb: "Mention something real from their life or work.",
    tone: "personal",
    template: `Hey {name} —

Was thinking about what you said last time about [the specific thing they shared]. A question that's been sitting with me:

[one sharp question that honors what they told you]

No need to answer quickly. Just wanted to put it in the air.`,
    fitsPain: ["purpose_confusion", "masculinity_identity", "relationship_conflict"],
  },
  {
    id: "close_the_loop",
    label: "Close the loop",
    blurb: "The honest 'are we still on, or not?' close.",
    tone: "direct",
    template: `{name} —

I don't want to be the guy who keeps landing in your inbox if the timing isn't right.

If this work isn't what you need right now, no hard feelings — just let me know and I'll stop reaching out. And if it IS something you want to move on, reply and we'll pick a time.

Either answer is clean.`,
    fitsAction: ["close_loop"],
  },
  {
    id: "shift_the_frame",
    label: "New angle",
    blurb: "After long silence — reopen with a different frame.",
    tone: "curious",
    template: `{name} —

Been thinking about our last conversation from a different angle. You mentioned [their situation] — I've started noticing this pattern with a lot of men in your spot:

[one-sentence insight or reframe]

Not trying to restart the sales convo. Just wanted to share the thought in case it's useful.`,
    fitsPain: ["business_pressure", "burnout", "emotional_numbness"],
  },
  {
    // Only suggested by rankPatternsForLead when the lead is a client or has
    // completed discovery — see +5 bump below. The ask is for a specific man,
    // not a blanket "anyone you know" (which everyone ignores).
    id: "referral_ask",
    label: "Ask for a specific intro",
    blurb: "After a win with them — ask for one man, not 'anyone you know'.",
    tone: "direct",
    template: `{name} —

Genuine question — who's one other man in your orbit right now who's stuck in the same place you were before we started working together?

Not asking for a list. Just one name that comes up.

If it feels right, I'd love an intro. If not, no pressure — just trusting your read.`,
  },
];

/**
 * Rank patterns for a specific lead. The top-ranked is the "primary suggestion";
 * the rest are alternates. Fit rules:
 *   - If any pain signal matches fitsPain → +3
 *   - If next_honest_action matches fitsAction → +4 (stronger — it's explicit intent)
 *   - "referral_ask" gets +5 if the lead is a client OR has completed discovery,
 *     and is HARD-SUPPRESSED otherwise (would be tone-deaf to ask strangers).
 *   - "close_the_loop" gets a +2 bump on severely overdue leads (handled by caller)
 */
export function rankPatternsForLead(lead: Lead): RewarmPattern[] {
  const painSet = new Set<PainSignal>(lead.pain_signal ?? []);
  const eligibleForReferralAsk =
    lead.status === "client" || lead.discovery_call_completed === true;

  const scored = REWARM_PATTERNS
    // Hard filter: referral_ask only shown when the trust is actually there.
    // Asking a cold lead for an intro is the fastest way to burn the relationship.
    .filter((p) => (p.id === "referral_ask" ? eligibleForReferralAsk : true))
    .map((p) => {
      let score = 0;
      if (p.fitsAction && lead.next_honest_action && p.fitsAction.includes(lead.next_honest_action)) {
        score += 4;
      }
      if (p.fitsPain && p.fitsPain.some((s) => painSet.has(s))) {
        score += 3;
      }
      // Strong default bump for referral_ask on eligible leads — it's the
      // highest-ROI pattern we have and most coaches never ask.
      if (p.id === "referral_ask" && eligibleForReferralAsk) {
        score += 5;
      }
      return { p, score };
    });
  // Stable sort: highest score first, ties preserve original order (variety matters)
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.p);
}

/**
 * Interpolate {name} with the lead's first name. Falls back to full_name if
 * we can't split (e.g., single-token names, non-Latin scripts).
 */
export function fillTemplate(pattern: RewarmPattern, lead: Lead): string {
  const firstName = (lead.full_name ?? "").split(/\s+/)[0] || lead.full_name || "there";
  return pattern.template.replace(/\{name\}/g, firstName);
}
