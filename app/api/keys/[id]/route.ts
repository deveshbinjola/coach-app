// /api/keys/[id] — revoke a key. We never DELETE rows so audit history is
// preserved; revoke = set revoked_at. The validator skips revoked keys.

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // RLS ensures the coach can only revoke their own keys (coach_id = auth.uid()).
  const { error } = await supabase
    .from("cp_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", params.id)
    .is("revoked_at", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, id: params.id }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
