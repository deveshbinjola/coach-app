import type { Lead, LeadMessage } from "@/lib/types";

export const LEAD_MEMORY_PREFIX = "memory:";

export type LeadMemory = {
  id: string;
  text: string;
  source: "lead_signal" | "manual";
  confidence: "new" | "repeated" | "approved";
};

const OBJECTION_PATTERNS = [
  { match: /\b(price|pricing|cost|expensive|afford|budget)\b/i, text: "Has a pricing or budget concern" },
  { match: /\b(time|busy|schedule|calendar|bandwidth)\b/i, text: "May have a time commitment concern" },
  { match: /\bthink about|not sure|unsure|maybe|later\b/i, text: "Needs more certainty before deciding" },
  { match: /\bpayment plan|installment|monthly\b/i, text: "May need payment plan conversation" },
];

const SIGNAL_PATTERNS = [
  { match: /\bdivorce|breakup|heartbreak|relationship\b/i, text: "Relationship pain is part of the context" },
  { match: /\bburnout|overwhelmed|exhausted|stressed\b/i, text: "Burnout is part of the context" },
  { match: /\bbusiness|founder|company|revenue|sales\b/i, text: "Business pressure is part of the context" },
  { match: /\bcall|zoom|chat|consultation\b/i, text: "Open to a call when the timing is right" },
];

export function leadMemoryFromTags(tags: string[] | null | undefined): LeadMemory[] {
  return (tags ?? [])
    .filter((tag) => tag.startsWith(LEAD_MEMORY_PREFIX))
    .map((tag) => tag.slice(LEAD_MEMORY_PREFIX.length).trim())
    .filter(Boolean)
    .map((text) => ({
      id: memoryId(text),
      text,
      source: "manual",
      confidence: "approved",
    }));
}

export function leadMemoryTag(text: string): string {
  return `${LEAD_MEMORY_PREFIX}${text.trim()}`;
}

export function suggestLeadMemory(
  lead: Lead,
  messages: LeadMessage[]
): LeadMemory[] {
  const approved = new Set(
    leadMemoryFromTags(lead.tags).map((memory) => normalizeMemory(memory.text))
  );
  const text = [
    lead.notes ?? "",
    ...messages.map((message) => message.content ?? ""),
  ].join("\n");

  const suggestions: string[] = [];
  for (const pattern of [...OBJECTION_PATTERNS, ...SIGNAL_PATTERNS]) {
    if (pattern.match.test(text)) suggestions.push(pattern.text);
  }

  if (lead.source_detail) {
    suggestions.push(`Came from ${lead.source_detail}`);
  }
  if (lead.next_honest_action) {
    suggestions.push(`Next action is ${lead.next_honest_action.replaceAll("_", " ")}`);
  }
  if (lead.fit_notes) {
    suggestions.push(`Fit note: ${lead.fit_notes}`);
  }

  return unique(suggestions)
    .filter((item) => !approved.has(normalizeMemory(item)))
    .slice(0, 4)
    .map((text) => ({
      id: memoryId(text),
      text,
      source: "lead_signal",
      confidence: "new",
    }));
}

export function extractAllLeadMemories(leads: Lead[]): LeadMemory[] {
  return leads.flatMap((lead) => leadMemoryFromTags(lead.tags));
}

function normalizeMemory(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

function memoryId(text: string): string {
  return normalizeMemory(text).replace(/\s+/g, "-").slice(0, 72);
}

function unique(items: string[]): string[] {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}
