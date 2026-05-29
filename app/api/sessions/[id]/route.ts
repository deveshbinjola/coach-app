// GET   /api/sessions/[id]  — single session detail
// PATCH /api/sessions/[id]  — update session fields

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import type { CoachingSession } from "@/lib/session-intelligence";

export const runtime = "edge";

// ── GET ───────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("cp_coaching_sessions")
    .select("*")
    .eq("id", params.id)
    .eq("coach_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session: data as CoachingSession });
}

// ── PATCH ─────────────────────────────────────────────────────────────

type PatchBody = {
  raw_notes?: unknown;
  ai_summary?: unknown;
  key_topics?: unknown;
  commitments?: unknown;
  somatic_observations?: unknown;
  patterns_flagged?: unknown;
  duration_minutes?: unknown;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PatchBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Build update payload — only include fields that were provided
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.raw_notes === "string") update.raw_notes = body.raw_notes.trim();
  if (typeof body.ai_summary === "string") update.ai_summary = body.ai_summary.trim();
  if (Array.isArray(body.key_topics)) update.key_topics = body.key_topics.filter((t): t is string => typeof t === "string");
  if (Array.isArray(body.commitments)) update.commitments = body.commitments.filter((t): t is string => typeof t === "string");
  if (Array.isArray(body.somatic_observations)) update.somatic_observations = body.somatic_observations.filter((t): t is string => typeof t === "string");
  if (Array.isArray(body.patterns_flagged)) update.patterns_flagged = body.patterns_flagged.filter((t): t is string => typeof t === "string");
  if (typeof body.duration_minutes === "number" && body.duration_minutes > 0) update.duration_minutes = body.duration_minutes;

  const { data, error } = await supabase
    .from("cp_coaching_sessions")
    .update(update)
    .eq("id", params.id)
    .eq("coach_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ session: data as CoachingSession });
}
