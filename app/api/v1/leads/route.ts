// GET  /api/v1/leads        — list this coach's leads
// POST /api/v1/leads        — create a new lead (auto-draft fires per row)
//
// Bearer-token auth. See lib/api-auth.ts for token format + verification.

import { NextRequest } from "next/server";
import { z } from "zod";
import { validateApiKey, apiError, apiOk } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase-admin";
import {
  parseBody,
  nonEmptyString,
  TrimmedStringOrNull,
  LeadSourceSchema,
  LeadTemperatureSchema,
  PainSignalSchema,
} from "@/lib/api-validation";

export const runtime = 'edge';

// POST /api/v1/leads — create lead. All field constraints in one place.
// next_honest_action stays a free string at this layer; validating against
// the LeadNextAction enum would be over-eager — agents send arbitrary phrases
// that the coach reviews in /inbox.
const CreateLeadSchema = z.object({
  full_name: nonEmptyString(200),
  email: TrimmedStringOrNull.optional().nullable().default(null),
  phone: TrimmedStringOrNull.optional().nullable().default(null),
  source: LeadSourceSchema.optional().default("other"),
  source_detail: TrimmedStringOrNull.optional().nullable().default(null),
  temperature: LeadTemperatureSchema.optional().default("warm"),
  notes: TrimmedStringOrNull.optional().nullable().default(null),
  pain_signal: z.array(PainSignalSchema).max(10).optional().default([]),
  next_honest_action: z.string().max(500).optional().nullable().default(null),
  auto_draft_eligible: z.boolean().optional().default(true),
});

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

  const parsed = await parseBody(request, CreateLeadSchema);
  if (!parsed.ok) return apiError(parsed.error, parsed.status);
  const body = parsed.data;

  // Whitelist: schema enforces shape; we still strip server-controlled
  // fields (coach_id, id, created_at) by only spreading the validated
  // fields plus the auth-derived coach_id and status default.
  const row = {
    coach_id: auth.coachId,
    full_name: body.full_name,
    email: body.email,
    phone: body.phone,
    source: body.source,
    source_detail: body.source_detail,
    temperature: body.temperature,
    notes: body.notes,
    pain_signal: body.pain_signal,
    next_honest_action: body.next_honest_action,
    status: "new" as const,
    auto_draft_eligible: body.auto_draft_eligible,
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
