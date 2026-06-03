// lib/dhara/memory.ts
// Dhara memory core: types, extraction parsing, and the dedup/promote ladder.
// Pure functions only — DB I/O lives in the routes.

export type MemoryKind = "fact" | "preference" | "goal" | "audience" | "voice_note";
export type MemoryConfidence = "candidate" | "repeated" | "confirmed";
export type MemoryStatus = "active" | "forgotten";

export type CoachMemory = {
  id: string;
  coachId: string;
  kind: MemoryKind;
  text: string;
  source: "conversation" | "explicit" | "brand_os";
  sourceRef: string | null;
  confidence: MemoryConfidence;
  status: MemoryStatus;
};

export const MEMORY_KINDS: MemoryKind[] = ["fact", "preference", "goal", "audience", "voice_note"];

export function normalizeMemoryText(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!,;:]+$/g, "");
}

export type ExtractedMemory = { kind: MemoryKind; text: string };

export function parseExtraction(raw: string): ExtractedMemory[] {
  let data: unknown;
  try { data = JSON.parse(raw.trim()); } catch { return []; }
  if (!Array.isArray(data)) return [];
  const out: ExtractedMemory[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const kind = (item as { kind?: unknown }).kind;
    const text = (item as { text?: unknown }).text;
    if (typeof text !== "string" || !text.trim()) continue;
    if (typeof kind !== "string" || !MEMORY_KINDS.includes(kind as MemoryKind)) continue;
    out.push({ kind: kind as MemoryKind, text: text.trim() });
  }
  return out;
}

export type MergeResult =
  | { action: "insert"; confidence: "candidate" }
  | { action: "promote"; targetId: string; confidence: MemoryConfidence };

function bump(c: MemoryConfidence): MemoryConfidence {
  return c === "candidate" ? "repeated" : c === "repeated" ? "confirmed" : "confirmed";
}

export function mergeOrInsert(
  existing: CoachMemory[],
  candidate: ExtractedMemory,
): MergeResult {
  const norm = normalizeMemoryText(candidate.text);
  const match = existing.find((m) => m.status === "active" && normalizeMemoryText(m.text) === norm);
  if (!match) return { action: "insert", confidence: "candidate" };
  return { action: "promote", targetId: match.id, confidence: bump(match.confidence) };
}

export function buildExtractionPrompt(userMessage: string, assistantMessage: string): string {
  return [
    "From the exchange below, extract 0 to 3 DURABLE memories about the COACH that would help a future conversation.",
    "Durable = stable preferences, goals, audience facts, how they like to work, who they are. NOT ephemera, NOT the assistant's words, NOT one-off task details.",
    "Return ONLY a JSON array (no prose, no fences) of objects: {\"kind\": one of fact|preference|goal|audience|voice_note, \"text\": short third-person statement}.",
    "If nothing durable, return [].",
    "",
    `COACH: ${userMessage}`,
    `ASSISTANT: ${assistantMessage}`,
  ].join("\n");
}
