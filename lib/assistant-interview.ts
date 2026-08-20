// Assistant Interview — shared question registry for the Coach Assistant
// personalization loop. Two surfaces consume this:
//
//   1. /meet — public pre-signup teaser (timeDrain, handOffFirst, desires).
//      Answers persist to localStorage so signup carries them forward.
//   2. /welcome interview step — post-login deep dive (niche, stage, tone,
//      desires pre-filled from the teaser).
//
// Answers become three things downstream (see /api/onboarding/interview):
//   a. Confirmed cp_coach_memory rows — Dhara knows the coach from message one.
//   b. emphasize_* flags on cp_coaches — nav/dashboard prioritization.
//   c. Flavor for voice seeding (niche + tone travel with the coach).
//
// Framing rule: the assistant is interviewing FOR THE JOB of working for
// the coach. Reactions are the assistant taking notes, not a quiz grading.

export const INTERVIEW_STORAGE_KEY = "ca_interview_v1";

// ── Answer vocabulary ──────────────────────────────────────────────────────

export type TimeDrain = "leads_dms" | "content" | "client_admin" | "everything";
export type HandOffFirst = "followups" | "drafting" | "clients" | "briefing";
export type Desire =
  | "sounds_like_me"
  | "never_cold"
  | "consistent"
  | "knows_business"
  | "accountability";
export type Niche = "mens_work" | "life" | "business" | "health" | "relationship" | "other";
export type Stage = "starting" | "building" | "established";
export type Tone = "direct" | "warm" | "playful";

export type InterviewAnswers = {
  timeDrain: TimeDrain | null;
  handOffFirst: HandOffFirst | null;
  desires: Desire[];
  niche: Niche | null;
  stage: Stage | null;
  tone: Tone | null;
};

export const EMPTY_ANSWERS: InterviewAnswers = {
  timeDrain: null,
  handOffFirst: null,
  desires: [],
  niche: null,
  stage: null,
  tone: null,
};

// ── Question definitions ───────────────────────────────────────────────────

export type Option<V extends string> = {
  value: V;
  label: string;
  /** The assistant's instant one-liner when this option is tapped.
   *  null means DELIBERATELY silent: there is nothing true to teach a coach
   *  about this answer, and filler dressed as insight is worse than quiet.
   *  An empty string is always a bug — a test pins that. Null also means the
   *  UI should not hold a beat before advancing. */
  reaction: string | null;
};

export const TIME_DRAIN_OPTIONS: Option<TimeDrain>[] = [
  { value: "leads_dms", label: "Chasing leads in the DMs", reaction: "That one eats the most and shows the least. Most coaches lose more people to a slow reply than to a weak offer." },
  { value: "content", label: "Writing content nobody sees", reaction: "That's usually not a reach problem. It's that the writing sounds like everyone else's." },
  { value: "client_admin", label: "Client admin and follow-ups", reaction: "The invisible tax. It never feels urgent, so it quietly eats the hours you meant to spend on the actual work." },
  { value: "everything", label: "All of it, honestly", reaction: "That's honest, and it's most coaches at some point. It usually means the business is running you instead of the other way round." },
];

export const HAND_OFF_OPTIONS: Option<HandOffFirst>[] = [
  { value: "followups", label: "Following up with every lead", reaction: "Good instinct. Most deals die in the gap between interested and forgotten, not at the price conversation." },
  { value: "drafting", label: "Drafting my content in my voice", reaction: "Then the voice has to come first. A draft that isn't yours costs more to fix than to write from scratch." },
  { value: "clients", label: "Keeping clients on track", reaction: "That's retention work, and it's cheaper than finding new people. Most coaches spend it the other way around." },
  { value: "briefing", label: "Telling me what actually matters each morning", reaction: "The hard part was never knowing what to do. It's deciding it again every morning from scratch." },
];

export const DESIRE_OPTIONS: Option<Desire>[] = [
  { value: "sounds_like_me", label: "Sounds like me, not a robot", reaction: "Your voice is the one thing a competitor can't copy. Worth protecting before it gets averaged out." },
  { value: "never_cold", label: "Never lets a lead go cold", reaction: "Cold usually isn't rejection. It's just time passing while you were busy with something else." },
  { value: "consistent", label: "Keeps me consistent when life hits", reaction: "Consistency isn't discipline. It's having something that keeps moving on the weeks you can't." },
  { value: "knows_business", label: "Knows my business cold", reaction: "That takes feeding. What you put in over the first month is what you get back for the next year." },
  { value: "accountability", label: "Calls me out when I drift", reaction: "Most people don't ask for that one. It's the only thing on this list that actually changes behaviour." },
];

export const NICHE_OPTIONS: Option<Niche>[] = [
  { value: "mens_work", label: "Men's work / embodiment", reaction: "Narrow is the advantage here. The men who need this work recognise the language the moment they hear it." },
  { value: "life", label: "Life / mindset", reaction: "The widest lane on this list, which means your words have to do more work. Specific beats broad every time." },
  { value: "business", label: "Business / career", reaction: "Your people can measure the outcome, so proof travels further here than positioning does." },
  { value: "health", label: "Health / fitness", reaction: "Crowded, and mostly competing on tactics. The ones who stand out sell the relationship with the body, not the protocol." },
  { value: "relationship", label: "Relationship / intimacy", reaction: "People arrive here already exposed. Trust gets built in how you write, long before the first call." },
  { value: "other", label: "My own lane", reaction: "Good. Harder to explain, much harder to compete with." },
];

export const STAGE_OPTIONS: Option<Stage>[] = [
  { value: "starting", label: "Just getting started", reaction: "Then your whole job right now is conversations, not systems. Ten real ones beats a funnel." },
  { value: "building", label: "Some clients, building momentum", reaction: "This is where most coaches stall. Not from a lack of leads. From dropping the ones they already have." },
  { value: "established", label: "Established, ready to scale", reaction: "At this point the constraint is usually your attention, not your pipeline." },
];

export const TONE_OPTIONS: Option<Tone>[] = [
  { value: "direct", label: "Direct. No fluff.", reaction: null },
  { value: "warm", label: "Warm and encouraging", reaction: null },
  { value: "playful", label: "Keep it fun", reaction: null },
];

/** Allowed values per question, derived from the option registry so API
 *  validation can never drift from the UI. */
export function optionValues<V extends string>(options: Option<V>[]): V[] {
  return options.map((o) => o.value);
}

// ── Archetypes (teaser result) ─────────────────────────────────────────────

export type ArchetypeSlug = "closer" | "ghostwriter" | "operator" | "chief_of_staff";

export type Archetype = {
  slug: ArchetypeSlug;
  name: string;
  tagline: string;
  /** "In week one, your assistant will..." bullets. */
  weekOne: string[];
};

export const ARCHETYPES: Record<ArchetypeSlug, Archetype> = {
  closer: {
    slug: "closer",
    name: "The Closer",
    tagline: "An assistant that treats every lead like it's the last one on earth.",
    weekOne: [
      "Watch every DM and inbound lead, and draft the reply in your voice",
      "Flag the leads going cold before they actually do",
      "Learn who your ideal client is so it can spot them for you",
    ],
  },
  ghostwriter: {
    slug: "ghostwriter",
    name: "The Ghostwriter",
    tagline: "An assistant that writes like you on your best day.",
    weekOne: [
      "Learn your voice from what you've already published",
      "Draft content you'd actually post, not AI mush",
      "Keep your posting rhythm alive even on your worst weeks",
    ],
  },
  operator: {
    slug: "operator",
    name: "The Operator",
    tagline: "An assistant that keeps every client moving without you pushing.",
    weekOne: [
      "Track every client thread so nothing slips",
      "Draft the check-ins you keep meaning to send",
      "Surface who needs attention before they tell you",
    ],
  },
  chief_of_staff: {
    slug: "chief_of_staff",
    name: "The Chief of Staff",
    tagline: "An assistant that tells you what matters and handles the rest.",
    weekOne: [
      "Give you one clear brief each morning: leads, clients, content",
      "Draft the replies and posts so you only approve",
      "Learn your business cold so its calls keep getting sharper",
    ],
  },
};

/** handOffFirst is the strongest signal; fall back to timeDrain. */
export function deriveArchetype(answers: Pick<InterviewAnswers, "timeDrain" | "handOffFirst">): Archetype {
  switch (answers.handOffFirst) {
    case "followups": return ARCHETYPES.closer;
    case "drafting": return ARCHETYPES.ghostwriter;
    case "clients": return ARCHETYPES.operator;
    case "briefing": return ARCHETYPES.chief_of_staff;
  }
  switch (answers.timeDrain) {
    case "leads_dms": return ARCHETYPES.closer;
    case "content": return ARCHETYPES.ghostwriter;
    case "client_admin": return ARCHETYPES.operator;
    default: return ARCHETYPES.chief_of_staff;
  }
}

// ── localStorage handoff (client-only callers) ─────────────────────────────

export function saveInterviewAnswers(partial: Partial<InterviewAnswers>): void {
  try {
    const existing = loadInterviewAnswers();
    const merged = { ...(existing ?? EMPTY_ANSWERS), ...partial };
    window.localStorage.setItem(INTERVIEW_STORAGE_KEY, JSON.stringify(merged));
  } catch { /* private mode etc. — the interview step just starts blank */ }
}

export function loadInterviewAnswers(): InterviewAnswers | null {
  try {
    const raw = window.localStorage.getItem(INTERVIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InterviewAnswers>;
    return { ...EMPTY_ANSWERS, ...parsed };
  } catch {
    return null;
  }
}

export function clearInterviewAnswers(): void {
  try { window.localStorage.removeItem(INTERVIEW_STORAGE_KEY); } catch { /* noop */ }
}

// ── Downstream mapping (used by /api/onboarding/interview) ─────────────────

const NICHE_MEMORY: Record<Niche, string> = {
  mens_work: "Is a men's work / embodiment coach",
  life: "Is a life / mindset coach",
  business: "Is a business / career coach",
  health: "Is a health / fitness coach",
  relationship: "Is a relationship / intimacy coach",
  other: "Coaches in their own niche outside the usual categories",
};

const STAGE_MEMORY: Record<Stage, string> = {
  starting: "Business stage: just getting started, early clients",
  building: "Business stage: has clients, building momentum",
  established: "Business stage: established and ready to scale",
};

const TONE_MEMORY: Record<Tone, string> = {
  direct: "Prefers direct, no-fluff communication from the assistant",
  warm: "Prefers warm, encouraging communication from the assistant",
  playful: "Prefers a playful, fun communication style from the assistant",
};

const DESIRE_MEMORY: Record<Desire, string> = {
  sounds_like_me: "Wants the assistant's writing to sound like them, not a robot",
  never_cold: "Wants no lead to ever go cold; fast follow-up is the priority",
  consistent: "Wants help staying consistent with content and follow-through",
  knows_business: "Wants the assistant to know their business cold",
  accountability: "Wants the assistant to call them out when they drift",
};

const TIME_DRAIN_MEMORY: Record<TimeDrain, string> = {
  leads_dms: "Biggest time drain: chasing leads in the DMs",
  content: "Biggest time drain: writing content that isn't landing",
  client_admin: "Biggest time drain: client admin and follow-ups",
  everything: "Feels stretched across everything: leads, content, and clients",
};

const HAND_OFF_MEMORY: Record<HandOffFirst, string> = {
  followups: "First thing they want off their plate: lead follow-up",
  drafting: "First thing they want off their plate: drafting content in their voice",
  clients: "First thing they want off their plate: keeping clients on track",
  briefing: "Wants a daily brief of what actually matters each morning",
};

export type InterviewMemory = {
  kind: "fact" | "preference" | "goal";
  text: string;
};

/** Flatten answers into memory rows. Pure — unit-testable. */
export function interviewToMemories(a: InterviewAnswers): InterviewMemory[] {
  const out: InterviewMemory[] = [];
  if (a.niche) out.push({ kind: "fact", text: NICHE_MEMORY[a.niche] });
  if (a.stage) out.push({ kind: "fact", text: STAGE_MEMORY[a.stage] });
  if (a.tone) out.push({ kind: "preference", text: TONE_MEMORY[a.tone] });
  if (a.timeDrain) out.push({ kind: "fact", text: TIME_DRAIN_MEMORY[a.timeDrain] });
  if (a.handOffFirst) out.push({ kind: "goal", text: HAND_OFF_MEMORY[a.handOffFirst] });
  for (const d of a.desires) out.push({ kind: "goal", text: DESIRE_MEMORY[d] });
  return out;
}

/** The proof moment after the interview: reflect their answers straight
 *  back so the personalization lands in the first 30 seconds. Returns null
 *  when there is nothing concrete to reflect (skipped interview). */
export function reflectionLine(a: InterviewAnswers): string | null {
  const start: Record<HandOffFirst, string> = {
    followups: "You said lead follow-up is the first thing off your plate, so that's where we start.",
    drafting: "You said drafting content in your voice comes off your plate first, so that's where we start.",
    clients: "You said keeping clients on track comes off your plate first, so that's where we start.",
    briefing: "You asked for one clear brief of what matters each morning, so that's where we start.",
  };
  const drain: Record<TimeDrain, string> = {
    leads_dms: "You said chasing leads in the DMs is eating your week, so that's what your assistant takes first.",
    content: "You said writing content that isn't landing is eating your week, so that's what your assistant takes first.",
    client_admin: "You said client admin is eating your week, so that's what your assistant takes first.",
    everything: "You said everything is eating your week, so your assistant starts with one clear brief a day.",
  };
  const base = a.handOffFirst ? start[a.handOffFirst] : a.timeDrain ? drain[a.timeDrain] : null;
  if (!base) return null;
  const tone: Record<Tone, string> = {
    direct: " No fluff, as requested.",
    warm: " At your pace, like you asked.",
    playful: " And we'll keep it fun.",
  };
  return base + (a.tone ? tone[a.tone] : "");
}

export type EmphasisFlags = {
  emphasize_leads: boolean;
  emphasize_content: boolean;
  emphasize_clients: boolean;
};

/** Derive nav emphasis from answers. Areas they named get emphasized;
 *  the rest de-emphasize (never hidden — matches lib/onboarding.ts rules).
 *  "everything"/"briefing" keep all three on. At least one is always true. */
export function interviewToEmphasis(a: InterviewAnswers): EmphasisFlags {
  const broad = a.timeDrain === "everything" || a.handOffFirst === "briefing";
  const leads =
    broad ||
    a.timeDrain === "leads_dms" ||
    a.handOffFirst === "followups" ||
    a.desires.includes("never_cold");
  const content =
    broad ||
    a.timeDrain === "content" ||
    a.handOffFirst === "drafting" ||
    a.desires.includes("sounds_like_me") ||
    a.desires.includes("consistent");
  const clients =
    broad ||
    a.timeDrain === "client_admin" ||
    a.handOffFirst === "clients";
  if (!leads && !content && !clients) {
    return { emphasize_leads: true, emphasize_content: true, emphasize_clients: true };
  }
  return { emphasize_leads: leads, emphasize_content: content, emphasize_clients: clients };
}
