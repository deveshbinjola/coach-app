import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { signOAuthState } from "@/lib/oauth-state";

export const runtime = "edge";

const AUTH_URL = "https://auth.calendly.com/oauth/authorize";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const origin = new URL(request.url).origin;
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/settings`);
  }

  const clientId = process.env.CALENDLY_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "CALENDLY_CLIENT_ID not configured." },
      { status: 500 }
    );
  }

  const redirectUri = `${origin}/api/integrations/calendly/callback`;
  const state = await signOAuthState(user.id, "calendly");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
  });

  return NextResponse.redirect(`${AUTH_URL}?${params.toString()}`);
}
