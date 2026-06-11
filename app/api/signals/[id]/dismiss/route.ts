// app/api/signals/[id]/dismiss/route.ts
// POST — coach dismisses a surfaced signal. Flips it to dismissed (RLS scopes to owner).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("cp_signals").update({ status: "dismissed" })
    .eq("id", params.id).eq("coach_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
