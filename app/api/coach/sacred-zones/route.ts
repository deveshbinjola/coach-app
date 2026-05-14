// /api/coach/sacred-zones — read + write the coach's sacred zones.
//
// Sacred zones are content kinds the AI will not generate net-new (it will
// still repurpose an existing piece into them). Stored at
// cp_coaches.sacred_zones. See lib/brand-os/sacred-zones.ts.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { parseSacredZones } from "@/lib/brand-os/sacred-zones";

export const runtime = "edge";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("cp_coaches")
    .select("sacred_zones")
    .eq("id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sacred_zones: parseSacredZones(data?.sacred_zones) });
}

export async function PUT(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { sacred_zones?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const zones = parseSacredZones(body.sacred_zones);
  const { error } = await supabase
    .from("cp_coaches")
    .update({ sacred_zones: zones })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sacred_zones: zones });
}
