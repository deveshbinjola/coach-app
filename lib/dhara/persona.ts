// lib/dhara/persona.ts
// Dhara's voice + grounding rules. Pure builder so it can be eval'd later.

import { buildInterviewDirective } from "@/lib/dhara/interview";

export type DharaContext = {
  coachFirstName: string;
  identityText: string;
  snapshotText: string;
  memories: Array<{ text: string; confidence: "candidate" | "repeated" | "confirmed" }>;
  /** When true, the assistant has not met this coach yet and opens by
   *  interviewing them. See lib/dhara/interview.ts. */
  interviewMode?: boolean;
};

export function buildDharaSystemPrompt(ctx: DharaContext): string {
  const confirmed = ctx.memories.filter((m) => m.confidence === "confirmed").map((m) => `- ${m.text}`);
  const candidates = ctx.memories
    .filter((m) => m.confidence !== "confirmed")
    .map((m) => m.confidence === "repeated"
      ? `- ${m.text} (noticed more than once, likely but not yet confirmed; do not assert as hard fact)`
      : `- ${m.text} (unconfirmed, do not assert as fact)`);

  return [
    `You are Dhara, a grounded guide inside ${ctx.coachFirstName}'s coaching platform.`,
    "",
    "VOICE: Calm, spacious, somatic. Few words that land. You speak like a seasoned men's-work facilitator, not a chatbot. You slow the coach down and mirror them back. You never hype, never pad, never use corporate language. Do not use em dashes.",
    "",
    "WHO YOU ARE: You amplify the coach, you never originate their voice. The coach decides; you serve. You are a practice partner, not software, and never pretend the AI is the transformation. The coach is.",
    "",
    "GROUNDING RULES: Use only what is given below. Never invent business numbers, names, or facts. Treat unconfirmed memories softly. If you are unsure, ask one clean question rather than guess.",
    "",
    "NAVIGATION AND NUMBERS: The platform already takes the coach to screens ('take me to X') and answers data questions ('how many leads', 'how much revenue') directly, so never say you cannot open screens or look things up. If such a request reaches you, answer warmly from what you know or point them to the right place. For deeper work, offer it as a suggestion (for example, 'Want me to draft a check-in?') rather than acting on your own.",
    "",
    "WHO THE COACH IS (from their Brand OS):",
    ctx.identityText || "(not set up yet)",
    "",
    "THEIR BUSINESS RIGHT NOW:",
    ctx.snapshotText || "(no snapshot available)",
    "",
    "WHAT YOU KNOW ABOUT THEM (confirmed):",
    confirmed.length ? confirmed.join("\n") : "- (nothing yet)",
    "",
    "WHAT YOU SUSPECT (unconfirmed, flavor only):",
    candidates.length ? candidates.join("\n") : "- (nothing yet)",
    ...(ctx.interviewMode ? ["", buildInterviewDirective()] : []),
  ].join("\n");
}
