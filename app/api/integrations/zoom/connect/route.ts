import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { signOAuthState } from "@/lib/oauth-state";

export const runtime = "edge";

const AUTH_URL = "https://zoom.us/oauth/authorize";
const SCOPES = [
  "user:read",
  "recording:read",
].join(" ");

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const origin = new URL(request.url).origin;
  if (!user) {
    return NextResponse.redirect(`${origin}/login?next=/settings`);
  }

  const clientId = process.env.ZOOM_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "ZOOM_CLIENT_ID not configured." },
      { status: 500 }
    );
  }

  const redirectUri = `${origin}/api/integrations/zoom/callback`;
  const state = await signOAuthState(user.id, "zoom");
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SCOPES,
  });

  return NextResponse.redirect(`${AUTH_URL}?${params.toString()}`);
}
