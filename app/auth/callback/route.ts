// /auth/callback · post-magic-link session exchange.
//
// On first successful signin we:
//   1. Claim any anonymous Snapshot runs that match this email.
//   2. Send Day 0 of the onboarding drip (idempotent via onboarding_email_step).
//   3. Set step=1 so the daily cron picks them up tomorrow for Day 1.
//   4. Redirect to ?next (defaults to /command-center).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { renderDay0, sendDripEmail } from "@/lib/email/onboarding-sequence";

export const runtime = "edge";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/command-center";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_missing_code`);
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // Best-effort. Never block the redirect on side effects.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const email = user.email.toLowerCase();
      const admin = createAdminClient();

      // 1. Claim any anonymous Snapshot runs matching this email.
      const { data: claimed } = await admin
        .from("cp_brand_os_runs")
        .update({
          coach_id: user.id,
          claimed_at: new Date().toISOString(),
        })
        .eq("email_for_claim", email)
        .is("coach_id", null)
        .is("claimed_at", null)
        .select("id, archetype");

      // 2. Drip Day 0 (welcome) · idempotent via cp_coaches.onboarding_email_step.
      const { data: coachRow } = await admin
        .from("cp_coaches")
        .select("onboarding_email_step, full_name")
        .eq("id", user.id)
        .maybeSingle();

      const stepRow = coachRow as { onboarding_email_step?: number; full_name?: string } | null;
      const currentStep = stepRow?.onboarding_email_step ?? 0;

      if (currentStep === 0) {
        const claimedWithArchetype = (claimed ?? []).find((r: { archetype?: string | null }) => r.archetype);
        const snapshotRevealUrl = claimedWithArchetype
          ? `${APP_ORIGIN}/snapshot/reveal/${(claimedWithArchetype as { id: string }).id}`
          : null;

        const fullName = stepRow?.full_name
          ?? (user.user_metadata?.full_name as string | undefined)
          ?? null;
        const firstName = fullName ? fullName.trim().split(/\s+/)[0] : null;

        const rendered = renderDay0({ firstName, snapshotRevealUrl });
        const sendResult = await sendDripEmail({ to: email, rendered });

        if (sendResult.ok) {
          await admin
            .from("cp_coaches")
            .update({
              onboarding_email_step: 1,
              last_onboarding_email_at: new Date().toISOString(),
            })
            .eq("id", user.id);
        }
      }
    }
  } catch {
    // Swallow. Redirect either way.
  }

  return NextResponse.redirect(`${origin}${next}`);
}
