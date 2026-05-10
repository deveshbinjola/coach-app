// GET /api/v1/voice, fetch the coach's active voice profile.
// POST /api/v1/voice, import a Brand OS or Voice Mining artifact as the
// active profile. The drafter reads the active row on every generation.

import { NextRequest } from "next/server";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = 'edge';

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return voiceError("Unauthorized", 401);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_voice_profiles")
    .select("id, version, voice_json, sample_messages, active, created_at")
    .eq("coach_id", auth.coachId)
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return voiceError(error.message, 500);
  if (!data) {
    return voiceOk(
      {
        voice: null,
        message:
          "No active voice profile. Coach should run Brand OS or Voice Mining first.",
      },
      200
    );
  }

  return voiceOk({ voice: data });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return voiceError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) {
    return voiceError("write scope required", 403);
  }

  // Voice import accepts a flexible shape (Brand OS payload, raw voice
  // dictionary, partial updates) so we keep the deeper semantic checks
  // in normalizeVoiceJson() / normalizeSampleMessages() rather than
  // pinning a Zod schema. This still upgrades from `let body: any` to
  // a typed `Record<string, unknown>` after the JSON parse.
  let body: Record<string, unknown>;
  try {
    const raw = await request.json();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return voiceError("Body must be a JSON object", 400);
    }
    body = raw as Record<string, unknown>;
  } catch {
    return voiceError("Invalid JSON body", 400);
  }

  const voiceJson = normalizeVoiceJson(body);
  if (!voiceJson.ok) return voiceError(voiceJson.error, 400);

  const sampleMessages = normalizeSampleMessages(body.sample_messages);
  if (!sampleMessages.ok) return voiceError(sampleMessages.error, 400);

  const admin = createAdminClient();

  const { data: latest, error: latestErr } = await admin
    .from("cp_voice_profiles")
    .select("version")
    .eq("coach_id", auth.coachId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestErr) return voiceError(latestErr.message, 500);

  const nextVersion = (latest?.version ?? 0) + 1;

  const { error: deactivateErr } = await admin
    .from("cp_voice_profiles")
    .update({ active: false })
    .eq("coach_id", auth.coachId)
    .eq("active", true);
  if (deactivateErr) return voiceError(deactivateErr.message, 500);

  const { data, error } = await admin
    .from("cp_voice_profiles")
    .insert({
      coach_id: auth.coachId,
      voice_json: voiceJson.value,
      sample_messages: sampleMessages.value,
      version: nextVersion,
      active: true,
    })
    .select("id, version, voice_json, sample_messages, active, created_at")
    .single();

  if (error || !data) return voiceError(error?.message ?? "Insert failed", 500);

  return voiceOk(
    {
      voice: data,
      message:
        "Voice profile imported. Future drafts will use this active voice.",
    },
    201
  );
}

function voiceError(message: string, status = 400): Response {
  const response = apiError(message, status);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function voiceOk(body: unknown, status = 200): Response {
  const response = apiOk(body, status);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

function normalizeVoiceJson(
  body: Record<string, unknown>
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const candidateRaw = body.voice_json ?? body.voice ?? body.brand_os_voice;
  if (!candidateRaw || typeof candidateRaw !== "object" || Array.isArray(candidateRaw)) {
    return {
      ok: false,
      error:
        "voice_json is required. Send the Brand OS Step 2 voice artifact as an object.",
    };
  }
  const candidate = candidateRaw as Record<string, unknown>;

  const hasUsefulSignal =
    Array.isArray(candidate.tone) ||
    typeof candidate.sentence_rhythm === "string" ||
    typeof candidate.emotional_register === "string" ||
    Array.isArray(candidate.openers) ||
    Array.isArray(candidate.ctas);

  if (!hasUsefulSignal) {
    return {
      ok: false,
      error:
        "voice_json must include at least one useful voice field: tone, sentence_rhythm, emotional_register, openers, or ctas.",
    };
  }

  return { ok: true, value: candidate };
}

function normalizeSampleMessages(
  input: unknown
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, error: "sample_messages must be an array of strings." };
  }

  const value = input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .slice(0, 10);

  return { ok: true, value };
}
