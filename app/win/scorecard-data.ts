// The Positioned-to-Win Scorecard — questions, scoring, and result content.
// App-owned lead magnet (not coach-owned). Consumed by app/win/ScorecardClient.
//
// Six axes, eight questions. Two axes (methodology, audience) carry a second
// question for a sharper read. Each option scores 0..3. An axis score is the
// average of its question(s), normalized to 0..100. The headline is the average
// of the six axis scores. The lowest axis is the gap, and the gap drives the
// result copy, the three moves, and the Brand OS handoff.

export type AxisKey =
  | "pov" | "methodology" | "niche" | "proof" | "audience" | "category";

export const AXIS_ORDER: AxisKey[] = [
  "pov", "methodology", "niche", "proof", "audience", "category",
];

export const AXIS_LABEL: Record<AxisKey, string> = {
  pov: "Point of View",
  methodology: "Owned Methodology",
  niche: "Niche Clarity",
  proof: "Embodied Proof",
  audience: "Owned Audience",
  category: "Category Ownership",
};

// Short label for the radar spokes.
export const AXIS_SHORT: Record<AxisKey, string> = {
  pov: "POV",
  methodology: "METHOD",
  niche: "NICHE",
  proof: "PROOF",
  audience: "AUDIENCE",
  category: "CATEGORY",
};

export type Choice = { key: string; text: string; points: 0 | 1 | 2 | 3 };
export type Question = { id: string; axis: AxisKey; text: string; choices: Choice[] };

// Interleaved so the two doubled axes (methodology, audience) never sit
// back-to-back. Order is the order the coach answers them.
export const QUESTIONS: Question[] = [
  {
    id: "pov",
    axis: "pov",
    text: "Read your last ten posts as a stranger. Could they name the one thing you believe that most coaches in your space don't?",
    choices: [
      { key: "a", text: "Yes. I have a stance people quote back to me.", points: 3 },
      { key: "b", text: "There's a theme, but it isn't sharp yet.", points: 2 },
      { key: "c", text: "Good content, but no real stance or enemy.", points: 1 },
      { key: "d", text: "Honestly, I sound like most coaches in my space.", points: 0 },
    ],
  },
  {
    id: "methodology_named",
    axis: "methodology",
    text: "Do you have a named method that clients can only get from you?",
    choices: [
      { key: "a", text: "Yes. It's named, and clients say the name back to me.", points: 3 },
      { key: "b", text: "I have a clear process, but I haven't named or packaged it.", points: 2 },
      { key: "c", text: "I mostly run frameworks from my training or mentors.", points: 1 },
      { key: "d", text: "I work intuitively. It's different every time.", points: 0 },
    ],
  },
  {
    id: "niche",
    axis: "niche",
    text: "Say it out loud: “I help ___.” Which version is closest to what you'd actually say?",
    choices: [
      { key: "a", text: "One specific person in one specific situation.", points: 3 },
      { key: "b", text: "People working through one specific theme.", points: 2 },
      { key: "c", text: "People who want to grow, heal, or level up.", points: 1 },
      { key: "d", text: "Anyone who resonates with my work.", points: 0 },
    ],
  },
  {
    id: "proof",
    axis: "proof",
    text: "What does your credibility actually rest on?",
    choices: [
      { key: "a", text: "Lived transformation plus client outcomes I can show.", points: 3 },
      { key: "b", text: "Client results and testimonials.", points: 2 },
      { key: "c", text: "My own story and how far I've come.", points: 1 },
      { key: "d", text: "My certifications and who I trained under.", points: 0 },
    ],
  },
  {
    id: "audience_reach",
    axis: "audience",
    text: "If Instagram vanished tomorrow, how many people could you still reach directly?",
    choices: [
      { key: "a", text: "Most of them. I own the relationship by email or community.", points: 3 },
      { key: "b", text: "A solid email list I actually use.", points: 2 },
      { key: "c", text: "A few hundred on a list I rarely email.", points: 1 },
      { key: "d", text: "Almost none. It all lives on the platforms.", points: 0 },
    ],
  },
  {
    id: "category",
    axis: "category",
    text: "When someone refers you, what do they actually say about you?",
    choices: [
      { key: "a", text: "“You have to work with them. Nobody does what they do.”", points: 3 },
      { key: "b", text: "They name the specific thing I'm known for.", points: 2 },
      { key: "c", text: "“They're a really good coach.”", points: 1 },
      { key: "d", text: "“They're a coach, might be worth a look.”", points: 0 },
    ],
  },
  {
    id: "methodology_path",
    axis: "methodology",
    text: "When a new client starts, do you already know the path they'll walk?",
    choices: [
      { key: "a", text: "Yes. The same core journey every time, in clear stages.", points: 3 },
      { key: "b", text: "A general arc that I adapt to each person.", points: 2 },
      { key: "c", text: "We mostly figure it out together as we go.", points: 1 },
      { key: "d", text: "Every client is completely different. No set path.", points: 0 },
    ],
  },
  {
    id: "audience_engine",
    axis: "audience",
    text: "How do new leads usually find their way to you?",
    choices: [
      { key: "a", text: "A repeatable engine I built: list, funnel, or referral system.", points: 3 },
      { key: "b", text: "Word of mouth, though I don't really control it.", points: 2 },
      { key: "c", text: "When I post consistently, a few trickle in.", points: 1 },
      { key: "d", text: "Honestly, it's unpredictable and it stresses me out.", points: 0 },
    ],
  },
];

export type Tier = "positioned_to_win" | "at_risk" | "commodity_zone";

export const TIERS: Record<Tier, { label: string; symbol: string; line: string }> = {
  positioned_to_win: {
    label: "Positioned to Win",
    symbol: "▲",
    line: "AI cannot touch you. Your edge is real and ownable. The move now is volume: turn the signal up before the window closes.",
  },
  at_risk: {
    label: "At Risk",
    symbol: "◆",
    line: "You have genuine edges and one soft spot a faster competitor will exploit. One focused shift moves you up a tier.",
  },
  commodity_zone: {
    label: "Commodity Zone",
    symbol: "●",
    line: "Right now you are replaceable, and AI makes that fatal. The good news: this is a positioning problem, not a talent problem.",
  },
};

export function tierFor(total: number): Tier {
  if (total >= 75) return "positioned_to_win";
  if (total >= 45) return "at_risk";
  return "commodity_zone";
}

// The plain-words read of the gap. Shown on the result screen under the lowest axis.
export const GAP_COPY: Record<AxisKey, string> = {
  pov: "Your work is solid, but a stranger could not name what you stand for. Sharpen one belief and people start repeating you.",
  methodology: "You get results, but your method has no name and no shape. Name it and it becomes yours, not your training's.",
  niche: "You speak to everyone, so no one feels chosen. Name one person in one situation and the right people lean in.",
  proof: "You lead with credentials, not transformation. Show one real before and after and trust stops being a leap.",
  audience: "Your reach is rented. One platform change and most of your audience is gone. Build an engine you own and everything else compounds.",
  category: "You are compared, not chosen. Claim a lane that is yours and the comparison stops.",
};

// Three free, do-this-week moves per axis. The coach sees the set for their gap.
export const QUICK_WINS: Record<AxisKey, string[]> = {
  pov: [
    "Write one line: “Most coaches think X. I believe Y.” Post it this week.",
    "List three things you would defend in a room. Build a post around the sharpest.",
    "Find one belief that would make half your audience nod and half bristle. Say it out loud.",
  ],
  methodology: [
    "Name your process. Give your stages names. A named method beats a better one.",
    "Draw your client journey on one page: where they start, the stages, where they finish.",
    "Pick the one step only you do. That is the seed of your signature method.",
  ],
  niche: [
    "Rewrite “I help ___” until it names one person in one situation. Cut every “and.”",
    "Describe your best client's exact moment of pain in one sentence. That is your niche.",
    "Name the person you do not serve. The exclusion sharpens the invitation.",
  ],
  proof: [
    "Capture one client's before and after in their words. Three lines. Post it.",
    "Write your “I have been where you are” paragraph and pin it.",
    "Turn one client win into a short story: where they were, what shifted, where they are now.",
  ],
  audience: [
    "Add “reply 'in' for my weekly note” to every post. Start the list this week.",
    "Move your best 50 followers onto email. Own the relationship.",
    "Pick one owned channel and send something every week, even to ten people.",
  ],
  category: [
    "Write your “only” sentence: “The only [thing] for [who] who [situation].”",
    "Ask three past clients what they would Google to find you. Their words are your category.",
    "Claim a named lane. If it does not exist yet, that is the point.",
  ],
};

// Which Brand OS module closes each gap. Carried into the handoff label + link.
export const AXIS_TO_MODULE: Record<AxisKey, string> = {
  pov: "Voice",
  methodology: "Pillars",
  niche: "Avatar",
  proof: "Story",
  audience: "Resonance Build",
  category: "synthesis",
};

// On a tie for lowest, prefer the axes that drive the funnel (revenue-relevant
// first), so the handoff points at what the paid offers actually fix.
const GAP_PRIORITY: AxisKey[] = [
  "audience", "methodology", "category", "niche", "proof", "pov",
];

export type AxisScores = Record<AxisKey, number>;

export type ScoreResult = {
  axisScores: AxisScores;
  total: number;
  tier: Tier;
  gapAxis: AxisKey;
};

// answers: question id -> points (0..3).
export function scoreAnswers(answers: Record<string, number>): ScoreResult {
  const buckets: Record<AxisKey, number[]> = {
    pov: [], methodology: [], niche: [], proof: [], audience: [], category: [],
  };
  for (const q of QUESTIONS) {
    const pts = answers[q.id];
    if (typeof pts === "number") buckets[q.axis].push(pts);
  }

  const axisScores = {} as AxisScores;
  for (const axis of AXIS_ORDER) {
    const pts = buckets[axis];
    const avg = pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : 0;
    axisScores[axis] = Math.round((avg / 3) * 100);
  }

  const total = Math.round(
    AXIS_ORDER.reduce((sum, a) => sum + axisScores[a], 0) / AXIS_ORDER.length,
  );

  let gapAxis: AxisKey = GAP_PRIORITY[0];
  let lowest = Infinity;
  for (const axis of GAP_PRIORITY) {
    if (axisScores[axis] < lowest) {
      lowest = axisScores[axis];
      gapAxis = axis;
    }
  }

  return { axisScores, total, tier: tierFor(total), gapAxis };
}
