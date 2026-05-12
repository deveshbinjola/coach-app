import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

const CAL_API_BASE = "https://api.cal.com/v2";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { apiKey?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return NextResponse.json({ error: "Cal.com API key required" }, { status: 400 });
  }

  const me = await fetch(`${CAL_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!me.ok) {
    return NextResponse.json({ error: "Cal.com key could not be verified" }, { status: 400 });
  }

  const profile = await me.json().catch(() => ({}));
  const email =
    stringValue(profile?.data?.email) ||
    stringValue(profile?.email) ||
    stringValue(profile?.data?.username) ||
    null;

  const { error } = await supabase
    .from("cp_coach_integrations")
    .upsert(
      {
        coach_id: user.id,
        provider: "cal_com",
        account_email: email,
        refresh_token: apiKey,
        access_token: apiKey,
        access_token_expires_at: null,
        scopes: "api_key",
        status: "active",
        connected_at: new Date().toISOString(),
        metadata: profile?.data ? { profile: profile.data } : {},
      },
      { onConflict: "coach_id,provider" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, account_email: email });
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
