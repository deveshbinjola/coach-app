import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
export const runtime = "edge";

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("cp_dhara_messages")
    .select("id, role, content, created_at")
    .eq("coach_id", user.id)
    .order("created_at", { ascending: false })
    .limit(40);

  const messages = (data ?? []).reverse();
  return NextResponse.json({ messages });
}
