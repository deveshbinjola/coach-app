// Objection-handling pattern library.
//
// Design intent: coaches freeze mid-call when they hear "too expensive" or
// "need to talk to my wife" because they've never rehearsed the reframe.
// These patterns are NOT scripts — they're structured reframes in the
// embodied/resonance-marketing register:
//   - Honor the objection (not dismiss it)
//   - Reflect back what it actually means
//   - Open a real question that moves the conversation forward
//
// Each pattern is one-click-able into Compose. The reframe is the body;
// the follow_up_question is the closer that puts the ball back in their court.
//
// Patterns are ranked per-lead by income_band + readiness — e.g. price
// objection ranks higher for under_10k_mo + researching, spouse objection
// ranks higher when next_honest_action = hold, etc.

import type { Lead, LeadIncomeBand, LeadReadiness } from "./types";

export type ObjectionPatternId =
  | "price"
  | "timing"
  | "spouse_partner"
  | "value_diy"
  | "trust"
  | "alternative";

export type ObjectionPattern = {
  id: ObjectionPatternId;
  label: string;
  // What they actually said — the trigger phrase a coach will recognize.
  theySaid: string;
  // What it usually means underneath (embodied read, not assumption).
  whatItMeans: string;
  // The reframe — honors the objection, reflects, no pressure.
  reframe: string;
  // The one question that closes the loop.
  followUp: string;
  // When to rank this higher
  rankForIncome?: LeadIncomeBand[];
  rankForReadiness?: LeadReadiness[];
};

export const OBJECTION_PATTERNS: ObjectionPattern[] = [
  {
    id: "price",
    label: "Price",
    theySaid: `"It's too expensive."`,
    whatItMeans:
      "Usually not about the number. It's about uncertainty that the outcome will actually land — so the number looks like risk, not investment.",
    reframe: `I hear you. And I'd rather you NOT stretch for this if the certainty isn't there on the other side.

The real question isn't "is it too much" — it's "is the outcome real enough that you'd pay it if you knew it was guaranteed?"

If that's a no, we shouldn't be having this conversation. If it's a yes, the gap we're actually working on is the certainty, not the number.`,
    followUp: `Which is it for you — is the outcome not clear enough yet, or is the outcome clear but the number itself isn't workable right now?`,
    rankForIncome: ["under_10k_mo", "10k_30k_mo"],
    rankForReadiness: ["researching", "comparing"],
  },
  {
    id: "timing",
    label: "Timing / not right now",
    theySaid: `"Not the right time."`,
    whatItMeans:
      "Usually code for 'I don't want to say no and I don't want to say yes.' The timing problem is almost never real — the clarity problem is.",
    reframe: `Appreciate you being honest.

One thing I've noticed — "not the right time" is almost always one of two things. Either the work scares you (which is usually the signal it IS the time), or it genuinely doesn't fit the season you're in (family, health, money).

I'm not trying to flip you. Just want to know which one it is, so I can either step back cleanly or point to something smaller that fits the season.`,
    followUp: `Honestly — is this "not now, maybe later" or "this is the right work but the wrong version"?`,
    rankForReadiness: ["researching", "dormant_explorer"],
  },
  {
    id: "spouse_partner",
    label: "Talk to spouse / partner",
    theySaid: `"I need to talk to my wife / partner."`,
    whatItMeans:
      "Real ~40% of the time. The other 60% it's a soft no they don't want to say in the moment. Both are valid — the reframe has to honor both readings.",
    reframe: `Totally respect that. It's the right call to bring her into something like this.

Two things that might help the conversation:

1. She's not deciding if the money is worth it — she's deciding if you're going to do the work. That's a different question.
2. If I can answer anything for her directly, I'd rather do that than have you try to remember my answers.`,
    followUp: `Would it help if I wrote you a 3-sentence summary you can send her, or would you rather just have the conversation and come back when you've landed?`,
    rankForReadiness: ["comparing", "ready_now"],
  },
  {
    id: "value_diy",
    label: "I can do this myself",
    theySaid: `"I think I can figure this out on my own."`,
    whatItMeans:
      "Usually true — and also usually ignores that 'figuring it out' is a 2-year project you've already been doing. This objection is really about self-reliance as identity, not about ability.",
    reframe: `You probably can. I mean that.

But "I can figure it out" and "I will figure it out in the next 90 days" are different statements. The guys who come to me aren't the ones who can't — they're the ones who've been trying on their own for 18 months and finally got honest that white-knuckling through it isn't the same as solving it.

The work you'd be paying for isn't information. It's pace.`,
    followUp: `How long have you been trying to figure this one out on your own — and what's changed in that time?`,
    rankForIncome: ["30k_plus_mo"],
    rankForReadiness: ["comparing", "researching"],
  },
  {
    id: "trust",
    label: "Never worked with a coach",
    theySaid: `"I've never done coaching before / not sure it works."`,
    whatItMeans:
      "Real caution, not stalling. They've seen the coaching industry from the outside and most of it is noise. They need the 'what's different here' answer to be specific, not branded.",
    reframe: `Fair. Most coaching is performance theater — I'd be skeptical too.

Here's what I actually do differently: [one specific thing — e.g., "we start with breath and body, not goals, because every man I work with is already cerebral and that's the block"].

I'm not trying to convince you it works. I'm telling you what I actually do so you can decide if it's the work you actually want.`,
    followUp: `What would you need to see from our first conversation to know if this is your kind of work?`,
    rankForReadiness: ["researching", "comparing"],
  },
  {
    id: "alternative",
    label: "How is this different from X",
    theySaid: `"How is this different from [other coach / program / podcast]?"`,
    whatItMeans:
      "They're triangulating. They've been exposed to a lot of options and need a crisp contrast — not a slam on the alternative, but a clear delta.",
    reframe: `Honest answer: [X] is good at [their actual strength]. If you want [what X delivers], go there — I'll point you myself.

What I do that's different is [one specific dimension — embodied over cognitive, men's work over general, small cohort over self-serve]. That matters if [the specific condition where it matters].

Doesn't matter otherwise.`,
    followUp: `When you picture the work actually landing, which of those two pictures fits better?`,
    rankForReadiness: ["comparing"],
  },
];

/**
 * Rank patterns for a lead. Scoring:
 *   +3 if income_band matches rankForIncome
 *   +3 if readiness_signal matches rankForReadiness
 *   +2 if next_honest_action is 'hold' and pattern is spouse_partner or timing
 *     (those are the "stalled but not dead" classics)
 *   +1 if pain_signal includes 'business_pressure' and pattern is price
 */
export function rankObjectionsForLead(lead: Lead): ObjectionPattern[] {
  const scored = OBJECTION_PATTERNS.map((p) => {
    let score = 0;
    if (lead.income_band && p.rankForIncome?.includes(lead.income_band)) score += 3;
    if (lead.readiness_signal && p.rankForReadiness?.includes(lead.readiness_signal)) {
      score += 3;
    }
    if (lead.next_honest_action === "hold" && (p.id === "spouse_partner" || p.id === "timing")) {
      score += 2;
    }
    if ((lead.pain_signal ?? []).includes("business_pressure") && p.id === "price") {
      score += 1;
    }
    return { p, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.p);
}

/**
 * Render an objection pattern as a message draft — reframe + follow-up.
 * Coach edits from there.
 */
export function renderObjectionDraft(pattern: ObjectionPattern, lead: Lead): string {
  const firstName = (lead.full_name ?? "").split(/\s+/)[0] || "there";
  return `Hey ${firstName} —

${pattern.reframe}

${pattern.followUp}`;
}
