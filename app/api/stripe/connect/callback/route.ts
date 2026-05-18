// GET /api/stripe/connect/callback
//
// Stripe redirects here after a coach completes (or abandons) the
// Connect onboarding. We pull the latest account state from Stripe,
// update our DB, then redirect to Settings.
//
// If ?refresh=1, the coach's link expired and they need a new one —
// we redirect them back to Settings with a query param so the UI
// can auto-trigger a new connect flow.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  const refresh = request.nextUrl.searchParams.get("refresh");
  if (refresh) {
    return NextResponse.redirect(new URL("/settings?stripe=refresh", appUrl));
  }

  const { data: row } = await supabase
    .from("cp_stripe_accounts")
    .select("stripe_account_id")
    .eq("coach_id", user.id)
    .maybeSingle();

  if (row) {
    const account = await stripe.accounts.retrieve(row.stripe_account_id);
    await supabase
      .from("cp_stripe_accounts")
      .update({
        details_submitted: account.details_submitted ?? false,
        charges_enabled: account.charges_enabled ?? false,
        display_name: account.business_profile?.name ?? account.email ?? null,
        livemode: (account as unknown as { livemode?: boolean }).livemode ?? false,
        updated_at: new Date().toISOString(),
      })
      .eq("coach_id", user.id);
  }

  return NextResponse.redirect(new URL("/settings?stripe=connected", appUrl));
}
