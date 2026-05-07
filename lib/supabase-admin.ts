// Service-role Supabase client for server-side API routes.
//
// Used by:
//   - /api/v1/* REST endpoints (Bearer-token auth bypasses Supabase Auth)
//   - /api/auth/google/callback (writes integration tokens)
//   - Anywhere we need to read/write across coach scopes (which we never
//     actually do — but we always filter by coach_id manually after API
//     key validation).
//
// CRITICAL: never expose this client or its key to the browser. It bypasses
// RLS entirely. Every server-side caller MUST manually scope queries with
// .eq('coach_id', auth.coachId) or equivalent.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in coach-app env. Required for server-side API routes (Phase 8.5+)."
    );
  }
  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
