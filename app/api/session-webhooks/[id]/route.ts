import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { active?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: { active?: boolean } = {};
  if (typeof body.active === "boolean") patch.active = body.active;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No supported fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cp_session_webhook_endpoints")
    .update(patch)
    .eq("id", params.id)
    .eq("coach_id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ endpoint: data });
}
