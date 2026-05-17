import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

type SaveBody = {
  acronym?: unknown;
  name?: unknown;
  tagline?: unknown;
  pillars?: unknown;
  sourceInput?: unknown;
  leadMagnetType?: unknown;
  isPrimary?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SaveBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const acronym = typeof body.acronym === "string" ? body.acronym.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const tagline = typeof body.tagline === "string" ? body.tagline.trim() : null;
  const pillars = Array.isArray(body.pillars) ? body.pillars : [];
  const sourceInput = typeof body.sourceInput === "string" ? body.sourceInput.trim() : null;
  const leadMagnetType = typeof body.leadMagnetType === "string" ? body.leadMagnetType.trim() : null;
  const isPrimary = body.isPrimary === true;

  if (!acronym || !name || pillars.length < 3) {
    return NextResponse.json(
      { error: "Acronym, name, and at least 3 pillars are required." },
      { status: 400 }
    );
  }

  if (isPrimary) {
    await supabase
      .from("cp_frameworks")
      .update({ is_primary: false })
      .eq("coach_id", user.id)
      .eq("is_primary", true);
  }

  const { data, error } = await supabase
    .from("cp_frameworks")
    .insert({
      coach_id: user.id,
      acronym,
      name,
      tagline,
      pillars,
      source_input: sourceInput,
      lead_magnet_type: leadMagnetType,
      is_primary: isPrimary,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
