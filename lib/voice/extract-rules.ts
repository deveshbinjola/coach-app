// Shared voice-rules extraction helpers.
//
// The bug we're fixing: every voice-import route (Instagram, LinkedIn,
// newsletter, text) was calling Claude, then `JSON.parse`ing the raw
// response. Sonnet wraps JSON in ``` ```json fences ``` ``` often enough
// that ~30% of calls threw a SyntaxError and silently fell through to
// hardcoded fallback rules — which is why "Instagram import" and
// "Newsletter import" both produced identical generic rules in the UI.
//
// This module:
//   1. extractJson(raw)   — find the first {...} block, with or without
//                            markdown fencing. Mirrors voice-mine's helper.
//   2. SYSTEM_PROMPT_RULES — the shared system prompt header that demands
//                            quoted-evidence-per-rule and bans generic
//                            coach phrasing.
//   3. BANNED_PHRASES     — the phrases that signal "the AI defaulted to
//                            generic coach-content advice." If a returned
//                            rule contains any of these, log it.

/** Pull the JSON payload out of a Claude response. Handles three cases:
 *  - Raw JSON: returns it as-is
 *  - ```json … ``` fenced block: extracts the inner content
 *  - JSON preceded/followed by chatter: finds the first { … last } pair
 *  Returns null when no plausible JSON is found. */
export function extractJson(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Fast path: starts with { and ends with }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  // Fenced block
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  // Loose extraction
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return null;
}

/** Parse a Claude JSON response defensively. Returns null on any failure
 *  so the caller can fall back gracefully without throwing. */
export function safeParseJson<T = unknown>(raw: string): T | null {
  const extracted = extractJson(raw);
  if (!extracted) return null;
  try {
    return JSON.parse(extracted) as T;
  } catch {
    return null;
  }
}

/** Shared system prompt header for voice-rule extraction. The full system
 *  prompt is composed as:
 *    SYSTEM_RULE_HEADER + source-specific framing + SYSTEM_RULE_FOOTER
 *  Source-specific framing lives in each import route. */
export const SYSTEM_RULE_HEADER = [
  "You extract voice rules for a coach AI assistant.",
  "Each rule must be SPECIFIC to THIS source — patterns you can quote from the writing in front of you, not generic content advice.",
].join(" ");

export const SYSTEM_RULE_FOOTER = [
  "",
  "BANNED OUTPUTS — refuse to produce any rule that:",
  "- Could apply to any coach writing anything (e.g. 'Open with a hook', 'Use direct CTAs', 'Avoid generic phrasing').",
  "- Lacks a quotable line of evidence from the source.",
  "- Describes the writing in general terms instead of naming a specific repeated pattern.",
  "",
  "EACH RULE must:",
  "- Name a specific repeated pattern (a word, a sentence shape, a rhythm, a move).",
  "- Cite ONE short quoted line from the source as evidence in the rule text or an evidence field.",
  "- Use the coach's vocabulary, not coach-template vocabulary.",
  "",
  'Output JSON ONLY — no preamble, no markdown fencing, no explanation outside the JSON.',
  'Shape: {"rules":[{"text":"...","evidence":"short quoted line","confidence":"preliminary"|"real","category":"hook"|"story"|"cta"|"belief"|"offer"|"avoid"|"rhythm"}]}',
  "No em dash characters anywhere.",
].join("\n");

/** Phrases that signal the AI defaulted to generic coach-content advice
 *  instead of extracting from the source. If a returned rule contains any
 *  of these, it's almost certainly the model being lazy. We log these so
 *  we can iterate on the prompt. */
export const BANNED_PHRASES = [
  "open with a hook",
  "open with a concrete tension",
  "open with a strong opening",
  "use direct ctas",
  "use clear ctas",
  "tell the reader exactly what to",
  "use line breaks to create pacing",
  "let the idea breathe",
  "avoid generic motivational",
  "avoid generic phrasing",
  "elevate your",
  "unlock your",
  "next level",
  "game changer",
  "the secret to",
] as const;

/** Returns the BANNED_PHRASES that appear in a rule's text. Empty array
 *  means the rule is clean. Used for telemetry, not for blocking. */
export function detectGenericPhrases(ruleText: string): string[] {
  const lower = ruleText.toLowerCase();
  return BANNED_PHRASES.filter((p) => lower.includes(p));
}
