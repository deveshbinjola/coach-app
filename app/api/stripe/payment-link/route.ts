// POST /api/stripe/payment-link
//
// Creates a Stripe Payment Link for a specific offering on the coach's
// connected account. The link is stored in cp_payment_links and returned.
//
// Body: { offering_id: string }

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createPrice, createPaymentLink } from "@/lib/stripe";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const offeringId = body.offering_id;
  if (!offeringId) {
    return NextResponse.json({ error: "offering_id required" }, { status: 400 });
  }

  const [{ data: offering }, { data: stripeAccount }, { data: existingLink }] = await Promise.all([
    supabase
      .from("cp_offerings")
      .select("id, name, price_cents, capacity, kind")
      .eq("id", offeringId)
      .eq("coach_id", user.id)
      .maybeSingle(),
    supabase
      .from("cp_stripe_accounts")
      .select("stripe_account_id, charges_enabled")
      .eq("coach_id", user.id)
      .maybeSingle(),
    supabase
      .from("cp_payment_links")
      .select("url, stripe_payment_link_id, active")
      .eq("offering_id", offeringId)
      .eq("coach_id", user.id)
      .maybeSingle(),
  ]);

  if (!offering) {
    return NextResponse.json({ error: "Offering not found" }, { status: 404 });
  }
  if (!stripeAccount || !stripeAccount.charges_enabled) {
    return NextResponse.json({ error: "Connect your Stripe account first" }, { status: 400 });
  }
  if (!offering.price_cents || offering.price_cents <= 0) {
    return NextResponse.json({ error: "Set a price on this offering first" }, { status: 400 });
  }

  if (existingLink?.active) {
    return NextResponse.json({ url: existingLink.url });
  }

  const price = await createPrice(
    {
      unit_amount: offering.price_cents,
      currency: "usd",
      product_data: {
        name: offering.name,
        metadata: { offering_id: offering.id, coach_id: user.id },
      },
    },
    stripeAccount.stripe_account_id,
  );

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const paymentLink = await createPaymentLink(
    {
      line_items: [{ price: price.id, quantity: 1 }],
      after_completion: {
        type: "redirect",
        redirect: { url: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}` },
      },
      metadata: {
        offering_id: offering.id,
        coach_id: user.id,
      },
    },
    stripeAccount.stripe_account_id,
  );

  await supabase.from("cp_payment_links").upsert({
    coach_id: user.id,
    offering_id: offering.id,
    stripe_payment_link_id: paymentLink.id,
    stripe_price_id: price.id,
    url: paymentLink.url,
    active: true,
  }, { onConflict: "offering_id" });

  return NextResponse.json({ url: paymentLink.url });
}
