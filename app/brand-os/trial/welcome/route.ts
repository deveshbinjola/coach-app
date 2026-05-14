// GET /brand-os/trial/welcome?session_id=cs_...
//
// Stripe success-redirect handler. Provisions the buyer and redirects
// straight to their trial URL — a URL-bearer-token path that doesn't
// require Supabase auth at all. The token IS the credential.
//
// Same URL goes in the email as a permanent (60-day) bookmark.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { fetchStripeSession, provisionTripwireBuyer } from "@/lib/brand-os/tripwire-provision";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const sessionId = (searchParams.get("session_id") ?? "").trim();

  if (!sessionId) {
    return NextResponse.redirect(`${origin}/brand-os/trial/check-email?reason=missing_session`);
  }

  // 1. Verify Stripe session.
  let stripeSession;
  try {
    stripeSession = await fetchStripeSession(sessionId);
  } catch (err) {
    console.error("[trial/welcome] Stripe fetch failed:", err);
    return NextResponse.redirect(`${origin}/brand-os/trial/check-email?reason=stripe_unavailable`);
  }
  if (!stripeSession) {
    return NextResponse.redirect(`${origin}/brand-os/trial/check-email?reason=session_not_found`);
  }
  const payable = stripeSession.payment_status === "paid" || stripeSession.payment_status === "no_payment_required";
  if (!payable) {
    return NextResponse.redirect(`${origin}/brand-os/trial/check-email?reason=not_paid`);
  }

  // 2. Provision (idempotent — webhook may have already run).
  const admin = createAdminClient();
  const result = await provisionTripwireBuyer(admin, stripeSession);
  if (!result.ok) {
    console.error("[trial/welcome] provision failed:", result.error, result.detail);
    return NextResponse.redirect(`${origin}/brand-os/trial/check-email?reason=${encodeURIComponent(result.error)}`);
  }

  // 3. Redirect to the trial URL. No cookies, no Supabase auth — the
  //    token in the path is the credential. Same URL works forever
  //    (until token expires) from any device.
  return NextResponse.redirect(result.trialUrl);
}
