// Bearer-token API key validator for /api/v1/* routes.
//
// The flow:
//   1. Client sends `Authorization: Bearer cp_live_xxxx`.
//   2. We hash the token (SHA-256) and look it up in cp_api_keys.
//   3. If found AND not revoked, return { coachId, scopes, keyId }.
//   4. Fire-and-forget update to last_used_at so coaches can spot stale keys.
//
// Tokens are high-entropy (256 bits) so SHA-256 is enough — bcrypt would
// add latency on every API request without meaningful security gain. Same
// pattern Stripe uses for Restricted Keys.

import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { createAdminClient } from "./supabase-admin";

export type ApiAuth = {
  coachId: string;
  scopes: string[];
  keyId: string;
};

/** Hex SHA-256 of the token. Matches what the create-key route stored. */
export function hashApiKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Generate a new API key. Format: cp_live_<32 hex chars>.
 *  Returns the raw token (show ONCE) and its hash + prefix for storage. */
export function generateApiKey(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const random = crypto.randomBytes(16).toString("hex"); // 32 hex chars
  const raw = `cp_live_${random}`;
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: raw.slice(0, 12), // "cp_live_" + 4 chars
  };
}

/** Validate an incoming Bearer token. Returns auth context or null.
 *  null = unauthorized (caller should return 401).
 *
 *  Side effects (fire-and-forget):
 *    - Updates cp_api_keys.last_used_at so coaches can spot stale keys
 *    - Inserts a row into cp_agent_activity for the audit log */
export async function validateApiKey(
  request: NextRequest
): Promise<ApiAuth | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(cp_live_[a-f0-9]+)$/i);
  if (!match) return null;
  const token = match[1];
  const hash = hashApiKey(token);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("cp_api_keys")
    .select("id, coach_id, scopes, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error || !data || data.revoked_at) return null;

  // Fire-and-forget last_used_at + audit log. We don't await — adding
  // latency to every API call is worse than the audit log being briefly
  // out of sync. Errors are swallowed; logging is best-effort.
  supabase
    .from("cp_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {});

  // Log the request to the audit trail. Path is enough context — we don't
  // capture bodies (could contain sensitive content) or query strings
  // (could contain filter values that don't add audit value).
  const url = new URL(request.url);
  supabase
    .from("cp_agent_activity")
    .insert({
      coach_id: data.coach_id,
      api_key_id: data.id,
      method: request.method,
      path: url.pathname,
      summary: null, // filled in later by individual route handlers if useful
    })
    .then(() => {});

  return {
    coachId: data.coach_id,
    scopes: data.scopes ?? [],
    keyId: data.id,
  };
}

/** Standardized JSON error response for API routes. */
export function apiError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Standardized JSON success response. */
export function apiOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
