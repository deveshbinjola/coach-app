// POST /api/billing/brand-os-tripwire/checkout
//
// Public endpoint (no auth) — creates a Stripe Checkout Session for the
// $7 Brand OS trip-wire. Marketing site at elevateaisystem.com/brand-os
// POSTs here. We return the Checkout URL and let the browser redirect.
//
// Body: { email?: string, utm_source?, utm_medium?, utm_campaign? }
// All fields optional — Stripe collects email if we don't pass one.
//
// On success, Stripe redirects to:
//   success_url = app.elevateaisystem.com/brand-os/trial/welcome?session_id={CHECKOUT_SESSION_ID}
//   cancel_url  = elevateaisystem.com/brand-os?canceled=1

import { NextResponse, type NextRequest } from "next/server";

export const runtime = "edge";

const TRIPWIRE_PRICE_CENTS = 700; // $7.00
const STRIPE_API = "https://api.stripe.com/v1/checkout/sessions";

// CORS: marketing site (elevateaisystem.com) POSTs from a different origin.
const ALLOWED_ORIGINS = [
  "https://elevateaisystem.com",
  "https://www.elevateaisystem.com",
  "http://localhost:3000",
  "http://localhost:8788",
];
function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

export async function POST(request: NextRequest) {
  const cors = corsHeaders(request.headers.get("origin"));
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({
      error: "stripe_not_configured",
      message: "STRIPE_SECRET_KEY not set on the platform.",
    }, { status: 503, headers: cors });
  }

  let body: { email?: string; utm_source?: string; utm_medium?: string; utm_campaign?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const email = (body.email ?? "").trim().toLowerCase() || undefined;

  // Build form-encoded body for Stripe REST API (no SDK at the edge).
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("payment_method_types[0]", "card");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][product_data][name]", "Brand OS — Quick Start");
  params.set("line_items[0][price_data][product_data][description]", "AI-guided brand discovery. 13 questions, voice DNA + pillars + buyer mirror + 5 ready-to-draft content angles. Yours forever.");
  params.set("line_items[0][price_data][unit_amount]", String(TRIPWIRE_PRICE_CENTS));
  params.set("line_items[0][quantity]", "1");

  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.elevateaisystem.com";
  const baseMarketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://elevateaisystem.com";
  params.set("success_url", `${baseAppUrl}/brand-os/trial/welcome?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url",  `${baseMarketingUrl}/brand-os?canceled=1`);

  // Email pre-fill (optional).
  if (email) params.set("customer_email", email);

  // Metadata for the webhook to dedupe + attribute.
  params.set("metadata[product]", "brand_os_mvp_tripwire");
  if (body.utm_source)   params.set("metadata[utm_source]",   body.utm_source.slice(0, 100));
  if (body.utm_medium)   params.set("metadata[utm_medium]",   body.utm_medium.slice(0, 100));
  if (body.utm_campaign) params.set("metadata[utm_campaign]", body.utm_campaign.slice(0, 100));

  // Allow promo codes — helpful for cohort referrals / podcast guests.
  params.set("allow_promotion_codes", "true");

  const res = await fetch(STRIPE_API, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json({
      error: "stripe_checkout_failed",
      detail: detail.slice(0, 500),
    }, { status: 502, headers: cors });
  }

  const session = await res.json() as { id: string; url: string };
  return NextResponse.json({ url: session.url, session_id: session.id }, { headers: cors });
}
