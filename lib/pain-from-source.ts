import type { PainSignal } from "./types";

type PainRule = {
  signal: PainSignal;
  keywords: string[];
};

const RULES: PainRule[] = [
  {
    signal: "heartbreak",
    keywords: [
      "heartbreak", "heartbroken", "breakup", "break-up", "divorce",
      "separation", "lost-love", "lost-her", "losing-her", "ex-wife",
      "ex-girlfriend", "grief-relationship", "she-left",
    ],
  },
  {
    signal: "relationship_conflict",
    keywords: [
      "relationship", "marriage", "partner", "conflict", "communication",
      "intimacy", "trust-issues", "jealousy", "codepend", "attachment",
      "polarity", "feminine-masculine", "disconnection", "fighting",
    ],
  },
  {
    signal: "purpose_confusion",
    keywords: [
      "purpose", "meaning", "direction", "lost", "stuck", "clarity",
      "confused", "what-am-i-doing", "mission", "calling", "unfulfilled",
      "quarter-life", "midlife", "crossroads", "transition", "pivot",
    ],
  },
  {
    signal: "emotional_numbness",
    keywords: [
      "numb", "numbness", "shut-down", "shutdown", "disconnected",
      "feeling-nothing", "empty", "flat", "dissociat", "suppressed",
      "bottled-up", "cant-feel", "frozen",
    ],
  },
  {
    signal: "masculinity_identity",
    keywords: [
      "masculinity", "masculine", "manhood", "man-up", "identity",
      "initiation", "rite-of-passage", "brotherhood", "men-work",
      "mens-work", "sacred-masculine", "king-warrior", "shadow-work",
      "embodiment", "embodied",
    ],
  },
  {
    signal: "business_pressure",
    keywords: [
      "business", "revenue", "scaling", "growth", "entrepreneur",
      "founder", "startup", "coaching-business", "client-acquisition",
      "lead-gen", "sales", "pricing", "monetiz", "income", "profit",
      "10k-month", "six-figure", "agency",
    ],
  },
  {
    signal: "burnout",
    keywords: [
      "burnout", "burn-out", "exhausted", "exhaustion", "overwhelm",
      "overwork", "stress", "anxiety", "cant-stop", "hustle-culture",
      "nervous-system", "adrenal", "fatigue", "recovery", "rest",
      "boundaries", "self-care",
    ],
  },
];

/**
 * Extract pain signals from a URL by matching slug keywords.
 * Returns an array of unique PainSignal values (may be empty).
 *
 * The match is intentionally generous — a blog post about "healing after
 * heartbreak and finding purpose" would return both "heartbreak" and
 * "purpose_confusion". Coaches can always refine manually.
 */
export function inferPainFromUrl(url: string): PainSignal[] {
  if (!url) return [];

  let slug: string;
  try {
    const u = new URL(url);
    slug = u.pathname.toLowerCase();
  } catch {
    slug = url.toLowerCase();
  }

  const normalized = slug.replace(/[/_]/g, "-");
  const matched = new Set<PainSignal>();

  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (normalized.includes(kw)) {
        matched.add(rule.signal);
        break;
      }
    }
  }

  return Array.from(matched);
}

/**
 * Derive a human-readable article title from a URL slug.
 * "/blog/healing-after-heartbreak" → "Healing After Heartbreak"
 */
export function titleFromUrl(url: string): string | null {
  if (!url) return null;

  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }

  const segments = pathname.split("/").filter(Boolean);
  const slug = segments[segments.length - 1];
  if (!slug || slug === "blog" || slug === "index.html") return null;

  return slug
    .replace(/\.html?$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
