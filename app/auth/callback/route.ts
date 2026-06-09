// /auth/callback · post-magic-link session exchange.
//
// On first successful signin for a new coach we:
//   1. Claim any anonymous Snapshot runs that match this email
//      (sets coach_id + claimed_at on those rows).
//   2. Fire the onboarding email (idempotent via cp_coaches.welcome_email_sent_at).
//   3. Redirect to ?next (defaults to /command-center).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { sendOnboardingEmail } from "@/lib/email/onboarding";

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

  // Best-effort post-signin housekeeping. Anything that fails here must not
  // block the redirect. Worst case the email never sends. Coach is still in.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      const email = user.email.toLowerCase();
      const admin = createAdminClient();

      // 1. Claim any anonymous Snapshot runs that match this email.
      const { data: claimed } = await admin
        .from("cp_brand_os_runs")
        .update({
          coach_id: user.id,
          claimed_at: new Date().toISOString(),
        })
        .eq("email_for_claim", email)
        .is("coach_id", null)
        .is("claimed_at", null)
        .select("id, archetype, tier");

      // 2. Onboarding email · idempotent via cp_coaches.welcome_email_sent_at.
      const { data: coachRow } = await admin
        .from("cp_coaches")
        .select("welcome_email_sent_at, full_name")
        .eq("id", user.id)
        .maybeSingle();

      const alreadySent = Boolean((coachRow as { welcome_email_sent_at?: string } | null)?.welcome_email_sent_at);

      if (!alreadySent) {
        // Pick a Snapshot reveal URL if we just claimed one with an archetype.
        const claimedWithArchetype = (claimed ?? []).find((r: { archetype?: string | null }) => r.archetype);
        const snapshotRevealUrl = claimedWithArchetype
          ? `${APP_ORIGIN}/snapshot/reveal/${(claimedWithArchetype as { id: string }).id}`
          : null;

        // First name from cp_coaches.full_name or user metadata.
        const fullName = ((coachRow as { full_name?: string } | null)?.full_name)
          ?? (user.user_metadata?.full_name as string | undefined)
          ?? null;
        const firstName = fullName ? fullName.trim().split(/\s+/)[0] : null;

        const sendResult = await sendOnboardingEmail({
          to: email,
          firstName,
          snapshotRevealUrl,
        });

        if (sendResult.ok) {
          await admin
            .from("cp_coaches")
            .update({ welcome_email_sent_at: new Date().toISOString() })
            .eq("id", user.id);
        }
      }
    }
  } catch {
    // Swallow. Redirect either way.
  }

  return NextResponse.redirect(`${origin}${next}`);
}
