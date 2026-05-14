// Edge Function: stripe-webhook
// Receives Stripe events and syncs cp_subscriptions / cp_coaches.
// MUST be deployed with verify_jwt=false (Stripe doesn't send JWTs).
// MUST verify Stripe signature for security.
//
// Required secrets:
//   STRIPE_SECRET_KEY=sk_...
//   STRIPE_WEBHOOK_SECRET=whsec_...
//
// In Stripe dashboard, add webhook endpoint:
//   https://modepuhwinzdngirlnkz.supabase.co/functions/v1/stripe-webhook
// Subscribe to events:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted
//   invoice.paid
//   invoice.payment_failed

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "npm:stripe@17";

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const stripe = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
  apiVersion: "2024-09-30.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");

const supabase = createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY")
);

Deno.serve(async (req: Request) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("No signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    return new Response(`Signature verification failed: ${err}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const coachId = session.metadata?.coach_id;
        if (!coachId) break;

        await supabase.from("cp_subscriptions").upsert({
          coach_id: coachId,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
          status: "active",
          onboarding_paid: true,
        }, { onConflict: "stripe_subscription_id" });

        await supabase
          .from("cp_coaches")
          .update({
            stripe_customer_id: session.customer as string,
            onboarded_at: new Date().toISOString(),
          })
          .eq("id", coachId);
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const coachId = sub.metadata?.coach_id;

        await supabase.from("cp_subscriptions").upsert({
          coach_id: coachId,
          stripe_customer_id: sub.customer as string,
          stripe_subscription_id: sub.id,
          stripe_price_id: sub.items.data[0]?.price.id ?? null,
          status: sub.status,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
        }, { onConflict: "stripe_subscription_id" });
        break;
      }

      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // Could log to cp_lead_activities or a separate cp_payment_events table
        console.log(`Invoice ${event.type} for ${invoice.customer}`);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(`Webhook handler failed: ${err}`, { status: 500 });
  }
});
