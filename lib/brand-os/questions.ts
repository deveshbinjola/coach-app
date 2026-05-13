// Brand OS Agent v2 — canonical question registry.
//
// Source: deliverables/brand-os-agent-v2/2026-05-12-spec.md
//
// Every question is audience-aware via the BranchedText type. The UI
// renders questions one at a time; the agent picks the right branch by
// run.audience.
//
// Push-back triggers are flagged via `pushBackTrigger: true`. The UI runs
// a marker-detection pass before locking the answer. If a marker hits, a
// server endpoint generates 2 differentiated alternatives.

export type Audience = "M" | "W" | "X";
export type ModuleId = "preflight" | "mirror" | "signal" | "stance" | "funnel" | "distribution" | "broadcast";

export type BranchedText = string | { M: string; W: string; X: string };

export type QuestionKind =
  | "text"        // single-line text input
  | "longtext"    // multi-line textarea
  | "pasteBlock"  // very long paste-box (writing samples, etc.)
  | "scale"       // 1-10 slider
  | "list"        // accept N items (one per line)
  | "choice"      // one of N preset choices
  | "scoutTest"   // Module 2 Q3 — agent generates, coach picks
  | "memoryPalace" // Module 3 Q13 — 4 sub-fields per stance
  | "summary";    // agent-rendered summary, coach confirms

export type Question = {
  id:                 string;                // stable slug, e.g. "mirror.q1"
  module:             ModuleId;
  order:              number;                // ordinal within the module (1..N)
  kind:               QuestionKind;
  /** Question prompt shown to the coach. Branch-aware. */
  prompt:             BranchedText;
  /** Short helper line below the prompt. Optional. */
  hint?:              BranchedText;
  /** Placeholder shown inside the input. Optional. */
  placeholder?:       BranchedText;
  /** Minimum characters before the coach can advance. 0 = optional. */
  minChars?:          number;
  /** Fires push-back marker detection on lock. */
  pushBackTrigger?:   boolean;
  /** For scale: { lowLabel, highLabel }. */
  scale?:             { lowLabel: string; highLabel: string };
  /** For choice: enum of options. */
  choices?:           Array<{ value: string; label: string; description?: string }>;
  /** For list: target number of items. */
  listTarget?:        number;
  /** Tag for downstream UI heuristics (e.g. "required-input" blocks output if missing). */
  flags?:             Array<"required-input" | "blocking" | "long">;
};

// Helper: pick the right branch of a BranchedText for a given audience.
export function pick(text: BranchedText, audience: Audience): string {
  return typeof text === "string" ? text : text[audience];
}

// ============================================================
// PRE-FLIGHT
// ============================================================

const PREFLIGHT: Question[] = [
  {
    id: "preflight.audience",
    module: "preflight",
    order: 1,
    kind: "choice",
    prompt: "Who do you coach?",
    hint: "This shapes every question that follows. The structure stays the same. The texture changes.",
    choices: [
      { value: "M", label: "Men",   description: "Masculine-coded language · men's-work voice bank · punchy short-line content" },
      { value: "W", label: "Women", description: "Feminine-coded language · women's voice bank · longer-breath embodied content" },
      { value: "X", label: "Mixed", description: "Both, or audience-fluid · soft-direct default · coach picks tone per piece" },
    ],
    flags: ["blocking"],
  },
  {
    id: "preflight.somatic",
    module: "preflight",
    order: 2,
    kind: "choice",
    prompt: "Where are you right now in your body?",
    hint: "One word. The brand inherits the state. Hungry / rushed / performing → take a 5-min pause first.",
    choices: [
      { value: "regulated", label: "Regulated",  description: "Grounded. Steady. Good." },
      { value: "rushed",    label: "Rushed",     description: "Take a 5-min pause before continuing — we'll wait." },
      { value: "hungry",    label: "Hungry",     description: "Eat first. The brand inherits the state." },
      { value: "performing", label: "Performing", description: "Notice it. Drop the performance. Then we go." },
      { value: "other",     label: "Something else", description: "Note it and continue." },
    ],
  },
];

// ============================================================
// MODULE 1 — MIRROR
// ============================================================

const MIRROR: Question[] = [
  {
    id: "mirror.q1",
    module: "mirror",
    order: 1,
    kind: "longtext",
    prompt: "In one sentence, who do you work with and what do you do for them?",
    hint: "We'll push back if this reads like every coach in your space. Be specific. Be true.",
    placeholder: "Most coaching landing pages say 'I help [type] go from [pain] to [outcome] in [time].' Don't write that. Write what you actually do.",
    minChars: 30,
    pushBackTrigger: true,
  },
  {
    id: "mirror.q2",
    module: "mirror",
    order: 2,
    kind: "text",
    prompt: "Think of a client you've actually worked with — or one you wished you had — who's a perfect fit. What's their first name?",
    hint: "Real or invented. Branding to a group means branding to no one. Pick one.",
    placeholder: "e.g. Marcus, Elena, Jess",
    minChars: 2,
  },
  {
    id: "mirror.q3",
    module: "mirror",
    order: 3,
    kind: "longtext",
    prompt: "Tell me about this person's life. Their age, their work, who they live with.",
    hint: "No ranges. Real numbers. The specificity sharpens this.",
    placeholder: "e.g. 37, runs a 6-person ad agency in Austin, lives with his wife and 8-year-old daughter.",
    minChars: 40,
  },
  {
    id: "mirror.q4",
    module: "mirror",
    order: 4,
    kind: "longtext",
    prompt: "Roughly what do they earn — or where are they in their career?",
    hint: "Business owner / freelancer? Monthly revenue. Employee? Early / mid / senior — and whether the work itself feels meaningful.",
    placeholder: "e.g. $28K/mo from the agency, takes home $12K. OR: Mid-career engineer at a Series C, comp ~$220K, work feels hollow.",
    minChars: 20,
  },
  {
    id: "mirror.q5",
    module: "mirror",
    order: 5,
    kind: "longtext",
    prompt: {
      M: "What is this person feeling in his body at 6am on a Tuesday — before the coffee, before the first meeting, when it's just him and the ceiling? Tight jaw? Heavy chest? Clenched gut? Restless legs? Describe the physical feeling, not the thought.",
      W: "What is this person feeling in her body at 6am on a Tuesday — before the coffee, before the day starts, when it's just her and the ceiling? The held breath? The bracing in her shoulders? The loop in her stomach? The contraction at the base of her ribs? Describe the physical sensation, not the thought.",
      X: "What is this person feeling in their body at 6am on a Tuesday — before the coffee, before the day starts? The held breath, the tight jaw, the loop in the gut, the bracing in the shoulders? Describe the physical sensation, not the thought.",
    },
    hint: "Stay sensory. Skip the diagnosis.",
    placeholder: "The body knows before the mind admits. What's it carrying?",
    minChars: 40,
  },
  {
    id: "mirror.q6",
    module: "mirror",
    order: 6,
    kind: "longtext",
    prompt: "What has this person already tried to fix this? Books, podcasts, therapy, programs, substances, relationships. What's in the graveyard?",
    placeholder: "Don't filter. The graveyard is where their belief in 'work harder' is buried.",
    minChars: 30,
  },
  {
    id: "mirror.q7",
    module: "mirror",
    order: 7,
    kind: "longtext",
    prompt: {
      M: "When this person imagines this working, what actually changes? Not 'success' or 'freedom.' What changes in his body? His relationships? His self-talk on a normal Thursday at 3pm?",
      W: "When this person imagines this working, what actually shifts? Not 'alignment' or 'empowerment.' What softens in her body? What changes in how she meets her partner, her kids, herself, on a normal Thursday at 3pm?",
      X: "When this person imagines this working, what actually shifts? Not 'transformation.' What changes in their body, their relationships, their self-talk on a normal Thursday at 3pm?",
    },
    placeholder: "Specific Thursday-at-3pm changes. Not the brochure version.",
    minChars: 40,
  },
  {
    id: "mirror.q8",
    module: "mirror",
    order: 8,
    kind: "longtext",
    prompt: "Imagine this person at 11pm, drink in hand, sitting across from one trusted friend. No performance, no professionalism. What's the ONE sentence they'd say about this whole thing?",
    hint: "This is the most powerful line in the entire run. Read it aloud after you write it.",
    placeholder: "The unposted version. The line they wouldn't put on Instagram.",
    minChars: 20,
  },
  {
    id: "mirror.q9",
    module: "mirror",
    order: 9,
    kind: "longtext",
    prompt: "Who buys from you and shouldn't? The person who pays, finishes the program, and you both quietly know it wasn't right.",
    hint: "If you say 'no one' — everyone has had one. The discomfort of the answer is the answer.",
    minChars: 25,
  },
  {
    id: "mirror.q10",
    module: "mirror",
    order: 10,
    kind: "list",
    prompt: "Three things that would make you say no to a paying client, even if they had the money. Be specific.",
    hint: "One per line.",
    listTarget: 3,
    minChars: 30,
  },
  {
    id: "mirror.q11",
    module: "mirror",
    order: 11,
    kind: "longtext",
    prompt: {
      M: "What does this person say about himself in his head that he wouldn't say out loud? Not the inspirational version. The real one.",
      W: "What does this person say about herself when she's alone that she wouldn't say to anyone, not even her closest friend? The unposted version.",
      X: "What does this person say about themselves in their head that they wouldn't say out loud?",
    },
    minChars: 25,
  },
  {
    id: "mirror.q12",
    module: "mirror",
    order: 12,
    kind: "text",
    prompt: "Who does this person secretly measure themselves against? Could be a peer, a celebrity, a former version of themselves, a sibling. Name them.",
    minChars: 5,
  },
  {
    id: "mirror.q13",
    module: "mirror",
    order: 13,
    kind: "text",
    prompt: "What's your weirdest interest outside of coaching? Not the hobby that fits your brand. The one that doesn't.",
    hint: "Jiu-jitsu, lutherie, beekeeping, sourdough, fly-fishing, salsa, motorcycle restoration. Name it.",
    placeholder: "The interest you wouldn't list on your bio.",
    minChars: 4,
  },
  {
    id: "mirror.q14",
    module: "mirror",
    order: 14,
    kind: "longtext",
    prompt: "How does that interest change how you see your clients? What does your weird thing know that coaching doesn't?",
    hint: "This is where voice escapes the coach-mean. Mine it hard.",
    minChars: 40,
  },
  {
    id: "mirror.q15",
    module: "mirror",
    order: 15,
    kind: "summary",
    prompt: "Agent summarises everything above. Anything you want to sharpen before moving to Module 2?",
  },
];

// ============================================================
// MODULE 2 — SIGNAL
// ============================================================

const SIGNAL: Question[] = [
  {
    id: "signal.q1",
    module: "signal",
    order: 1,
    kind: "pasteBlock",
    prompt: "Bring 3–5 of your best writing samples.",
    hint: "Use the panel above to pull from your Voice Profile, import a URL, or paste below. We're looking for 'that's me at my best.' Voice samples are not optional.",
    placeholder: "[CAPTION] …\n\n[NEWSLETTER] …\n\n[POST] …",
    minChars: 200,
    flags: ["required-input", "blocking", "long"],
  },
  // (Removed: signal.q2 'regret writing' — 2026-05-12. Was high-friction.
  // Q10's anti-vocab list captures the same anti-voice signal without
  // forcing the coach to dig up writing they're embarrassed by.
  // Subsequent IDs (signal.q3 onward) stay STABLE so any in-flight runs
  // and saved answer rows keep resolving. Module ordinal in the UI
  // recomputes from array position, so users see Q1, Q2, Q3, … with no
  // visible gap.)
  {
    id: "signal.q3",
    module: "signal",
    order: 3,
    kind: "scoutTest",
    prompt: "Five sentences. Three are yours. Two are mine, written in your style. Tell me which two are mine.",
    hint: "After you answer, we reveal. Score below 2/2 → we lean heavier on your Q1 patterns going forward.",
  },
  {
    id: "signal.q4",
    module: "signal",
    order: 4,
    kind: "summary",
    prompt: "Here's what we picked up reading your samples. Sound right?",
  },
  {
    id: "signal.q5",
    module: "signal",
    order: 5,
    kind: "scale",
    prompt: "Where are you on Formal ↔ Casual?",
    scale: { lowLabel: "Formal", highLabel: "Casual" },
  },
  {
    id: "signal.q6",
    module: "signal",
    order: 6,
    kind: "scale",
    prompt: "Where are you on Serious ↔ Playful?",
    scale: { lowLabel: "Serious", highLabel: "Playful" },
  },
  {
    id: "signal.q7",
    module: "signal",
    order: 7,
    kind: "scale",
    prompt: "Where are you on Analytical ↔ Emotional?",
    scale: { lowLabel: "Analytical", highLabel: "Emotional" },
  },
  {
    id: "signal.q8",
    module: "signal",
    order: 8,
    kind: "scale",
    prompt: "Where are you on Direct ↔ Nuanced?",
    scale: { lowLabel: "Direct", highLabel: "Nuanced" },
  },
  {
    id: "signal.q9",
    module: "signal",
    order: 9,
    kind: "list",
    prompt: "5 words or phrases you use all the time that feel unmistakably you.",
    hint: "Don't be modest. One per line.",
    listTarget: 5,
    minChars: 20,
  },
  {
    id: "signal.q10",
    module: "signal",
    order: 10,
    kind: "list",
    prompt: "5 words or phrases you'll never say. The ones that feel like a costume.",
    listTarget: 5,
    minChars: 20,
  },
  {
    id: "signal.q11",
    module: "signal",
    order: 11,
    kind: "list",
    prompt: {
      M: "3 sensory words that describe you at your best. Not adjectives — sensory. How do you feel to be near?",
      W: "3 sensory words that describe you when you're in your full capacity. Not adjectives — sensory. How does it feel to be in a room with you?",
      X: "3 sensory words that describe you at your full capacity. Not adjectives — sensory. How does it feel to be near you?",
    },
    listTarget: 3,
    pushBackTrigger: true,
    minChars: 10,
  },
  {
    id: "signal.q12",
    module: "signal",
    order: 12,
    kind: "list",
    prompt: "3 adjectives that describe what your voice actually is — not what you aspire to.",
    listTarget: 3,
    minChars: 8,
  },
  {
    id: "signal.q13",
    module: "signal",
    order: 13,
    kind: "longtext",
    prompt: "Read one piece from Q1 aloud, slowly. What's the rhythm? Short bursts? Long arcs? Pauses? Tell us what you hear, not what you wrote.",
    hint: "Most coaches in somatic / nervous-system space have a longer-breath rhythm. Don't force LinkedIn short-line cadence if it isn't yours.",
    minChars: 30,
  },
];

// ============================================================
// MODULE 3 — STANCE
// ============================================================

const STANCE: Question[] = [
  {
    id: "stance.q1",
    module: "stance",
    order: 1,
    kind: "list",
    prompt: "List 20 potential content stances. Don't filter. 90 seconds. Topics you care about, frameworks you use, stories you've lived, things you keep saying.",
    listTarget: 20,
    minChars: 100,
  },
  {
    id: "stance.q2",
    module: "stance",
    order: 2,
    kind: "summary",
    prompt: "Pattern observation — we'll read your 20 back and flag the tensions, themes, and outliers.",
  },
  {
    id: "stance.q3",
    module: "stance",
    order: 3,
    kind: "longtext",
    prompt: "Score each candidate against three tests (Depth, Pull, Anchor — 1–3 each). Keep 7+.",
    hint: "Depth: 50 posts without reaching. Pull: client searches inside this. Anchor: your offer sits inside this.",
    placeholder: "Stance — Depth/Pull/Anchor — Total\n1. Honest Money — 3/2/3 — 8\n2. Body before goals — 3/3/3 — 9\n…",
    minChars: 60,
  },
  {
    id: "stance.q4",
    module: "stance",
    order: 4,
    kind: "longtext",
    prompt: "What do most coaches in your space believe that you think is wrong? Not a small disagreement. A real one.",
    minChars: 40,
  },
  {
    id: "stance.q5",
    module: "stance",
    order: 5,
    kind: "longtext",
    prompt: "What did you used to believe and don't anymore? The shift becomes a stance.",
    minChars: 40,
  },
  {
    id: "stance.q6",
    module: "stance",
    order: 6,
    kind: "longtext",
    prompt: "For each candidate stance, name the enemy. What is this stance against? Be specific.",
    hint: "Not 'fear' or 'ego.' A specific belief, practice, or persona in your space.",
    minChars: 60,
  },
  {
    id: "stance.q7",
    module: "stance",
    order: 7,
    kind: "longtext",
    prompt: "For each stance, give one client outcome AND one moment from your own life that proves it. Two artifacts per stance.",
    hint: "If you can't produce two, the stance is unproven. Demote it.",
    minChars: 80,
  },
  {
    id: "stance.q8",
    module: "stance",
    order: 8,
    kind: "longtext",
    prompt: "Of every 10 pieces of content, how many for each stance? (Total = 10.)",
    placeholder: "Stance 1: 4\nStance 2: 3\nStance 3: 2\nStance 4: 1",
    minChars: 20,
  },
  {
    id: "stance.q9",
    module: "stance",
    order: 9,
    kind: "list",
    prompt: "Name your 3–5 stances. Real names, not single words.",
    hint: "We'll push back on single-word generics ('Leadership', 'Mindset', 'Empowerment').",
    listTarget: 4,
    pushBackTrigger: true,
    minChars: 30,
  },
  {
    id: "stance.q10",
    module: "stance",
    order: 10,
    kind: "longtext",
    prompt: "Anything you'd add by instinct, even below 7? Cap at 5 total.",
    minChars: 0,
  },
  {
    id: "stance.q11",
    module: "stance",
    order: 11,
    kind: "longtext",
    prompt: "For each stance, 3 sub-topics. Concrete posts, sessions, or sections.",
    hint: "You'll end with 9–15 content ideas to seed Module 6.",
    minChars: 80,
  },
  {
    id: "stance.q12",
    module: "stance",
    order: 12,
    kind: "longtext",
    prompt: "For each stance, which segment of your audience does it pull hardest? Which does it lose?",
    hint: "Use your Mirror data.",
    minChars: 60,
  },
  {
    id: "stance.q13",
    module: "stance",
    order: 13,
    kind: "memoryPalace",
    prompt: "Memory Palace — for each stance, build the recall card. Don't skip.",
    hint: "Image, body location, sensory cue, real-world recall trigger. Coaches can pull a stance to mind in 2 seconds on a sales call.",
  },
];

// ============================================================
// MODULE 4 — FUNNEL
// ============================================================

const FUNNEL: Question[] = [
  {
    id: "funnel.q1",
    module: "funnel",
    order: 1,
    kind: "text",
    prompt: "One destination for the next 45 days. Not three. One.",
    hint: "Discovery call, $7 trip-wire, cohort application, waitlist. Block if you pick more than one.",
    flags: ["required-input", "blocking"],
    minChars: 10,
  },
  {
    id: "funnel.q2",
    module: "funnel",
    order: 2,
    kind: "longtext",
    prompt: "Describe the offer this CTA leads to. Price, length, container, what the buyer gets, what you do.",
    minChars: 60,
  },
  {
    id: "funnel.q3",
    module: "funnel",
    order: 3,
    kind: "longtext",
    prompt: "What does the buyer have to believe before they buy this? The single most load-bearing belief.",
    minChars: 30,
  },
  {
    id: "funnel.q4",
    module: "funnel",
    order: 4,
    kind: "longtext",
    prompt: "What do they currently believe instead? Where are they coming from?",
    minChars: 30,
  },
  {
    id: "funnel.q5",
    module: "funnel",
    order: 5,
    kind: "longtext",
    prompt: "Sequence the beliefs from current to required. Usually 3–5 rungs. Each rung is a piece of content.",
    minChars: 80,
  },
  {
    id: "funnel.q6",
    module: "funnel",
    order: 6,
    kind: "longtext",
    prompt: "Top 5 real objections. Not 'I can't afford it.' The real ones underneath.",
    hint: "Examples: 'I've tried 4 of these. Why is yours different?' / 'I'm scared if this works, I'll have to change.'",
    minChars: 100,
  },
  {
    id: "funnel.q7",
    module: "funnel",
    order: 7,
    kind: "longtext",
    prompt: "Write the CTA the way it appears at the end of a piece of content. 1–2 sentences.",
    hint: "We'll push back if generic ('book a discovery call', 'apply now').",
    minChars: 15,
    pushBackTrigger: true,
  },
  {
    id: "funnel.q8",
    module: "funnel",
    order: 8,
    kind: "longtext",
    prompt: "Three CTA versions — invitational, scarcity-anchored (real not fake), identity-anchored.",
    hint: "Pick one as primary, two as alternates.",
    minChars: 90,
  },
  {
    id: "funnel.q9",
    module: "funnel",
    order: 9,
    kind: "longtext",
    prompt: "For each of your 5 objections, name the proof artifact that answers it.",
    hint: "Client quote, case study, screenshot, your own story, data. Specific, named, retrievable.",
    minChars: 100,
  },
  {
    id: "funnel.q10",
    module: "funnel",
    order: 10,
    kind: "longtext",
    prompt: "Pre-mortem. 45 days from today: the funnel didn't work. Pipeline empty. Why?",
    hint: "Give 3 specific failure modes. For each: early signal you missed, fix that wasn't taken, push-back override (if any) that contributed.",
    minChars: 120,
    flags: ["blocking"],
  },
];

// ============================================================
// MODULE 5 — DISTRIBUTION
// ============================================================

const DISTRIBUTION: Question[] = [
  {
    id: "distribution.q1",
    module: "distribution",
    order: 1,
    kind: "text",
    prompt: "One channel for the next 45 days. Not three.",
    minChars: 3,
  },
  {
    id: "distribution.q2",
    module: "distribution",
    order: 2,
    kind: "longtext",
    prompt: "What does this channel allow that the others don't? Structural reason — not 'my audience is there.'",
    minChars: 40,
  },
  {
    id: "distribution.q3",
    module: "distribution",
    order: 3,
    kind: "longtext",
    prompt: "Repurpose rules. For one main piece on the primary channel, what are the 3 derivative pieces and which channel each lives on?",
    minChars: 60,
  },
  {
    id: "distribution.q4",
    module: "distribution",
    order: 4,
    kind: "longtext",
    prompt: "Recovery rule for a missed posting day.",
    hint: "Set it in advance. In the moment, decision fatigue kills it.",
    minChars: 25,
  },
  {
    id: "distribution.q5",
    module: "distribution",
    order: 5,
    kind: "longtext",
    prompt: "Return script for a long break (1+ week off). One sentence. Don't apologize. Don't over-explain.",
    minChars: 20,
  },
  {
    id: "distribution.q6",
    module: "distribution",
    order: 6,
    kind: "text",
    prompt: "How many evergreen pieces do you keep in reserve? Target: at least 2 weeks of inventory.",
    minChars: 1,
  },
  {
    id: "distribution.q7",
    module: "distribution",
    order: 7,
    kind: "longtext",
    prompt: "Days + times you'll publish. Specific. ('Tuesday and Thursday 9am, no exceptions.')",
    minChars: 15,
  },
  {
    id: "distribution.q8",
    module: "distribution",
    order: 8,
    kind: "longtext",
    prompt: {
      M: "What will you NOT post, even if it would get reach?",
      W: "What will you NOT post, even if it would get reach? Especially: where's the line between vulnerable and over-disclosure?",
      X: "What will you NOT post, even if it would get reach?",
    },
    hint: "Different audiences have different lines. Many women coaches get the algorithm bump from over-sharing and pay the dysregulation tax for it.",
    minChars: 30,
  },
];

// ============================================================
// MODULE 6 — BROADCAST
// ============================================================

const BROADCAST: Question[] = [
  {
    id: "broadcast.q1",
    module: "broadcast",
    order: 1,
    kind: "summary",
    prompt: "Agent generates your 45-day calendar from everything above. Each piece tagged Pólya + unit econ + voice signature.",
    hint: "Calendar rules: 12–15 main-channel pieces · TOFU:MOFU:BOFU 6:3:1 default · 1 push-back-style piece per 5 · 1 cross-domain piece per week · 2 memory-anchored pieces per month.",
  },
];

// ============================================================
// REGISTRY EXPORT
// ============================================================

export const BRAND_OS_QUESTIONS: Question[] = [
  ...PREFLIGHT,
  ...MIRROR,
  ...SIGNAL,
  ...STANCE,
  ...FUNNEL,
  ...DISTRIBUTION,
  ...BROADCAST,
];

/** Questions belonging to a single module, in order. */
export function questionsForModule(module: ModuleId): Question[] {
  return BRAND_OS_QUESTIONS.filter((q) => q.module === module).sort((a, b) => a.order - b.order);
}

/** All modules, in execution order. */
export const MODULE_ORDER: ModuleId[] = [
  "preflight", "mirror", "signal", "stance", "funnel", "distribution", "broadcast",
];

/** Per-module metadata used by the UI shell. */
export const MODULE_META: Record<ModuleId, { label: string; tagline: string; minutes: string }> = {
  preflight:    { label: "Pre-flight",    tagline: "Set audience + somatic state",                       minutes: "2 min" },
  mirror:       { label: "Mirror",        tagline: "Real buyer · wrong buyer · pressure underneath",     minutes: "35–50 min" },
  signal:       { label: "Signal",        tagline: "Voice from proof, not adjectives",                   minutes: "35–50 min" },
  stance:       { label: "Stance",        tagline: "Pillars are stances. Each has an enemy, proof, anchor.", minutes: "35–50 min" },
  funnel:       { label: "Funnel",        tagline: "One CTA · belief ladder · pre-mortem",               minutes: "25–35 min" },
  distribution: { label: "Distribution",  tagline: "Channel · repurpose · recovery rules",               minutes: "20–30 min" },
  broadcast:    { label: "Broadcast",     tagline: "45-day calendar generated from everything above",    minutes: "30–45 min" },
};

/** MVP question subset — 13 Qs, ~60–90 min, $7 trip-wire variant. */
export const MVP_QUESTION_IDS: string[] = [
  "preflight.audience", "preflight.somatic",
  "mirror.q1", "mirror.q2", "mirror.q5", "mirror.q11", "mirror.q13",
  "signal.q1", "signal.q3",
  "stance.q3", "stance.q5",
  "funnel.q1", "funnel.q3", "funnel.q7",
];

export function isMvpQuestion(id: string): boolean {
  return MVP_QUESTION_IDS.includes(id);
}

/** Walk to the next question for a run.
 *  Returns null if the run is at the end of the variant. */
export function nextQuestionId(
  currentId: string | null | undefined,
  variant: "mvp" | "full"
): string | null {
  const pool = variant === "mvp"
    ? MVP_QUESTION_IDS
    : BRAND_OS_QUESTIONS.map((q) => q.id);
  if (!currentId) return pool[0] ?? null;
  const idx = pool.indexOf(currentId);
  if (idx < 0 || idx >= pool.length - 1) return null;
  return pool[idx + 1];
}

/** Walk to the previous question (for "back" button). */
export function previousQuestionId(
  currentId: string,
  variant: "mvp" | "full"
): string | null {
  const pool = variant === "mvp"
    ? MVP_QUESTION_IDS
    : BRAND_OS_QUESTIONS.map((q) => q.id);
  const idx = pool.indexOf(currentId);
  if (idx <= 0) return null;
  return pool[idx - 1];
}

export function getQuestion(id: string): Question | null {
  return BRAND_OS_QUESTIONS.find((q) => q.id === id) ?? null;
}
