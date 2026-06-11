// app/api/sessions/[id]/distill/route.ts
// POST — distill the coach's own just-saved session (felt deposit). Verifies
// ownership, then runs the shared runner with a service-role client.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { runSessionDistill } from "@/lib/distill/run-session-distill";

export const runtime = "edge";

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = rateLimitByUser(user.id, "session/distill", 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { data: own } = await supabase
    .from("cp_coaching_sessions").select("id").eq("id", params.id).eq("coach_id", user.id).maybeSingle();
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await runSessionDistill(createAdminClient(), params.id);
  if (result.error && !result.skipped) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ deposited: result.deposited, skipped: result.skipped });
}
