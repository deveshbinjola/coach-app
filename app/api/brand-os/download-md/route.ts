// GET /api/brand-os/download-md?runId=...
//
// Streams the Brand OS synthesis as a downloadable markdown file. Coaches
// paste this into ChatGPT / Claude / Gemini as durable brand context.

import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { renderSynthesisMarkdown } from "@/lib/brand-os/render-markdown";
import { userDisplayName } from "@/lib/user-display";
import type { BrandOsSynthesis } from "@/app/api/brand-os/synthesize/route";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(request.url);
  const runId = (searchParams.get("runId") ?? "").trim();
  if (!runId) return new Response("runId required", { status: 400 });

  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("synthesis_json, completed_at")
    .eq("id", runId)
    .eq("coach_id", user.id)
    .maybeSingle();

  if (!run?.synthesis_json) {
    return new Response("Synthesis not generated yet. Open the output page first.", { status: 404 });
  }

  const md = renderSynthesisMarkdown(run.synthesis_json as BrandOsSynthesis, {
    coachName: userDisplayName(user.user_metadata),
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
