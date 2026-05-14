// GET /brand-os/trial/welcome?session_id=cs_...
//
// Stripe success-redirect handler. This is a ROUTE HANDLER (not a page
// component) on purpose — Route Handlers can write cookies, Server
// Components can't (Next.js silently swallows cookie sets in Server
// Components, which is why earlier attempts at this flow bounced the
// buyer to /login).
//
// Flow:
//   1. Verify Stripe session is paid (or no_payment_required for 100% coupons)
//   2. Provision the buyer (idempotent — also runs from webhook as backup)
//   3. Server-side verifyOtp with the hashed_token → writes auth cookies
//      onto app.elevateaisystem.com via the Supabase SSR cookie handler
//   4. Redirect to /brand-os — buyer is now authenticated, gate passes,
//      auto-creates a Full Brand OS run, drops into question 1
//
// Failure modes redirect to /brand-os/trial/check-email?reason=… with
// a human-readable explanation while the webhook still provisions in
// the background.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { fetchStripeSession, provisionTripwireBuyer } from "@/lib/brand-os/tripwire-provision";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const sessionId = (searchParams.get("session_id") ?? "").trim();

  // If they're already signed in (rare), straight to Brand OS.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    return NextResponse.redirect(`${origin}/brand-os`);
  }

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

  // 3. Auto-login via verifyOtp. THIS sets the auth cookies on
  //    app.elevateaisystem.com — the critical step that the earlier
  //    Server Component implementation couldn't do.
  if (result.hashedToken) {
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: result.hashedToken,
      type: "magiclink",
    });
    if (!verifyErr) {
      // Session cookies are now set. Redirect to Brand OS.
      return NextResponse.redirect(`${origin}/brand-os`);
    }
    console.error("[trial/welcome] verifyOtp failed:", verifyErr);
  }

  // 4. Fallback — hashed_token route failed for some reason. The
  //    backup magic-link email is en route. Send them to the
  //    check-email page with the actionLink so they can click it
  //    inline without waiting for inbox delivery.
  const params = new URLSearchParams({ reason: "verify_failed" });
  if (result.actionLink) params.set("action_link", result.actionLink);
  return NextResponse.redirect(`${origin}/brand-os/trial/check-email?${params.toString()}`);
}
