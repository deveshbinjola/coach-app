// POST /api/cron/daily-brief · admin · the ongoing trigger
//
// Runs once a day (morning). Picks up where the 5-day onboarding drip
// leaves off: coaches who finished the drip get a brief built from their
// real Business Pulse, and ONLY when the pulse has something to say.
//
// Guardrails, in order of importance:
//   1. Nothing to say → no email. A quiet week is a quiet inbox.
//   2. brief_opt_out → never send.
//   3. One brief per calendar day, enforced by brief_last_sent_at.
//   4. ?dry=1 returns the plan (and the skip reasons) without sending.
//
// Auth mirrors the drip cron: BRAND_OS_ADMIN_TOKEN bearer, or a signed-in
// admin. Point the scheduler at this once daily.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { getBusinessPulse } from "@/lib/ambient";
import { decideBrief, sendBrief } from "@/lib/email/daily-brief";

export const runtime = "edge";

const ADMIN_EMAIL = "sunny.binjola@gmail.com";
/** Coaches are eligible once the Day 0-4 drip has run its course. */
const DRIP_COMPLETE_STEP = 5;

function firstNameOf(email: string, fullName: string | null): string {
  const n = (fullName ?? "").trim();
  if (n) return n.split(/\s+/)[0]!;
  const prefix = (email ?? "").split("@")[0] ?? "";
  const cleaned = prefix.replace(/[._\-+]+/g, " ").trim().split(/\s+/)[0] ?? "";
  return cleaned ? cleaned[0]!.toUpperCase() + cleaned.slice(1) : "";
}

type Result = {
  coach_id: string;
  email: string;
  action: "sent" | "skipped" | "failed";
  reason?: string;
  subject?: string;
};

export async function POST(request: NextRequest) {
  const adminTokenEnv = process.env.BRAND_OS_ADMIN_TOKEN;
  const auth = request.headers.get("authorization") ?? "";
  const tokenOk = Boolean(adminTokenEnv) && auth.replace(/^Bearer\s+/i, "") === adminTokenEnv;

  if (!tokenOk) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const limit = Math.max(1, Math.min(500, parseInt(url.searchParams.get("limit") ?? "100", 10)));

  const admin = createAdminClient();
  const now = Date.now();
  const dayAgo = new Date(now - 23 * 60 * 60 * 1000).toISOString();

  const { data: coaches, error } = await admin
    .from("cp_coaches")
    .select("id, email, full_name, brief_last_sent_at")
    .eq("brief_opt_out", false)
    .gte("onboarding_email_step", DRIP_COMPLETE_STEP)
    .or(`brief_last_sent_at.is.null,brief_last_sent_at.lt.${dayAgo}`)
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "query_failed", detail: error.message }, { status: 500 });
  }

  const results: Result[] = [];

  for (const row of (coaches ?? []) as Array<{
    id: string; email: string; full_name: string | null; brief_last_sent_at: string | null;
  }>) {
    if (!row.email) {
      results.push({ coach_id: row.id, email: "", action: "skipped", reason: "no_email" });
      continue;
    }

    let decision;
    try {
      const pulse = await getBusinessPulse(row.id, now);
      decision = decideBrief({ firstName: firstNameOf(row.email, row.full_name), pulse });
    } catch (err) {
      results.push({
        coach_id: row.id, email: row.email, action: "failed",
        reason: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    // The whole point: silence is a valid outcome.
    if (!decision.send) {
      results.push({ coach_id: row.id, email: row.email, action: "skipped", reason: decision.reason });
      continue;
    }

    if (dryRun) {
      results.push({ coach_id: row.id, email: row.email, action: "sent", reason: "dry_run", subject: decision.rendered.subject });
      continue;
    }

    const sent = await sendBrief(row.email, decision.rendered);
    if (!sent.ok) {
      results.push({ coach_id: row.id, email: row.email, action: "failed", reason: sent.error });
      continue;
    }

    await admin
      .from("cp_coaches")
      .update({ brief_last_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id);

    results.push({ coach_id: row.id, email: row.email, action: "sent", subject: decision.rendered.subject });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    considered: results.length,
    sent: results.filter((r) => r.action === "sent").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    failed: results.filter((r) => r.action === "failed").length,
    results,
  });
}
