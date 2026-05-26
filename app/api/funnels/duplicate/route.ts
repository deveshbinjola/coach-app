// POST /api/funnels/duplicate — clone an existing funnel.
//
// Creates a copy with:
//   - New ID (auto from DB)
//   - Title: "Copy of <original title>"
//   - New unique slug
//   - published = false (always starts as draft)
//   - All counters reset to 0
//   - Same config (questions, results, branding)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { generateFunnelSlug } from "@/lib/funnel-slug";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Missing funnel id to duplicate." }, { status: 400 });
  }

  // Fetch the source funnel (must belong to this coach)
  const { data: source, error: fetchErr } = await supabase
    .from("cp_funnels")
    .select("title, type, config")
    .eq("id", body.id)
    .eq("coach_id", user.id)
    .single();

  if (fetchErr || !source) {
    return NextResponse.json({ error: "Funnel not found." }, { status: 404 });
  }

  const newTitle = `Copy of ${source.title}`;
  const newSlug = generateFunnelSlug(newTitle);

  const { data: created, error: insertErr } = await supabase
    .from("cp_funnels")
    .insert({
      coach_id: user.id,
      title: newTitle,
      slug: newSlug,
      type: source.type || "resonance",
      config: source.config,
      published: false,
      view_count: 0,
      start_count: 0,
      complete_count: 0,
      email_count: 0,
    })
    .select("id, slug, type, title, published, view_count, start_count, complete_count, email_count, created_at, updated_at")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: "Failed to duplicate funnel." }, { status: 500 });
  }

  return NextResponse.json({ funnel: created });
}
