// /api/webhooks — manage inbound webhook endpoints from the dashboard.
// Cookie-authed. NOT to be confused with /api/v1/webhooks/leads/[token]
// which is the public endpoint that RECEIVES webhook calls.
//
// GET  → list this coach's endpoints
// POST → create a new endpoint with a fresh random token

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = 'edge';

const SOURCES = [
  "ig",
  "linkedin",
  "referral",
  "quiz",
  "in_person",
  "podcast",
  "newsletter",
  "other",
] as const;

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

  // RLS scopes us to this coach's endpoints automatically.
  const { data, error } = await supabase
    .from("cp_webhook_endpoints")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ endpoints: data ?? [] }), {
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

  let body: {
    name?: string;
    default_source?: string;
    default_source_detail?: string | null;
  };
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
  const default_source =
    typeof body.default_source === "string" &&
    SOURCES.includes(body.default_source as any)
      ? body.default_source
      : "other";
  const default_source_detail =
    typeof body.default_source_detail === "string" &&
    body.default_source_detail.trim().length > 0
      ? body.default_source_detail.trim().slice(0, 200)
      : null;

  // Generate token: "whk_" prefix + 32 hex chars = 256 bits of entropy.
  // Same shape and security level as our cp_live_ keys.
  // Web Crypto (edge-compatible) replacement for node:crypto.randomBytes(16).toString("hex")
  const tokenBytes = new Uint8Array(16);
  crypto.getRandomValues(tokenBytes);
  const token = `whk_${Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("")}`;

  // Use admin client so we control the inserted row exactly. RLS would
  // also allow this insert, but admin is consistent with /api/keys.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_webhook_endpoints")
    .insert({
      coach_id: user.id,
      token,
      name,
      default_source,
      default_source_detail,
      active: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    return new Response(
      JSON.stringify({ error: error?.message ?? "Insert failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ endpoint: data }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
