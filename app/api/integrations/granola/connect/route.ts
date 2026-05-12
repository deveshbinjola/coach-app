import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

const GRANOLA_API_BASE = "https://public-api.granola.ai/v1";

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
    return NextResponse.json({ error: "Granola API key required" }, { status: 400 });
  }

  const verify = await fetch(`${GRANOLA_API_BASE}/notes?page_size=1`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!verify.ok) {
    return NextResponse.json({ error: "Granola key could not be verified" }, { status: 400 });
  }

  const preview = await verify.json().catch(() => ({}));
  const { error } = await supabase
    .from("cp_coach_integrations")
    .upsert(
      {
        coach_id: user.id,
        provider: "granola",
        account_email: null,
        refresh_token: apiKey,
        access_token: apiKey,
        access_token_expires_at: null,
        scopes: "api_key",
        status: "active",
        connected_at: new Date().toISOString(),
        metadata: { preview_count: countPreviewNotes(preview) },
      },
      { onConflict: "coach_id,provider" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function countPreviewNotes(value: unknown) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object" && Array.isArray((value as { notes?: unknown }).notes)) {
    return (value as { notes: unknown[] }).notes.length;
  }
  if (value && typeof value === "object" && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: unknown[] }).data.length;
  }
  return 0;
}
