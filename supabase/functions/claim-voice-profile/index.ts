// Edge Function: claim-voice-profile
//
// Called once after a coach's first authenticated landing. Looks up a pending
// voice profile created by the public Find Your Voice magnet (matched by the
// coach's email) and activates it as their cp_voice_profiles row.
//
// Does NOT clobber an existing voice: if the coach already built one in-app,
// the pending row is marked claimed but not inserted.
//
// Auth: user JWT only.
// Output: { claimed: boolean, reason?: string, version?: number }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decideClaimAction, type PendingRow } from "../_shared/claim-voice.ts";

const ALLOWED_ORIGIN = Deno.env.get("APP_URL") || "https://app.elevateaisystem.com";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  try {
    const srkKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!srkKey) return json({ error: "Server misconfigured" }, 500);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, srkKey);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing Authorization header" }, 401);

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user?.email) return json({ error: "Invalid auth token" }, 401);

    // Find newest unclaimed pending profile for this email (case-insensitive).
    const { data: pendingRows } = await supabase
      .from("cp_pending_voice_profiles")
      .select("id, voice_json, sample_messages")
      .ilike("email", user.email)
      .is("claimed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const pending: PendingRow | null = pendingRows?.[0] ?? null;

    // Does the coach already have any voice profile?
    const { count } = await supabase
      .from("cp_voice_profiles")
      .select("id", { count: "exact", head: true })
      .eq("coach_id", user.id);
    const hasExistingVoiceProfile = (count ?? 0) > 0;

    const decision = decideClaimAction(hasExistingVoiceProfile, pending);

    if (decision.action === "none") {
      return json({ claimed: false, reason: "no_pending" });
    }

    if (decision.action === "mark_only") {
      await supabase
        .from("cp_pending_voice_profiles")
        .update({ claimed_at: new Date().toISOString(), claimed_by: user.id })
        .eq("id", pending!.id);
      return json({ claimed: false, reason: "already_has_voice" });
    }

    // action === "insert": activate the magnet voice as a new active version.
    const { data: latest } = await supabase
      .from("cp_voice_profiles")
      .select("version")
      .eq("coach_id", user.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (latest?.version ?? 0) + 1;

    await supabase
      .from("cp_voice_profiles")
      .update({ active: false })
      .eq("coach_id", user.id)
      .eq("active", true);

    const { error: insErr } = await supabase.from("cp_voice_profiles").insert({
      coach_id: user.id,
      voice_json: pending!.voice_json,
      sample_messages: pending!.sample_messages,
      version: nextVersion,
      active: true,
    });
    if (insErr) return json({ error: insErr.message }, 500);

    await supabase
      .from("cp_pending_voice_profiles")
      .update({ claimed_at: new Date().toISOString(), claimed_by: user.id })
      .eq("id", pending!.id);

    return json({ claimed: true, version: nextVersion });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
