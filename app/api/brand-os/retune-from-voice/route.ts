// POST /api/brand-os/retune-from-voice
//
// Incremental voice re-tune. Reads the coach's current brand voice overlay
// + their newest voice training samples (Instagram, LinkedIn, newsletter,
// sales calls, pasted text) and asks Claude to refine the overlay's
// voice_dna fields (tone, rhythm, signature_moves, vocab_yes, vocab_no).
//
// This is the lighter-weight cousin of /api/brand-os/synthesize:
//   - synthesize  = full Brand OS deliverable from quiz answers
//   - retune      = update the voice DNA from new writing samples only
//
// Triggered by the "Your voice has new material — re-tune?" banner on
// /content (and /voice). Resets the corpus baseline on success.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import {
  loadBrandVoiceOverlay,
  saveBrandVoiceOverlay,
  snapshotVoiceCorpus,
  type BrandVoiceOverlay,
} from "@/lib/brand-os/voice-overlay";

export const runtime = "edge";

const MAX_SAMPLES = 12;
const MAX_SAMPLE_CHARS = 4000;

export async function POST(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "brand-os/retune", 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // Load current overlay — required. If they haven't run Brand OS, send
  // them there first.
  const overlay = await loadBrandVoiceOverlay(supabase, user.id);
  if (!overlay) {
    return NextResponse.json({
      error: "no_overlay",
      message: "Run Brand OS first to create your voice DNA — then re-tunes update it from new samples.",
    }, { status: 400 });
  }

  // Pull the most recent voice training sources (the new corpus).
  const { data: sources } = await supabase
    .from("cp_voice_training_sources")
    .select("source_type, title, transcript, created_at")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: false })
    .limit(MAX_SAMPLES);

  const rows = (sources ?? []) as Array<{
    source_type: string;
    title: string | null;
    transcript: string | null;
    created_at: string | null;
  }>;
  const usableSamples = rows.filter((r) => (r.transcript ?? "").trim().length >= 80);
  if (usableSamples.length === 0) {
    return NextResponse.json({
      error: "no_samples",
      message: "Import voice samples (Instagram, LinkedIn, newsletter, paste) first — those are what we re-tune from.",
    }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Anthropic API not configured." }, { status: 500 });

  const sampleBlocks = usableSamples.map((r, i) =>
    `### Sample ${i + 1} — ${r.source_type}${r.title ? ` · ${r.title}` : ""}\n${(r.transcript ?? "").slice(0, MAX_SAMPLE_CHARS)}`
  ).join("\n\n");

  const sysPrompt = `You re-tune a coach's brand voice DNA based on new writing samples.

You will be given:
  1. The coach's CURRENT voice DNA (tone, rhythm, signature_moves, vocab_yes, vocab_no)
  2. Their NEWEST writing samples (Instagram, LinkedIn, newsletter, etc.)

Your job is to produce an UPDATED voice DNA that better matches their current patterns. Honor what's still true; sharpen what's evolved.

RULES:
- tone, rhythm: 1–2 sentences each. Concrete, not aspirational.
- signature_moves: 3–5 things THIS coach does that AI mimicry would miss. Pulled from the samples.
- vocab_yes: 10–20 words/phrases observed in the samples. Lowercase unless proper noun. 1–4 words per item.
- vocab_no: 8–15 words/phrases the samples DO NOT use, especially generic coach-clichés. 1–4 words per item.
- Preserve items from the current DNA that still ring true in the samples.
- Update items that are no longer accurate.
- Never invent vocabulary not present in the samples.

OUTPUT: Strict JSON only. Shape:
{
  "tone": "string",
  "rhythm": "string",
  "signature_moves": ["string", ...],
  "vocab_yes": ["string", ...],
  "vocab_no": ["string", ...]
}

No prose. No code fences. Just the JSON.`;

  const userPrompt = `CURRENT VOICE DNA:
${JSON.stringify({
  tone: overlay.tone,
  rhythm: overlay.rhythm,
  signature_moves: overlay.signature_moves,
  vocab_yes: overlay.vocab_yes,
  vocab_no: overlay.vocab_no,
}, null, 2)}

NEWEST WRITING SAMPLES:
${sampleBlocks}`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: sysPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    return NextResponse.json({ error: "anthropic_error", detail: detail.slice(0, 300) }, { status: 502 });
  }

  const aiData = await aiRes.json() as { content?: Array<{ type: string; text?: string }> };
  const raw = aiData.content?.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return NextResponse.json({ error: "could_not_parse", raw: raw.slice(0, 300) }, { status: 502 });

  type Parsed = {
    tone?: string;
    rhythm?: string;
    signature_moves?: string[];
    vocab_yes?: string[];
    vocab_no?: string[];
  };
  let parsed: Parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Parsed;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 502 });
  }

  const next: BrandVoiceOverlay = {
    ...overlay,
    tone:            (parsed.tone ?? overlay.tone).slice(0, 200),
    rhythm:          (parsed.rhythm ?? overlay.rhythm).slice(0, 200),
    signature_moves: (parsed.signature_moves ?? overlay.signature_moves ?? []).slice(0, 5).map((s) => s.slice(0, 200)),
    vocab_yes:       (parsed.vocab_yes ?? overlay.vocab_yes ?? []).slice(0, 20),
    vocab_no:        (parsed.vocab_no  ?? overlay.vocab_no  ?? []).slice(0, 15),
  };

  // saveBrandVoiceOverlay also resets the corpus baseline.
  await saveBrandVoiceOverlay(supabase, user.id, next);

  // For the response — surface diffs the UI can show.
  const diff = {
    added_yes: (next.vocab_yes ?? []).filter((v) => !(overlay.vocab_yes ?? []).map((s) => s.toLowerCase()).includes(v.toLowerCase())),
    added_no:  (next.vocab_no  ?? []).filter((v) => !(overlay.vocab_no  ?? []).map((s) => s.toLowerCase()).includes(v.toLowerCase())),
    samples_used: usableSamples.length,
  };

  return NextResponse.json({
    overlay: next,
    diff,
    corpus_at_save: await snapshotVoiceCorpus(supabase, user.id),
  });
}
