// lib/dhara/interview.ts
//
// The assistant interviews the coaches it never met.
//
// /meet and /welcome interview new signups, but every coach who joined
// before that shipped has an assistant that claims to know them and never
// asked them anything. Rather than bounce them back through a form, the
// assistant does what an assistant would do: it asks, in conversation, the
// first time they talk.
//
// Storage is the same as the form path — confirmed memories with
// source 'explicit' — so both routes converge on one representation and
// the rest of the product cannot tell which way a coach was interviewed.
//
// Pure module: no I/O, unit-tested.

import type { CoachMemory } from "@/lib/dhara/memory";

/** How many explicit memories mean "this coach has been interviewed."
 *  The form path writes 5 to 7 (niche, stage, tone, drains, desires), so
 *  form-onboarded coaches clear this immediately and never see interview
 *  mode. The conversational path needs a few exchanges to get here, which
 *  is the point: it keeps asking until it actually knows them. */
export const INTERVIEW_COMPLETE_AT = 4;

export type InterviewSubject = Pick<CoachMemory, "source" | "status">;

/** True once the assistant knows enough to stop interviewing. */
export function hasBeenInterviewed(memories: InterviewSubject[]): boolean {
  const explicit = memories.filter(
    (m) => m.source === "explicit" && m.status === "active",
  ).length;
  return explicit >= INTERVIEW_COMPLETE_AT;
}

/** What the assistant still wants to learn, in asking order. */
export const INTERVIEW_TOPICS = [
  "what kind of coach they are and who they work with",
  "where the business is right now (starting, building, established)",
  "how they want the assistant to talk to them (direct, warm, playful)",
  "what they most want handed off first",
] as const;

/** Appended to Dhara's system prompt while interview mode is on. */
export function buildInterviewDirective(): string {
  return [
    "INTERVIEW MODE (active):",
    "You have not properly met this coach yet. Before you can be useful you need to know them.",
    "",
    "Work through these, in this order, one at a time:",
    ...INTERVIEW_TOPICS.map((t, i) => `${i + 1}. ${t}`),
    "",
    "How to run it:",
    "- Ask ONE question per message. Never stack two questions.",
    "- Keep each question to a sentence or two. No preamble.",
    "- When they answer, say back the one thing you took from it in a short line, then ask the next.",
    "- If they raise something else, answer that first, then return to where you were.",
    "- If they decline, drop it and be useful with what you have. Never ask twice.",
    "- When you have all four, tell them plainly what you now know and what you will do with it. Then stop asking.",
    "This is a conversation, not a form. Do not number the questions out loud or mention the list.",
  ].join("\n");
}

/** Greeting shown in the empty conversation for a coach not yet interviewed. */
export function interviewOpener(firstName: string): string {
  const name = firstName.trim();
  return name
    ? `${name}, we have not properly met. Before I start working for you, tell me what kind of coach you are and who you work with.`
    : "We have not properly met. Before I start working for you, tell me what kind of coach you are and who you work with.";
}
