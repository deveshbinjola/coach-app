// POST /api/stripe/connect
//
// Creates a Stripe Connect account for the authenticated coach and
// returns an Account Link URL where they complete onboarding.
// If they already have a connected account that needs more info,
// generates a fresh Account Link for that existing account.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { stripe } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const { data: existing } = await supabase
    .from("cp_stripe_accounts")
    .select("stripe_account_id, charges_enabled")
    .eq("coach_id", user.id)
    .maybeSingle();

  let stripeAccountId: string;

  if (existing) {
    stripeAccountId = existing.stripe_account_id;
  } else {
    const account = await stripe.accounts.create({
      type: "standard",
      email: user.email,
      metadata: { coach_id: user.id },
    });
    stripeAccountId = account.id;

    await supabase.from("cp_stripe_accounts").insert({
      coach_id: user.id,
      stripe_account_id: account.id,
      livemode: (account as unknown as { livemode?: boolean }).livemode ?? false,
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    refresh_url: `${appUrl}/api/stripe/connect/callback?refresh=1`,
    return_url: `${appUrl}/api/stripe/connect/callback`,
    type: "account_onboarding",
  });

  return NextResponse.json({ url: accountLink.url });
}
