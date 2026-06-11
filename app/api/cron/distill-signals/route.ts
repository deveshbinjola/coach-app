// app/api/cron/distill-signals/route.ts
// CRON_SECRET sweep: distill recent sessions with no signals yet (runner is idempotent).
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { runSessionDistill } from "@/lib/distill/run-session-distill";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const provided =
    new URL(request.url).searchParams.get("key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: sessions } = await admin
    .from("cp_coaching_sessions").select("id").order("session_date", { ascending: false }).limit(100);

  let distilled = 0, skipped = 0;
  for (const s of (sessions ?? []).slice(0, 25)) {
    const r = await runSessionDistill(admin, s.id as string);
    if (r.skipped) skipped++; else distilled++;
  }
  return NextResponse.json({ distilled, skipped });
}
