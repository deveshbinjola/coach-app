// Voice profiles — audience-aware default registry.
//
// Triggered by the Missy Rose pilot (2026-05-12). Every default in the
// platform previously assumed a male coach serving men. This registry
// branches voice cues, demo copy, greetings, placeholders, and objection
// language by `coach.voice_profile_slug`.
//
// The slug is derived at onboarding from two questions:
//   1. audience_self    → 'masculine' | 'feminine' | 'integrated'
//   2. audience_serves  → 'men' | 'women' | 'both'
//
// A 3×3 matrix collapses to 6 profiles because what actually differs is
// (a) the coach's voice register (masc/fem/integrated) and
// (b) gendered language toward the audience (men/women/both).
//
// To add a new profile: extend VOICE_PROFILES below and add the slug to
// the DB CHECK constraint on cp_coaches.voice_profile_slug.

export type VoiceProfileSlug =
  | "m-coach-m-aud"     // Masculine coach, men audience (Sunny's baseline)
  | "m-coach-w-aud"     // Masculine coach, women audience
  | "f-coach-w-aud"     // Feminine coach, women audience (Missy's profile)
  | "f-coach-m-aud"     // Feminine coach, men audience
  | "i-coach-single"    // Integrated coach, single audience (men OR women, not both)
  | "i-coach-mixed";    // Integrated coach, mixed/both audiences

export type AudienceSelf = "masculine" | "feminine" | "integrated";
export type AudienceServes = "men" | "women" | "both";

export type InboundPreset = { label: string; text: string };

export type VoiceProfile = {
  slug: VoiceProfileSlug;
  /** Human-readable name shown in /settings. */
  displayName: string;
  /** What we tell coaches when they see this profile auto-selected. */
  description: string;

  /** Seed phrases injected as few-shot examples in voice extractor + drafter. */
  seedPhrases: string[];
  /** Words/phrases the AI should AVOID in this profile's drafts. */
  forbiddenDefaults: string[];

  /** Replaces hard-coded "Welcome back, brother" pattern. */
  greeting: (firstName: string) => string;
  /** Demo inbound DMs shown in onboarding magic-moment step. */
  demoInboundPresets: InboundPreset[];
  /** Voice trainer cue copy (questions + placeholder examples). */
  voiceTrainerCues: {
    belief: { q: string; hint: string; placeholder: string };
    afraid: { q: string; hint: string; placeholder: string };
    signature: { q: string; hint: string; placeholder: string };
  };
  /** Lead-source placeholder text. */
  leadSourcePlaceholder: { ig: string; quiz: string };
  /** Content-workspace audience description fallback. */
  audienceDescription: string;
  /** VoiceMinePanel empty-state placeholder sample. */
  voiceMineSample: string;
  /** Default program/session name. */
  defaultProgramName: string;
  /** Objection-pattern voice variant — used in objection-patterns.ts. */
  objectionRegister: "direct-edge" | "softer-direct" | "somatic-embodied" | "embodied-feminine-to-masc" | "balanced-clear" | "neutral-plural";
};

// ============================================================
// 1. m-coach-m-aud — Masculine × Men (Sunny baseline)
// ============================================================

const M_COACH_M_AUD: VoiceProfile = {
  slug: "m-coach-m-aud",
  displayName: "Masculine coach · men audience",
  description: "Direct, edge-aware, purpose-driven. The Sunny baseline.",
  seedPhrases: [
    "Most guys don't have a discipline problem. They have a clarity problem dressed up as one.",
    "The honest move is the one you've been avoiding for six months.",
    "Stop optimizing the thing that doesn't matter.",
    "Brother. Be where your feet are.",
    "You're not lost. You're avoiding the next true thing.",
  ],
  forbiddenDefaults: ["circle back", "synergy", "I hope this finds you well", "crushing it"],
  greeting: (firstName) => `Welcome back, ${firstName}.`,
  demoInboundPresets: [
    { label: "DM curious",  text: "Hey. Saw your post about masculine clarity. Hit something. Curious what working with you actually looks like?" },
    { label: "Quiz result", text: "Just did your quiz. The 'purpose dressed up as discipline' thing is exactly where I am. What's the next step?" },
    { label: "Hesitant",    text: "Been following you for a while. Honestly not sure I'm ready, but I wanted to reach out. Is now a bad time to start?" },
  ],
  voiceTrainerCues: {
    belief: {
      q: "What's the one belief you keep coming back to with the men you coach?",
      hint: "The thing you'd say to a brother at the start of every call. The phrase your clients quote back to you.",
      placeholder: "Something like: 'Most guys don't have a discipline problem. They have a clarity problem dressed up as one.'",
    },
    afraid: {
      q: "What do you say to a man who's afraid to actually do the work?",
      hint: "Use your real words. The way you'd say it to him in the room, not how you'd write it in a brochure.",
      placeholder: "Speak it the way you'd say it. The exact sentences you use when someone hesitates.",
    },
    signature: {
      q: "What's a phrase or way of saying things that's distinctly YOU?",
      hint: "A turn of phrase, a recurring metaphor, a beat your captions always have. The thing people copy from your style.",
      placeholder: "It could be a rhythm ('short. then a beat. then the punchline.'), a metaphor (honest move, masculine spine, etc.), or something you always end with.",
    },
  },
  leadSourcePlaceholder: { ig: "e.g. IG reel: masculine leadership 2026-04-18", quiz: "IG quiz — masculine leadership" },
  audienceDescription: "Warm, organic, grounded coaching and men's work.",
  voiceMineSample: `The work isn't loud.
It doesn't post about itself.
It just keeps choosing the next honest move.

Most guys don't have a discipline problem.
They have a clarity problem dressed up as one.

[paste more captions, separated by a blank line]`,
  defaultProgramName: "Coaching container",
  objectionRegister: "direct-edge",
};

// ============================================================
// 2. f-coach-w-aud — Feminine × Women (Missy's profile)
// ============================================================

const F_COACH_W_AUD: VoiceProfile = {
  slug: "f-coach-w-aud",
  displayName: "Feminine coach · women audience",
  description: "Somatic, nervous-system, attachment, embodied feminine.",
  seedPhrases: [
    "What's the body saying that the mind isn't admitting yet?",
    "There's no rush. The unfolding has its own timing.",
    "I want to meet the part of you that's holding this.",
    "Let's slow down here, love. What's actually true?",
    "Your nervous system is wiser than your strategy.",
    "This isn't about fixing it. It's about feeling it through.",
    "I see you. The version of you who's been carrying this alone.",
  ],
  forbiddenDefaults: [
    "brother", "guys", "warrior", "edge", "container", "men's work",
    "the work" /* overused men's-coaching code */, "do the work",
    "alpha", "stoic", "circle back", "synergy",
  ],
  greeting: (firstName) => `Welcome back, ${firstName}.`,
  demoInboundPresets: [
    { label: "DM curious",  text: "Saw your post about reclaiming your body after burnout. Hit something. Curious what working with you looks like." },
    { label: "Quiz result", text: "Just did your quiz. The 'I'm armored to function' thing is exactly where I am. What's next?" },
    { label: "Hesitant",    text: "Been following you for a while. Not sure I'm ready. Is now a bad time to start?" },
  ],
  voiceTrainerCues: {
    belief: {
      q: "What's the one belief you keep coming back to with the women you serve?",
      hint: "The thing you'd say to a sister at the start of every session. The phrase your clients quote back to you.",
      placeholder: "Something like: 'Most women don't have a discipline problem. They have a body that's been carrying too much for too long.'",
    },
    afraid: {
      q: "What do you say to a woman who's afraid to actually feel what's underneath?",
      hint: "Use your real words. The way you'd say it to her in the room, not how you'd write it in a brochure.",
      placeholder: "Speak it the way you'd say it. The exact sentences you use when someone freezes.",
    },
    signature: {
      q: "What's a phrase or way of saying things that's distinctly YOU?",
      hint: "A turn of phrase, a recurring metaphor, a beat your captions always have. The thing people copy from your style.",
      placeholder: "It could be a rhythm, a somatic metaphor (returning home, the body remembers, the slow unfurling), or a closing line you always come back to.",
    },
  },
  leadSourcePlaceholder: { ig: "e.g. IG reel: somatic attachment 2026-04-18", quiz: "IG quiz — nervous system reset" },
  audienceDescription: "Somatic, attachment-aware, embodied coaching for women.",
  voiceMineSample: `What's here usually isn't loud.
It's the thing you almost said but didn't.

Most women I work with aren't disconnected from their feelings.
They're disconnected from the body that's been holding them.

[paste more captions, separated by a blank line]`,
  defaultProgramName: "Coaching session",
  objectionRegister: "somatic-embodied",
};

// ============================================================
// 3. m-coach-w-aud — Masculine coach × Women audience
// ============================================================

const M_COACH_W_AUD: VoiceProfile = {
  slug: "m-coach-w-aud",
  displayName: "Masculine coach · women audience",
  description: "Direct but warm. Clear without coldness.",
  seedPhrases: [
    "Direct, but not blunt. Clear, but not cold.",
    "Here's what I'm hearing. Tell me if I'm wrong.",
    "You're not asking the right question yet. Let's find it.",
    "I'll show you the pattern. You decide if it fits.",
  ],
  forbiddenDefaults: ["brother", "guys", "alpha", "stoic"],
  greeting: (firstName) => `Welcome back, ${firstName}.`,
  demoInboundPresets: [
    { label: "DM curious",  text: "Hey. Saw your post — the part about boundaries hit me. Curious what working with you actually looks like?" },
    { label: "Quiz result", text: "Just did your quiz. Results were clearer than anything I've read on this. What's next?" },
    { label: "Hesitant",    text: "Been following for a while. Not sure I'm ready, but I wanted to reach out anyway." },
  ],
  voiceTrainerCues: {
    belief: {
      q: "What's the one belief you keep coming back to with the women you serve?",
      hint: "The thing you'd say at the start of every session. The phrase clients quote back to you.",
      placeholder: "Something like: 'Most women I work with aren't unclear about what they want. They're unsure they're allowed to want it.'",
    },
    afraid: {
      q: "What do you say to a client who's afraid to actually commit?",
      hint: "Use your real words. The way you'd say it in the room, not how you'd write it in a brochure.",
      placeholder: "Speak it the way you'd say it.",
    },
    signature: {
      q: "What's a phrase or way of saying things that's distinctly YOU?",
      hint: "A turn of phrase, a recurring metaphor, a beat your captions always have.",
      placeholder: "It could be a rhythm, a signature metaphor, or something you always end with.",
    },
  },
  leadSourcePlaceholder: { ig: "e.g. IG reel: boundaries + clarity 2026-04-18", quiz: "IG quiz — clarity audit" },
  audienceDescription: "Direct, clarity-focused coaching for women.",
  voiceMineSample: `Your voice isn't loud.
It's the one that doesn't apologize for being clear.

Most women I work with aren't unclear about what they want.
They're unsure they're allowed to want it.

[paste more captions, separated by a blank line]`,
  defaultProgramName: "Coaching session",
  objectionRegister: "softer-direct",
};

// ============================================================
// 4. f-coach-m-aud — Feminine coach × Men audience
// ============================================================

const F_COACH_M_AUD: VoiceProfile = {
  slug: "f-coach-m-aud",
  displayName: "Feminine coach · men audience",
  description: "Embodied feminine meeting masculine. Soft strength.",
  seedPhrases: [
    "I see the part of you that's tired of performing strength.",
    "What if the next layer isn't more drive — what if it's more surrender?",
    "The masculine doesn't need fixing. It needs to be felt.",
    "You don't have to be hard to be strong with me here.",
    "The pressure you're carrying isn't yours to fix alone.",
  ],
  forbiddenDefaults: ["alpha", "stoic", "warrior", "container", "man up"],
  greeting: (firstName) => `Welcome back, ${firstName}.`,
  demoInboundPresets: [
    { label: "DM curious",  text: "Saw your post about the pressure men carry. Something in it hit. Curious what working with you looks like?" },
    { label: "Quiz result", text: "Just did your quiz. The 'over-functioning to feel safe' thing is exactly where I am. What's next?" },
    { label: "Hesitant",    text: "Been following you for a while. Honestly, not sure if I'm the right kind of guy for this. Open to talking though." },
  ],
  voiceTrainerCues: {
    belief: {
      q: "What's the one belief you keep coming back to with the men you serve?",
      hint: "The thing you'd say at the start of every session. The phrase clients quote back to you.",
      placeholder: "Something like: 'Most men aren't disconnected from their strength. They're exhausted by performing it.'",
    },
    afraid: {
      q: "What do you say to a man who's afraid to actually feel?",
      hint: "Use your real words. The way you'd say it to him in the room.",
      placeholder: "Speak it the way you'd say it. The exact sentences you use when a man freezes.",
    },
    signature: {
      q: "What's a phrase or way of saying things that's distinctly YOU?",
      hint: "A turn of phrase, a recurring metaphor, a beat your captions always have.",
      placeholder: "It could be a rhythm, a metaphor (the slow yes, the felt sense, returning home), or something you always end with.",
    },
  },
  leadSourcePlaceholder: { ig: "e.g. IG reel: feeling beneath performance 2026-04-18", quiz: "IG quiz — pressure audit" },
  audienceDescription: "Embodied feminine meeting masculine. Coaching for men.",
  voiceMineSample: `The strength you're performing isn't yours to keep carrying alone.

Most men I work with aren't disconnected from their power.
They're exhausted by performing it.

[paste more captions, separated by a blank line]`,
  defaultProgramName: "Coaching session",
  objectionRegister: "embodied-feminine-to-masc",
};

// ============================================================
// 5. i-coach-single — Integrated × single audience
// ============================================================

const I_COACH_SINGLE: VoiceProfile = {
  slug: "i-coach-single",
  displayName: "Integrated coach · single audience",
  description: "Balanced — neither masculine nor feminine dominates the voice.",
  seedPhrases: [
    "Let's name what's actually happening here.",
    "The next move you take is the one you haven't named yet.",
    "Slow down. There's something here.",
    "What if the work isn't to push harder — it's to look closer?",
  ],
  forbiddenDefaults: ["brother", "guys", "alpha", "warrior"],
  greeting: (firstName) => `Welcome back, ${firstName}.`,
  demoInboundPresets: [
    { label: "DM curious",  text: "Hey. Saw your post — something in it really landed. Curious what working with you actually looks like?" },
    { label: "Quiz result", text: "Just did your quiz. The results hit something I've been avoiding for a while. What's the next step?" },
    { label: "Hesitant",    text: "Been following you for a while. Not sure I'm ready, but I wanted to reach out." },
  ],
  voiceTrainerCues: {
    belief: {
      q: "What's the one belief you keep coming back to with the people you coach?",
      hint: "The thing you'd say to a client at the start of every call. The phrase your clients quote back to you.",
      placeholder: "Something like: 'Most people don't have a discipline problem. They have a clarity problem dressed up as one.'",
    },
    afraid: {
      q: "What do you say to a client who's afraid to actually move forward?",
      hint: "Use your real words. The way you'd say it in the room, not how you'd write it in a brochure.",
      placeholder: "Speak it the way you'd say it. The exact sentences you use when someone hesitates.",
    },
    signature: {
      q: "What's a phrase or way of saying things that's distinctly YOU?",
      hint: "A turn of phrase, a recurring metaphor, a beat your captions always have.",
      placeholder: "It could be a rhythm, a signature metaphor, or something you always end with.",
    },
  },
  leadSourcePlaceholder: { ig: "e.g. IG reel: weekly insight 2026-04-18", quiz: "IG quiz — clarity audit" },
  audienceDescription: "Grounded, integrated coaching.",
  voiceMineSample: `Your voice isn't loud.
It doesn't perform.
It just keeps choosing the next honest move.

Most people don't have a discipline problem.
They have a clarity problem dressed up as one.

[paste more captions, separated by a blank line]`,
  defaultProgramName: "Coaching session",
  objectionRegister: "balanced-clear",
};

// ============================================================
// 6. i-coach-mixed — Integrated × both audiences
// ============================================================

const I_COACH_MIXED: VoiceProfile = {
  slug: "i-coach-mixed",
  displayName: "Integrated coach · mixed audience",
  description: "Plural-aware, neutral. For coaches who serve men and women equally.",
  seedPhrases: [
    "Let's name what's actually happening here.",
    "The people I work with usually arrive at the same threshold from very different doors.",
    "What if the work isn't to push harder — it's to look closer?",
    "The next move you take is the one you haven't named yet.",
  ],
  forbiddenDefaults: ["brother", "guys", "alpha", "warrior", "sister", "love"],
  greeting: (firstName) => `Welcome back, ${firstName}.`,
  demoInboundPresets: [
    { label: "DM curious",  text: "Hey. Saw your post — something in it really landed for me. Curious what working with you actually looks like?" },
    { label: "Quiz result", text: "Just did your quiz. The results hit something I've been avoiding for a while. What's the next step?" },
    { label: "Hesitant",    text: "Been following you for a while. Honestly not sure I'm ready, but I wanted to reach out. Is now a bad time to start?" },
  ],
  voiceTrainerCues: {
    belief: {
      q: "What's the one belief you keep coming back to with the people you coach?",
      hint: "The thing you'd say at the start of every call. The phrase clients quote back to you.",
      placeholder: "Something like: 'Most people don't have a discipline problem. They have a clarity problem dressed up as one.'",
    },
    afraid: {
      q: "What do you say to a client who's afraid to actually move forward?",
      hint: "Use your real words. The way you'd say it in the room.",
      placeholder: "Speak it the way you'd say it. The exact sentences you use when someone hesitates.",
    },
    signature: {
      q: "What's a phrase or way of saying things that's distinctly YOU?",
      hint: "A turn of phrase, a recurring metaphor, a beat your captions always have.",
      placeholder: "It could be a rhythm, a signature metaphor, or something you always end with.",
    },
  },
  leadSourcePlaceholder: { ig: "e.g. IG reel: weekly insight 2026-04-18", quiz: "IG quiz — clarity audit" },
  audienceDescription: "Grounded coaching for men and women.",
  voiceMineSample: `Your voice isn't loud.
It doesn't perform.
It just keeps choosing the next honest thing.

Most people I work with arrive at the same threshold from very different doors.

[paste more captions, separated by a blank line]`,
  defaultProgramName: "Coaching session",
  objectionRegister: "neutral-plural",
};

// ============================================================
// REGISTRY
// ============================================================

export const VOICE_PROFILES: Record<VoiceProfileSlug, VoiceProfile> = {
  "m-coach-m-aud":  M_COACH_M_AUD,
  "m-coach-w-aud":  M_COACH_W_AUD,
  "f-coach-w-aud":  F_COACH_W_AUD,
  "f-coach-m-aud":  F_COACH_M_AUD,
  "i-coach-single": I_COACH_SINGLE,
  "i-coach-mixed":  I_COACH_MIXED,
};

/** Default slug for backfill / when coach hasn't answered onboarding yet.
 *  Sunny's baseline ICP — matches existing copy. */
export const DEFAULT_VOICE_PROFILE_SLUG: VoiceProfileSlug = "m-coach-m-aud";

/** Get a profile by slug. Falls back to the default if slug is null/unknown. */
export function getVoiceProfile(slug: VoiceProfileSlug | null | undefined): VoiceProfile {
  if (!slug) return VOICE_PROFILES[DEFAULT_VOICE_PROFILE_SLUG];
  return VOICE_PROFILES[slug] ?? VOICE_PROFILES[DEFAULT_VOICE_PROFILE_SLUG];
}

/** Derive the profile slug from the two onboarding answers.
 *
 *  Matrix: (audience_self) × (audience_serves) → slug
 *    masculine × men    → m-coach-m-aud
 *    masculine × women  → m-coach-w-aud
 *    masculine × both   → i-coach-mixed   (defer to neutral when serving mixed)
 *    feminine × men     → f-coach-m-aud
 *    feminine × women   → f-coach-w-aud
 *    feminine × both    → i-coach-mixed
 *    integrated × men   → i-coach-single
 *    integrated × women → i-coach-single
 *    integrated × both  → i-coach-mixed
 */
export function deriveProfileSlug(
  audienceSelf: AudienceSelf,
  audienceServes: AudienceServes
): VoiceProfileSlug {
  if (audienceServes === "both") return "i-coach-mixed";
  if (audienceSelf === "masculine") {
    return audienceServes === "men" ? "m-coach-m-aud" : "m-coach-w-aud";
  }
  if (audienceSelf === "feminine") {
    return audienceServes === "men" ? "f-coach-m-aud" : "f-coach-w-aud";
  }
  // integrated × single audience
  return "i-coach-single";
}
