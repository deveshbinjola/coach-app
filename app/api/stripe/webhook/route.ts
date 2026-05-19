// POST /api/stripe/webhook
//
// Stripe sends events here when a payment completes on a connected
// account. We listen for checkout.session.completed, look up the
// offering, and auto-enroll the buyer as a member.
//
// This uses the Connect webhook (account events), not the platform webhook.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { stripe } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Webhook signature verification failed: ${message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await handleCheckoutCompleted(session);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const admin = createAdminClient();

  const offeringId = session.metadata?.offering_id;
  const coachId = session.metadata?.coach_id;
  if (!offeringId || !coachId) return;

  const alreadyRecorded = await admin
    .from("cp_payments")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();
  if (alreadyRecorded.data) return;

  await admin.from("cp_payments").insert({
    coach_id: coachId,
    offering_id: offeringId,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id ?? null,
    amount_cents: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    status: "completed",
    customer_email: session.customer_details?.email ?? null,
    customer_name: session.customer_details?.name ?? null,
    metadata: session.metadata ?? {},
  });

  // Auto-enroll: find or create a client room for this buyer, then
  // add them to the offering.
  const email = session.customer_details?.email;
  if (!email) return;

  // Check if a lead already exists for this email under this coach.
  const { data: existingLead } = await admin
    .from("cp_leads")
    .select("id")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  let leadId: string;
  if (existingLead) {
    leadId = existingLead.id;
  } else {
    const { data: newLead } = await admin
      .from("cp_leads")
      .insert({
        full_name: session.customer_details?.name ?? email.split("@")[0],
        email,
        source: "other",
        source_detail: "Stripe payment",
        status: "client",
      })
      .select("id")
      .single();
    if (!newLead) return;
    leadId = newLead.id;
  }

  // Find or create a client room for this lead under this coach.
  const { data: existingRoom } = await admin
    .from("cp_client_rooms")
    .select("id")
    .eq("lead_id", leadId)
    .eq("coach_id", coachId)
    .maybeSingle();

  let roomId: string;
  if (existingRoom) {
    roomId = existingRoom.id;

    await admin
      .from("cp_client_rooms")
      .update({ payment_status: "paid" })
      .eq("id", roomId);
  } else {
    const { data: offering } = await admin
      .from("cp_offerings")
      .select("name")
      .eq("id", offeringId)
      .maybeSingle();

    const { data: newRoom } = await admin
      .from("cp_client_rooms")
      .insert({
        coach_id: coachId,
        lead_id: leadId,
        program_name: offering?.name ?? "Offering",
        payment_status: "paid",
      })
      .select("id")
      .single();
    if (!newRoom) return;
    roomId = newRoom.id;
  }

  // Add to offering (skip if already enrolled).
  const { data: alreadyMember } = await admin
    .from("cp_offering_members")
    .select("offering_id")
    .eq("offering_id", offeringId)
    .eq("client_room_id", roomId)
    .maybeSingle();

  if (!alreadyMember) {
    await admin.from("cp_offering_members").insert({
      offering_id: offeringId,
      client_room_id: roomId,
      role: "member",
      status: "active",
    });
  }
}
