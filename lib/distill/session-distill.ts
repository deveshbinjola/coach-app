// lib/distill/session-distill.ts
//
// Pure distillation of a coaching session into structured, provenance-carrying
// signals. Extract only what's in the notes; quote the source as `evidence`.

import { extractJson } from "@/lib/voice/extract-rules";
import type { NewSignal, SignalKind } from "@/lib/signals";

export type DistillItem = { text: string; evidence: string | null };
export type DistillParsed = { topics: DistillItem[]; commitments: DistillItem[]; patterns: DistillItem[]; somatic: DistillItem[] };

export function buildDistillPrompt(sessionText: string): string {
  return [
    "You distill a coach's session notes into structured memory.",
    "Extract ONLY what is present in the notes. Do not invent facts, names,",
    "numbers, or outcomes. For every item include `evidence`: the exact phrase",
    "from the notes it came from. No em-dashes.",
    "",
    "Output strict JSON only:",
    '{ "topics": [{ "text": "", "evidence": "" }], "commitments": [...], "patterns": [...], "somatic": [...] }',
    "- topics: what the session was about (3-6, short).",
    "- commitments: things the client said they will do (quote the promise).",
    "- patterns: recurring themes worth watching (only if clearly recurring).",
    "- somatic: body/nervous-system observations, if any.",
    "Return empty arrays for buckets with nothing real.",
    "",
    "SESSION NOTES:",
    '"""',
    sessionText,
    '"""',
  ].join("\n");
}

function cleanBucket(v: unknown): DistillItem[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((it) => {
      const text = typeof it?.text === "string" ? it.text.trim() : "";
      const ev = typeof it?.evidence === "string" && it.evidence.trim() ? it.evidence.trim() : null;
      return { text, evidence: ev };
    })
    .filter((it) => it.text.length > 0);
}

export function parseDistillResponse(raw: string): DistillParsed {
  const json = extractJson(raw);
  let data: Record<string, unknown> = {};
  if (json) { try { data = JSON.parse(json); } catch { data = {}; } }
  return {
    topics: cleanBucket(data.topics),
    commitments: cleanBucket(data.commitments),
    patterns: cleanBucket(data.patterns),
    somatic: cleanBucket(data.somatic),
  };
}

const BUCKET_KIND: Array<[keyof DistillParsed, SignalKind]> = [
  ["topics", "topic"], ["commitments", "commitment"], ["patterns", "pattern"], ["somatic", "somatic"],
];

export function toSignals(parsed: DistillParsed, ctx: { sessionId: string; subjectId: string | null }): NewSignal[] {
  const out: NewSignal[] = [];
  for (const [bucket, kind] of BUCKET_KIND) {
    for (const item of parsed[bucket]) {
      out.push({
        source: "session", kind, refTable: "cp_coaching_sessions",
        refId: ctx.sessionId, subjectId: ctx.subjectId, text: item.text, evidence: item.evidence,
      });
    }
  }
  return out;
}
