// Shared provisioning logic for $7 Brand OS trip-wire buyers.
//
// Called by TWO paths:
//   1. /brand-os/trial/welcome   (Stripe success redirect — fast path,
//      provisions on the spot, redirects buyer straight INTO Brand OS
//      without any email step)
//   2. /api/billing/brand-os-tripwire/webhook  (Stripe webhook — backup
//      path that fires async; idempotent thanks to dedup on
//      stripe_session_id)
//
// Both paths converge on this helper so the buyer ends up in one
// canonical state: user exists, cp_coaches row exists at plan='trial',
// cp_tripwire_purchases row is stamped, magic-link email queued.

import type { SupabaseClient } from "@supabase/supabase-js";

export type StripeSessionForProvision = {
  id: string;
  customer_email: string | null;
  customer_details?: { email?: string | null } | null;
  payment_intent?: string | null;
  amount_total?: number | null;
  currency?: string | null;
  payment_status?: string | null;
  metadata?: Record<string, string> | null;
};

export type ProvisionResult = {
  ok: true;
  coachId: string;
  email: string;
  /** Magic-link URL the buyer can click to sign in. We redirect them to
   *  this URL on the synchronous welcome path so they're auto-logged-in. */
  actionLink: string | null;
  /** Whether this run actually created a new user (vs. found existing). */
  newUser: boolean;
  /** Whether the welcome email got sent (false if Resend not configured). */
  emailSent: boolean;
};

export type ProvisionError = { ok: false; error: string; detail?: string };

/** Fetch a Stripe Checkout Session by ID. Used by the welcome page to
 *  confirm payment status server-side before doing anything. */
export async function fetchStripeSession(sessionId: string): Promise<StripeSessionForProvision | null> {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { "Authorization": `Bearer ${stripeKey}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as StripeSessionForProvision;
}

/** Idempotent provision: creates Supabase user (or finds existing), inserts
 *  cp_coaches row at plan='trial', stamps cp_tripwire_purchases, generates
 *  a magic-link URL, queues the welcome email. Safe to call from both the
 *  welcome page and the webhook — second call is a no-op past the dedup
 *  check. */
export async function provisionTripwireBuyer(
  admin: SupabaseClient,
  session: StripeSessionForProvision,
): Promise<ProvisionResult | ProvisionError> {
  if (session.metadata?.product !== "brand_os_mvp_tripwire") {
    return { ok: false, error: "wrong_product" };
  }
  // We accept both 'paid' (real) and 'no_payment_required' (100% off coupon).
  const status = session.payment_status;
  if (status !== "paid" && status !== "no_payment_required") {
    return { ok: false, error: "not_paid", detail: status ?? undefined };
  }

  const email = (session.customer_email ?? session.customer_details?.email ?? "").trim().toLowerCase();
  if (!email) return { ok: false, error: "no_email_on_session" };

  // Dedup — if this session was already fully provisioned, return the
  // cached state so the welcome redirect still gets an actionLink.
  const { data: existing } = await admin
    .from("cp_tripwire_purchases")
    .select("id, coach_id, user_provisioned_at")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  // Always upsert the purchase row first (covers first-time + replay).
  await admin.from("cp_tripwire_purchases").upsert({
    email,
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent ?? null,
    amount_cents: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    product: "brand_os_mvp",
    status: "paid",
    paid_at: new Date().toISOString(),
    utm_source: session.metadata?.utm_source ?? null,
    utm_medium: session.metadata?.utm_medium ?? null,
    utm_campaign: session.metadata?.utm_campaign ?? null,
  }, { onConflict: "stripe_session_id" });

  // Provision the user. If existing → attach. If not → create.
  let coachId: string | null = existing?.coach_id ?? null;
  let newUser = false;

  if (!coachId) {
    // Try to find by email first (e.g. they previously signed up elsewhere).
    const { data: userList } = await admin.auth.admin.listUsers();
    const existingUser = userList?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    if (existingUser) {
      coachId = existingUser.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { provisioned_via: "brand_os_tripwire", display_name: email.split("@")[0] },
      });
      if (createErr || !created.user) {
        return { ok: false, error: "user_create_failed", detail: createErr?.message };
      }
      coachId = created.user.id;
      newUser = true;
    }
  }

  // Ensure cp_coaches row exists. Use upsert to avoid races between
  // welcome path + webhook (both can hit this within seconds).
  await admin.from("cp_coaches").upsert({
    id: coachId,
    email,
    plan: "trial",
  }, { onConflict: "id" });

  // Generate magic link — used by welcome page for auto-login redirect,
  // AND emailed as fallback if welcome path fails.
  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.elevateaisystem.com";
  const { data: link } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${baseAppUrl}/brand-os` },
  });
  const actionLink = link?.properties?.action_link ?? null;

  // Send welcome email (best-effort; never blocks). Only once per session.
  let emailSent = false;
  if (!existing?.user_provisioned_at) {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey && actionLink) {
      try {
        const from = process.env.RESEND_FROM ?? "Brand OS <brand-os@elevateaisystem.com>";
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: email,
            subject: "Your Brand OS access · backup link",
            html: backupEmailHtml(actionLink, email),
            text: backupEmailText(actionLink),
          }),
        });
        emailSent = resp.ok;
      } catch (err) {
        console.error("[tripwire-provision] welcome email send failed:", err);
      }
    }
  }

  // Stamp the timeline.
  await admin
    .from("cp_tripwire_purchases")
    .update({
      coach_id: coachId,
      user_provisioned_at: existing?.user_provisioned_at ?? new Date().toISOString(),
      magic_link_sent_at: emailSent ? new Date().toISOString() : null,
    })
    .eq("stripe_session_id", session.id);

  return { ok: true, coachId, email, actionLink, newUser, emailSent };
}

// ── Email templates ───────────────────────────────────────

function backupEmailHtml(link: string, email: string): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#111;line-height:1.6;">
  <div style="text-align:left;padding-bottom:24px;border-bottom:2px solid #00FF41;">
    <strong style="color:#0A0F1C;font-size:18px;">ElevateAI · Brand OS</strong>
  </div>

  <h1 style="font-size:24px;font-weight:800;margin:24px 0 12px 0;">Backup access link.</h1>
  <p>You should already be inside Brand OS from the checkout redirect. This is your backup — use it to resume from another device, or if the redirect missed you.</p>

  <p style="margin:28px 0;">
    <a href="${link}" style="display:inline-block;background:#00FF41;color:#0A0F1C;padding:14px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:16px;">Open Brand OS →</a>
  </p>

  <p style="font-size:14px;color:#666;">Signs you in as <strong>${email}</strong>. Save this email — you can use this link from any device to pick up where you left off.</p>

  <p style="font-size:13px;color:#999;margin-top:40px;border-top:1px solid #eee;padding-top:16px;">
    ElevateAI Systems · elevateaisystem.com<br>
    Reply with anything weird and we'll fix it.
  </p>
</body></html>`;
}

function backupEmailText(link: string): string {
  return `Backup access link.

You should already be inside Brand OS from the checkout redirect. This is your backup — use it to resume from another device.

${link}

Save this email — works from any device.

ElevateAI Systems · elevateaisystem.com`;
}
