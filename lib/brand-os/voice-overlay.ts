// Brand Voice Overlay — the bridge between Brand OS synthesis and the
// content engine.
//
// Shape stored at cp_coaches.brand_voice_overlay (jsonb). Distilled from
// the latest cp_brand_os_runs.synthesis_json. Read by every content-gen
// endpoint and prepended to the system prompt *above* the generic 6-slug
// voice register so drafts sound like the actual coach, not a stereotype.
//
// Refresh path: synthesize endpoint writes here after each successful run.
// Coaches can re-tune by hitting "Regenerate" in the Brand OS output, which
// upserts a new overlay.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrandOsSynthesis } from "@/app/api/brand-os/synthesize/route";

export type BrandVoiceOverlay = {
  positioning_line: string;
  signature_line: string;
  tone: string;
  rhythm: string;
  signature_moves: string[];
  vocab_yes: string[];
  vocab_no: string[];
  buyer_mirror_name: string;
  buyer_mirror_portrait: string;
  pillars: Array<{ name: string; enemy: string }>;
  source_run_id: string;
};

/** Distill the full synthesis into the lean overlay shape. Trims long
 *  fields so we don't bloat every prompt with the whole deliverable. */
export function buildOverlayFromSynthesis(s: BrandOsSynthesis, runId: string): BrandVoiceOverlay {
  return {
    positioning_line: trim(s.positioning_line, 280),
    signature_line:   trim(s.signature_line, 280),
    tone:             trim(s.voice_dna?.tone ?? "", 200),
    rhythm:           trim(s.voice_dna?.rhythm ?? "", 200),
    signature_moves:  (s.voice_dna?.signature_moves ?? []).slice(0, 5).map((m) => trim(m, 200)),
    vocab_yes:        (s.voice_dna?.vocab_yes ?? []).slice(0, 20),
    vocab_no:         (s.voice_dna?.vocab_no  ?? []).slice(0, 15),
    buyer_mirror_name:     trim(s.buyer_mirror?.name ?? "", 60),
    buyer_mirror_portrait: trim(s.buyer_mirror?.one_line_portrait ?? "", 280),
    pillars: (s.pillars ?? []).slice(0, 3).map((p) => ({
      name:  trim(p.name ?? "", 80),
      enemy: trim(p.enemy ?? "", 200),
    })),
    source_run_id: runId,
  };
}

/** Load the overlay for a coach. Returns null if Brand OS hasn't been run.
 *  Caller is responsible for falling back to the generic voice profile. */
export async function loadBrandVoiceOverlay(
  supabase: SupabaseClient,
  coachId: string
): Promise<BrandVoiceOverlay | null> {
  const { data } = await supabase
    .from("cp_coaches")
    .select("brand_voice_overlay")
    .eq("user_id", coachId)
    .maybeSingle();
  return (data?.brand_voice_overlay as BrandVoiceOverlay | null) ?? null;
}

/** Persist a new overlay. Called from the synthesize endpoint AND the
 *  retune-from-voice endpoint. Also captures a baseline of the coach's
 *  voice training corpus so we can detect when new imports warrant a
 *  re-tune (used by the /content "voice has new material — re-tune?"
 *  banner). */
export async function saveBrandVoiceOverlay(
  supabase: SupabaseClient,
  coachId: string,
  overlay: BrandVoiceOverlay
): Promise<void> {
  const corpus = await snapshotVoiceCorpus(supabase, coachId);
  await supabase
    .from("cp_coaches")
    .update({
      brand_voice_overlay: overlay,
      brand_voice_overlay_run_id: overlay.source_run_id,
      brand_voice_overlay_updated_at: new Date().toISOString(),
      brand_voice_corpus_baseline: corpus,
    })
    .eq("user_id", coachId);
}

export type VoiceCorpusSnapshot = {
  sources_count:     number;
  total_chars:       number;
  latest_source_at:  string | null;
  captured_at:       string;
};

/** Read voice training sources and produce a compact baseline. */
export async function snapshotVoiceCorpus(
  supabase: SupabaseClient,
  coachId: string
): Promise<VoiceCorpusSnapshot> {
  const { data } = await supabase
    .from("cp_voice_training_sources")
    .select("transcript, created_at")
    .eq("coach_id", coachId);
  const rows = (data ?? []) as Array<{ transcript: string | null; created_at: string | null }>;
  const total_chars = rows.reduce((n, r) => n + ((r.transcript ?? "").length), 0);
  const latest_source_at = rows
    .map((r) => r.created_at)
    .filter((s): s is string => Boolean(s))
    .sort()
    .pop() ?? null;
  return {
    sources_count: rows.length,
    total_chars,
    latest_source_at,
    captured_at: new Date().toISOString(),
  };
}

/** Compare current corpus to baseline. Returns null if baseline missing or
 *  delta isn't meaningful (so callers can render the banner conditionally). */
export type CorpusDelta = {
  new_sources: number;
  new_chars:   number;
  baseline:    VoiceCorpusSnapshot;
  current:     VoiceCorpusSnapshot;
};
export async function detectCorpusDelta(
  supabase: SupabaseClient,
  coachId: string,
  baseline: VoiceCorpusSnapshot | null
): Promise<CorpusDelta | null> {
  if (!baseline) return null;
  const current = await snapshotVoiceCorpus(supabase, coachId);
  const new_sources = Math.max(0, current.sources_count - baseline.sources_count);
  const new_chars   = Math.max(0, current.total_chars  - baseline.total_chars);
  // Meaningful threshold: 3+ new sources OR 5000+ new chars.
  if (new_sources < 3 && new_chars < 5000) return null;
  return { new_sources, new_chars, baseline, current };
}

/** Render the overlay as a system-prompt block. Prepended ABOVE the
 *  generic voice register so it takes precedence. If the overlay is
 *  null, returns "" so callers can splice it in unconditionally.
 *
 *  Format is deliberately compact: bullet style hits LLM attention
 *  harder than prose and uses ~1/3 the tokens of a paragraph version. */
export function renderOverlayPromptBlock(overlay: BrandVoiceOverlay | null): string {
  if (!overlay) return "";

  const lines: string[] = [];
  lines.push("=== COACH BRAND VOICE (from their Brand OS — TREAT AS SOURCE OF TRUTH) ===");
  if (overlay.positioning_line) lines.push(`POSITIONING: ${overlay.positioning_line}`);
  if (overlay.signature_line)   lines.push(`SIGNATURE LINE (their own words): "${overlay.signature_line}"`);

  if (overlay.tone || overlay.rhythm) {
    lines.push("");
    lines.push("VOICE:");
    if (overlay.tone)   lines.push(`  - Tone: ${overlay.tone}`);
    if (overlay.rhythm) lines.push(`  - Rhythm: ${overlay.rhythm}`);
  }

  if (overlay.signature_moves?.length) {
    lines.push("");
    lines.push("SIGNATURE MOVES (things this coach does — preserve, do not flatten into generic AI prose):");
    for (const m of overlay.signature_moves) lines.push(`  - ${m}`);
  }

  if (overlay.vocab_yes?.length) {
    lines.push("");
    lines.push(`USE THESE WORDS/PHRASES (their natural vocabulary): ${overlay.vocab_yes.join(" · ")}`);
  }
  if (overlay.vocab_no?.length) {
    lines.push(`NEVER USE THESE WORDS/PHRASES (their anti-vocabulary — banned): ${overlay.vocab_no.join(" · ")}`);
  }

  if (overlay.buyer_mirror_name || overlay.buyer_mirror_portrait) {
    lines.push("");
    lines.push("WRITE AS IF TO ONE PERSON:");
    if (overlay.buyer_mirror_name)     lines.push(`  - Name: ${overlay.buyer_mirror_name}`);
    if (overlay.buyer_mirror_portrait) lines.push(`  - Portrait: ${overlay.buyer_mirror_portrait}`);
    lines.push(`  - All content addresses ${overlay.buyer_mirror_name || "this one person"}, not a "you" plural audience.`);
  }

  if (overlay.pillars?.length) {
    lines.push("");
    lines.push("CONTENT PILLARS (every piece should fit inside one of these):");
    overlay.pillars.forEach((p, i) => {
      lines.push(`  ${i + 1}. ${p.name}${p.enemy ? ` — pushes against: ${p.enemy}` : ""}`);
    });
  }

  lines.push("");
  lines.push("=== END COACH BRAND VOICE ===");
  return lines.join("\n");
}

function trim(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
