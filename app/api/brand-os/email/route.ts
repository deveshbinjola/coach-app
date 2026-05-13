// POST /api/brand-os/email — capture email + send the output (stub).
//
// V1: write the email to the run row (collected as a lead artifact, useful
// even if the actual send isn't wired yet). Wire Resend / Postmark in the
// next build. Accepts JSON: { runId, email }.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { runId?: string; email?: string };
  try {
    body = (await request.json()) as { runId?: string; email?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const runId = (body.runId ?? "").trim();
  const email = (body.email ?? "").trim();
  if (!runId || !email) {
    return NextResponse.json({ error: "runId and email required" }, { status: 400 });
  }

  const { error: upErr } = await supabase
    .from("cp_brand_os_runs")
    .update({ delivery_email: email })
    .eq("id", runId)
    .eq("coach_id", user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // TODO(next build): call Resend with the rendered output HTML.
  return NextResponse.json({ ok: true, captured: email });
}
