// GET  /api/funnels       — list coach's funnels
// POST /api/funnels       — (unused; generation goes through /api/funnels/generate)
// PATCH /api/funnels      — update funnel (slug, title, config, published)
// DELETE /api/funnels     — delete a funnel
//
// All endpoints require authenticated coach session.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { validateSlug } from "@/lib/funnel-slug";

export const runtime = "edge";

// ── GET: list funnels ────────────────────────────────────

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("cp_funnels")
    .select("id, slug, type, title, published, view_count, start_count, complete_count, email_count, created_at, updated_at")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load funnels." }, { status: 500 });
  }

  return NextResponse.json({ funnels: data });
}

// ── PATCH: update funnel ─────────────────────────────────

type PatchBody = {
  id: string;
  slug?: string;
  title?: string;
  config?: unknown;
  published?: boolean;
};

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.id) {
    return NextResponse.json({ error: "Missing funnel id." }, { status: 400 });
  }

  // Build update payload (only include fields that were sent)
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.slug !== undefined) {
    const check = validateSlug(body.slug);
    if (!check.valid) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
    updates.slug = body.slug;
  }

  if (body.title !== undefined) {
    if (!body.title || body.title.length > 200) {
      return NextResponse.json({ error: "Title must be 1-200 characters." }, { status: 400 });
    }
    updates.title = body.title;
  }

  if (body.config !== undefined) {
    updates.config = body.config;
  }

  if (body.published !== undefined) {
    updates.published = !!body.published;
  }

  const { data, error } = await supabase
    .from("cp_funnels")
    .update(updates)
    .eq("id", body.id)
    .eq("coach_id", user.id)
    .select("id, slug, title, config, published, view_count, start_count, complete_count, email_count, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "That slug is already taken. Try another." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to update funnel." }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Funnel not found." }, { status: 404 });
  }

  return NextResponse.json({ funnel: data });
}

// ── DELETE: remove funnel ────────────────────────────────

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing funnel id." }, { status: 400 });
  }

  const { error } = await supabase
    .from("cp_funnels")
    .delete()
    .eq("id", id)
    .eq("coach_id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete funnel." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
