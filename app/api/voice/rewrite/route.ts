import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import {
  buildVoiceRewriteGuidance,
  makeDraftMoreLikeVoice,
  scoreVoiceFit,
} from "@/lib/voice-trust";
import type { VoiceProfile } from "@/lib/types";
import { loadBrandVoiceOverlay, renderOverlayPromptBlock } from "@/lib/brand-os/voice-overlay";

export const runtime = 'edge';

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { draft?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  if (!draft) {
    return NextResponse.json({ error: "draft required" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("cp_voice_profiles")
    .select("*")
    .eq("coach_id", user.id)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const voiceProfile = (profile as VoiceProfile | null) ?? null;
  const fit = scoreVoiceFit(draft, voiceProfile);
  const fallback = makeDraftMoreLikeVoice(draft, voiceProfile);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      draft: fallback,
      source: "deterministic",
      fit_before: fit,
      fit_after: scoreVoiceFit(fallback, voiceProfile),
      guidance: buildVoiceRewriteGuidance(fit, voiceProfile),
    });
  }

  const guidance = buildVoiceRewriteGuidance(fit, voiceProfile);
  const brandOverlay = await loadBrandVoiceOverlay(supabase, user.id);
  const overlayBlock = renderOverlayPromptBlock(brandOverlay);
  const baseSystem = [
    "Rewrite this coach outbound message so it sounds more like the active voice profile.",
    "Preserve the meaning and the next step.",
    "Do not add claims, promises, pricing, or new facts.",
    "Output only the rewritten message body.",
    "No em dash characters.",
  ].join(" ");
  const system = overlayBlock ? `${overlayBlock}\n\n${baseSystem}` : baseSystem;

  const userPrompt = [
    "VOICE PROFILE:",
    JSON.stringify(voiceProfile?.voice_json ?? {}, null, 2),
    "",
    "SAMPLES:",
    (voiceProfile?.sample_messages ?? []).slice(0, 5).join("\n\n") || "(none)",
    "",
    "GUIDANCE:",
    guidance.map((item) => `- ${item}`).join("\n"),
    "",
    "DRAFT:",
    draft,
  ].join("\n");

  try {
    const anthropicRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      return NextResponse.json({
        draft: fallback,
        source: "deterministic",
        fit_before: fit,
        fit_after: scoreVoiceFit(fallback, voiceProfile),
        guidance,
      });
    }

    const result = await anthropicRes.json();
    const rewritten = String(result?.content?.[0]?.text ?? "").trim();
    const safeDraft = rewritten || fallback;

    return NextResponse.json({
      draft: safeDraft,
      source: rewritten ? "model" : "deterministic",
      fit_before: fit,
      fit_after: scoreVoiceFit(safeDraft, voiceProfile),
      guidance,
    });
  } catch {
    return NextResponse.json({
      draft: fallback,
      source: "deterministic",
      fit_before: fit,
      fit_after: scoreVoiceFit(fallback, voiceProfile),
      guidance,
    });
  }
}
