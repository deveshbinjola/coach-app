import { createAdminClient } from "@/lib/supabase-admin";

type IntegrationToken = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

export async function getFreshZoomAccessToken(coachId: string) {
  return getFreshOAuthAccessToken({
    coachId,
    provider: "zoom",
    tokenUrl: "https://zoom.us/oauth/token",
    clientId: process.env.ZOOM_CLIENT_ID,
    clientSecret: process.env.ZOOM_CLIENT_SECRET,
  });
}

export async function getFreshCalendlyAccessToken(coachId: string) {
  return getFreshOAuthAccessToken({
    coachId,
    provider: "calendly",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    clientId: process.env.CALENDLY_CLIENT_ID,
    clientSecret: process.env.CALENDLY_CLIENT_SECRET,
  });
}

async function getFreshOAuthAccessToken({
  coachId,
  provider,
  tokenUrl,
  clientId,
  clientSecret,
}: {
  coachId: string;
  provider: "calendly" | "zoom";
  tokenUrl: string;
  clientId?: string;
  clientSecret?: string;
}) {
  const admin = createAdminClient();
  const { data: integration } = await admin
    .from("cp_coach_integrations")
    .select("*")
    .eq("coach_id", coachId)
    .eq("provider", provider)
    .eq("status", "active")
    .maybeSingle();

  if (!integration?.refresh_token) return null;

  const expiresAt = integration.access_token_expires_at
    ? new Date(integration.access_token_expires_at).getTime()
    : 0;
  if (integration.access_token && expiresAt > Date.now() + 60_000) {
    return integration.access_token as string;
  }

  if (!clientId || !clientSecret) return null;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: integration.refresh_token,
    }),
  });

  if (!response.ok) {
    await admin
      .from("cp_coach_integrations")
      .update({ status: "revoked" })
      .eq("id", integration.id);
    return null;
  }

  const token = (await response.json()) as IntegrationToken;
  const expires = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;

  await admin
    .from("cp_coach_integrations")
    .update({
      access_token: token.access_token,
      refresh_token: token.refresh_token ?? integration.refresh_token,
      access_token_expires_at: expires,
      scopes: token.scope ?? integration.scopes ?? "",
      status: "active",
    })
    .eq("id", integration.id);

  return token.access_token;
}
