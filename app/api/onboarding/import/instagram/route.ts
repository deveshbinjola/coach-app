import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { normalizeInstagramHandle, normalizeLimit, APIFY_DEFAULT_ACTOR } from "@/lib/voice/instagram-import";

export const runtime = "edge";

// POST /api/onboarding/import/instagram
//
// Async counterpart to /api/voice/import/instagram. Starts the Apify run and
// returns immediately with an importId. The client then polls
// /api/onboarding/import/[id]/status until it reports complete/failed.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "onboarding/import/instagram", 5, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await request.json().catch(() => null);
  const handle = normalizeInstagramHandle(body?.handle);
  const limit = normalizeLimit(body?.limit);
  if (!handle) return NextResponse.json({ error: "Instagram handle required." }, { status: 400 });

  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN is not configured." }, { status: 501 });

  const actor = (process.env.APIFY_INSTAGRAM_ACTOR ?? APIFY_DEFAULT_ACTOR).replace("/", "~");
  const startUrl = `https://api.apify.com/v2/acts/${actor}/runs?token=${encodeURIComponent(token)}`;

  let runId: string | null = null;
  let datasetId: string | null = null;
  try {
    const resp = await fetch(startUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${handle}/`],
        resultsType: "posts",
        resultsLimit: limit,
      }),
    });
    if (!resp.ok) {
      return NextResponse.json({ error: "Could not start Instagram import." }, { status: 502 });
    }
    const json = (await resp.json()) as { data?: { id?: string; defaultDatasetId?: string } };
    runId = json.data?.id ?? null;
    datasetId = json.data?.defaultDatasetId ?? null;
  } catch {
    return NextResponse.json({ error: "Could not reach Apify." }, { status: 504 });
  }
  if (!runId) return NextResponse.json({ error: "Apify did not return a run id." }, { status: 502 });

  // Track the job with the service-role client (RLS has no authed insert policy).
  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("cp_imports")
    .insert({
      coach_id: user.id,
      source: "instagram",
      status: "processing",
      source_ref: handle,
      external_run_id: runId,
      external_dataset_id: datasetId,
    })
    .select("id")
    .single();
  if (error || !row) {
    return NextResponse.json({ error: "Could not record import job." }, { status: 500 });
  }

  return NextResponse.json({ importId: row.id as string, status: "processing", handle });
}
