// lib/funnel-config.ts
//
// Shared shape + structural validator for quiz (funnel) configs. Used by the
// generate route (after LLM parse) and the create route (re-validating a
// client-posted draft — never trust the client). Synthesis-free: checks
// internal consistency only (5 questions, 3 choices each, 3 results, every
// choice score references a real result key). Empty cta_url is allowed here;
// the review UI handles "no link" warnings.

export type FunnelChoice = { key: string; text: string; scores: Record<string, number> };
export type FunnelQuestion = { id: string; text: string; choices: FunnelChoice[] };
export type FunnelResult = {
  key: string; pillar_name: string; headline: string; body: string; cta_text: string; cta_url: string;
};
export type FunnelConfig = {
  intro: { headline: string; subhead: string; cta_label: string };
  questions: FunnelQuestion[];
  results: FunnelResult[];
  branding: { primary_hex: string; accent_hex: string; background_hex: string; font_family: string };
};

export function validateFunnelConfigShape(config: FunnelConfig): { valid: boolean; error?: string } {
  if (!config || typeof config !== "object") return { valid: false, error: "config missing" };
  if (!config.intro?.headline || !config.intro?.subhead) return { valid: false, error: "intro incomplete" };

  if (!Array.isArray(config.questions) || config.questions.length !== 5) {
    return { valid: false, error: "must have exactly 5 questions" };
  }
  if (!Array.isArray(config.results) || config.results.length !== 3) {
    return { valid: false, error: "must have exactly 3 results" };
  }

  const resultKeys = new Set(config.results.map((r) => r.key));
  if (resultKeys.size !== 3) return { valid: false, error: "result keys not unique" };

  for (const r of config.results) {
    if (!r.key || !r.pillar_name || !r.headline || !r.body || typeof r.cta_url !== "string") {
      return { valid: false, error: "result fields incomplete" };
    }
  }

  for (const q of config.questions) {
    if (!q.id || !q.text || !Array.isArray(q.choices) || q.choices.length !== 3) {
      return { valid: false, error: "each question needs 3 choices" };
    }
    for (const ch of q.choices) {
      if (!ch.key || !ch.text || !ch.scores || typeof ch.scores !== "object") {
        return { valid: false, error: "choice fields incomplete" };
      }
      for (const scoreKey of Object.keys(ch.scores)) {
        if (!resultKeys.has(scoreKey)) {
          return { valid: false, error: `choice scores unknown key ${scoreKey}` };
        }
      }
    }
  }

  return { valid: true };
}
