// POST /api/stripe/webhook
//
// Stripe sends events here when a payment completes on a connected
// account. We listen for checkout.session.completed, look up the
// offering, and auto-enroll the buyer as a member.
//
// This uses the Connect webhook (account events), not the platform webhook.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/stripe";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Record<string, unknown>;
  try {
    event = await verifyWebhookSignature(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Webhook verification failed: ${message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data as { object: CheckoutSession };
    await handleCheckoutCompleted(session.object);
  }

  return NextResponse.json({ received: true });
}

interface CheckoutSession {
  id: string;
  payment_intent?: string | { id: string } | null;
  amount_total?: number | null;
  currency?: string | null;
  customer_details?: {
    email?: string | null;
    name?: string | null;
  } | null;
  metadata?: Record<string, string> | null;
}

async function handleCheckoutCompleted(session: CheckoutSession) {
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

  const email = session.customer_details?.email;
  if (!email) return;

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
