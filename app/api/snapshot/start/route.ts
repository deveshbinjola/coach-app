// POST /api/snapshot/start · public · anonymous Snapshot run create
//
// Public API. No Supabase auth. Email gate captured from the marketing site.
// Creates a cp_brand_os_runs row with coach_id = NULL and email_for_claim set.
// Returns { runId } for the client to navigate to /snapshot/[runId].

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";

type Body = {
  email?: string;
  first_name?: string;
  audience?: "M" | "W" | "X";
};

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as Body;

  const email = (body.email ?? "").trim().toLowerCase();
  const firstName = (body.first_name ?? "").trim();
  const audience: "M" | "W" | "X" =
    body.audience === "M" ? "M"
    : body.audience === "W" ? "W"
    : "X";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const admin = createAdminClient();

  // If this email already has an UNCLAIMED in-progress run, resume it
  // instead of creating a new one. Keeps the funnel idempotent.
  const { data: existing } = await admin
    .from("cp_brand_os_runs")
    .select("id, state")
    .eq("email_for_claim", email)
    .is("claimed_at", null)
    .is("coach_id", null)
    .eq("variant_v", "v5")
    .eq("tier", "snapshot")
    .eq("state", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ ok: true, runId: existing.id, resumed: true });
  }

  const { data: created, error } = await admin
    .from("cp_brand_os_runs")
    .insert({
      coach_id: null,
      email_for_claim: email,
      first_name_for_claim: firstName || null,
      variant: "designed",
      variant_v: "v5",
      tier: "snapshot",
      audience,
      current_module: "snapshot",
      current_question_id: "snapshot.audience",
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json(
      { ok: false, error: error?.message ?? "create_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, runId: created.id, resumed: false });
}
