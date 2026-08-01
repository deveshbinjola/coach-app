// The inbox triage demo: a coach pastes a week of messages and gets back the
// chief-of-staff read. Who needs answering, who is going cold, who is not a
// fit, and the thing buried in the middle that nobody followed up on.
//
// The split of labour here is the whole point, and it is deliberate:
//
//   The model does PERCEPTION. It reads unstructured pasted text and turns it
//   into structured leads. That is the thing only a model can do.
//
//   The deterministic engines do JUDGEMENT. computeLeadScore, assessFit and
//   assessSla are the exact functions that rank the Command Center for paying
//   coaches. Nothing here reimplements them or approximates them.
//
// So the ranking a stranger sees on the landing page is not a model opinion
// dressed up as analysis. It is the product's actual logic, run on their own
// messages. If we ever change the scoring, this demo changes with it.

import { computeLeadScore, scoreTier } from "@/lib/lead-score";
import { assessFit, type FitAssessment } from "@/lib/lead-fit";
import { assessSla, type SlaAssessment } from "@/lib/lead-sla";
import {
  PAIN_SIGNAL_LABEL,
  type Lead,
  type LeadIncomeBand,
  type LeadReadiness,
  type LeadSource,
  type LeadTemperature,
  type PainSignal,
} from "@/lib/types";

export const INBOX_MIN = 120;
export const INBOX_MAX = 6000;
/** Above this the paste is almost certainly a whole mailbox, not a week. */
export const MAX_MESSAGES = 12;

const TEMPERATURES: LeadTemperature[] = ["on_fire", "hot", "warm", "cold", "dormant"];
const SOURCES: LeadSource[] = ["ig", "linkedin", "referral", "quiz", "in_person", "podcast", "newsletter", "other"];
const READINESS: LeadReadiness[] = ["researching", "comparing", "ready_now", "dormant_explorer", "tire_kicker"];
const INCOME_BANDS: LeadIncomeBand[] = ["under_10k_mo", "10k_30k_mo", "30k_plus_mo", "unknown"];
const PAIN_SIGNALS: PainSignal[] = [
  "heartbreak",
  "relationship_conflict",
  "purpose_confusion",
  "emotional_numbness",
  "masculinity_identity",
  "business_pressure",
  "burnout",
];

export const EXAMPLE_INBOX = `Marcus, 2 days ago:
Been reading your stuff for months. Things at home are bad and I keep telling myself I'll deal with it later. I'm ready to actually do something. What's the next step?

Priya, 11 days ago:
Thanks for the call last week! Really valuable. Let me talk to my partner about the investment and I'll come back to you.

Dev, 3 days ago:
hey what are your rates

Tom, 6 days ago:
We spoke in January, then life happened. I'm in a much worse place now honestly. Do you have anything starting soon?

Nadia, yesterday:
Loved the newsletter. Do you ever do free intro sessions? I'm not really in a position to pay for coaching right now but would love to pick your brain.`;

export type ParsedMessage = {
  name: string;
  /** The line from their message that carries the actual signal. */
  quote: string;
  daysAgo: number;
  temperature: LeadTemperature;
  source: LeadSource;
  readiness: LeadReadiness;
  incomeBand: LeadIncomeBand;
  painSignals: PainSignal[];
  hadCall: boolean;
  /** The thing they did not say directly. One short sentence. */
  underneath: string;
};

export type TriagedLead = {
  name: string;
  quote: string;
  underneath: string;
  daysAgo: number;
  score: number;
  tier: ReturnType<typeof scoreTier>;
  fit: FitAssessment;
  sla: SlaAssessment;
  painLabels: string[];
};

export type TriageResult = {
  /** Ranked by the same scoring that ranks the Command Center. */
  ranked: TriagedLead[];
  answerFirst: TriagedLead | null;
  goingCold: TriagedLead[];
  notAFit: TriagedLead[];
  missedCount: number;
};

export type InboxValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

export function validateInbox(body: unknown): InboxValidation {
  const raw = (body ?? {}) as Record<string, unknown>;
  const inbox = typeof raw.inbox === "string" ? raw.inbox.trim().slice(0, INBOX_MAX) : "";
  if (inbox.replace(/\s+/g, " ").length < INBOX_MIN) {
    return { ok: false, error: "Paste a few more messages. A week's worth works best." };
  }
  return { ok: true, value: inbox };
}

export function buildParsePrompt(inbox: string): { system: string; user: string } {
  const system = [
    "You read a coach's raw inbox and turn each message into one structured lead.",
    "You are doing perception, not judgement. Extract what is actually there.",
    "Do not rank, do not advise, do not decide who matters. Something else does that.",
    "Never invent a person, a detail, a price, or a date that is not in the text.",
    "If a field is genuinely unclear from the message, use the least flattering plausible value rather than guessing upward.",
    "Never use em dash characters.",
    `Return compact JSON only: {"messages": [...]} with at most ${MAX_MESSAGES} entries.`,
    "Each entry:",
    "  name: the sender's name as written, or a short description if unnamed.",
    "  quote: the single most revealing sentence from their message, verbatim, under 160 characters.",
    "  daysAgo: integer days since they wrote. Read relative dates in the text. If absent, 0.",
    `  temperature: one of ${TEMPERATURES.join("|")}. How close to buying they sound.`,
    `  source: one of ${SOURCES.join("|")}. Where they came from, "other" if unstated.`,
    `  readiness: one of ${READINESS.join("|")}. tire_kicker is for people who ask and never commit.`,
    `  incomeBand: one of ${INCOME_BANDS.join("|")}. "unknown" unless they signal it.`,
    `  painSignals: array from ${PAIN_SIGNALS.join("|")}. Only what they actually name. Empty array is fine.`,
    "  hadCall: true only if the message says a call or session already happened.",
    "  underneath: one short sentence naming what they are not saying directly.",
  ].join("\n");

  return { system, user: `THE INBOX:\n\n${inbox}` };
}

function clean(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().replaceAll("—", ",").slice(0, max);
}

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

export function parseMessages(text: string): ParsedMessage[] {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    return [];
  }

  const list = (raw as { messages?: unknown })?.messages;
  if (!Array.isArray(list)) return [];

  return list.slice(0, MAX_MESSAGES).flatMap((entry): ParsedMessage[] => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const name = clean(item.name, 60);
    const quote = clean(item.quote, 200);
    if (!name || !quote) return [];

    const daysAgoRaw = typeof item.daysAgo === "number" ? item.daysAgo : 0;
    const painSignals = Array.isArray(item.painSignals)
      ? (item.painSignals.filter(
          (p): p is PainSignal => typeof p === "string" && (PAIN_SIGNALS as string[]).includes(p),
        ) as PainSignal[])
      : [];

    return [
      {
        name,
        quote,
        daysAgo: Math.max(0, Math.min(365, Math.round(daysAgoRaw))),
        temperature: pick(item.temperature, TEMPERATURES, "warm"),
        source: pick(item.source, SOURCES, "other"),
        readiness: pick(item.readiness, READINESS, "researching"),
        incomeBand: pick(item.incomeBand, INCOME_BANDS, "unknown"),
        painSignals: [...new Set(painSignals)],
        hadCall: item.hadCall === true,
        underneath: clean(item.underneath, 200),
      },
    ];
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Build the Lead the real engines expect. Only fields the engines read are
 *  meaningful; the rest exist because the type requires them. */
export function toLead(message: ParsedMessage, index: number, now: number): Lead {
  const contactedAt = new Date(now - message.daysAgo * DAY_MS).toISOString();
  return {
    id: `demo-${index}`,
    coach_id: "demo",
    full_name: message.name,
    email: null,
    phone: null,
    source: message.source,
    source_detail: null,
    source_url: null,
    referred_by_lead_id: null,
    // Someone who has already been in a conversation is "contacted", which is
    // what puts them on the slower SLA clock. A brand new message is "new" and
    // gets the 2-hour clock. This distinction is the whole reason the SLA read
    // is worth anything.
    status: message.hadCall ? "qualified" : message.daysAgo <= 1 ? "new" : "contacted",
    temperature: message.temperature,
    notes: null,
    tags: [],
    last_contact_at: contactedAt,
    next_followup_at: null,
    next_honest_action: null,
    pain_signal: message.painSignals,
    primary_pain_point_id: null,
    pain_stage: null,
    discovery_call_completed: message.hadCall,
    income_band: message.incomeBand,
    readiness_signal: message.readiness,
    fit_notes: null,
    disqualified_reason: null,
    auto_draft_eligible: false,
    deal_value: null,
    created_at: contactedAt,
    updated_at: contactedAt,
  };
}

export function triage(messages: ParsedMessage[], now: number = Date.now()): TriageResult {
  const leads: TriagedLead[] = messages.map((message, index) => {
    const lead = toLead(message, index, now);
    const score = computeLeadScore(lead, now);
    return {
      name: message.name,
      quote: message.quote,
      underneath: message.underneath,
      daysAgo: message.daysAgo,
      score,
      tier: scoreTier(score),
      fit: assessFit(lead),
      sla: assessSla(lead, now),
      painLabels: message.painSignals.map((p) => PAIN_SIGNAL_LABEL[p]),
    };
  });

  const ranked = [...leads].sort((a, b) => b.score - a.score);

  // Weak and disqualified both mean "this is not the conversation to spend
  // your morning on". Saying so is the part no other tool will do.
  const notAFit = ranked.filter((l) => l.fit.band === "weak" || l.fit.band === "disqualified");
  const goingCold = ranked.filter(
    (l) => (l.sla.state === "overdue" || l.sla.state === "warning") && l.fit.band !== "weak",
  );

  // The one to answer first is the best-scoring lead who is actually worth
  // answering. A hot tire kicker at the top of the list is still not the
  // person your morning belongs to.
  const answerFirst = ranked.find((l) => l.fit.band !== "weak" && l.fit.band !== "disqualified") ?? null;

  return {
    ranked: ranked.map(scrubLead),
    answerFirst: answerFirst ? scrubLead(answerFirst) : null,
    goingCold: goingCold.filter((l) => l.name !== answerFirst?.name).map(scrubLead),
    notAFit: notAFit.map(scrubLead),
    missedCount: goingCold.length,
  };
}

/** Every string the landing page renders passes through here.
 *
 *  The engines are internal-facing and free to write however they like, and
 *  they did: assessFit was returning "Below the $2K floor — may need lower
 *  offer" and the SLA fallback label was a bare em dash. Both would have shipped
 *  onto a page with a zero em dash rule. Those specific strings are fixed at
 *  source, but the landing page should not depend on every future engine string
 *  remembering a marketing rule. This is the boundary that enforces it. */
function scrub(value: string): string {
  return value.replaceAll("—", ",").replaceAll("–", "-").trim();
}

export function safeSlaLabel(sla: SlaAssessment): string {
  return scrub(sla.label) || "No timestamp";
}

function scrubLead(lead: TriagedLead): TriagedLead {
  return {
    ...lead,
    name: scrub(lead.name),
    quote: scrub(lead.quote),
    underneath: scrub(lead.underneath),
    painLabels: lead.painLabels.map(scrub),
    fit: { ...lead.fit, reasons: lead.fit.reasons.map(scrub) },
    sla: { ...lead.sla, label: safeSlaLabel(lead.sla), tip: scrub(lead.sla.tip) },
  };
}
