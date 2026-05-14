// Shared auth resolver for Brand OS endpoints that support BOTH:
//   1. Real Supabase coach session (cookie-based)
//   2. Trial token (X-Trial-Token header OR ?trialToken query param)
//
// Endpoints just call resolveAuthOrTrial(request) and get { coachId,
// dbClient, isTrial } back, or a NextResponse to return immediately
// when auth fails.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyTrialToken } from "@/lib/brand-os/trial-token";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuthOrTrialResult =
  | {
      ok: true;
      coachId: string;
      dbClient: SupabaseClient;
      isTrial: boolean;
      userMetadata: Record<string, unknown>;
    }
  | { ok: false; response: NextResponse };

export async function resolveAuthOrTrial(request: NextRequest): Promise<AuthOrTrialResult> {
  // Check for trial token first — header (POST/PATCH) or query (GET).
  const headerToken = request.headers.get("x-trial-token");
  const queryToken = new URL(request.url).searchParams.get("trialToken");
  const trialToken = (headerToken ?? queryToken ?? "").trim();

  if (trialToken) {
    const verify = await verifyTrialToken(trialToken);
    if (!verify.ok) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Unauthorized", reason: verify.reason }, { status: 401 }),
      };
    }
    return {
      ok: true,
      coachId: verify.payload.coachId,
      dbClient: createAdminClient(),
      isTrial: true,
      userMetadata: {},
    };
  }

  // Fall back to standard Supabase session.
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return {
    ok: true,
    coachId: user.id,
    dbClient: supabase,
    isTrial: false,
    userMetadata: user.user_metadata ?? {},
  };
}
