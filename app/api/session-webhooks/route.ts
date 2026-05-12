// /api/session-webhooks, manage session integration endpoints.
//
// Coaches paste these URLs into Cal.com, Calendly, or Zoom. Incoming events
// land in Client Rooms when the attendee email matches a client lead.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";

const PROVIDERS = ["cal_com", "calendly", "zoom"] as const;

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const [endpointsRes, integrationsRes] = await Promise.all([
    supabase
      .from("cp_session_webhook_endpoints")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("cp_coach_integrations")
      .select("id, provider, account_email, status, connected_at, updated_at, metadata")
      .in("provider", ["cal_com", "calendly", "zoom", "granola"]),
  ]);

  if (endpointsRes.error) {
    return NextResponse.json({ error: endpointsRes.error.message }, { status: 500 });
  }

  if (integrationsRes.error) {
    return NextResponse.json({ error: integrationsRes.error.message }, { status: 500 });
  }

  return NextResponse.json({
    endpoints: endpointsRes.data ?? [],
    integrations: integrationsRes.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { provider?: unknown; name?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = PROVIDERS.find((item) => item === body.provider);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const name = typeof body.name === "string" && body.name.trim()
    ? body.name.trim().slice(0, 100)
    : defaultName(provider);

  const tokenBytes = new Uint8Array(16);
  crypto.getRandomValues(tokenBytes);
  const token = `sess_${Array.from(tokenBytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_session_webhook_endpoints")
    .insert({
      coach_id: user.id,
      provider,
      token,
      name,
      active: true,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ endpoint: data }, { status: 201 });
}

function defaultName(provider: (typeof PROVIDERS)[number]) {
  if (provider === "cal_com") return "Cal.com bookings";
  if (provider === "calendly") return "Calendly bookings";
  return "Zoom recordings";
}
