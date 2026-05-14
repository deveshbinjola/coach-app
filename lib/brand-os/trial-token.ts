// Trial token — URL-bearer credential for $7 Brand OS trip-wire buyers.
//
// We sign a small payload with HMAC-SHA256 using SECRETS_MASTER_KEY,
// base64url-encode it, and ship it in the URL path. Every /trial/[token]
// request decodes + verifies. No cookies, no Supabase auth, no domain
// dance — the URL IS the credential.
//
// Tokens are valid for 60 days by default. Long enough that the buyer can
// pick the run back up next week from any device just by clicking the
// link in their email. Short enough that an old leaked link doesn't haunt
// us forever.
//
// Payload shape:
//   { p: purchase_id, c: coach_id, e: expires_at_unix }
//
// If the SECRETS_MASTER_KEY rotates, all existing trial tokens become
// invalid — buyers would need a fresh link. The webhook can regenerate
// on demand from the cp_tripwire_purchases row.

const ENC_ALGO = "HMAC";
const HASH_ALGO = "SHA-256";
const DEFAULT_TTL_SECONDS = 60 * 24 * 60 * 60; // 60 days

export type TrialTokenPayload = {
  /** cp_tripwire_purchases.id */
  purchaseId: string;
  /** auth.users.id (the coach we created in provisionTripwireBuyer) */
  coachId: string;
  /** unix seconds when this token expires */
  expiresAt: number;
};

async function importKey(): Promise<CryptoKey> {
  const raw = process.env.SECRETS_MASTER_KEY;
  if (!raw) throw new Error("SECRETS_MASTER_KEY env var not set — cannot sign trial tokens.");
  const bytes = base64ToBytes(raw);
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(bytes),
    { name: ENC_ALGO, hash: HASH_ALGO },
    false,
    ["sign", "verify"],
  );
}

/** Sign a payload and return the URL-safe token string. */
export async function signTrialToken(input: {
  purchaseId: string;
  coachId: string;
  ttlSeconds?: number;
}): Promise<string> {
  const payload: TrialTokenPayload = {
    purchaseId: input.purchaseId,
    coachId: input.coachId,
    expiresAt: Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };
  const payloadJson = JSON.stringify({ p: payload.purchaseId, c: payload.coachId, e: payload.expiresAt });
  const payloadBytes = new TextEncoder().encode(payloadJson);
  const payloadB64 = bytesToBase64Url(payloadBytes);

  const key = await importKey();
  const sigBuf = await crypto.subtle.sign(ENC_ALGO, key, toArrayBuffer(payloadBytes));
  const sigB64 = bytesToBase64Url(new Uint8Array(sigBuf));

  return `${payloadB64}.${sigB64}`;
}

export type VerifyResult =
  | { ok: true; payload: TrialTokenPayload }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "no_master_key" };

/** Verify a token and return its payload, or a reason it's invalid. */
export async function verifyTrialToken(token: string): Promise<VerifyResult> {
  if (!process.env.SECRETS_MASTER_KEY) return { ok: false, reason: "no_master_key" };
  if (!token || typeof token !== "string") return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, sigB64] = parts;

  let payloadBytes: Uint8Array;
  let sigBytes: Uint8Array;
  try {
    payloadBytes = base64UrlToBytes(payloadB64);
    sigBytes = base64UrlToBytes(sigB64);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const key = await importKey();
  const valid = await crypto.subtle.verify(
    ENC_ALGO,
    key,
    toArrayBuffer(sigBytes),
    toArrayBuffer(payloadBytes),
  );
  if (!valid) return { ok: false, reason: "bad_signature" };

  let raw: { p?: string; c?: string; e?: number };
  try {
    raw = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!raw.p || !raw.c || !raw.e) return { ok: false, reason: "malformed" };
  if (raw.e < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };

  return {
    ok: true,
    payload: { purchaseId: raw.p, coachId: raw.c, expiresAt: raw.e },
  };
}

// ── base64url helpers (edge-safe) ─────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice(0, (4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}
