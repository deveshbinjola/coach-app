// POST /api/billing/brand-os-tripwire/webhook
//
// Stripe webhook backup for the $7 Brand OS trip-wire.
//
// In the HAPPY PATH, the buyer is provisioned synchronously by the
// /brand-os/trial/welcome server component (Stripe success redirect).
// This webhook fires async — usually a few seconds later — and serves
// as a SAFETY NET for cases where the buyer's browser didn't follow
// the redirect (crashed, closed, network blip). Idempotent.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { provisionTripwireBuyer, type StripeSessionForProvision } from "@/lib/brand-os/tripwire-provision";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not set" }, { status: 503 });
  }
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const rawBody = await request.text();

  const verified = await verifyStripeSignature(rawBody, sig, secret);
  if (!verified) return NextResponse.json({ error: "invalid signature" }, { status: 400 });

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as unknown as StripeSessionForProvision;
  const admin = createAdminClient();
  const result = await provisionTripwireBuyer(admin, session);

  if (!result.ok) {
    return NextResponse.json({
      received: true,
      provisioned: false,
      reason: result.error,
      detail: result.detail,
    });
  }
  return NextResponse.json({
    received: true,
    provisioned: true,
    new_user: result.newUser,
    email_sent: result.emailSent,
  });
}

// ── Stripe signature verification ─────────────────────────

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0) return false;

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
