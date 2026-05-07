// Voice Trust Loop: the math behind the screenshot moment.
//
// One number a coach defends: "I sent X of last week's drafts in my voice
// without changing a word." That number is computed from cp_lead_messages
// rows where ai_drafted=true and original_draft is captured. This file
// owns the logic so every surface (Command Center, Decisions, per-message
// badge) reports the same thing.
//
// Two design choices worth flagging:
//
// 1. "Edited" means "different non-trivially from the original". A single
//    typo fix shouldn't tank the metric. Threshold: edit distance ratio
//    >= 5% of original length. Below that, it's effectively as-is.
//
// 2. Confidence levels are honest. Below ~10 sent AI messages we mark
//    "preliminary". Below ~3 we don't show the trust card at all — there's
//    no signal worth defending. This is the calibration discipline that
//    keeps insights from becoming theater.

import type { LeadMessage, VoiceProfile } from "@/lib/types";

/** Below this fraction of changed characters, we consider the message
 *  "as-is" — the coach didn't materially edit. A typo fix is fine. */
export const EDIT_THRESHOLD_RATIO = 0.05;

/** Minimum AI-drafted, sent messages to show ANY trust number. Below this
 *  we render an empty/teaser state instead of misleading the coach. */
export const TRUST_MIN_SAMPLE = 3;

/** Below this we mark the number "preliminary" so the coach knows it's
 *  early signal. Above, it's "real". */
export const TRUST_CONFIDENT_SAMPLE = 10;

export type VoiceShape = {
  tone?: string[];
  sentence_rhythm?: string;
  vocabulary?: { use?: string[]; avoid?: string[] };
  openers?: string[];
  closers?: string[];
  ctas?: string[];
  emotional_register?: string;
  do_nots?: string[];
};

export type VoiceFitScore = {
  score: number;
  label: "weak" | "needs_edit" | "strong";
  reasons: string[];
  fixes: string[];
  matched: string[];
};

export type EditLearningSummary = {
  sampleSize: number;
  confidence: "none" | "preliminary" | "real";
  averageLengthChangePct: number | null;
  tendency: "shortens" | "expands" | "keeps_length" | null;
  removedPhrases: string[];
  addedPhrases: string[];
  patterns: string[];
  nextActions: string[];
};

export type EditLearningExample = {
  id: string;
  original: string;
  final: string;
  changeLabel: string;
};

export type VoiceMemoryRule = {
  id: string;
  text: string;
  source: "edit_learning" | "manual" | "transcript";
  confidence: "preliminary" | "real";
  approved_at?: string;
};

const GENERIC_AI_PHRASES = [
  "i hope this finds you well",
  "thanks for reaching out",
  "just checking in",
  "circle back",
  "i'd love to",
  "i would love to",
  "quick follow-up",
  "quick follow up",
  "let me know if you have any questions",
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "that",
  "this",
  "you",
  "your",
  "with",
  "for",
  "from",
  "have",
  "been",
  "were",
  "are",
  "was",
  "but",
  "not",
  "just",
  "about",
  "into",
  "like",
  "what",
  "when",
  "where",
  "how",
  "why",
  "can",
  "could",
  "would",
  "should",
  "then",
  "than",
  "they",
  "them",
  "there",
  "here",
  "really",
  "very",
  "also",
]);

/** Compute whether a sent message was meaningfully edited from the AI
 *  draft. Levenshtein is overkill for the message lengths we see — a
 *  cheap "fraction of characters that differ" is good enough and runs
 *  client-side without a wasm dep. */
export function computeWasEdited(
  originalDraft: string,
  finalText: string
): boolean {
  const a = originalDraft.trim();
  const b = finalText.trim();
  if (a === b) return false;
  if (a.length === 0) return b.length > 0;
  // Cheap distance: count characters that differ at aligned positions
  // PLUS the absolute length delta. This isn't proper Levenshtein, but
  // it's cheap O(n) and tracks intuition: shifting one word at the start
  // shouldn't penalize the rest of the message disproportionately.
  const len = Math.max(a.length, b.length);
  let diff = Math.abs(a.length - b.length);
  const overlap = Math.min(a.length, b.length);
  for (let i = 0; i < overlap; i++) {
    if (a[i] !== b[i]) diff++;
  }
  const ratio = diff / len;
  return ratio >= EDIT_THRESHOLD_RATIO;
}

export function scoreVoiceFit(
  draft: string,
  profile: VoiceProfile | null | undefined
): VoiceFitScore | null {
  const text = draft.trim();
  if (!text) return null;

  const v = (profile?.voice_json ?? {}) as VoiceShape;
  const hasProfile = !!profile;
  let score = hasProfile ? 70 : 35;
  const reasons: string[] = [];
  const fixes: string[] = [];
  const matched: string[] = [];
  const lower = text.toLowerCase();

  if (!hasProfile) {
    reasons.push("No active voice profile yet.");
    fixes.push("Finish Voice setup before trusting outbound drafts.");
  }

  const useWords = cleanList(v.vocabulary?.use);
  const avoidWords = cleanList(v.vocabulary?.avoid);
  const used = useWords.filter((word) => includesLoose(lower, word)).slice(0, 4);
  const avoided = avoidWords
    .filter((word) => includesLoose(lower, word))
    .slice(0, 4);

  if (used.length > 0) {
    score += Math.min(12, used.length * 4);
    matched.push(`Uses your words: ${used.join(", ")}`);
  } else if (hasProfile && useWords.length > 0) {
    score -= 8;
    fixes.push(`Add one real phrase you use, like "${useWords[0]}".`);
  }

  if (avoided.length > 0) {
    score -= Math.min(20, avoided.length * 8);
    reasons.push(`Contains avoid words: ${avoided.join(", ")}`);
    fixes.push("Replace avoid words with simpler coach-written language.");
  }

  const genericHits = GENERIC_AI_PHRASES.filter((phrase) =>
    lower.includes(phrase)
  ).slice(0, 3);
  if (genericHits.length > 0) {
    score -= 18;
    reasons.push(`Sounds generic: ${genericHits.join(", ")}`);
    fixes.push("Cut polite filler and say the real next thing.");
  }

  if (text.includes("\u2014")) {
    score -= 8;
    reasons.push("Uses an em dash, which is outside the app voice rules.");
    fixes.push("Replace long punctuation with a comma or short sentence.");
  }

  const exclamations = (text.match(/!/g) ?? []).length;
  if (exclamations > 1) {
    score -= Math.min(12, exclamations * 3);
    reasons.push("Too much excitement for a trust-building reply.");
    fixes.push("Keep one emphasis point and let the message breathe.");
  }

  if (text.length > 900) {
    score -= 10;
    reasons.push("The draft is long for a lead reply.");
    fixes.push("Cut it to one clear idea and one next step.");
  } else if (text.length < 120) {
    score -= 5;
    reasons.push("The draft may be too thin to carry context.");
    fixes.push("Add one specific observation before the ask.");
  }

  const openers = cleanList(v.openers);
  if (hasProfile && openers.length > 0) {
    const openerHit = openers.find((opener) =>
      lower.slice(0, 140).includes(firstMeaningfulWords(opener, 3))
    );
    if (openerHit) {
      score += 6;
      matched.push("Starts close to your saved opener style.");
    } else {
      score -= 5;
      fixes.push("Open more like your saved examples.");
    }
  }

  const ctas = cleanList(v.ctas);
  const hasQuestion = /\?/.test(text);
  const ctaHit = ctas.find((cta) => includesLoose(lower, cta));
  if (hasQuestion || ctaHit) {
    score += 8;
    matched.push(ctaHit ? "Uses one of your CTA patterns." : "Ends with a clear ask.");
  } else {
    score -= 8;
    reasons.push("No clear next step.");
    fixes.push("End with one simple question or call invite.");
  }

  if (reasons.length === 0 && matched.length > 0) {
    reasons.push("The draft has enough voice signal to review quickly.");
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score: clamped,
    label: clamped >= 82 ? "strong" : clamped >= 58 ? "needs_edit" : "weak",
    reasons: unique(reasons).slice(0, 3),
    fixes: unique(fixes).slice(0, 3),
    matched: unique(matched).slice(0, 3),
  };
}

export function makeDraftMoreLikeVoice(
  draft: string,
  profile: VoiceProfile | null | undefined
): string {
  const text = draft.trim();
  if (!text) return "";

  const v = (profile?.voice_json ?? {}) as VoiceShape;
  const avoidWords = cleanList(v.vocabulary?.avoid);
  const useWords = cleanList(v.vocabulary?.use);
  const ctas = cleanList(v.ctas);
  const openers = cleanList(v.openers);

  let improved = text
    .replaceAll("\u2014", ",")
    .replace(/\s+!/g, "!")
    .replace(/!{2,}/g, "!")
    .replace(/\bjust checking in\b[:,]?\s*/gi, "")
    .replace(/\bquick follow[- ]up\b[:,]?\s*/gi, "")
    .replace(/\bi hope this finds you well\b[:,]?\s*/gi, "")
    .replace(/\bthanks for reaching out\b[:,]?\s*/gi, "")
    .replace(/\blet me know if you have any questions\b\.?/gi, "")
    .trim();

  for (const word of avoidWords) {
    improved = replaceLoose(improved, word, "");
  }

  improved = improved
    .split(/\n{3,}/)
    .join("\n\n")
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trim())
    .join("\n")
    .trim();

  if (improved.length > 900) {
    const sentences = improved.match(/[^.!?]+[.!?]*/g) ?? [improved];
    improved = sentences.slice(0, 5).join(" ").trim();
  }

  if (openers.length > 0 && !startsLikeAny(improved, openers)) {
    const opener = openers[0].replace(/\.$/, "").trim();
    if (opener.length > 0 && opener.length < 120) {
      improved = `${opener}.\n\n${improved}`;
    }
  }

  if (!/\?/.test(improved) && ctas.length > 0) {
    const cta = ctas[0].trim();
    if (cta) {
      improved = `${improved.replace(/[.!]*$/, "")}.\n\n${cta}`;
    }
  }

  if (useWords.length > 0 && !useWords.some((word) => includesLoose(improved.toLowerCase(), word))) {
    const anchor = useWords[0].trim();
    if (anchor.length > 0 && anchor.length < 48) {
      improved = improved.replace(/\.$/, `, ${anchor}.`);
    }
  }

  return improved.replace(/\n{3,}/g, "\n\n").trim();
}

export function buildVoiceRewriteGuidance(
  fit: VoiceFitScore | null,
  profile: VoiceProfile | null | undefined
): string[] {
  const v = (profile?.voice_json ?? {}) as VoiceShape;
  const memory = voiceMemoryRules(profile).map((rule) => rule.text);
  return unique([
    ...memory.map((rule) => `Approved voice memory: ${rule}`),
    ...(fit?.fixes ?? []),
    ...(fit?.reasons ?? []).map((reason) => `Fix: ${reason}`),
    cleanList(v.vocabulary?.use).length > 0
      ? `Use coach words when natural: ${cleanList(v.vocabulary?.use).slice(0, 6).join(", ")}`
      : "",
    cleanList(v.vocabulary?.avoid).length > 0
      ? `Avoid: ${cleanList(v.vocabulary?.avoid).slice(0, 6).join(", ")}`
      : "",
    cleanList(v.ctas).length > 0
      ? `End with one CTA like: ${cleanList(v.ctas)[0]}`
      : "End with one simple next step.",
    "Remove generic AI filler.",
    "No em dash characters.",
  ]).slice(0, 8);
}

export function summarizeEditLearning(
  messages: LeadMessage[]
): EditLearningSummary {
  const edited = messages.filter(
    (m) =>
      m.ai_drafted &&
      m.was_edited === true &&
      !!m.original_draft &&
      !!m.sent_at
  );

  const sampleSize = edited.length;
  const confidence =
    sampleSize >= 8 ? "real" : sampleSize >= 2 ? "preliminary" : "none";

  if (sampleSize === 0) {
    return {
      sampleSize,
      confidence,
      averageLengthChangePct: null,
      tendency: null,
      removedPhrases: [],
      addedPhrases: [],
      patterns: ["No edited AI drafts yet."],
      nextActions: ["Send or log two edited AI drafts so the app can learn."],
    };
  }

  let totalDeltaPct = 0;
  let removedExcitement = 0;
  let addedQuestion = 0;
  const removedCounts = new Map<string, number>();
  const addedCounts = new Map<string, number>();

  for (const m of edited) {
    const original = m.original_draft ?? "";
    const final = m.content ?? "";
    const base = Math.max(original.length, 1);
    totalDeltaPct += ((final.length - original.length) / base) * 100;

    if ((original.match(/!/g) ?? []).length > (final.match(/!/g) ?? []).length) {
      removedExcitement++;
    }
    if (!original.includes("?") && final.includes("?")) {
      addedQuestion++;
    }

    for (const word of diffWords(original, final, "removed")) {
      removedCounts.set(word, (removedCounts.get(word) ?? 0) + 1);
    }
    for (const word of diffWords(original, final, "added")) {
      addedCounts.set(word, (addedCounts.get(word) ?? 0) + 1);
    }
  }

  const averageLengthChangePct = Math.round(totalDeltaPct / sampleSize);
  const tendency =
    averageLengthChangePct <= -12
      ? "shortens"
      : averageLengthChangePct >= 12
        ? "expands"
        : "keeps_length";
  const removedPhrases = topEntries(removedCounts, 5);
  const addedPhrases = topEntries(addedCounts, 5);
  const patterns: string[] = [];
  const nextActions: string[] = [];

  if (tendency === "shortens") {
    patterns.push(`You shorten AI drafts by ${Math.abs(averageLengthChangePct)}% on average.`);
    nextActions.push("Default new drafts to fewer words and one idea.");
  } else if (tendency === "expands") {
    patterns.push(`You expand AI drafts by ${averageLengthChangePct}% on average.`);
    nextActions.push("Add more context before the ask in future drafts.");
  } else {
    patterns.push("You usually keep AI draft length close, but change the wording.");
    nextActions.push("Keep draft length stable and improve phrase choice.");
  }

  if (removedExcitement >= Math.max(2, sampleSize / 3)) {
    patterns.push("You often remove hype or extra enthusiasm.");
    nextActions.push("Lower the energy before sending follow-ups.");
  }

  if (addedQuestion >= Math.max(2, sampleSize / 3)) {
    patterns.push("You often add a direct question at the end.");
    nextActions.push("Make the next step a question by default.");
  }

  if (removedPhrases.length > 0) {
    patterns.push(`You remove words like ${removedPhrases.slice(0, 3).join(", ")}.`);
  }
  if (addedPhrases.length > 0) {
    patterns.push(`You add words like ${addedPhrases.slice(0, 3).join(", ")}.`);
  }

  return {
    sampleSize,
    confidence,
    averageLengthChangePct,
    tendency,
    removedPhrases,
    addedPhrases,
    patterns: unique(patterns).slice(0, 4),
    nextActions: unique(nextActions).slice(0, 3),
  };
}

export function editLearningExamples(
  messages: LeadMessage[],
  limit = 3
): EditLearningExample[] {
  return messages
    .filter(
      (m) =>
        m.ai_drafted &&
        m.was_edited === true &&
        !!m.original_draft &&
        !!m.sent_at
    )
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      original: compactExample(m.original_draft ?? ""),
      final: compactExample(m.content ?? ""),
      changeLabel: describeEditChange(m.original_draft ?? "", m.content ?? ""),
    }));
}

export function suggestVoiceMemoryRules(
  messages: LeadMessage[],
  approved: VoiceMemoryRule[] = []
): VoiceMemoryRule[] {
  const learning = summarizeEditLearning(messages);
  const existing = new Set(
    approved.map((rule) => normalizeRuleText(rule.text))
  );

  const candidates = [
    ...learning.nextActions,
    ...learning.patterns
      .filter((pattern) => !pattern.startsWith("No edited"))
      .map(patternToRule),
  ]
    .map((text) => text.replace(/\.$/, "").trim())
    .filter((text) => text.length > 0)
    .filter((text) => !existing.has(normalizeRuleText(text)));

  return unique(candidates)
    .slice(0, 4)
    .map((text) => ({
      id: ruleId(text),
      text,
      source: "edit_learning",
      confidence:
        learning.confidence === "real" ? "real" : "preliminary",
    }));
}

export function voiceMemoryRules(
  profile: VoiceProfile | null | undefined
): VoiceMemoryRule[] {
  const voiceJson = (profile?.voice_json ?? {}) as Record<string, unknown>;
  const memory = voiceJson.memory as Record<string, unknown> | undefined;
  const rules = memory?.approved_rules;
  if (!Array.isArray(rules)) return [];
  return rules
    .filter((rule): rule is VoiceMemoryRule => {
      if (!rule || typeof rule !== "object") return false;
      const candidate = rule as Record<string, unknown>;
      return typeof candidate.text === "string" && candidate.text.trim().length > 0;
    })
    .map((rule) => ({
      ...rule,
      id: rule.id || ruleId(rule.text),
      source: rule.source ?? "edit_learning",
      confidence: rule.confidence ?? "preliminary",
    }));
}

function cleanList(items: unknown): string[] {
  return Array.isArray(items)
    ? items
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function includesLoose(lowerText: string, raw: string): boolean {
  const needle = raw.trim().toLowerCase();
  if (!needle) return false;
  return lowerText.includes(needle);
}

function firstMeaningfulWords(text: string, limit: number): string {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .slice(0, limit)
    .join(" ");
}

function replaceLoose(text: string, raw: string, replacement: string): string {
  const escaped = raw.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return text;
  return text.replace(new RegExp(`\\b${escaped}\\b`, "gi"), replacement);
}

function startsLikeAny(text: string, openers: string[]): boolean {
  const lower = text.toLowerCase().slice(0, 160);
  return openers.some((opener) => {
    const key = firstMeaningfulWords(opener, 3);
    return key.length > 0 && lower.includes(key);
  });
}

function diffWords(original: string, final: string, mode: "removed" | "added"): string[] {
  const a = tokenize(original);
  const b = tokenize(final);
  const source = mode === "removed" ? a : b;
  const compare = new Set(mode === "removed" ? b : a);
  return source.filter((word) => !compare.has(word));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 3 && !STOP_WORDS.has(word));
}

function topEntries(map: Map<string, number>, limit: number): string[] {
  return [...map.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

function patternToRule(pattern: string): string {
  if (pattern.startsWith("You shorten AI drafts")) {
    return "Keep drafts shorter by default";
  }
  if (pattern.startsWith("You expand AI drafts")) {
    return "Add more context before the ask";
  }
  if (pattern.includes("remove hype")) {
    return "Lower hype and extra enthusiasm";
  }
  if (pattern.includes("direct question")) {
    return "End with a direct question";
  }
  if (pattern.includes("remove words like")) {
    return "Avoid words the coach usually deletes";
  }
  if (pattern.includes("add words like")) {
    return "Use words the coach keeps adding";
  }
  return pattern;
}

function normalizeRuleText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function ruleId(text: string): string {
  return normalizeRuleText(text).replace(/\s+/g, "-").slice(0, 72);
}

function compactExample(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > 220 ? `${trimmed.slice(0, 217)}...` : trimmed;
}

function describeEditChange(original: string, final: string): string {
  const base = Math.max(original.trim().length, 1);
  const pct = Math.round(((final.trim().length - original.trim().length) / base) * 100);
  if (pct <= -12) return `${Math.abs(pct)}% shorter`;
  if (pct >= 12) return `${pct}% longer`;
  return "same length, sharper words";
}

export type TrustWindow = {
  /** AI-drafted messages SENT in the window (sent_at not null). */
  total: number;
  /** Of those, how many went out unedited (was_edited=false). */
  asIs: number;
  /** Of those, how many were edited (was_edited=true). */
  edited: number;
  /** AI-drafted SENT messages we don't know about (pre-Trust-Loop, NULL).
   *  Counted but excluded from sent-as-is rate. */
  unknown: number;
};

export type TrustSummary = {
  last7: TrustWindow;
  last28: TrustWindow;
  /** Week buckets ending now. Most recent first. Up to 4 weeks. */
  weeklyAsIsPct: number[];
  /** Honest label so callers can show a confidence chip. */
  confidence: "none" | "preliminary" | "real";
  /** Convenience: as-is percentage over the rolling 28-day window.
   *  Null when total<TRUST_MIN_SAMPLE. */
  asIsPct28: number | null;
  /** Auto-send threshold: sent-as-is >= 90% over >= 20 messages.
   *  When true, the UI offers to flip auto_send_eligible on. */
  autoSendReady: boolean;
};

/** Filter to AI-drafted, sent messages with known edit state.
 *  Returns the subset that's signal — the rest is excluded from rates. */
function knownAiSent(messages: LeadMessage[]): LeadMessage[] {
  return messages.filter(
    (m) =>
      m.ai_drafted &&
      m.sent_at !== null &&
      m.was_edited !== null
  );
}

function summarizeWindow(
  messages: LeadMessage[],
  cutoffMs: number
): TrustWindow {
  let total = 0;
  let asIs = 0;
  let edited = 0;
  let unknown = 0;
  for (const m of messages) {
    if (!m.ai_drafted || !m.sent_at) continue;
    const t = Date.parse(m.sent_at);
    if (Number.isNaN(t) || t < cutoffMs) continue;
    total++;
    if (m.was_edited === true) edited++;
    else if (m.was_edited === false) asIs++;
    else unknown++;
  }
  return { total, asIs, edited, unknown };
}

export function summarizeTrust(
  messages: LeadMessage[],
  now = Date.now()
): TrustSummary {
  const day = 86_400_000;
  const last7 = summarizeWindow(messages, now - 7 * day);
  const last28 = summarizeWindow(messages, now - 28 * day);

  // Weekly buckets — last 4 calendar-aligned 7-day chunks ending now.
  const weeklyAsIsPct: number[] = [];
  for (let w = 0; w < 4; w++) {
    const end = now - w * 7 * day;
    const start = end - 7 * day;
    let total = 0;
    let asIs = 0;
    for (const m of messages) {
      if (!m.ai_drafted || !m.sent_at || m.was_edited === null) continue;
      const t = Date.parse(m.sent_at);
      if (Number.isNaN(t) || t < start || t >= end) continue;
      total++;
      if (m.was_edited === false) asIs++;
    }
    // Push 0 when no data so sparkline shows a flat baseline rather than
    // gaps. Caller can tell from sample size whether to dim the bar.
    weeklyAsIsPct.push(total === 0 ? 0 : Math.round((asIs / total) * 100));
  }

  const knownTotal28 = last28.asIs + last28.edited;
  const asIsPct28 =
    knownTotal28 < TRUST_MIN_SAMPLE
      ? null
      : Math.round((last28.asIs / knownTotal28) * 100);

  let confidence: TrustSummary["confidence"] = "none";
  if (knownTotal28 >= TRUST_CONFIDENT_SAMPLE) confidence = "real";
  else if (knownTotal28 >= TRUST_MIN_SAMPLE) confidence = "preliminary";

  const autoSendReady =
    knownTotal28 >= 20 && asIsPct28 !== null && asIsPct28 >= 90;

  return {
    last7,
    last28,
    weeklyAsIsPct,
    confidence,
    asIsPct28,
    autoSendReady,
  };
}
