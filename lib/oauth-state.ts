const STATE_SECRET_FALLBACK = "coach-platform-oauth-state";

export async function signOAuthState(userId: string, provider: string) {
  const payload = {
    user_id: userId,
    provider,
    issued_at: Date.now(),
    nonce: crypto.randomUUID(),
  };
  const body = toBase64Url(JSON.stringify(payload));
  const signature = await hmac(body);
  return `${body}.${signature}`;
}

export async function verifyOAuthState(
  state: string | null,
  expectedUserId: string,
  expectedProvider: string
) {
  if (!state) return false;
  const [body, signature] = state.split(".");
  if (!body || !signature) return false;
  const expected = await hmac(body);
  if (expected !== signature) return false;

  let payload: { user_id?: string; provider?: string; issued_at?: number };
  try {
    payload = JSON.parse(fromBase64Url(body));
  } catch {
    return false;
  }

  const ageMs = Date.now() - Number(payload.issued_at ?? 0);
  return (
    payload.user_id === expectedUserId &&
    payload.provider === expectedProvider &&
    Number.isFinite(ageMs) &&
    ageMs >= 0 &&
    ageMs < 15 * 60 * 1000
  );
}

async function hmac(body: string) {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || STATE_SECRET_FALLBACK;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}
