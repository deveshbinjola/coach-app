// POST /api/dhara/interview/start
//
// Lets the assistant speak first, which the rest of Dhara cannot do.
//
// Every other path is user-sends-then-assistant-replies, so "Introduce
// yourself" opened the panel and then sat there waiting for the coach to
// talk. Worse, the interview greeting only rendered on an empty thread, so
// anyone with conversation history saw their old messages and no question
// at all.
//
// This posts the opening question into the thread as a real assistant
// message. From there the normal loop takes over: interview mode is
// already in the system prompt (lib/dhara/interview.ts) and answers are
// stored explicit + confirmed by /api/dhara/learn.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { userFirstName } from "@/lib/user-display";
import { hasBeenInterviewed, interviewOpener } from "@/lib/dhara/interview";
import type { CoachMemory } from "@/lib/dhara/memory";

export const runtime = "edge";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memRows } = await supabase
    .from("cp_coach_memory")
    .select("source, status")
    .eq("coach_id", user.id)
    .eq("status", "active");

  // Already met them. Never re-ask; that is the one rule the interview has.
  if (hasBeenInterviewed((memRows ?? []) as Array<Pick<CoachMemory, "source" | "status">>)) {
    return NextResponse.json({ ok: false, reason: "already_interviewed" });
  }

  const opener = interviewOpener(userFirstName(user.email, user.user_metadata));

  // Persist so the question survives a refresh and the model sees it as
  // its own previous turn on the next request.
  const admin = createAdminClient();
  await admin.from("cp_dhara_messages").insert({
    coach_id: user.id,
    role: "assistant",
    content: opener,
  });

  return NextResponse.json({ ok: true, message: opener });
}
