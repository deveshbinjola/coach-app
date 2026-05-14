// POST /api/billing/brand-os-tripwire/webhook
//
// Stripe webhook for the $7 Brand OS trip-wire purchase.
//
// On checkout.session.completed:
//   1. Verify signature
//   2. Dedupe by stripe_session_id (Stripe retries)
//   3. Create Supabase user with the buyer's email (plan='trial')
//   4. Insert cp_coaches row (plan='trial')
//   5. Generate a magic link
//   6. Send the welcome email (Resend platform key)
//   7. Stamp cp_tripwire_purchases with the timeline
//
// Stripe webhook signature verification at the edge: implements HMAC-SHA256
// over `<timestamp>.<payload>` per the Stripe spec, using Web Crypto only.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";

// Cloudflare Workers can't read raw bytes from request.text() without
// special handling for the signature check. We read once and use the
// string body for both signature verification and JSON parsing.

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 503 });
  }
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const rawBody = await request.text();

  // Verify signature (HMAC SHA-256 over `${timestamp}.${payload}`).
  const verified = await verifyStripeSignature(rawBody, sig, secret);
  if (!verified) {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // We only care about completed Checkout Sessions for this product.
  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as {
    id: string;
    customer_email?: string | null;
    customer_details?: { email?: string | null } | null;
    payment_intent?: string | null;
    amount_total?: number | null;
    currency?: string | null;
    metadata?: Record<string, string> | null;
    payment_status?: string | null;
  };

  // Wrong product / not paid → ignore.
  if (session.metadata?.product !== "brand_os_mvp_tripwire") {
    return NextResponse.json({ received: true, ignored: "wrong_product" });
  }
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, ignored: "not_paid" });
  }

  const email = (session.customer_email ?? session.customer_details?.email ?? "").trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "no_email_on_session" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Dedupe — if we already saw this session, exit clean.
  const { data: existing } = await admin
    .from("cp_tripwire_purchases")
    .select("id, coach_id, user_provisioned_at")
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (existing?.user_provisioned_at) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  // Upsert the purchase row first (so we have a record even if user creation fails).
  await admin.from("cp_tripwire_purchases").upsert({
    email,
    stripe_session_id: session.id,
    stripe_payment_intent_id: session.payment_intent ?? null,
    amount_cents: session.amount_total ?? 700,
    currency: session.currency ?? "usd",
    product: "brand_os_mvp",
    status: "paid",
    paid_at: new Date().toISOString(),
    utm_source: session.metadata?.utm_source ?? null,
    utm_medium: session.metadata?.utm_medium ?? null,
    utm_campaign: session.metadata?.utm_campaign ?? null,
  }, { onConflict: "stripe_session_id" });

  // Provision the user. If they already exist, just attach to that account.
  let coachId: string | null = null;

  // Try to find existing user by email.
  const { data: userList } = await admin.auth.admin.listUsers();
  const existingUser = userList?.users?.find((u) => (u.email ?? "").toLowerCase() === email);

  if (existingUser) {
    coachId = existingUser.id;
  } else {
    // Create a new Supabase user (no password — magic link login only).
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provisioned_via: "brand_os_tripwire", display_name: email.split("@")[0] },
    });
    if (createErr || !created.user) {
      return NextResponse.json({ error: "user_create_failed", detail: createErr?.message }, { status: 500 });
    }
    coachId = created.user.id;

    // Insert cp_coaches row at trial tier.
    await admin.from("cp_coaches").insert({
      id: coachId,
      email,
      plan: "trial",
    });
  }

  // Generate a magic link they can click to sign in.
  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.elevateaisystem.com";
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${baseAppUrl}/brand-os`,
    },
  });
  if (linkErr) {
    return NextResponse.json({ error: "link_gen_failed", detail: linkErr.message }, { status: 500 });
  }
  const actionLink = link?.properties?.action_link ?? null;

  // Send the welcome email (platform Resend, since trial users don't have BYOK).
  const resendKey = process.env.RESEND_API_KEY;
  let magicLinkSent = false;
  if (resendKey && actionLink) {
    try {
      const from = process.env.RESEND_FROM ?? "Brand OS <brand-os@elevateaisystem.com>";
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: email,
          subject: "Your Brand OS access · let's go",
          html: welcomeEmailHtml(actionLink, email),
          text: welcomeEmailText(actionLink),
        }),
      });
      magicLinkSent = true;
    } catch (err) {
      console.error("[tripwire/webhook] magic link send failed:", err);
    }
  }

  // Finalize the purchase row.
  await admin
    .from("cp_tripwire_purchases")
    .update({
      coach_id: coachId,
      user_provisioned_at: new Date().toISOString(),
      magic_link_sent_at: magicLinkSent ? new Date().toISOString() : null,
    })
    .eq("stripe_session_id", session.id);

  return NextResponse.json({ received: true, provisioned: true, magic_link_sent: magicLinkSent });
}

// ── Stripe signature verification ─────────────────────────

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  // Stripe-Signature header format: t=<unix>,v1=<sig>,v1=<sig>...
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0) return false;

  // Tolerance: 5 minutes against replay.
  const tsNum = Number(t);
  if (!Number.isFinite(tsNum)) return false;
  if (Math.abs(Date.now() / 1000 - tsNum) > 300) return false;

  const signedPayload = `${t}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(signedPayload));
  const expectedHex = bufToHex(sigBuf);
  return sigs.some((s) => timingSafeEqual(s, expectedHex));
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

// ── Email templates ──────────────────────────────────────

function welcomeEmailHtml(link: string, email: string): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#111;line-height:1.6;">
  <div style="text-align:left;padding-bottom:24px;border-bottom:2px solid #00FF41;">
    <strong style="color:#0A0F1C;font-size:18px;">ElevateAI · Brand OS</strong>
  </div>

  <h1 style="font-size:24px;font-weight:800;margin:24px 0 12px 0;">Your Brand OS is ready.</h1>
  <p>Thanks for grabbing it. Click below to start your run — about 30 minutes, one question at a time. We push back when the answers read generic.</p>

  <p style="margin:28px 0;">
    <a href="${link}" style="display:inline-block;background:#00FF41;color:#0A0F1C;padding:14px 24px;border-radius:8px;font-weight:700;text-decoration:none;font-size:16px;">Start Brand OS →</a>
  </p>

  <p style="font-size:14px;color:#666;">This link signs you in as <strong>${email}</strong>. It's valid for one use — if it expires, just request a new one from the login page.</p>

  <p style="font-size:14px;color:#666;margin-top:24px;">What you'll get when you finish:</p>
  <ul style="font-size:14px;color:#444;">
    <li>Your <strong>positioning line</strong> — refined past the generic "I help X go from Y to Z"</li>
    <li>Your <strong>voice DNA</strong> — vocab to use, vocab to never use, signature moves</li>
    <li>Your <strong>buyer mirror</strong> — one named avatar with body-state detail</li>
    <li>Your <strong>3 content pillars</strong> + 5 ready-to-draft hooks</li>
    <li>A portable <strong>.md file</strong> you can paste into ChatGPT / Claude / Gemini as brand context</li>
  </ul>

  <p style="font-size:13px;color:#999;margin-top:40px;border-top:1px solid #eee;padding-top:16px;">
    ElevateAI Systems · elevateaisystem.com<br>
    Reply to this email if you hit any snags.
  </p>
</body></html>`;
}

function welcomeEmailText(link: string): string {
  return `Your Brand OS is ready.

Thanks for grabbing it. Click below to start your run — about 30 minutes, one question at a time.

${link}

This link signs you in. Valid for one use.

What you'll get:
- Your positioning line (sharper than the generic version)
- Your voice DNA (vocab + signature moves)
- Your buyer mirror (named avatar)
- 3 content pillars + 5 ready-to-draft hooks
- A portable .md file for ChatGPT/Claude/Gemini

ElevateAI Systems · elevateaisystem.com`;
}
