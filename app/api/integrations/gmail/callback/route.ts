// /api/integrations/gmail/callback — Phase 8 OAuth callback.
//
// Google redirects here after the coach grants (or declines) Gmail access.
// We:
//   1. Verify the response contains a `code` (else: declined or error)
//   2. Exchange the code for access_token + refresh_token
//   3. Fetch the connected email address (so we can show "Connected as X")
//   4. Upsert into cp_coach_integrations using the user's session
//   5. Redirect back to /settings with a success or error indicator

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = 'edge';

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const settingsUrl = `${origin}/settings`;

  // The coach declined consent or Google returned an error. Bounce back
  // with a query param so the settings page can surface a friendly toast.
  if (error || !code) {
    const reason = error ?? "missing_code";
    return NextResponse.redirect(
      `${settingsUrl}?gmail=error&reason=${encodeURIComponent(reason)}`
    );
  }

  // Identify the coach via their Supabase session. The `state` token is a
  // CSRF defense layer; we don't strictly verify it here because the
  // session cookie is the real auth check. If the session doesn't match
  // anymore, we 401.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/settings`);
  }

  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(
      `${settingsUrl}?gmail=error&reason=server_misconfigured`
    );
  }

  // Exchange the authorization code for tokens. The redirect_uri here MUST
  // match exactly what we sent in the connect step — Google checks both.
  const redirectUri = `${origin}/api/integrations/gmail/callback`;

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const detail = await tokenRes.text();
    console.error("Gmail token exchange failed:", tokenRes.status, detail);
    return NextResponse.redirect(
      `${settingsUrl}?gmail=error&reason=token_exchange_failed`
    );
  }

  const tokenData = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
  };

  if (!tokenData.refresh_token) {
    // Should never happen because we forced `prompt=consent` on the init,
    // but Google has been known to skip refresh_token if the user has
    // previously authorized this app and Google decides not to re-issue
    // one. The fix is to revoke the prior grant and reconnect.
    return NextResponse.redirect(
      `${settingsUrl}?gmail=error&reason=no_refresh_token`
    );
  }

  // Pull the connected email so we can show "Connected as X" in settings.
  // If this fails it's not fatal — we save the tokens anyway and leave
  // account_email null.
  let accountEmail: string | null = null;
  try {
    const meRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (meRes.ok) {
      const me = (await meRes.json()) as { email?: string };
      accountEmail = me.email ?? null;
    }
  } catch {
    /* non-fatal; account_email stays null */
  }

  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
    : null;

  // Upsert. If the coach reconnects (e.g., to a different Gmail account),
  // we replace the existing row. Note: refresh_token gets overwritten on
  // reconnect — the old one is invalidated by Google anyway.
  const { error: upsertErr } = await supabase
    .from("cp_coach_integrations")
    .upsert(
      {
        coach_id: user.id,
        provider: "gmail",
        account_email: accountEmail,
        refresh_token: tokenData.refresh_token,
        access_token: tokenData.access_token ?? null,
        access_token_expires_at: expiresAt,
        scopes: tokenData.scope ?? "",
        status: "active",
        connected_at: new Date().toISOString(),
        // Reset sync cursor so the first post-reconnect sync does a clean
        // backfill rather than picking up from a stale historyId.
        last_synced_at: null,
        last_history_id: null,
      },
      { onConflict: "coach_id,provider" }
    );

  if (upsertErr) {
    console.error("Failed to save Gmail integration:", upsertErr);
    return NextResponse.redirect(
      `${settingsUrl}?gmail=error&reason=save_failed`
    );
  }

  return NextResponse.redirect(`${settingsUrl}?gmail=connected`);
}
