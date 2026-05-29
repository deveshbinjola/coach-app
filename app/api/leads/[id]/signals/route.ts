// app/api/leads/[id]/signals/route.ts
//
// GET /api/leads/[id]/signals — returns PersonSignals for a lead.
// Auth-gated: only the coach who owns this lead can access.
// Called client-side by PersonPanel on demand.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getPersonSignals } from "@/lib/ambient";

export const runtime = "edge";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the lead belongs to this coach
  const { data: lead } = await supabase
    .from("cp_leads")
    .select("id")
    .eq("id", params.id)
    .eq("coach_id", user.id)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const signals = await getPersonSignals(params.id);
    return NextResponse.json(signals, {
      headers: {
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
