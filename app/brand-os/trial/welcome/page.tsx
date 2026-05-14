// /brand-os/trial/welcome?session_id=cs_…
//
// Landing page after Stripe Checkout success. Server component that:
//   1. Verifies the Stripe session is paid
//   2. Provisions the buyer's user + cp_coaches row (idempotent)
//   3. Generates a magic-link URL
//   4. SERVER-REDIRECTS to that magic link so the buyer lands in /brand-os
//      already signed in — no email step in the happy path
//
// The same provisioning also runs from the Stripe webhook as a backup
// (in case the redirect doesn't complete). Webhook + welcome page are
// idempotent — second call is a no-op past dedup.
//
// If something fails (no session_id, payment not yet processed, Stripe
// hiccup), we render a "check your email" fallback page so the buyer
// still gets in via the magic-link email.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { fetchStripeSession, provisionTripwireBuyer } from "@/lib/brand-os/tripwire-provision";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function TripwireWelcome({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  // Already signed in — straight to Brand OS.
  if (user) redirect("/brand-os");

  const sessionId = (searchParams.session_id ?? "").trim();
  if (!sessionId) return <FallbackPage reason="missing_session" />;

  // Look up Stripe session and provision synchronously. If anything goes
  // wrong, fall back to the "check email" page (the webhook may still
  // succeed asynchronously).
  let stripeSession: Awaited<ReturnType<typeof fetchStripeSession>>;
  try {
    stripeSession = await fetchStripeSession(sessionId);
  } catch {
    return <FallbackPage reason="stripe_unavailable" />;
  }
  if (!stripeSession) return <FallbackPage reason="session_not_found" />;

  // 100% coupon = "no_payment_required"; real payment = "paid".
  const payable = stripeSession.payment_status === "paid" || stripeSession.payment_status === "no_payment_required";
  if (!payable) return <FallbackPage reason="not_paid" />;

  // Provision.
  const admin = createAdminClient();
  const result = await provisionTripwireBuyer(admin, stripeSession);
  if (!result.ok) return <FallbackPage reason={result.error} />;

  // Auto-login: redirect the browser to the Supabase magic-link URL. The
  // link's redirectTo is /brand-os, so the buyer lands in Brand OS signed
  // in — no email step. The link is single-use and short-lived.
  if (result.actionLink) {
    redirect(result.actionLink);
  }

  // No actionLink (rare — would happen if generateLink returned null).
  // Fall back to email path.
  return <FallbackPage reason="no_link_generated" email={result.email} />;
}

// ─────────────────────────────────────────────────────────
// Fallback page — used when the auto-login path can't complete.
// The webhook still runs in the background and emails a magic link as a
// safety net.

function FallbackPage({ reason, email }: { reason: string; email?: string }) {
  const recipientText = email || "your email";
  return (
    <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--brand-soft)] border-2 border-[var(--brand-strong)]">
          <span className="text-3xl">✓</span>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight leading-tight text-[color:var(--text)]">
          Paid. Check {recipientText}.
        </h1>
        <p className="text-[color:var(--text-muted)] leading-relaxed">
          The instant sign-in didn't complete (<code className="font-mono text-[length:var(--t-caption)] bg-[var(--surface-elevated)] px-1.5 py-0.5 rounded">{reason}</code>) — but your purchase went through.
          We're sending a magic-link email now. Click it to start your Brand OS run.
        </p>
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 text-left space-y-3">
          <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--brand-strong)]">
            What's in the email
          </p>
          <ul className="space-y-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            <li>· A one-click sign-in link (no password)</li>
            <li>· Works from any device</li>
            <li>· Save it for later — same link resumes you next time</li>
          </ul>
        </div>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
          Not arriving in 60 seconds? Check spam, then{" "}
          <a href="mailto:sunny.binjola@gmail.com" className="underline">email Sunny</a>{" "}
          — we'll resend manually.
        </p>
      </div>
    </div>
  );
}
