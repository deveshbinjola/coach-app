import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import {
  APIFY_DEFAULT_ACTOR,
  normalizeInstagramHandle,
  normalizeLimit,
  normalizeApifyItems,
  processInstagramCaptions,
  type InstagramCaption,
} from "@/lib/voice/instagram-import";

export const runtime = 'edge';

const IMPORT_SOURCE_TYPES = ["instagram", "linkedin", "newsletter"] as const;
const APIFY_TIMEOUT_MS = 55_000;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimitByUser(user.id, "voice/import/instagram", 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const handle = normalizeInstagramHandle(body?.handle);
  const limit = normalizeLimit(body?.limit);

  if (!handle) {
    return NextResponse.json({ error: "Instagram handle required." }, { status: 400 });
  }

  const paid = await hasPaidImportAccess(user.id);
  const importUsage = await getMonthlyInstagramUsage(user.id);
  if (!paid && importUsage.used >= importUsage.limit) {
    return NextResponse.json(
      {
        error: "Monthly free Instagram import used.",
        upgrade_required: true,
        upgrade_url: "/settings?upgrade=voice-imports",
        usage: importUsage,
      },
      { status: 402 }
    );
  }

  const imported = await importInstagramCaptions(handle, limit);
  if (!imported.ok) {
    return NextResponse.json({ error: imported.error }, { status: imported.status });
  }

  const captions = imported.captions;
  if (captions.length === 0) {
    return NextResponse.json(
      { error: "No usable captions found. Try a public profile or lower the import size." },
      { status: 422 }
    );
  }

  try {
    const result = await processInstagramCaptions(supabase, user.id, handle, captions);
    return NextResponse.json({
      profile: result.profile,
      source: result.source,
      captions_used: result.captionsUsed,
      handle,
      extracted_rules: result.extractedRules,
      learned_patterns: result.learnedPatterns,
      usage: { ...importUsage, used: importUsage.used + 1 },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save Instagram import." },
      { status: 500 }
    );
  }
}

async function getMonthlyInstagramUsage(coachId: string): Promise<{
  used: number;
  limit: number;
  resets_at: string;
}> {
  const supabase = createClient();
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const { count, error } = await supabase
    .from("cp_voice_training_sources")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", coachId)
    .in("source_type", IMPORT_SOURCE_TYPES)
    .gte("created_at", monthStart.toISOString());

  if (error) return { used: 0, limit: 1, resets_at: nextMonth.toISOString() };
  return { used: count ?? 0, limit: 1, resets_at: nextMonth.toISOString() };
}

async function hasPaidImportAccess(coachId: string): Promise<boolean> {
  const supabase = createClient();
  const { data: coach } = await supabase
    .from("cp_coaches")
    .select("plan")
    .eq("id", coachId)
    .maybeSingle();
  if (coach?.plan === "standard") return true;

  const { data, error } = await supabase
    .from("cp_subscriptions")
    .select("status")
    .eq("coach_id", coachId)
    .in("status", ["active", "trialing"])
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return !!data;
}

async function importInstagramCaptions(
  handle: string,
  limit: number
): Promise<
  | { ok: true; captions: InstagramCaption[] }
  | { ok: false; error: string; status: number }
> {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 501,
      error: "APIFY_TOKEN is not configured. Add it to your environment first.",
    };
  }

  const actor = (process.env.APIFY_INSTAGRAM_ACTOR ?? APIFY_DEFAULT_ACTOR).replace("/", "~");
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&clean=true`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(APIFY_TIMEOUT_MS),
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: "posts",
        resultsLimit: limit,
      }),
    });
  } catch (err) {
    return {
      ok: false,
      status: 504,
      error: String(err).includes("TimeoutError")
        ? "Instagram import took too long. Try fewer posts or import again later."
        : "Instagram import could not reach Apify. Try again later.",
    };
  }

  if (!response.ok) {
    const message = await response.text();
    return {
      ok: false,
      status: response.status,
      error: friendlyApifyError(message, response.status),
    };
  }

  const items = (await response.json()) as unknown;
  const captions = normalizeApifyItems(items).slice(0, limit);
  return { ok: true, captions };
}

function friendlyApifyError(message: string, status: number): string {
  const lower = message.toLowerCase();
  if (status === 401 || lower.includes("token")) {
    return "Instagram import is not configured correctly. Check the Apify token.";
  }
  if (lower.includes("private") || lower.includes("login") || lower.includes("not found")) {
    return "Could not read that profile. Try a public Instagram profile.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "Instagram import took too long. Try fewer posts or import again later.";
  }
  return "Instagram import failed. Try fewer posts or a public profile.";
}
