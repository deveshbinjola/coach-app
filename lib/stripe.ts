// Edge-compatible Stripe helpers (fetch-based, no Node SDK).
//
// Cloudflare Pages requires runtime = 'edge' on every route.
// The official Stripe SDK depends on Node.js APIs, so we call
// the Stripe REST API directly with fetch.

const STRIPE_API = "https://api.stripe.com/v1";

function secretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return key;
}

function headers(connectedAccountId?: string): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${secretKey()}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (connectedAccountId) h["Stripe-Account"] = connectedAccountId;
  return h;
}

function toForm(obj: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object" && !Array.isArray(v)) {
      parts.push(toForm(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object") {
          parts.push(toForm(item as Record<string, unknown>, `${key}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function post<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
  connectedAccountId?: string,
): Promise<T> {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: headers(connectedAccountId),
    body: toForm(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data as T;
}

async function get<T = Record<string, unknown>>(
  path: string,
  connectedAccountId?: string,
): Promise<T> {
  const h = headers(connectedAccountId);
  delete h["Content-Type"];
  const res = await fetch(`${STRIPE_API}${path}`, { headers: h });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe error ${res.status}`);
  return data as T;
}

// ── Accounts ──────────────────────────────────────────────

interface StripeAccount {
  id: string;
  email?: string;
  livemode?: boolean;
  details_submitted?: boolean;
  charges_enabled?: boolean;
  business_profile?: { name?: string };
}

export async function createAccount(params: {
  type: string;
  email?: string;
  metadata?: Record<string, string>;
}): Promise<StripeAccount> {
  return post<StripeAccount>("/accounts", params);
}

export async function retrieveAccount(id: string): Promise<StripeAccount> {
  return get<StripeAccount>(`/accounts/${id}`);
}

// ── Account Links ─────────────────────────────────────────

export async function createAccountLink(params: {
  account: string;
  refresh_url: string;
  return_url: string;
  type: string;
}): Promise<{ url: string }> {
  return post("/account_links", params);
}

// ── Prices ────────────────────────────────────────────────

export async function createPrice(
  params: {
    unit_amount: number;
    currency: string;
    product_data: { name: string; metadata?: Record<string, string> };
  },
  connectedAccountId: string,
): Promise<{ id: string }> {
  return post("/prices", params, connectedAccountId);
}

// ── Payment Links ─────────────────────────────────────────

export async function createPaymentLink(
  params: {
    line_items: Array<{ price: string; quantity: number }>;
    after_completion?: {
      type: string;
      redirect?: { url: string };
    };
    metadata?: Record<string, string>;
  },
  connectedAccountId: string,
): Promise<{ id: string; url: string }> {
  return post("/payment_links", params, connectedAccountId);
}

// ── Webhook Verification (Web Crypto) ─────────────────────

export async function verifyWebhookSignature(
  payload: string,
  sigHeader: string,
  secret: string,
): Promise<Record<string, unknown>> {
  const parts = sigHeader.split(",").reduce(
    (acc, part) => {
      const [k, v] = part.split("=");
      if (k === "t") acc.timestamp = v;
      if (k === "v1") acc.signatures.push(v);
      return acc;
    },
    { timestamp: "", signatures: [] as string[] },
  );

  if (!parts.timestamp || parts.signatures.length === 0) {
    throw new Error("Invalid Stripe signature header");
  }

  const signedPayload = `${parts.timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (!parts.signatures.includes(expected)) {
    throw new Error("Webhook signature verification failed");
  }

  const tolerance = 300;
  const now = Math.floor(Date.now() / 1000);
  if (now - parseInt(parts.timestamp, 10) > tolerance) {
    throw new Error("Webhook timestamp too old");
  }

  return JSON.parse(payload);
}
