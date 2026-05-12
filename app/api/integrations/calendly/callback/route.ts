import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { verifyOAuthState } from "@/lib/oauth-state";

export const runtime = "edge";

const TOKEN_URL = "https://auth.calendly.com/oauth/token";
const ME_URL = "https://api.calendly.com/users/me";
const WEBHOOK_URL = "https://api.calendly.com/webhook_subscriptions";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { searchParams, origin } = new URL(request.url);
  const settingsUrl = `${origin}/settings`;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      `${settingsUrl}?calendly=error&reason=${encodeURIComponent(error ?? "missing_code")}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/settings`);
  }

  const stateOk = await verifyOAuthState(searchParams.get("state"), user.id, "calendly");
  if (!stateOk) {
    return NextResponse.redirect(`${settingsUrl}?calendly=error&reason=bad_state`);
  }

  const clientId = process.env.CALENDLY_CLIENT_ID;
  const clientSecret = process.env.CALENDLY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${settingsUrl}?calendly=error&reason=server_misconfigured`);
  }

  const redirectUri = `${origin}/api/integrations/calendly/callback`;
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
    return NextResponse.redirect(`${settingsUrl}?calendly=error&reason=token_exchange_failed`);
  }

  const token = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!token.access_token || !token.refresh_token) {
    return NextResponse.redirect(`${settingsUrl}?calendly=error&reason=missing_token`);
  }

  const meRes = await fetch(ME_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const me = meRes.ok ? await meRes.json() : {};
  const resource = me?.resource ?? {};
  const accountEmail = stringValue(resource.email);
  const userUri = stringValue(resource.uri);
  const organizationUri = stringValue(resource.current_organization);

  const webhookSubscription = userUri && organizationUri
    ? await createCalendlyWebhook({
        accessToken: token.access_token,
        callbackUrl: await ensureSessionWebhookUrl(supabase, user.id, origin),
        organizationUri,
        userUri,
      })
    : null;

  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;

  const { error: saveError } = await supabase
    .from("cp_coach_integrations")
    .upsert(
      {
        coach_id: user.id,
        provider: "calendly",
        account_email: accountEmail,
        refresh_token: token.refresh_token,
        access_token: token.access_token,
        access_token_expires_at: expiresAt,
        scopes: token.scope ?? "",
        status: "active",
        connected_at: new Date().toISOString(),
        metadata: {
          user_uri: userUri,
          organization_uri: organizationUri,
          webhook_subscription: webhookSubscription,
        },
      },
      { onConflict: "coach_id,provider" }
    );

  if (saveError) {
    return NextResponse.redirect(`${settingsUrl}?calendly=error&reason=save_failed`);
  }

  return NextResponse.redirect(`${settingsUrl}?calendly=connected`);
}

async function ensureSessionWebhookUrl(
  supabase: ReturnType<typeof createClient>,
  coachId: string,
  origin: string
) {
  const { data: existing } = await supabase
    .from("cp_session_webhook_endpoints")
    .select("*")
    .eq("coach_id", coachId)
    .eq("provider", "calendly")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const endpoint = existing ?? (await createSessionEndpoint(supabase, coachId, "calendly"));
  return `${origin}/api/v1/webhooks/sessions/calendly/${endpoint.token}`;
}

async function createSessionEndpoint(
  supabase: ReturnType<typeof createClient>,
  coachId: string,
  provider: "calendly"
) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const token = `sess_${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  const { data, error } = await supabase
    .from("cp_session_webhook_endpoints")
    .insert({
      coach_id: coachId,
      provider,
      token,
      name: "Calendly sessions",
      active: true,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create session webhook");
  return data as { token: string };
}

async function createCalendlyWebhook({
  accessToken,
  callbackUrl,
  organizationUri,
  userUri,
}: {
  accessToken: string;
  callbackUrl: string;
  organizationUri: string;
  userUri: string;
}) {
  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: callbackUrl,
      events: ["invitee.created", "invitee.canceled"],
      organization: organizationUri,
      user: userUri,
      scope: "user",
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: await response.text(),
    };
  }

  return {
    ok: true,
    data: await response.json(),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
