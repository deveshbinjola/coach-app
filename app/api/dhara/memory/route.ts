import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data } = await supabase.from("cp_coach_memory")
    .select("id, kind, text, source, source_ref, confidence, status, created_at")
    .eq("coach_id", user.id).eq("status", "active")
    .order("confidence", { ascending: false }).order("last_seen_at", { ascending: false });
  return NextResponse.json({ memories: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { id?: string; text?: string; confirm?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.text === "string") patch.text = body.text.trim().slice(0, 400);
  if (body.confirm) patch.confidence = "confirmed";
  const { error } = await supabase.from("cp_coach_memory").update(patch).eq("id", body.id).eq("coach_id", user.id);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { id?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const { error } = await supabase.from("cp_coach_memory")
    .update({ status: "forgotten", updated_at: new Date().toISOString() })
    .eq("id", body.id).eq("coach_id", user.id);
  if (error) return NextResponse.json({ error: "Forget failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
