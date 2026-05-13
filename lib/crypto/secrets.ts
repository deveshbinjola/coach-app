// AES-GCM secret encryption for BYOK-style integrations.
//
// Designed for the Cloudflare Workers / Edge runtime — uses Web Crypto only,
// no Node primitives. Master key is provided via env (SECRETS_MASTER_KEY)
// as a base64-encoded 32-byte value. Each secret gets a fresh 12-byte IV.
//
// Storage convention: ciphertext_b64 + iv_b64 stored in two separate
// columns. The plaintext never persists. The master key never persists in
// the database — it lives in env, rotatable independently.

const ENC_ALGO = "AES-GCM";

/** Lazy-load the master key. Throws a clear error if unset so route
 *  handlers can surface a 500 without leaking implementation details. */
async function importMasterKey(): Promise<CryptoKey> {
  const raw = process.env.SECRETS_MASTER_KEY;
  if (!raw) {
    throw new Error("SECRETS_MASTER_KEY env var not set — cannot encrypt/decrypt secrets.");
  }
  const bytes = base64ToBytes(raw);
  if (bytes.length !== 32) {
    throw new Error(`SECRETS_MASTER_KEY must decode to 32 bytes (got ${bytes.length}).`);
  }
  return crypto.subtle.importKey("raw", toArrayBuffer(bytes), ENC_ALGO, false, ["encrypt", "decrypt"]);
}

export type EncryptedSecret = { ciphertext_b64: string; iv_b64: string };

export async function encryptSecret(plaintext: string): Promise<EncryptedSecret> {
  const key = await importMasterKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: ENC_ALGO, iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plain),
  );
  return {
    ciphertext_b64: bytesToBase64(new Uint8Array(cipherBuf)),
    iv_b64: bytesToBase64(iv),
  };
}

export async function decryptSecret(secret: EncryptedSecret): Promise<string> {
  const key = await importMasterKey();
  const iv = base64ToBytes(secret.iv_b64);
  const cipher = base64ToBytes(secret.ciphertext_b64);
  const plainBuf = await crypto.subtle.decrypt(
    { name: ENC_ALGO, iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(cipher),
  );
  return new TextDecoder().decode(plainBuf);
}

/** Copy a Uint8Array's bytes into a fresh ArrayBuffer. Cloudflare Workers'
 *  Web Crypto types insist on `ArrayBuffer` (not `ArrayBufferLike`) — this
 *  is the narrowest, safest workaround. */
function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}

/** Returns the last `n` chars of the input — used to display a safe
 *  fingerprint in /settings ("…lf2A") without exposing the full key. */
export function last4(s: string): string {
  if (!s) return "";
  return s.slice(-4);
}

// ── base64 helpers (edge-compatible) ──────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
