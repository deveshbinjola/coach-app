// Edge Function: stripe-checkout
// Creates a Checkout Session that bundles:
//   1. $497 one-time onboarding fee
//   2. $100/mo subscription (recurring)
// POST /functions/v1/stripe-checkout (auth required)
// Returns { url: "https://checkout.stripe.com/..." }
//
// Required secrets:
//   STRIPE_SECRET_KEY=sk_...
//   STRIPE_PRICE_ONBOARDING=price_...      (the $497 one-time)
//   STRIPE_PRICE_MONTHLY=price_...         (the $100/mo recurring)
//   APP_URL=https://app.elevateaisystem.com

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing auth" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Not authenticated" }, 401);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2024-09-30.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const appUrl = Deno.env.get("APP_URL")!;

    // Lookup or create Stripe customer
    const { data: coach } = await supabase
      .from("cp_coaches")
      .select("stripe_customer_id, email, full_name")
      .eq("id", user.id)
      .single();

    let customerId = coach?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: coach?.email ?? user.email!,
        name: coach?.full_name ?? undefined,
        metadata: { coach_id: user.id },
      });
      customerId = customer.id;

      // Use service role via separate client to bypass RLS for this admin update
      const srkKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!srkKey) return json({ error: "Server misconfigured" }, 500);
      const admin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        srkKey
      );
      await admin
        .from("cp_coaches")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        { price: Deno.env.get("STRIPE_PRICE_ONBOARDING")!, quantity: 1 },
        { price: Deno.env.get("STRIPE_PRICE_MONTHLY")!, quantity: 1 },
      ],
      success_url: `${appUrl}/inbox?welcome=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing?canceled=true`,
      subscription_data: {
        metadata: { coach_id: user.id },
      },
      metadata: { coach_id: user.id },
      allow_promotion_codes: true,
    });

    return json({ url: session.url });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
