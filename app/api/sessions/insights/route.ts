// GET /api/sessions/insights — coaching insights for the logged-in coach
//
// Returns cross-session pattern analysis. Generates insights on the fly
// from recent sessions rather than storing them separately.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { generatePreSessionBrief } from "@/lib/session-intelligence";
import type { CoachingSession } from "@/lib/session-intelligence";

export const runtime = "edge";

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

  // Fetch recent sessions
  let query = supabase
    .from("cp_coaching_sessions")
    .select("*")
    .eq("coach_id", user.id)
    .order("session_date", { ascending: false })
    .limit(20);

  if (clientId) {
    query = query.eq("client_id", clientId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sessions = (data ?? []) as CoachingSession[];

  // Aggregate insights from sessions
  const allTopics: Record<string, number> = {};
  const allPatterns: string[] = [];
  const openCommitments: string[] = [];

  for (const session of sessions) {
    for (const topic of session.key_topics) {
      allTopics[topic] = (allTopics[topic] ?? 0) + 1;
    }
    for (const pattern of session.patterns_flagged) {
      if (!allPatterns.includes(pattern)) allPatterns.push(pattern);
    }
    // Only count commitments from last 3 sessions as "open"
    if (sessions.indexOf(session) < 3) {
      for (const commitment of session.commitments) {
        openCommitments.push(commitment);
      }
    }
  }

  // Top recurring topics
  const recurringTopics = Object.entries(allTopics)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));

  // Generate brief if client-specific
  let brief: string | null = null;
  if (clientId && sessions.length > 0) {
    // Get client name
    const { data: clientLead } = await supabase
      .from("cp_leads")
      .select("full_name")
      .eq("id", clientId)
      .eq("coach_id", user.id)
      .maybeSingle();

    brief = await generatePreSessionBrief({
      clientName: clientLead?.full_name || "this client",
      recentSessions: sessions.slice(0, 3).map((s) => ({
        ai_summary: s.ai_summary,
        key_topics: s.key_topics,
        commitments: s.commitments,
        session_date: s.session_date,
      })),
      openCommitments: openCommitments.slice(0, 5),
    });
  }

  return NextResponse.json({
    total_sessions: sessions.length,
    recurring_topics: recurringTopics,
    patterns: allPatterns.slice(0, 10),
    open_commitments: openCommitments.slice(0, 10),
    pre_session_brief: brief,
  });
}
