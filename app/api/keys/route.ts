// /api/keys — manage API keys from the dashboard (cookie-authed).
//
// GET  → list this coach's keys (without exposing hashes)
// POST → create a new key. Returns the raw token EXACTLY ONCE; thereafter
//        only prefix + metadata. The coach is responsible for storing it.
//
// NOT to be confused with /api/v1/keys — that would be API-key-authed,
// which we don't support (you can't create keys via key auth, that's a
// privilege-escalation footgun).

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { generateApiKey } from "@/lib/api-auth";

export const runtime = 'edge';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // RLS scopes us to this coach's keys automatically.
  const { data, error } = await supabase
    .from("cp_api_keys")
    .select("id, name, key_prefix, scopes, last_used_at, revoked_at, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ keys: data ?? [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { name?: string; scopes?: string[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const name = (body.name ?? "").trim();
  if (!name || name.length > 100) {
    return new Response(
      JSON.stringify({ error: "name required (1–100 chars)" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Phase 11 — accept scopes from the client. Default to read+write so
  // existing callers don't break. Only "read" and "write" are valid.
  const requestedScopes = Array.isArray(body.scopes)
    ? body.scopes.filter((s): s is string => s === "read" || s === "write")
    : ["read", "write"];
  const scopes = requestedScopes.length > 0 ? requestedScopes : ["read", "write"];

  const { raw, hash, prefix } = await generateApiKey();

  // Use admin client because RLS would prevent inserting `key_hash` (and
  // we want to keep that column locked down at the policy layer too).
  // We're already proven-authenticated as `user`, so we set coach_id = user.id.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_api_keys")
    .insert({
      coach_id: user.id,
      name,
      key_prefix: prefix,
      key_hash: hash,
      scopes,
    })
    .select(
      "id, name, key_prefix, scopes, last_used_at, revoked_at, created_at"
    )
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ error: error?.message ?? "Insert failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // The raw key is returned ONCE in the create response. Coaches must save
  // it now — there's no way to recover it later (we only stored the hash).
  return new Response(
    JSON.stringify({
      key: data,
      raw, // <-- shown to coach exactly once
      warning:
        "Save this key now. We can't show it again. If you lose it, revoke and create a new one.",
    }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
}
