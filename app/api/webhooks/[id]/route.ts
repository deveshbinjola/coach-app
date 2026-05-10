// PATCH /api/webhooks/[id]  — toggle active status (revoke / re-enable)
// DELETE /api/webhooks/[id] — alias for setting active=false (preserves audit)

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = 'edge';

export async function PATCH(
  request: NextRequest,
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

  let body: { active?: boolean };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (typeof body.active !== "boolean") {
    return new Response(JSON.stringify({ error: "active (boolean) required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase
    .from("cp_webhook_endpoints")
    .update({ active: body.active })
    .eq("id", params.id);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

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

  // Soft-revoke (set active=false) — preserves audit trail. Coaches who
  // want a hard delete can do it via SQL editor.
  const { error } = await supabase
    .from("cp_webhook_endpoints")
    .update({ active: false })
    .eq("id", params.id);

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
