// POST /api/brand-os/learn-from-edit
//
// Edit-as-feedback loop. Diffs the coach's edited content body against
// the AI's original output and uses Anthropic to extract:
//   - phrases the coach STRUCK out (candidates for vocab_no)
//   - phrases the coach ADDED  (candidates for vocab_yes)
//
// Patches cp_coaches.brand_voice_overlay so the next generation gets
// sharper without the coach ever opening the Brand OS quiz again.
//
// Body: { contentId }. Returns { added_yes, added_no, skipped?: reason }.
//
// Guardrails:
//   - skips if AI original missing (couldn't have edited)
//   - skips if edit distance < 12 chars (typo fix, not voice signal)
//   - caps additions per call: max 4 yes + 4 no
//   - dedups against existing overlay vocab (case-insensitive)
//   - caps overlay vocab arrays: 25 yes, 20 no (oldest fall off)
//   - logs each event to cp_brand_voice_learnings for review/undo

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import {
  loadBrandVoiceOverlay,
  saveBrandVoiceOverlay,
  type BrandVoiceOverlay,
} from "@/lib/brand-os/voice-overlay";

export const runtime = "edge";

const MIN_EDIT_CHARS = 12;
const MAX_NEW_YES_PER_CALL = 4;
const MAX_NEW_NO_PER_CALL = 4;
const VOCAB_YES_CAP = 25;
const VOCAB_NO_CAP  = 20;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "brand-os/learn-from-edit", 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { contentId?: string };
  try {
    body = (await request.json()) as { contentId?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const contentId = (body.contentId ?? "").trim();
  if (!contentId) return NextResponse.json({ error: "contentId required" }, { status: 400 });

  // Pull content row + verify ownership.
  const { data: content } = await supabase
    .from("cp_content")
    .select("id, body, ai_original_body, voice_learned_at")
    .eq("id", contentId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!content) return NextResponse.json({ error: "content_not_found" }, { status: 404 });

  const original = (content.ai_original_body as string | null) ?? "";
  const edited   = (content.body as string | null) ?? "";

  if (!original) {
    return NextResponse.json({ skipped: "no_ai_original" });
  }
  if (original.trim() === edited.trim()) {
    return NextResponse.json({ skipped: "no_changes" });
  }
  // Trivial edits (typo fixes) aren't voice signal.
  const distance = Math.abs(original.length - edited.length) + countWordDiff(original, edited);
  if (distance < MIN_EDIT_CHARS) {
    return NextResponse.json({ skipped: "trivial_edit", distance });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ skipped: "anthropic_not_configured" });

  // Ask the model to extract voice deltas. Cheap call — tight system, tight output.
  const sysPrompt = `You analyze how a coach edits AI drafts to learn their voice.

Given the AI's ORIGINAL output and the coach's EDITED version, identify:
  - "added_yes": words/phrases the coach added or substituted IN. These are vocabulary they prefer.
  - "added_no":  words/phrases the coach removed or replaced OUT. These are vocabulary they reject.

QUALITY BAR:
- Only meaningful voice signal. Skip typo fixes, punctuation, capitalization, articles, conjunctions.
- 1–4 items each list. NEVER more.
- 1–4 words per item. NEVER a full sentence.
- Lowercase unless it's a proper noun.
- If the edit is structural rewriting (not vocabulary), return empty arrays.
- If unsure, return empty arrays. Quality over quantity.

OUTPUT: Strict JSON only. Shape:
{ "added_yes": ["string", ...], "added_no": ["string", ...] }

No prose. No code fences. Just the JSON.`;

  const userPrompt = `ORIGINAL:\n${original.slice(0, 6000)}\n\nEDITED:\n${edited.slice(0, 6000)}`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: sysPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    return NextResponse.json({ skipped: "anthropic_error", detail: detail.slice(0, 200) }, { status: 502 });
  }

  const aiData = await aiRes.json() as { content?: Array<{ type: string; text?: string }> };
  const raw = aiData.content?.find((c) => c.type === "text")?.text ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return NextResponse.json({ skipped: "could_not_parse" });

  type Parsed = { added_yes?: string[]; added_no?: string[] };
  let parsed: Parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Parsed;
  } catch {
    return NextResponse.json({ skipped: "invalid_json" });
  }

  const newYes = sanitizeList(parsed.added_yes ?? [], MAX_NEW_YES_PER_CALL);
  const newNo  = sanitizeList(parsed.added_no  ?? [], MAX_NEW_NO_PER_CALL);

  if (newYes.length === 0 && newNo.length === 0) {
    return NextResponse.json({ added_yes: [], added_no: [], skipped: "no_signal" });
  }

  // Patch the overlay (if one exists).
  const overlay = await loadBrandVoiceOverlay(supabase, user.id);
  if (!overlay) {
    // Coach hasn't run Brand OS yet — log the event but don't patch.
    await supabase.from("cp_brand_voice_learnings").insert({
      coach_id: user.id,
      content_id: contentId,
      added_yes: newYes,
      added_no: newNo,
      raw_diff: { original_len: original.length, edited_len: edited.length, no_overlay: true },
    });
    return NextResponse.json({ added_yes: newYes, added_no: newNo, skipped: "no_overlay_to_patch" });
  }

  const mergedYes = mergeVocab(overlay.vocab_yes ?? [], newYes, overlay.vocab_no ?? [], VOCAB_YES_CAP);
  const mergedNo  = mergeVocab(overlay.vocab_no  ?? [], newNo,  overlay.vocab_yes ?? [], VOCAB_NO_CAP);

  const next: BrandVoiceOverlay = {
    ...overlay,
    vocab_yes: mergedYes,
    vocab_no:  mergedNo,
  };

  await saveBrandVoiceOverlay(supabase, user.id, next);

  await Promise.all([
    supabase.from("cp_brand_voice_learnings").insert({
      coach_id: user.id,
      content_id: contentId,
      added_yes: newYes,
      added_no: newNo,
      raw_diff: { original_len: original.length, edited_len: edited.length },
    }),
    supabase
      .from("cp_content")
      .update({ voice_learned_at: new Date().toISOString() })
      .eq("id", contentId)
      .eq("coach_id", user.id),
  ]);

  return NextResponse.json({
    added_yes: newYes,
    added_no: newNo,
    vocab_yes_total: mergedYes.length,
    vocab_no_total: mergedNo.length,
  });
}

// ── helpers ────────────────────────────────────────────────

function sanitizeList(items: string[], cap: number): string[] {
  return items
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().replace(/^["'`]+|["'`]+$/g, "").trim())
    .filter((s) => s.length >= 2 && s.length <= 60)
    // Reject single common words like "the", "and"
    .filter((s) => !STOP_WORDS.has(s.toLowerCase()))
    .slice(0, cap);
}

/** Case-insensitive merge. New items take priority; existing items move to
 *  front. Items that appear in the OPPOSING vocab list are removed from
 *  that list elsewhere (handled by caller using mergeVocab on both sides).
 *  Items that would land in BOTH yes and no are dropped from this list. */
function mergeVocab(existing: string[], incoming: string[], opposing: string[], cap: number): string[] {
  const opposingLower = new Set(opposing.map((s) => s.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];

  // Incoming first (most recent voice signal).
  for (const item of incoming) {
    const k = item.toLowerCase();
    if (opposingLower.has(k)) continue; // conflict — skip
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  // Then existing, oldest at the bottom.
  for (const item of existing) {
    const k = item.toLowerCase();
    if (seen.has(k)) continue;
    if (opposingLower.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out.slice(0, cap);
}

function countWordDiff(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/));
  const wb = new Set(b.toLowerCase().split(/\s+/));
  let diff = 0;
  for (const w of wa) if (!wb.has(w)) diff++;
  for (const w of wb) if (!wa.has(w)) diff++;
  return diff;
}

const STOP_WORDS = new Set([
  "the","a","an","and","or","but","if","of","to","in","on","at","by","for",
  "with","from","as","is","are","was","were","be","been","being","have","has","had",
  "do","does","did","not","no","yes","this","that","these","those","i","you","he","she","it","we","they",
]);
