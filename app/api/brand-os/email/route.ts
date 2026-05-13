// POST /api/brand-os/email — capture email + send the output (stub).
//
// V1: write the email to the run row (collected as a lead artifact, useful
// even if the actual send isn't wired yet). Wire Resend / Postmark in the
// next build. Returns to the output page with a flash.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const form = await request.formData();
  const runId = String(form.get("runId") ?? "");
  const email = String(form.get("email") ?? "").trim();
  if (!runId || !email) {
    return NextResponse.redirect(new URL("/brand-os", request.url));
  }

  await supabase
    .from("cp_brand_os_runs")
    .update({ delivery_email: email })
    .eq("id", runId)
    .eq("coach_id", user.id);

  // TODO(next build): call Resend with the rendered output HTML.
  return NextResponse.redirect(
    new URL(`/brand-os/run/${runId}/output?emailed=${encodeURIComponent(email)}`, request.url),
    { status: 303 }
  );
}
