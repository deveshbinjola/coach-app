// Brand OS Agent v2 — Push-back marker detection.
//
// Cheap regex pass that runs CLIENT-SIDE when a push-back-trigger question
// is being locked. If a marker hits, the UI calls a server endpoint that
// uses Anthropic to generate the 2 differentiated alternatives.
//
// Source: spec sections 1.2 (detection rules) + 1.3 (generic-marker lists).

import type { Audience } from "./questions";

// ============================================================
// MARKER LISTS — per branch, per trigger
// ============================================================

const POSITIONING_M = [
  "high performers", "alpha", "purpose", "next level", "transform", "transformation",
  "authentic", "leadership", "mindset", "breakthrough", "fulfillment", "success",
  "peak performance", "alignment", "abundance", "manifestation", "your best self",
  "level up", "scale", "freedom", "impact", "sovereignty", "mission", "legacy",
];

const POSITIONING_W = [
  "empowered", "aligned", "abundant", "authentic", "transform", "transformation",
  "magnetic", "divine feminine", "embodied", "sacred", "soul-led", "intuitive",
  "holistic", "whole", "your best self", "level up", "liberation", "expansion",
  "magnetism", "manifestation", "empowerment", "your highest self",
];

const POSITIONING_X = [...new Set([...POSITIONING_M, ...POSITIONING_W])];

const FELT_SENSE_M = ["authentic", "grounded", "real", "honest", "genuine", "raw", "true", "direct", "powerful"];
const FELT_SENSE_W = ["authentic", "grounded", "real", "soft",   "genuine", "raw", "true", "sacred", "deep", "expansive"];
const FELT_SENSE_X = [...new Set([...FELT_SENSE_M, ...FELT_SENSE_W])];

const STANCE_SINGLES = [
  "leadership", "mindset", "confidence", "purpose", "transformation",
  "performance", "success", "mastery", "growth", "empowerment",
  "alignment", "abundance", "manifestation", "femininity", "masculinity", "sovereignty",
];

const CTA_GENERIC = [
  "book a discovery call", "apply now", "learn more", "get started",
  "schedule a chat", "hop on a call", "click the link", "dm me",
  "book a clarity call",
];

const FAMOUS_FIGURES = [
  "tony robbins", "brené brown", "marie forleo", "amy porterfield",
  "rachel hollis", "gabby bernstein", "deepak chopra", "tim ferriss",
  "mel robbins", "joe dispenza", "andrew huberman",
];

// ============================================================
// DETECTION
// ============================================================

export type PushBackTrigger =
  | "positioning"    // Mirror Q1
  | "felt-sense"     // Signal Q11
  | "stance"         // Stance Q9
  | "cta";           // Funnel Q7

export type DetectionResult = {
  fired: boolean;
  reason: "markers" | "too_short" | "famous_figure" | "template_match" | null;
  markersMatched: string[];
};

/** Run the marker detection for a question. Returns whether push-back should
 *  fire and the reason. The UI uses the result to decide whether to call the
 *  alternatives-generation endpoint. */
export function detectPushBack(
  trigger: PushBackTrigger,
  answer: string,
  audience: Audience
): DetectionResult {
  const text = answer.trim().toLowerCase();
  if (!text) return { fired: false, reason: null, markersMatched: [] };

  // Rule: too short + no specificity.
  // Spec says "fewer than 5 words and lacks specificity". Cheap heuristic:
  // word count below 5 AND no numbers/proper nouns.
  const words = text.split(/\s+/).filter(Boolean);
  const hasSpecificity = /\d|[A-Z][a-z]+/.test(answer);
  if (words.length < 5 && !hasSpecificity) {
    return { fired: true, reason: "too_short", markersMatched: [] };
  }

  // Rule: references a famous figure as a comparison.
  for (const figure of FAMOUS_FIGURES) {
    if (text.includes(figure)) {
      return { fired: true, reason: "famous_figure", markersMatched: [figure] };
    }
  }

  // Rule: template match — "I help [type] go from [pain] to [outcome] in [time]"
  // Heuristic: phrase pattern with "go from" + "to" within 60 chars + "in"
  if (/i help .{1,40}go from .{1,40} to .{1,40} in /i.test(answer)) {
    return { fired: true, reason: "template_match", markersMatched: [] };
  }

  // Rule: marker list match — 2+ markers for the relevant list.
  const markers = pickMarkerList(trigger, audience);
  const hits = markers.filter((m) => text.includes(m));
  // For stance-singles: even ONE match fires (single-word stance is the defect).
  const threshold = trigger === "stance" ? 1 : 2;
  if (hits.length >= threshold) {
    return { fired: true, reason: "markers", markersMatched: hits.slice(0, 5) };
  }

  return { fired: false, reason: null, markersMatched: [] };
}

function pickMarkerList(trigger: PushBackTrigger, audience: Audience): string[] {
  if (trigger === "positioning") {
    return audience === "M" ? POSITIONING_M : audience === "W" ? POSITIONING_W : POSITIONING_X;
  }
  if (trigger === "felt-sense") {
    return audience === "M" ? FELT_SENSE_M : audience === "W" ? FELT_SENSE_W : FELT_SENSE_X;
  }
  if (trigger === "stance") return STANCE_SINGLES;
  if (trigger === "cta")    return CTA_GENERIC;
  return [];
}

/** Map question id → push-back trigger type. */
export function triggerForQuestion(questionId: string): PushBackTrigger | null {
  if (questionId === "mirror.q1")  return "positioning";
  if (questionId === "signal.q11") return "felt-sense";
  if (questionId === "stance.q9")  return "stance";
  if (questionId === "funnel.q7")  return "cta";
  return null;
}

/** Anti-loop rule from spec §1.6 — after 2 push-backs in one module, stop
 *  pushing. The agent switches tactic: "Tell me about a client conversation
 *  in the last 90 days that surprised you." */
export const ANTI_LOOP_FALLBACK = `We're stuck here. Tell me about a client conversation in the last 90 days that surprised you. Quote them. Quote yourself. The differentiation is hiding in there.`;
