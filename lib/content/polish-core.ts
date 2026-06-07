// lib/content/polish-core.ts
//
// Pure, runtime-agnostic logic for the Content "polish in my voice" feature.
// Imported by BOTH the Next edge route and the Node eval script, so it must
// stay free of Next/Deno-specific APIs. The only dependency is the already-
// pure safeParseJson helper.

import { safeParseJson } from "@/lib/voice/extract-rules";

export const MIN_POLISH_CHARS = 20;
export const MAX_POLISH_CHARS = 4000;

export type PolishSteer = "tighter" | "warmer" | "shorter" | "keep_more";

export type PolishFlag =
  | { kind: "em_dash" }
  | { kind: "numbers_added"; values: string[] }
  | { kind: "ballooned"; rawWords: number; polishedWords: number }
  | { kind: "structure_dropped" };

export type PolishResult = { polished: string; changes: string[] };

/** The Sharpen contract. The prompt is the product: it constrains the model
 *  to EDIT, not rewrite or invent. */
export function buildSharpenSystemPrompt(
  voiceJson: unknown,
  sampleMessages: string[],
): string {
  return [
    "You are an editor for a coach. You EDIT their rough draft. You do not",
    "rewrite it from scratch and you do not generate new content.",
    "",
    "GOAL: Sharpen the draft. Cut filler, fix grammar and flow, tighten the",
    "rhythm, so it is ready to post. Keep the coach's ideas, claims, meaning,",
    "and their words and cadence wherever they already land.",
    "",
    "HARD RULES:",
    "- Do not add new facts, names, numbers, examples, claims, or ideas that",
    "  are not already in the draft. Editing only.",
    "- Preserve structure: keep line breaks, lists, and bullets. A bulleted",
    "  post stays bulleted. Do not collapse structure into one paragraph.",
    "- Obey the coach's do_nots and vocabulary.avoid below.",
    "- Never use em-dashes. Use periods, commas, colons, or parentheses.",
    "",
    "OUTPUT: strict JSON only, no prose around it:",
    '{ "polished": "<the edited text>", "changes": ["<short bullet>", "..."] }',
    "Give 2 to 4 change bullets, each under 8 words, plain and specific",
    '(e.g. "cut the throat-clearing opener", "kept your closing line").',
    "",
    "VOICE PROFILE (the coach's actual voice):",
    "```json",
    JSON.stringify(voiceJson ?? {}, null, 2),
    "```",
    "",
    "SAMPLES OF HOW THIS COACH WRITES:",
    sampleMessages.slice(0, 5).map((s, i) => `${i + 1}. ${s}`).join("\n") || "(none)",
  ].join("\n");
}

const STEER_LINES: Record<PolishSteer, string> = {
  tighter: "Lean shorter and punchier than your default. Cut harder.",
  warmer: "Make it a touch warmer and more personal, without going soft.",
  shorter: "Make it noticeably shorter. Keep only what earns its place.",
  keep_more: "Keep more of their own words and phrasing. Edit less, trust their voice.",
};

/** Wrap the coach's draft as the user turn. `steer` is an additive nudge from
 *  a Try-again chip, never a new contract. */
export function buildUserPrompt(rawText: string, steer?: PolishSteer): string {
  const lines = [
    "Edit the draft below and return the JSON described in the system prompt.",
    "",
    "DRAFT:",
    '"""',
    rawText,
    '"""',
  ];
  if (steer) lines.push("", `STEER: ${STEER_LINES[steer]}`);
  return lines.join("\n");
}

/** Defensive parse. Reuses safeParseJson (handles fenced/loose JSON). On any
 *  failure, treats the whole response as the polished text so the coach still
 *  gets their edit, just without a change summary. */
export function parsePolishResponse(raw: string): PolishResult {
  const parsed = safeParseJson<{ polished?: unknown; changes?: unknown }>(raw);
  if (parsed && typeof parsed.polished === "string" && parsed.polished.trim()) {
    const changes = Array.isArray(parsed.changes)
      ? parsed.changes.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
      : [];
    return { polished: parsed.polished.trim(), changes };
  }
  return { polished: (raw ?? "").trim(), changes: [] };
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function numberTokens(s: string): string[] {
  // Normalize thousands separators so "1,000" and "1000" compare equal.
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

function bulletLineCount(s: string): number {
  return s.split("\n").filter((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)).length;
}

/** Cheap, deterministic, instant checks. Returned as soft flags the UI shows
 *  as "check this" notes. They never block the edit. No named-entity detection
 *  (not deterministically possible in this runtime), so it is not attempted. */
export function runGuardrails(rawText: string, polished: string): PolishFlag[] {
  const flags: PolishFlag[] = [];

  if (polished.includes("—")) flags.push({ kind: "em_dash" });

  const rawNums = new Set(numberTokens(rawText));
  const addedNums = [...new Set(numberTokens(polished))].filter((n) => !rawNums.has(n));
  if (addedNums.length > 0) flags.push({ kind: "numbers_added", values: addedNums });

  const rawWords = wordCount(rawText);
  const polishedWords = wordCount(polished);
  if (rawWords > 0 && polishedWords > rawWords * 1.4) {
    flags.push({ kind: "ballooned", rawWords, polishedWords });
  }

  const rawBullets = bulletLineCount(rawText);
  const rawNewlines = (rawText.match(/\n/g) ?? []).length;
  const polishedBullets = bulletLineCount(polished);
  const polishedNewlines = (polished.match(/\n/g) ?? []).length;
  const rawHadStructure = rawBullets >= 2 || rawNewlines >= 2;
  const polishedLostIt = polishedBullets === 0 && polishedNewlines === 0;
  if (rawHadStructure && polishedLostIt) flags.push({ kind: "structure_dropped" });

  return flags;
}
