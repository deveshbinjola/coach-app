// GET  /api/v1/leads        — list this coach's leads
// POST /api/v1/leads        — create a new lead (auto-draft fires per row)
//
// Bearer-token auth. See lib/api-auth.ts for token format + verification.

import { NextRequest } from "next/server";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);

  // Optional query params: status, temperature, limit, offset.
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const temperature = searchParams.get("temperature");
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1),
    200
  );
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

  const admin = createAdminClient();
  let query = admin
    .from("cp_leads")
    .select("*", { count: "exact" })
    .eq("coach_id", auth.coachId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) query = query.eq("status", status);
  if (temperature) query = query.eq("temperature", temperature);

  const { data, error, count } = await query;
  if (error) return apiError(error.message, 500);

  return apiOk({
    leads: data ?? [],
    pagination: { limit, offset, total: count ?? 0 },
  });
}

export async function POST(request: NextRequest) {
  const auth = await validateApiKey(request);
  if (!auth) return apiError("Unauthorized", 401);
  if (!auth.scopes.includes("write")) return apiError("write scope required", 403);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }
  if (!body?.full_name || typeof body.full_name !== "string") {
    return apiError("full_name (string) is required", 400);
  }

  // Whitelist: only the fields we expose via API. Prevents callers from
  // setting coach_id, id, created_at, etc.
  const row = {
    coach_id: auth.coachId,
    full_name: String(body.full_name).trim(),
    email: typeof body.email === "string" ? body.email.trim() || null : null,
    phone: typeof body.phone === "string" ? body.phone.trim() || null : null,
    source: typeof body.source === "string" ? body.source : "other",
    source_detail:
      typeof body.source_detail === "string"
        ? body.source_detail.trim() || null
        : null,
    temperature: typeof body.temperature === "string" ? body.temperature : "warm",
    notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
    pain_signal: Array.isArray(body.pain_signal) ? body.pain_signal : [],
    next_honest_action:
      typeof body.next_honest_action === "string"
        ? body.next_honest_action
        : null,
    status: "new" as const,
    auto_draft_eligible: body.auto_draft_eligible !== false, // default true
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("cp_leads")
    .insert(row)
    .select("*")
    .single();

  if (error || !data) return apiError(error?.message ?? "Insert failed", 500);

  // Fire auto-draft per inserted lead, fire-and-forget. Same pattern as
  // /leads/new in the dashboard.
  if (data.auto_draft_eligible) {
    admin.functions
      .invoke("auto-draft-response", { body: { lead_id: data.id } })
      .catch(() => {});
  }

  return apiOk({ lead: data }, 201);
}
