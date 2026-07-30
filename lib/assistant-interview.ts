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
  /** The assistant's instant one-liner when this option is tapped. */
  reaction: string;
};

export const TIME_DRAIN_OPTIONS: Option<TimeDrain>[] = [
  { value: "leads_dms", label: "Chasing leads in the DMs", reaction: "Noted. Lead follow-up is exactly the kind of thing I never drop." },
  { value: "content", label: "Writing content nobody sees", reaction: "Heard. Writing in your voice is my favorite part of the job." },
  { value: "client_admin", label: "Client admin and follow-ups", reaction: "Good to know. Check-ins and follow-through are where I shine." },
  { value: "everything", label: "All of it, honestly", reaction: "Respect the honesty. That's why you need an assistant, not another app." },
];

export const HAND_OFF_OPTIONS: Option<HandOffFirst>[] = [
  { value: "followups", label: "Following up with every lead", reaction: "Done. No lead goes cold on my watch." },
  { value: "drafting", label: "Drafting my content in my voice", reaction: "I'll learn your voice first. Then I write, you approve." },
  { value: "clients", label: "Keeping clients on track", reaction: "I'll watch every client thread so nothing slips." },
  { value: "briefing", label: "Telling me what actually matters each morning", reaction: "One clear brief every morning. No noise." },
];

export const DESIRE_OPTIONS: Option<Desire>[] = [
  { value: "sounds_like_me", label: "Sounds like me, not a robot", reaction: "" },
  { value: "never_cold", label: "Never lets a lead go cold", reaction: "" },
  { value: "consistent", label: "Keeps me consistent when life hits", reaction: "" },
  { value: "knows_business", label: "Knows my business cold", reaction: "" },
  { value: "accountability", label: "Calls me out when I drift", reaction: "" },
];

export const NICHE_OPTIONS: Option<Niche>[] = [
  { value: "mens_work", label: "Men's work / embodiment", reaction: "" },
  { value: "life", label: "Life / mindset", reaction: "" },
  { value: "business", label: "Business / career", reaction: "" },
  { value: "health", label: "Health / fitness", reaction: "" },
  { value: "relationship", label: "Relationship / intimacy", reaction: "" },
  { value: "other", label: "My own lane", reaction: "" },
];

export const STAGE_OPTIONS: Option<Stage>[] = [
  { value: "starting", label: "Just getting started", reaction: "" },
  { value: "building", label: "Some clients, building momentum", reaction: "" },
  { value: "established", label: "Established, ready to scale", reaction: "" },
];

export const TONE_OPTIONS: Option<Tone>[] = [
  { value: "direct", label: "Direct. No fluff.", reaction: "" },
  { value: "warm", label: "Warm and encouraging", reaction: "" },
  { value: "playful", label: "Keep it fun", reaction: "" },
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
