import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { extractSessionMemory } from "@/lib/session-memory";
import type { ClientRoom, VoiceProfile } from "@/lib/types";

export const runtime = "edge";

type Body = {
  clientRoomId?: unknown;
  title?: unknown;
  notes?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const clientRoomId = typeof body.clientRoomId === "string" ? body.clientRoomId : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!clientRoomId || !notes) {
    return NextResponse.json({ error: "clientRoomId and notes are required" }, { status: 400 });
  }

  const [roomRes, profileRes] = await Promise.all([
    supabase
      .from("cp_client_rooms")
      .select("*")
      .eq("id", clientRoomId)
      .eq("coach_id", user.id)
      .maybeSingle(),
    supabase
      .from("cp_voice_profiles")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const room = (roomRes.data as ClientRoom | null) ?? null;
  if (!room) {
    return NextResponse.json({ error: "Client room not found" }, { status: 404 });
  }

  const profile = (profileRes.data as VoiceProfile | null) ?? null;
  const extraction = await extractSessionMemory({
    notes,
    title,
    clientName: "the client",
    currentFocus: room.current_focus,
    profile,
  });

  const { data: session, error: sessionError } = await supabase
    .from("cp_client_sessions")
    .insert({
      coach_id: user.id,
      client_room_id: room.id,
      title: extraction.title,
      notes,
      wins: extraction.wins,
      blockers: extraction.blockers,
      commitments: extraction.commitments,
      next_focus: extraction.next_focus,
      follow_up_draft: extraction.follow_up_draft,
      content_ideas: extraction.content_ideas,
      extraction_source: extraction.extraction_source,
    })
    .select()
    .single();

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  const taskRows = extraction.commitments.slice(0, 5).map((commitment) => ({
    coach_id: user.id,
    client_room_id: room.id,
    title: commitment,
  }));

  const tasksRes = taskRows.length
    ? await supabase.from("cp_client_tasks").insert(taskRows).select()
    : { data: [] };

  const { data: updatedRoom } = await supabase
    .from("cp_client_rooms")
    .update({ current_focus: extraction.next_focus || room.current_focus })
    .eq("id", room.id)
    .eq("coach_id", user.id)
    .select()
    .single();

  return NextResponse.json({
    session,
    room: updatedRoom ?? room,
    tasks: tasksRes.data ?? [],
    extraction,
  });
}
