// /api/integrations/gmail/connect — Phase 8 OAuth init.
//
// Coach clicks "Connect Gmail" → this route builds the Google OAuth
// authorization URL with the right scopes and redirects them to Google.
// After consent, Google redirects to /api/integrations/gmail/callback.
//
// We require the coach to already be authenticated (Supabase session) before
// initiating Gmail OAuth — that way the callback can write the tokens to
// the right cp_coach_integrations.coach_id without a separate identity
// hand-off.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = 'edge';

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

// Read-only at this stage. We DON'T request gmail.modify or gmail.send yet
// — those come in a later phase when Compose can send-via-Gmail. Keeping
// the scope minimal makes the consent screen less alarming and reduces
// blast radius if a token ever leaks.
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

// Plus the standard identity scopes so we can fetch the connected email
// (account_email column) for display purposes.
const SCOPES = ["openid", "email", "profile", GMAIL_SCOPE].join(" ");

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not signed in — bounce to login. After they sign in they can re-click.
    const origin = new URL(request.url).origin;
    return NextResponse.redirect(`${origin}/login?next=/settings`);
  }

  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "GOOGLE_GMAIL_CLIENT_ID not configured. Add it to coach-app env vars.",
      },
      { status: 500 }
    );
  }

  // Redirect URI must EXACTLY match one of the authorized URIs registered
  // in Google Cloud Console for this OAuth client. We derive it from the
  // current request origin so the same code works in dev (localhost) and
  // production (app.elevateaisystem.com).
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/gmail/callback`;

  // State = the coach's user.id signed lightly. We use it in the callback
  // to confirm the response came back to the same session — minimal CSRF
  // protection. (Supabase session cookie is the actual auth source of
  // truth; this state is belt-and-suspenders.)
  const state = encodeURIComponent(
    Buffer.from(`${user.id}:${Date.now()}`).toString("base64url")
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES,
    // offline + consent prompt → guarantees Google returns a refresh_token
    // every time. Without `prompt=consent`, returning users sometimes get
    // only an access_token, which breaks our long-lived sync model.
    access_type: "offline",
    prompt: "consent",
    state,
    // Optional: pre-fill the user's known email so the account picker
    // defaults to it. Reduces "wrong account connected" mistakes.
    login_hint: user.email ?? "",
    include_granted_scopes: "true",
  });

  return NextResponse.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}
