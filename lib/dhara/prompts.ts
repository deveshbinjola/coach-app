// lib/dhara/prompts.ts
// Reverse-engineer 2-3 tailored starter prompts from what's actually in the
// coach's database, so opening Dhara is never a blank box. Prompts are gated
// by data presence and prioritized so the top ones are answered
// deterministically (counts / revenue / pain points / navigation). Pure +
// unit-tested.

export type DharaStats = {
  revenueCents: number;   // this month
  leads: number;
  clients: number;
  quizzes: number;
  draftsReady: number;
  topPainPoint: { name: string; count: number } | null;
  slipping: string[];     // names of quiet clients
};

export type StarterPrompt = { label: string; message: string };

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function buildStarterPrompts(s: DharaStats): StarterPrompt[] {
  const out: StarterPrompt[] = [];

  // Deterministic, data-gated — these answer instantly from the DB.
  // Revenue: show when there are any clients/leads/payments worth asking about.
  if (s.revenueCents > 0 || s.clients > 0) {
    out.push({ label: "How much have I made this month?", message: "how much revenue did I make this month" });
  }
  if (s.topPainPoint) {
    out.push({ label: "What are my leads struggling with?", message: "which pain points do most leads have" });
  }
  if (s.draftsReady > 0) {
    out.push({ label: `Review my ${s.draftsReady} ready draft${s.draftsReady === 1 ? "" : "s"}`, message: "open content" });
  }
  if (s.leads > 0) {
    out.push({ label: "How many leads do I have?", message: "how many leads do I have" });
  }
  if (s.quizzes > 0) {
    out.push({ label: "How many quizzes are live?", message: "how many quizzes do I have" });
  }

  // Fallbacks so a brand-new coach (no data) still sees something useful.
  if (out.length < 3) {
    out.push({ label: "How's my month looking?", message: "how's my month looking" });
    out.push({ label: "Take me to my dashboard", message: "take me to the dashboard" });
  }

  return out.slice(0, 3);
}

// A tiny one-liner for the panel header, tailored if we have a standout number.
export function tailoredGreeting(s: DharaStats): string {
  if (s.revenueCents > 0) return `${usd(s.revenueCents)} in so far this month.`;
  if (s.leads > 0) return `${s.leads} lead${s.leads === 1 ? "" : "s"} in your world right now.`;
  return "Take a breath. What's on your mind?";
}
