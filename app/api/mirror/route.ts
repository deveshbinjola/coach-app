import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import { readMirror } from "@/lib/mirror";

export const runtime = "edge";

// POST -- run one Mirror read and log it.
export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Each read is one model call. Keep it human-paced.
  const { allowed } = rateLimitByUser(user.id, "mirror", 12, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Give it a breath -- too many in a row." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const input = typeof body?.input === "string" ? body.input.trim() : "";
  if (input.length < 10) {
    return NextResponse.json({ error: "Tell me a little more about what you're working through." }, { status: 400 });
  }

  const read = await readMirror(input.slice(0, 1500));
  if (!read) {
    return NextResponse.json({ error: "The Mirror went quiet. Try again in a moment." }, { status: 502 });
  }

  const { data, error } = await supabase
    .from("cp_mirror_reads")
    .insert({
      coach_id: user.id,
      input: input.slice(0, 1500),
      system_type: read.system_type,
      type_reason: read.type_reason,
      mirror_line: read.mirror_line,
      the_mistake: read.the_mistake,
      the_move: read.the_move,
      confidence: read.confidence,
      needs_clarification: read.needs_clarification,
      clarifying_question: read.clarifying_question,
      is_crisis: read.is_crisis,
    })
    .select("id")
    .single();

  if (error) {
    // The read still has value to the coach even if logging failed.
    return NextResponse.json({ ok: true, id: null, read });
  }

  return NextResponse.json({ ok: true, id: data.id, read });
}

// PATCH -- record the "that's me" / "not quite" tap. The investment step.
export async function PATCH(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const tap = body?.tap === "yes" || body?.tap === "not_quite" ? body.tap : null;
  if (!id || !tap) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // RLS scopes the update to this coach's own row.
  const { error } = await supabase
    .from("cp_mirror_reads")
    .update({ tap })
    .eq("id", id)
    .eq("coach_id", user.id);

  if (error) return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
