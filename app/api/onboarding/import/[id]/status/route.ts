import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { mapApifyStatus } from "@/lib/voice/apify-status";
import { normalizeApifyItems, processInstagramCaptions } from "@/lib/voice/instagram-import";

export const runtime = "edge";

// GET /api/onboarding/import/[id]/status
//
// Polls the Apify run for an import job. On SUCCEEDED, fetches the dataset and
// runs the shared extraction (voice profile + training source), then marks the
// job complete. Idempotent: terminal jobs return their stored result.
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // RLS: coach can read own import rows.
  const { data: job } = await supabase
    .from("cp_imports")
    .select("id, coach_id, status, source, source_ref, external_run_id, external_dataset_id, items_imported, error")
    .eq("id", params.id)
    .maybeSingle();
  if (!job || job.coach_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Already terminal — return as-is.
  if (job.status === "complete" || job.status === "failed") {
    return NextResponse.json({ status: job.status, itemsImported: job.items_imported, error: job.error });
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ status: "processing" });

  // Poll the Apify run.
  let apifyStatus: string | null = null;
  let datasetId: string | null = (job.external_dataset_id as string | null) ?? null;
  try {
    const resp = await fetch(
      `https://api.apify.com/v2/actor-runs/${encodeURIComponent(job.external_run_id as string)}?token=${encodeURIComponent(token)}`,
    );
    if (resp.ok) {
      const json = (await resp.json()) as { data?: { status?: string; defaultDatasetId?: string } };
      apifyStatus = json.data?.status ?? null;
      datasetId = datasetId ?? (json.data?.defaultDatasetId ?? null);
    }
  } catch {
    return NextResponse.json({ status: "processing" });
  }

  const mapped = mapApifyStatus(apifyStatus);
  const admin = createAdminClient();

  if (mapped === "processing") {
    return NextResponse.json({ status: "processing" });
  }

  if (mapped === "failed") {
    await admin.from("cp_imports").update({
      status: "failed", error: `apify:${apifyStatus}`, completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return NextResponse.json({ status: "failed", error: `apify:${apifyStatus}` });
  }

  // SUCCEEDED → fetch dataset, process, persist.
  try {
    const itemsResp = await fetch(
      `https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId ?? "")}/items?token=${encodeURIComponent(token)}&clean=true`,
    );
    const items = itemsResp.ok ? await itemsResp.json() : [];
    const captions = normalizeApifyItems(items);
    if (captions.length === 0) {
      await admin.from("cp_imports").update({
        status: "failed", error: "no_usable_captions", completed_at: new Date().toISOString(),
      }).eq("id", job.id);
      return NextResponse.json({ status: "failed", error: "no_usable_captions" });
    }
    const result = await processInstagramCaptions(admin, job.coach_id as string, job.source_ref as string, captions);
    await admin.from("cp_imports").update({
      status: "complete",
      items_found: captions.length,
      items_imported: result.captionsUsed,
      completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return NextResponse.json({
      status: "complete",
      itemsImported: result.captionsUsed,
      learnedPatterns: result.learnedPatterns,
    });
  } catch {
    await admin.from("cp_imports").update({
      status: "failed", error: "processing_failed", completed_at: new Date().toISOString(),
    }).eq("id", job.id);
    return NextResponse.json({ status: "failed", error: "processing_failed" });
  }
}
