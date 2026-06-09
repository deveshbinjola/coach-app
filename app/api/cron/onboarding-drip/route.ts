// POST /api/cron/onboarding-drip · admin · daily nurture drip
//
// Runs once per day. Finds coaches whose last_onboarding_email_at is older
// than 23 hours AND step is 1-4, sends the next day's email, increments step.
//
// Auth via BRAND_OS_ADMIN_TOKEN Bearer header. Set the cron in Cloudflare
// (or an external scheduler) to hit this once daily.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";
import { renderDripEmail, sendDripEmail } from "@/lib/email/onboarding-sequence";

export const runtime = "edge";

const ADMIN_EMAIL = "sunny.binjola@gmail.com";

export async function POST(request: NextRequest) {
  // Auth: accept either BRAND_OS_ADMIN_TOKEN Bearer or a signed-in admin user.
  const adminTokenEnv = process.env.BRAND_OS_ADMIN_TOKEN;
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const tokenOk = Boolean(adminTokenEnv) && bearer === adminTokenEnv;

  if (!tokenOk) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Optional: ?dry=1 returns the plan without sending.
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";
  // Optional: ?limit=N to cap how many we touch in one run.
  const limit = Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10));

  const admin = createAdminClient();

  // Find coaches due for the next email. We want step in 1..4 (Day 1 onward),
  // last_onboarding_email_at older than 23h. Day 0 (welcome) is sent inline
  // from /auth/callback, not from this cron.
  const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
  const { data: due, error: dueErr } = await admin
    .from("cp_coaches")
    .select("id, email, full_name, onboarding_email_step, last_onboarding_email_at")
    .gte("onboarding_email_step", 1)
    .lte("onboarding_email_step", 4)
    .lt("last_onboarding_email_at", cutoff)
    .order("last_onboarding_email_at", { ascending: true })
    .limit(limit);

  if (dueErr) {
    return NextResponse.json({ ok: false, error: dueErr.message }, { status: 500 });
  }

  const results: Array<{
    coach_id: string;
    email: string;
    next_step: number;
    action: "sent" | "skipped" | "error" | "would_send";
    error?: string;
  }> = [];

  for (const coach of due ?? []) {
    const currentStep = (coach as { onboarding_email_step: number }).onboarding_email_step;
    const nextStep = currentStep + 1; // 1->2, 2->3, 3->4, 4->5
    if (nextStep < 1 || nextStep > 5) {
      results.push({ coach_id: coach.id, email: coach.email, next_step: nextStep, action: "skipped" });
      continue;
    }

    // renderDripEmail uses step 0..4 (Day 0..4). Our DB step is 1..5 meaning
    // "Day N has been sent". So to send Day N (step value N+1 stored after),
    // we render with arg = currentStep (because step=1 means Day 0 sent;
    // next to send is Day 1 → renderDripEmail(1)).
    const rendered = renderDripEmail(currentStep, {
      firstName: (coach as { full_name?: string }).full_name?.split(/\s+/)[0] ?? null,
    });
    if (!rendered) {
      results.push({ coach_id: coach.id, email: coach.email, next_step: nextStep, action: "skipped" });
      continue;
    }

    if (dryRun) {
      results.push({ coach_id: coach.id, email: coach.email, next_step: nextStep, action: "would_send" });
      continue;
    }

    const sendResult = await sendDripEmail({ to: coach.email, rendered });
    if (!sendResult.ok) {
      results.push({
        coach_id: coach.id,
        email: coach.email,
        next_step: nextStep,
        action: "error",
        error: sendResult.error ?? sendResult.skipped ?? "unknown",
      });
      continue;
    }

    await admin
      .from("cp_coaches")
      .update({
        onboarding_email_step: nextStep,
        last_onboarding_email_at: new Date().toISOString(),
      })
      .eq("id", coach.id);

    results.push({ coach_id: coach.id, email: coach.email, next_step: nextStep, action: "sent" });
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    cutoff,
    inspected: (due ?? []).length,
    sent: results.filter((r) => r.action === "sent").length,
    errors: results.filter((r) => r.action === "error").length,
    results,
  });
}

// Convenience for manual browser firing during testing. Same auth.
export async function GET(request: NextRequest) {
  return POST(request);
}
