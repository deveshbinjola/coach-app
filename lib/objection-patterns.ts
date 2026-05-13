// Objection-handling pattern library.
//
// Design intent: coaches freeze mid-call when they hear "too expensive" or
// "need to talk to my partner" because they've never rehearsed the reframe.
// These patterns are NOT scripts — they're structured reframes:
//   - Honor the objection (not dismiss it)
//   - Reflect back what it actually means
//   - Open a real question that moves the conversation forward
//
// Each pattern is one-click-able into Compose. The reframe is the body;
// the follow_up_question is the closer that puts the ball back in their court.
//
// Audience-aware (2026-05-12): each pattern has a default voice register
// (the m-coach-m-aud baseline) PLUS optional overrides per voice register
// (somatic-embodied, softer-direct, embodied-feminine-to-masc, balanced-clear,
// neutral-plural). Coaches see the variant that matches their
// voice_profile_slug. Patterns rank per-lead by income_band + readiness.

import type { Lead, LeadIncomeBand, LeadReadiness } from "./types";
import { getVoiceProfile, type VoiceProfileSlug } from "./voice-profiles";

export type ObjectionPatternId =
  | "price"
  | "timing"
  | "spouse_partner"
  | "value_diy"
  | "trust"
  | "alternative";

export type VoiceRegister =
  | "direct-edge"
  | "softer-direct"
  | "somatic-embodied"
  | "embodied-feminine-to-masc"
  | "balanced-clear"
  | "neutral-plural";

export type ObjectionVariant = { reframe: string; followUp: string };

export type ObjectionPattern = {
  id: ObjectionPatternId;
  label: string;
  // What they actually said — the trigger phrase a coach will recognize.
  theySaid: string;
  // What it usually means underneath (embodied read, not assumption).
  whatItMeans: string;
  // The default reframe (direct-edge / m-coach-m-aud baseline).
  reframe: string;
  // The default follow-up.
  followUp: string;
  // Optional per-register overrides. Falls back to default if missing.
  voiceVariants?: Partial<Record<VoiceRegister, ObjectionVariant>>;
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
    voiceVariants: {
      "somatic-embodied": {
        reframe: `I hear you. And honestly — I don't want you stretching for this if your body isn't a yes underneath.

The question isn't really "is it too much." It's "is the outcome alive enough that you'd choose it if money weren't in the way?"

If that's not a yes, this isn't the right moment. If it is a yes, the work we're actually doing isn't about the number — it's about the part of you that's been quietly carrying the cost of NOT doing it.`,
        followUp: `What's louder right now — the body saying "the cost feels heavy" or the body saying "the cost of not doing this is heavier"?`,
      },
      "embodied-feminine-to-masc": {
        reframe: `I hear that. And I'd rather you not push through on something this size without your nervous system being clear.

The real question isn't whether it costs too much. It's whether you've already been paying a higher price for this staying unsolved — and you've just been better at hiding it.

If the outcome lands true for you, the number stops being the obstacle.`,
        followUp: `What does the cost of staying where you are actually look like — in your sleep, your body, your relationships?`,
      },
      "balanced-clear": {
        reframe: `Fair. And I'd rather you not stretch for this if you're not certain.

The real question is whether the outcome is clear enough to you that the number stops being the obstacle. If it's not, the number is doing what numbers do — telling you the outcome isn't real enough yet.

Let's name which one this is.`,
        followUp: `Is the outcome not clear enough yet, or is the outcome clear but the number itself isn't workable right now?`,
      },
    },
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
    voiceVariants: {
      "somatic-embodied": {
        reframe: `Thank you for being honest with me.

"Not the right time" usually shows up as one of two things. Either there's fear underneath (which is often the signal it IS the time, just not the version that doesn't ask anything of you), or the season truly isn't holding capacity for it right now.

Both are real. I just want to know which one you're feeling, so I can either step back or offer a softer first door.`,
        followUp: `If you slow down and check — is your body saying "later", or is it saying "this, but not this shape"?`,
      },
      "balanced-clear": {
        reframe: `Appreciate the honesty.

"Not the right time" usually splits two ways: either the work itself scares you (which is often the signal it IS the time), or the season genuinely doesn't have capacity for it.

Both are valid. Knowing which lets me either step back cleanly or point to a smaller version that fits.`,
        followUp: `Is this "not now, maybe later" or "this is the right work but the wrong shape"?`,
      },
    },
    rankForReadiness: ["researching", "dormant_explorer"],
  },
  {
    id: "spouse_partner",
    label: "Talk to spouse / partner",
    theySaid: `"I need to talk to my partner."`,
    whatItMeans:
      "Real ~40% of the time. The other 60% it's a soft no they don't want to say in the moment. Both are valid — the reframe has to honor both readings.",
    reframe: `Totally respect that. It's the right call to bring your partner into something like this.

Two things that might help the conversation:

1. They're not deciding if the money is worth it — they're deciding if you're going to do the work. That's a different question.
2. If I can answer anything for them directly, I'd rather do that than have you try to remember my answers.`,
    followUp: `Would it help if I wrote you a 3-sentence summary you can share, or would you rather just have the conversation and come back when you've landed?`,
    voiceVariants: {
      "somatic-embodied": {
        reframe: `Of course. Bringing your partner into something this size is a good move.

Two things that might soften the conversation:

1. They're not really deciding whether the cost is worth it — they're feeling whether you're really in. That's the real question on the table.
2. If they have questions, I'd rather answer them directly than have you carry the weight of explaining for me.`,
        followUp: `Would it help if I wrote a few sentences you could share with them, or do you want to sit with this together first and come back when it's clear?`,
      },
      "balanced-clear": {
        reframe: `Of course. Bringing them in is the right move.

A couple of things that might help:

1. They're not really deciding whether the money is worth it — they're deciding if you're going to actually do this. That's the real question.
2. If there's anything I can answer for them directly, I'd rather do that than have you translate for me.`,
        followUp: `Want me to write a few sentences you can share, or would you rather just have the conversation first?`,
      },
    },
    rankForReadiness: ["comparing", "ready_now"],
  },
  {
    id: "value_diy",
    label: "I can do this myself",
    theySaid: `"I think I can figure this out on my own."`,
    whatItMeans:
      "Usually true — and also usually ignores that 'figuring it out' is a 2-year project they've already been doing. This objection is really about self-reliance as identity, not about ability.",
    reframe: `You probably can. I mean that.

But "I can figure it out" and "I will figure it out in the next 90 days" are different statements. The people who come to me aren't the ones who can't — they're the ones who've been trying on their own for 18 months and finally got honest that white-knuckling through it isn't the same as solving it.

What you'd be paying for isn't information. It's pace.`,
    followUp: `How long have you been trying to figure this one out on your own — and what's changed in that time?`,
    voiceVariants: {
      "somatic-embodied": {
        reframe: `You probably can. I mean it.

And — "I can figure it out" and "I will figure it out in the next 90 days" are different sentences. The women I work with aren't the ones who can't. They're the ones who've been carrying it alone for two years and finally let themselves admit that doing it alone is part of what's been costing them.

What you'd be paying for isn't another framework. It's the part you stop having to hold by yourself.`,
        followUp: `How long have you been holding this one alone — and what's it been costing you, quietly?`,
      },
      "embodied-feminine-to-masc": {
        reframe: `You probably can. I mean that.

And — "I can figure it out" and "I will figure it out in the next 90 days" are different sentences. The men I work with aren't the ones who can't. They're the ones who've been performing self-sufficiency for so long that letting someone in has become the harder thing than doing it alone.

What you'd be paying for isn't information. It's the permission to stop white-knuckling.`,
        followUp: `How long have you been carrying this alone — and what's it cost you to keep performing that you've got it handled?`,
      },
      "balanced-clear": {
        reframe: `You probably can. I mean that.

But "I can figure it out" and "I will figure it out in the next 90 days" are different statements. The people who come to me aren't the ones who can't — they're the ones who've been trying alone for 18 months and finally got honest that pace matters more than approach.

What you'd pay for isn't information. It's the timeline.`,
        followUp: `How long have you been working on this on your own — and what's changed in that time?`,
      },
    },
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

Here's what I actually do differently: [one specific thing — e.g., "we start with breath and body, not goals, because most of the people I work with are already cerebral and that's the block"].

I'm not trying to convince you it works. I'm telling you what I actually do so you can decide if it's the kind of work you actually want.`,
    followUp: `What would you need to see from our first conversation to know if this is the right fit?`,
    voiceVariants: {
      "somatic-embodied": {
        reframe: `Fair. Most coaching is performance theater — I'd be careful too.

Here's what I do that's actually different: [one specific thing — e.g., "we don't start with goals, we start with what your body has been holding that the goals were trying to compensate for"].

I'm not asking you to trust the field. I'm telling you what actually happens here so you can feel whether it's yours.`,
        followUp: `What would you need to feel in our first conversation to know this is your kind of work?`,
      },
      "balanced-clear": {
        reframe: `Fair. Most coaching is branded noise — I'd be cautious too.

Here's what's actually different here: [one specific thing — name the one practice, not a value]. That matters if [the condition where it matters]. Doesn't otherwise.

I'm not selling you on coaching. I'm telling you what I do so you can decide.`,
        followUp: `What would you need to see in our first conversation to know if this is the right fit?`,
      },
    },
    rankForReadiness: ["researching", "comparing"],
  },
  {
    id: "alternative",
    label: "How is this different from X",
    theySaid: `"How is this different from [other coach / program / podcast]?"`,
    whatItMeans:
      "They're triangulating. They've been exposed to a lot of options and need a crisp contrast — not a slam on the alternative, but a clear delta.",
    reframe: `Honest answer: [X] is good at [their actual strength]. If you want [what X delivers], go there — I'll point you myself.

What I do that's different is [one specific dimension — embodied over cognitive, narrow niche over general, small cohort over self-serve]. That matters if [the specific condition where it matters].

Doesn't matter otherwise.`,
    followUp: `When you picture the work actually landing, which of those two pictures fits better?`,
    voiceVariants: {
      "somatic-embodied": {
        reframe: `Honest answer: [X] is good at [their actual strength]. If that's what your body is asking for, go there — I'll point you.

What I do that's different is [one specific dimension — body-led over cognitive, slow over scaled, attachment-aware over performance-aware]. That matters if [the specific condition].

If it doesn't, [X] is your move.`,
        followUp: `When you imagine the work actually landing — which of those two pictures feels more true in your body?`,
      },
    },
    rankForReadiness: ["comparing"],
  },
];

/** Return the variant for a given pattern + voice register. */
export function getObjectionVariant(
  pattern: ObjectionPattern,
  register: VoiceRegister
): ObjectionVariant {
  return (
    pattern.voiceVariants?.[register] ?? {
      reframe: pattern.reframe,
      followUp: pattern.followUp,
    }
  );
}

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
 * Pulls the variant matching the coach's voice profile slug. Falls back to
 * the default (m-coach-m-aud baseline) if no slug provided or no variant
 * defined for this pattern+register pair.
 */
export function renderObjectionDraft(
  pattern: ObjectionPattern,
  lead: Lead,
  profileSlug?: VoiceProfileSlug
): string {
  const firstName = (lead.full_name ?? "").split(/\s+/)[0] || "there";
  const register = profileSlug ? getVoiceProfile(profileSlug).objectionRegister : "direct-edge";
  const variant = getObjectionVariant(pattern, register);
  return `Hey ${firstName} —

${variant.reframe}

${variant.followUp}`;
}
