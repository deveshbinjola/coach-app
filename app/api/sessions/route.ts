// GET  /api/sessions  — list coaching sessions for the logged-in coach
// POST /api/sessions  — create a new coaching session + trigger AI analysis
//
// Table: cp_coaching_sessions (mirrors CoachingSession type in lib/session-intelligence.ts)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { analyzeSession } from "@/lib/session-intelligence";
import type { CoachingSession } from "@/lib/session-intelligence";
import type { VoiceProfile } from "@/lib/types";

export const runtime = "edge";

// ── GET — list sessions ───────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);

  let query = supabase
    .from("cp_coaching_sessions")
    .select("*")
    .eq("coach_id", user.id)
    .order("session_date", { ascending: false })
    .limit(limit);

  if (clientId) {
    query = query.eq("client_id", clientId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sessions: data as CoachingSession[] });
}

// ── POST — create session ─────────────────────────────────────────────

type CreateBody = {
  client_id?: unknown;
  session_date?: unknown;
  duration_minutes?: unknown;
  raw_notes?: unknown;
  transcript?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CreateBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  const rawNotes = typeof body.raw_notes === "string" ? body.raw_notes.trim() : "";
  const transcript = typeof body.transcript === "string" ? body.transcript.trim() || null : null;
  const sessionDate = typeof body.session_date === "string" ? body.session_date : new Date().toISOString();
  const durationMinutes =
    typeof body.duration_minutes === "number" && body.duration_minutes > 0
      ? body.duration_minutes
      : null;

  if (!clientId) {
    return NextResponse.json({ error: "client_id is required" }, { status: 400 });
  }
  if (!rawNotes) {
    return NextResponse.json({ error: "raw_notes is required" }, { status: 400 });
  }

  // Verify the client belongs to this coach (via leads table)
  const { data: clientLead } = await supabase
    .from("cp_leads")
    .select("id, full_name")
    .eq("id", clientId)
    .eq("coach_id", user.id)
    .maybeSingle();

  if (!clientLead) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  // Fetch previous sessions for pattern detection + voice profile
  const [previousRes, profileRes] = await Promise.all([
    supabase
      .from("cp_coaching_sessions")
      .select("ai_summary, key_topics, commitments")
      .eq("coach_id", user.id)
      .eq("client_id", clientId)
      .order("session_date", { ascending: false })
      .limit(5),
    supabase
      .from("cp_voice_profiles")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const previousSessions = (previousRes.data ?? []) as Array<{
    ai_summary: string | null;
    key_topics: string[];
    commitments: string[];
  }>;
  const profile = (profileRes.data as VoiceProfile | null) ?? null;

  // Run AI analysis
  const analysis = await analyzeSession({
    rawNotes,
    transcript,
    clientName: clientLead.full_name || "the client",
    previousSessions,
    profile,
  });

  // Insert the session
  const { data: session, error: insertError } = await supabase
    .from("cp_coaching_sessions")
    .insert({
      coach_id: user.id,
      client_id: clientId,
      session_date: sessionDate,
      duration_minutes: durationMinutes,
      raw_notes: rawNotes,
      transcript,
      ai_summary: analysis.ai_summary,
      key_topics: analysis.key_topics,
      commitments: analysis.commitments,
      somatic_observations: analysis.somatic_observations,
      patterns_flagged: analysis.patterns_flagged,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ session, analysis }, { status: 201 });
}
