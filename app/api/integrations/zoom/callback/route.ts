import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { verifyOAuthState } from "@/lib/oauth-state";

export const runtime = "edge";

const TOKEN_URL = "https://zoom.us/oauth/token";
const ME_URL = "https://api.zoom.us/v2/users/me";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { searchParams, origin } = new URL(request.url);
  const settingsUrl = `${origin}/settings`;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${settingsUrl}?zoom=error&reason=${encodeURIComponent(error ?? "missing_code")}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/settings`);
  }

  const stateOk = await verifyOAuthState(searchParams.get("state"), user.id, "zoom");
  if (!stateOk) {
    return NextResponse.redirect(`${settingsUrl}?zoom=error&reason=bad_state`);
  }

  const clientId = process.env.ZOOM_CLIENT_ID;
  const clientSecret = process.env.ZOOM_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${settingsUrl}?zoom=error&reason=server_misconfigured`);
  }

  const redirectUri = `${origin}/api/integrations/zoom/callback`;
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    return NextResponse.redirect(`${settingsUrl}?zoom=error&reason=token_exchange_failed`);
  }

  const token = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!token.access_token || !token.refresh_token) {
    return NextResponse.redirect(`${settingsUrl}?zoom=error&reason=missing_token`);
  }

  const meRes = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const me = meRes.ok ? await meRes.json() : {};
  const accountEmail = stringValue(me.email);
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;

  const { error: saveError } = await supabase
    .from("cp_coach_integrations")
    .upsert(
      {
        coach_id: user.id,
        provider: "zoom",
        account_email: accountEmail,
        refresh_token: token.refresh_token,
        access_token: token.access_token,
        access_token_expires_at: expiresAt,
        scopes: token.scope ?? "",
        status: "active",
        connected_at: new Date().toISOString(),
        metadata: {
          zoom_user_id: stringValue(me.id),
          first_name: stringValue(me.first_name),
          last_name: stringValue(me.last_name),
        },
      },
      { onConflict: "coach_id,provider" }
    );

  if (saveError) {
    return NextResponse.redirect(`${settingsUrl}?zoom=error&reason=save_failed`);
  }

  return NextResponse.redirect(`${settingsUrl}?zoom=connected`);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
