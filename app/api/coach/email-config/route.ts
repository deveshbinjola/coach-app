// /api/coach/email-config — manage a coach's BYOK Resend configuration.
//
// GET    → return current status (never the key itself; just last4 + flags)
// POST   → connect (encrypt + store key, validate via /domains)
// PATCH  → update from_email / from_name / verified_domain choice
// DELETE → disconnect (clear all resend_* columns; falls back to platform)
//
// Every write also stamps resend_connected_at / resend_last_verified_at.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { encryptSecret, decryptSecret, last4 } from "@/lib/crypto/secrets";

export const runtime = "edge";

type CoachEmailConfigStatus = {
  connected: boolean;
  source: "coach" | "platform" | "none";
  api_key_last4: string | null;
  from_email: string | null;
  from_name: string | null;
  verified_domain: string | null;
  connected_at: string | null;
  last_verified_at: string | null;
  available_domains: string[];
  /** True iff platform RESEND_API_KEY is set — drives the "fallback active" hint. */
  platform_fallback_available: boolean;
};

// ── GET — read status ─────────────────────────────────────

export async function GET(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: settings } = await supabase
    .from("cp_coach_settings")
    .select(`
      resend_api_key_ciphertext,
      resend_api_key_iv,
      resend_api_key_last4,
      resend_from_email,
      resend_from_name,
      resend_verified_domain,
      resend_connected_at,
      resend_last_verified_at
    `)
    .eq("coach_id", user.id)
    .maybeSingle();

  const connected = Boolean(settings?.resend_api_key_ciphertext && settings?.resend_api_key_iv);
  const platformAvailable = Boolean(process.env.RESEND_API_KEY);

  // If connected, pull live domain list from Resend for the picker.
  let available_domains: string[] = [];
  if (connected && settings) {
    try {
      const apiKey = await decryptSecret({
        ciphertext_b64: settings.resend_api_key_ciphertext as string,
        iv_b64: settings.resend_api_key_iv as string,
      });
      available_domains = await fetchVerifiedDomains(apiKey);
    } catch (err) {
      // Don't block status read on a Resend hiccup — just return empty list.
      console.error("[email-config GET] domain fetch failed:", err);
    }
  }

  const status: CoachEmailConfigStatus = {
    connected,
    source: connected ? "coach" : (platformAvailable ? "platform" : "none"),
    api_key_last4: (settings?.resend_api_key_last4 as string | null) ?? null,
    from_email: (settings?.resend_from_email as string | null) ?? null,
    from_name: (settings?.resend_from_name as string | null) ?? null,
    verified_domain: (settings?.resend_verified_domain as string | null) ?? null,
    connected_at: (settings?.resend_connected_at as string | null) ?? null,
    last_verified_at: (settings?.resend_last_verified_at as string | null) ?? null,
    available_domains,
    platform_fallback_available: platformAvailable,
  };
  return NextResponse.json(status);
}

// ── POST — connect (encrypt + validate key) ───────────────

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { api_key?: string; from_email?: string; from_name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const apiKey = (body.api_key ?? "").trim();
  const fromEmail = (body.from_email ?? "").trim().toLowerCase();
  const fromName = (body.from_name ?? "").trim();

  if (!apiKey || !apiKey.startsWith("re_")) {
    return NextResponse.json({ error: "API key must start with 're_' — paste your Resend key." }, { status: 400 });
  }
  if (!fromEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
    return NextResponse.json({ error: "Valid from_email required." }, { status: 400 });
  }

  // Validate the key against Resend by fetching domains. Anything 2xx
  // means the key is real. Non-2xx → reject so we never store a bad key.
  let domains: string[];
  try {
    domains = await fetchVerifiedDomains(apiKey);
  } catch (err) {
    return NextResponse.json({
      error: "Resend rejected this key. Double-check it and try again.",
      detail: err instanceof Error ? err.message.slice(0, 200) : undefined,
    }, { status: 400 });
  }

  // Validate the chosen from_email's domain matches a verified domain.
  // Resend will refuse sends from un-verified domains anyway, but we want
  // to fail fast in the UI with a useful message.
  const domain = fromEmail.split("@")[1];
  const domainVerified = domains.includes(domain);
  if (!domainVerified) {
    return NextResponse.json({
      error: `Your Resend account doesn't have '${domain}' verified.`,
      hint: domains.length
        ? `Verified on this key: ${domains.join(", ")}. Pick a from_email on one of those, or verify '${domain}' in your Resend dashboard first.`
        : "No domains verified on this key yet. Go to resend.com/domains and verify your sending domain first.",
    }, { status: 400 });
  }

  // Encrypt + persist.
  let encrypted;
  try {
    encrypted = await encryptSecret(apiKey);
  } catch (err) {
    return NextResponse.json({
      error: "Server can't encrypt secrets — SECRETS_MASTER_KEY env var not configured.",
      detail: err instanceof Error ? err.message : undefined,
    }, { status: 500 });
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("cp_coach_settings")
    .upsert({
      coach_id: user.id,
      resend_api_key_ciphertext: encrypted.ciphertext_b64,
      resend_api_key_iv: encrypted.iv_b64,
      resend_api_key_last4: last4(apiKey),
      resend_from_email: fromEmail,
      resend_from_name: fromName || null,
      resend_verified_domain: domain,
      resend_connected_at: now,
      resend_last_verified_at: now,
      updated_at: now,
    }, { onConflict: "coach_id" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    connected: true,
    api_key_last4: last4(apiKey),
    verified_domain: domain,
    available_domains: domains,
    from_email: fromEmail,
    from_name: fromName || null,
  });
}

// ── PATCH — change from_email / from_name without re-pasting key ──

export async function PATCH(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { from_email?: string; from_name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  // Load current settings — need to verify the new from_email is on a
  // verified domain.
  const { data: settings } = await supabase
    .from("cp_coach_settings")
    .select("resend_api_key_ciphertext, resend_api_key_iv")
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!settings?.resend_api_key_ciphertext) {
    return NextResponse.json({ error: "Not connected — POST a key first." }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.from_email !== undefined) {
    const fromEmail = body.from_email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromEmail)) {
      return NextResponse.json({ error: "Invalid from_email." }, { status: 400 });
    }
    const apiKey = await decryptSecret({
      ciphertext_b64: settings.resend_api_key_ciphertext as string,
      iv_b64: settings.resend_api_key_iv as string,
    });
    const domains = await fetchVerifiedDomains(apiKey);
    const domain = fromEmail.split("@")[1];
    if (!domains.includes(domain)) {
      return NextResponse.json({ error: `'${domain}' isn't verified on your Resend account.` }, { status: 400 });
    }
    patch.resend_from_email = fromEmail;
    patch.resend_verified_domain = domain;
    patch.resend_last_verified_at = new Date().toISOString();
  }
  if (body.from_name !== undefined) {
    patch.resend_from_name = body.from_name.trim() || null;
  }

  const { error: upErr } = await supabase
    .from("cp_coach_settings")
    .update(patch)
    .eq("coach_id", user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

// ── DELETE — disconnect ───────────────────────────────────

export async function DELETE(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("cp_coach_settings")
    .update({
      resend_api_key_ciphertext: null,
      resend_api_key_iv: null,
      resend_api_key_last4: null,
      resend_from_email: null,
      resend_from_name: null,
      resend_verified_domain: null,
      resend_connected_at: null,
      resend_last_verified_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("coach_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, disconnected: true });
}

// ── helpers ────────────────────────────────────────────────

async function fetchVerifiedDomains(apiKey: string): Promise<string[]> {
  const res = await fetch("https://api.resend.com/domains", {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend /domains ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json() as { data?: Array<{ name?: string; status?: string }> };
  return (data.data ?? [])
    .filter((d) => d.status === "verified")
    .map((d) => (d.name ?? "").toLowerCase())
    .filter((n) => n.length > 0);
}

export type { CoachEmailConfigStatus };
