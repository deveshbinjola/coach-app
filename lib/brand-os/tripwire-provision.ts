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
import { signTrialToken } from "@/lib/brand-os/trial-token";
import { logFunnelEvent } from "@/lib/funnel-log";

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
  /** Magic-link URL the buyer can click to sign in. Used as email fallback. */
  actionLink: string | null;
  /** Hashed token from generateLink — kept around as a session-upgrade
   *  path if/when the buyer wants the full platform later. */
  hashedToken: string | null;
  /** URL-bearer token for the standalone trial path. The single, durable
   *  credential the buyer carries in their email + their browser URL. */
  trialToken: string;
  /** Full URL the buyer should land on. Always prefer this over the
   *  Supabase magic link for trip-wire flow. */
  trialUrl: string;
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
  // We need the row id back to sign the trial token.
  const { data: upserted } = await admin
    .from("cp_tripwire_purchases")
    .upsert({
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
    }, { onConflict: "stripe_session_id" })
    .select("id")
    .single();
  const purchaseId = (upserted?.id as string | undefined) ?? existing?.id;

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

  // Ensure cp_coaches row exists. Captures email + display name so the
  // customer record is complete on day one. Use upsert to avoid races
  // between welcome path + webhook (both can hit this within seconds).
  const displayName = email.split("@")[0];
  await admin.from("cp_coaches").upsert({
    id: coachId,
    email,
    full_name: displayName,
    plan: "trial",
  }, { onConflict: "id" });

  // Subscribe to The Signal newsletter via Beehiiv. Fire-and-forget;
  // never blocks the buyer's checkout flow. Only fires on first
  // provision (not on idempotent retries).
  if (!existing?.user_provisioned_at) {
    void subscribeToBeehiiv(email, displayName);
    void logFunnelEvent(coachId, "signup_completed", { path: "tripwire" });
  }

  // Generate magic link — used by welcome page for auto-login redirect,
  // AND emailed as fallback.
  //
  // CRITICAL: redirectTo must point at /auth/callback (with ?next=/brand-os),
  // NOT directly at /brand-os. The callback route runs
  // exchangeCodeForSession() server-side which SETS the auth cookies
  // before forwarding the user. Without this hop, the user lands on
  // /brand-os with the auth code in the URL fragment but no session
  // cookies set — so the server component sees them as anonymous and
  // bounces them to /login.
  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.elevateaisystem.com";
  const { data: link } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${baseAppUrl}/auth/callback?next=/brand-os` },
  });
  const actionLink = link?.properties?.action_link ?? null;
  const hashedToken = (link?.properties as { hashed_token?: string } | undefined)?.hashed_token ?? null;

  // Sign the trial token. This is the URL-bearer credential the buyer
  // uses to access /trial/[token]/... — no Supabase login needed.
  if (!purchaseId) {
    return { ok: false, error: "no_purchase_id_after_upsert" };
  }
  if (!process.env.SECRETS_MASTER_KEY) {
    console.error("[tripwire-provision] SECRETS_MASTER_KEY not set — cannot sign trial token");
    return {
      ok: false,
      error: "secrets_master_key_missing",
      detail: "Set SECRETS_MASTER_KEY on Cloudflare Pages env (base64 32 bytes from `openssl rand -base64 32`) and redeploy.",
    };
  }
  let trialToken: string;
  try {
    trialToken = await signTrialToken({ purchaseId, coachId });
  } catch (err) {
    console.error("[tripwire-provision] signTrialToken failed:", err);
    return {
      ok: false,
      error: "token_sign_failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  const trialUrl = `${baseAppUrl}/trial/${trialToken}`;

  // Send the welcome email pointing at the trial URL. ONE big button.
  // No magic-link verify chain. Same URL works on any device forever
  // (until token expires in 60 days).
  let emailSent = false;
  if (!existing?.user_provisioned_at) {
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
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
            subject: "Your Brand OS — click to start",
            html: welcomeEmailHtml(trialUrl, email),
            text: welcomeEmailText(trialUrl),
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

  return { ok: true, coachId, email, actionLink, hashedToken, trialToken, trialUrl, newUser, emailSent };
}

// ── Email templates ───────────────────────────────────────

function welcomeEmailHtml(trialUrl: string, email: string): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#111;line-height:1.6;">
  <div style="text-align:left;padding-bottom:24px;border-bottom:2px solid #00FF41;">
    <strong style="color:#0A0F1C;font-size:18px;">ElevateAI · Brand OS</strong>
  </div>

  <h1 style="font-size:24px;font-weight:800;margin:24px 0 12px 0;">Your Brand OS is ready.</h1>
  <p>Click below to start. About 90 minutes, one question at a time. We push back when answers read generic. Save this email — same link resumes you from any device.</p>

  <p style="margin:28px 0;">
    <a href="${trialUrl}" style="display:inline-block;background:#00FF41;color:#0A0F1C;padding:14px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:16px;">Start Brand OS →</a>
  </p>

  <p style="font-size:14px;color:#666;">Bookmark this URL — it's your access for the next 60 days. No password needed.</p>

  <p style="font-size:14px;color:#444;margin-top:24px;">What you'll get when you finish:</p>
  <ul style="font-size:14px;color:#444;">
    <li>Your <strong>positioning line</strong> — sharper than "I help X go from Y to Z"</li>
    <li>Your <strong>voice DNA</strong> — vocab to use, vocab to never use</li>
    <li>Your <strong>buyer mirror</strong> — one named avatar with body-state detail</li>
    <li>Your <strong>3 content pillars</strong> + 5 ready-to-draft hooks</li>
    <li>A portable <strong>.md file</strong> you can paste into ChatGPT / Claude / Gemini</li>
  </ul>

  <p style="font-size:13px;color:#999;margin-top:40px;border-top:1px solid #eee;padding-top:16px;">
    ElevateAI Systems · elevateaisystem.com<br>
    Sent to <strong>${email}</strong> · reply with anything weird and we'll fix it.
  </p>
</body></html>`;
}

// Push a new $7 buyer to The Signal newsletter (Beehiiv). Tagged
// with utm so we can attribute the source in Beehiiv analytics.
// Non-blocking: if BEEHIIV_API_KEY isn't set or the API call fails,
// we log and move on — the customer still gets their product.
async function subscribeToBeehiiv(email: string, displayName: string): Promise<void> {
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUB_ID ?? "f390a157-1409-46d7-8d9e-1eff7e3a4d64";
  if (!apiKey) {
    console.warn("[tripwire-provision] BEEHIIV_API_KEY not set — skipping newsletter signup for", email);
    return;
  }
  try {
    const resp = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        reactivate_existing: true,
        send_welcome_email: true,
        utm_source: "brand_os_tripwire",
        utm_medium: "product_signup",
        utm_campaign: "brand_os_7_purchase",
        custom_fields: [{ name: "first_name", value: displayName }],
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      console.warn(
        "[tripwire-provision] Beehiiv subscribe failed:",
        resp.status,
        detail.slice(0, 200),
      );
    }
  } catch (err) {
    console.error("[tripwire-provision] Beehiiv subscribe error:", err);
  }
}

function welcomeEmailText(trialUrl: string): string {
  return `Your Brand OS is ready.

Click below to start. About 90 minutes, one question at a time.

${trialUrl}

Save this email — same link resumes you from any device. Valid 60 days.

What you'll get:
- Your positioning line (sharper than the generic template)
- Your voice DNA (vocab to use, vocab to never use)
- Your buyer mirror (named avatar)
- 3 content pillars + 5 ready-to-draft hooks
- A portable .md file for ChatGPT/Claude/Gemini

ElevateAI Systems · elevateaisystem.com`;
}
