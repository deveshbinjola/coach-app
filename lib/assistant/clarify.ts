// lib/assistant/clarify.ts
//
// "Ask one question before producing something substantial."
// See docs/assistant-principles.md section 3.
//
// The failure this fixes: the assistant guesses at a missing, load-bearing
// piece of context, produces a confident asset built on the guess, and the
// coach has to reverse-engineer what it assumed. One sharp question up
// front is cheaper than a good-looking wrong draft.
//
// The discipline that keeps it from becoming a form:
//   - ONE question, never a list
//   - only when the output is expensive enough to be worth the pause
//   - never when the answer is already known
//
// Pure module. No I/O, no model calls, unit-tested.

/** How costly is the thing being asked for? Cheap output is never worth
 *  interrupting: a coach asking for a quick reply wants the reply. */
export type OutputCost = "cheap" | "substantial";

export type ClarifyInput = {
  /** What the coach asked for, verbatim. */
  brief: string;
  cost: OutputCost;
  /** Facts the assistant already holds (Dhara memories, brief fields).
   *  Anything covered here must never be asked about. */
  known?: string[];
};

export type ClarifyDecision =
  | { ask: false; reason: "cheap_output" | "brief_is_specific" | "already_known" }
  | { ask: true; question: string; gap: ClarifyGap };

/** The load-bearing gaps, in priority order. The first one that is both
 *  missing from the brief and not already known is the one question. */
export type ClarifyGap = "audience" | "outcome" | "occasion";

const GAP_QUESTION: Record<ClarifyGap, string> = {
  audience: "Who is this for, your list or someone specific?",
  outcome: "What do you want them to do after they read it?",
  occasion: "Is this tied to something happening now, or evergreen?",
};

/** Words in the brief that show the gap is already answered. */
const GAP_SIGNALS: Record<ClarifyGap, RegExp> = {
  // "my list", "our clients", a named person, or an explicit segment.
  // Deliberately requires a possessive rather than any article, so "the
  // cohort closing tomorrow" reads as the topic, not the audience.
  audience:
    /\b(my|our)\s+(list|clients?|leads?|audience|subscribers?|group|people|men|women|members)\b|\bfor\s+[A-Z][a-z]+\b|\bcold\b|\bwarm\b|\bnewsletter\b/i,
  outcome:
    /\b(book|reply|respond|sign\s?up|join|buy|click|call|dm|apply|register|download|share|subscribe)\b/i,
  occasion:
    /\b(today|tonight|tomorrow|this\s+(week|month)|launch|cohort|deadline|closing|last\s+chance|evergreen|any\s?time)\b/i,
};

const GAP_ORDER: ClarifyGap[] = ["audience", "outcome", "occasion"];

function alreadyKnown(gap: ClarifyGap, known: string[]): boolean {
  return known.some((k) => GAP_SIGNALS[gap].test(k));
}

/** Decide whether to ask, and what the single question is. */
export function decideClarification(input: ClarifyInput): ClarifyDecision {
  if (input.cost === "cheap") return { ask: false, reason: "cheap_output" };

  const brief = input.brief.trim();
  const known = input.known ?? [];

  // A detailed brief has already answered the questions worth asking.
  const missing = GAP_ORDER.filter(
    (gap) => !GAP_SIGNALS[gap].test(brief) && !alreadyKnown(gap, known),
  );

  if (missing.length === 0) {
    return { ask: false, reason: brief.length > 0 ? "brief_is_specific" : "already_known" };
  }

  // Ask about the most load-bearing gap only. Never stack.
  const gap = missing[0]!;
  return { ask: true, question: GAP_QUESTION[gap], gap };
}

/** The rule as stated to a model. Appended to agent system prompts so the
 *  behaviour is identical wherever the assistant produces work. */
export function buildClarifyDirective(): string {
  return [
    "BEFORE YOU PRODUCE SOMETHING SUBSTANTIAL:",
    "If a load-bearing piece of context is missing (who it is for, what it should make them do, whether it is tied to something happening now), ask ONE question first, then produce.",
    "Rules: one question only, never a list. Never ask about anything already in what you know about them or already stated in their request. Never ask the same thing twice. For quick, cheap output like a short reply, do not ask at all, just draft it.",
  ].join("\n");
}
