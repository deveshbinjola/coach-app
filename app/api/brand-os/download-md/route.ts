// GET /api/brand-os/download-md?runId=...&trialToken=...
//
// Streams the Brand OS synthesis as a downloadable markdown file.
// Auth: Supabase session cookie OR trialToken query param (trial buyers).

import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { renderSynthesisMarkdown } from "@/lib/brand-os/render-markdown";
import { userDisplayName } from "@/lib/user-display";
import { verifyTrialToken } from "@/lib/brand-os/trial-token";
import type { BrandOsSynthesis } from "@/app/api/brand-os/synthesize/route";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const runId = (searchParams.get("runId") ?? "").trim();
  const trialToken = (searchParams.get("trialToken") ?? "").trim();
  if (!runId) return new Response("runId required", { status: 400 });

  // Dual auth: trial token (query param) OR Supabase session cookie.
  let coachId: string | null = null;
  let coachDisplayName: string | undefined;
  let dbClient;
  if (trialToken) {
    const verify = await verifyTrialToken(trialToken);
    if (!verify.ok) return new Response("Unauthorized", { status: 401 });
    coachId = verify.payload.coachId;
    dbClient = createAdminClient();
    // Pull email for the markdown header.
    const { data: coachRow } = await dbClient
      .from("cp_coaches").select("email").eq("id", coachId).maybeSingle();
    coachDisplayName = (coachRow?.email as string | null) ?? undefined;
  } else {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response("Unauthorized", { status: 401 });
    coachId = user.id;
    coachDisplayName = userDisplayName(user.user_metadata);
    dbClient = supabase;
  }

  const { data: run } = await dbClient
    .from("cp_brand_os_runs")
    .select("synthesis_json, completed_at")
    .eq("id", runId)
    .eq("coach_id", coachId)
    .maybeSingle();

  if (!run?.synthesis_json) {
    return new Response("Synthesis not generated yet. Open the output page first.", { status: 404 });
  }

  const md = renderSynthesisMarkdown(run.synthesis_json as BrandOsSynthesis, {
    coachName: coachDisplayName,
    completedAt: run.completed_at ? new Date(run.completed_at as string).toLocaleString() : undefined,
  });

  return new Response(md, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="brand-os-${runId.slice(0, 8)}.md"`,
      "Cache-Control": "no-store",
    },
  });
}
