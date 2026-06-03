// lib/dhara/intents.ts
// Deterministic intent matching for Dhara. The common questions and commands
// are answered straight from the database or by navigating — no LLM, no API
// key, instant and reliable. Only unmatched messages fall through to the model.
// Pure + unit-tested.

export type DharaIntent =
  | { type: "count_leads" }
  | { type: "count_clients" }
  | { type: "revenue" }
  | { type: "count_quizzes" }
  | { type: "count_sessions" }
  | { type: "pain_points" }
  | { type: "navigate"; target: string; route: string };

// Destination word -> real app route. Order matters for multi-word keys
// (checked longest-first below).
const NAV_ROUTES: Record<string, string> = {
  "command center": "/command-center",
  "brand os": "/brand-os",
  dashboard: "/command-center",
  home: "/command-center",
  today: "/today",
  clients: "/clients",
  leads: "/clients",
  people: "/clients",
  content: "/content",
  quizzes: "/funnels",
  quiz: "/funnels",
  funnels: "/funnels",
  funnel: "/funnels",
  sessions: "/sessions",
  inbox: "/inbox",
  messages: "/inbox",
  compose: "/compose",
  voice: "/voice",
  analytics: "/analytics",
  automations: "/automations",
  sequences: "/sequences",
  settings: "/settings",
};

export function matchIntent(message: string): DharaIntent | null {
  const m = message.toLowerCase().trim();

  // ── Data questions first (they carry "how many" / "how much") ──
  if (/(revenue|earnings|income)\b/.test(m) || /how much.*\b(made|make|earn|earned|money|sales|revenue|income)\b/.test(m)) {
    return { type: "revenue" };
  }
  if (/(how many|number of|count of|how much).*\bclient/.test(m)) return { type: "count_clients" };
  if (/(how many|number of|count of).*\blead/.test(m)) return { type: "count_leads" };
  if (/(how many|number of|count of).*\b(quiz|quizzes|funnel)/.test(m)) return { type: "count_quizzes" };
  if (/(how many|number of|count of).*\bsession/.test(m)) return { type: "count_sessions" };
  if (/pain point|common pain|biggest pain|main pain|what.*\bpain\b|pains? (do|are|that)/.test(m)) {
    return { type: "pain_points" };
  }

  // ── Navigation ──
  // Match when the message ENDS WITH a place name (so "show me content ideas"
  // is NOT navigation — it ends with "ideas") and either carries a nav verb or
  // is a bare destination like "my quizzes" / "dashboard".
  const cleaned = m
    .replace(/[?!.]+$/g, "")
    .replace(/\b(please|now|right now|for me|thanks|thank you)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const navVerb = /\b(take me|bring me|lead me|send me|give me|go to|go|open|show|view|see|pull up|navigate|jump to|jump|head to|head|get me|where are|where'?s|where is|let me see)\b/.test(cleaned);

  // Longest keys first so "command center" beats "content"-style partials.
  const dests = Object.keys(NAV_ROUTES).sort((a, b) => b.length - a.length);
  for (const w of dests) {
    const endsWithDest = cleaned === w || cleaned.endsWith(` ${w}`);
    const bareDest = new RegExp(`^(my |the |our )?${w}$`).test(cleaned);
    if (endsWithDest && (navVerb || bareDest)) {
      return { type: "navigate", target: w, route: NAV_ROUTES[w] };
    }
  }

  return null;
}
