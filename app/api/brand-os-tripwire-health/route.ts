// GET /api/brand-os-tripwire-health
//
// Diagnostic endpoint — hit this in a browser to see exactly which env
// vars are configured and which are missing. No secrets returned, just
// the presence/absence of each piece.
//
// Public on purpose (no auth gate) so you can verify config from any
// device without logging in.

import { NextResponse } from "next/server";

export const runtime = "edge";

export async function GET() {
  const checks = {
    STRIPE_SECRET_KEY:        Boolean(process.env.STRIPE_SECRET_KEY),
    STRIPE_WEBHOOK_SECRET:    Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    SECRETS_MASTER_KEY:       Boolean(process.env.SECRETS_MASTER_KEY),
    NEXT_PUBLIC_APP_URL:      process.env.NEXT_PUBLIC_APP_URL ?? "(unset — defaults to https://app.elevateaisystem.com)",
    NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL ?? "(unset — defaults to https://elevateaisystem.com)",
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    ANTHROPIC_API_KEY:        Boolean(process.env.ANTHROPIC_API_KEY),
    RESEND_API_KEY:           Boolean(process.env.RESEND_API_KEY),
  };

  // Try to actually sign+verify a tiny test token to confirm
  // SECRETS_MASTER_KEY is not just set but VALID (32-byte base64).
  let masterKeyValid = false;
  let masterKeyError: string | null = null;
  if (process.env.SECRETS_MASTER_KEY) {
    try {
      const { signTrialToken, verifyTrialToken } = await import("@/lib/brand-os/trial-token");
      const token = await signTrialToken({ purchaseId: "test", coachId: "test" });
      const v = await verifyTrialToken(token);
      masterKeyValid = v.ok;
      if (!v.ok) masterKeyError = v.reason;
    } catch (err) {
      masterKeyError = err instanceof Error ? err.message : String(err);
    }
  }

  const ready =
    checks.STRIPE_SECRET_KEY &&
    checks.STRIPE_WEBHOOK_SECRET &&
    checks.SECRETS_MASTER_KEY &&
    masterKeyValid &&
    checks.SUPABASE_SERVICE_ROLE_KEY &&
    checks.ANTHROPIC_API_KEY;

  const blockers: string[] = [];
  if (!checks.STRIPE_SECRET_KEY)
    blockers.push("Set STRIPE_SECRET_KEY (from Stripe Dashboard → API keys)");
  if (!checks.STRIPE_WEBHOOK_SECRET)
    blockers.push("Set STRIPE_WEBHOOK_SECRET (from Stripe webhook endpoint config)");
  if (!checks.SECRETS_MASTER_KEY)
    blockers.push("Set SECRETS_MASTER_KEY — generate locally with: openssl rand -base64 32");
  if (checks.SECRETS_MASTER_KEY && !masterKeyValid)
    blockers.push(`SECRETS_MASTER_KEY is set but not valid (${masterKeyError ?? "unknown"}) — should be base64-encoded 32 bytes`);
  if (!checks.SUPABASE_SERVICE_ROLE_KEY)
    blockers.push("Set SUPABASE_SERVICE_ROLE_KEY");
  if (!checks.ANTHROPIC_API_KEY)
    blockers.push("Set ANTHROPIC_API_KEY");

  return NextResponse.json({
    ready,
    env_vars: checks,
    secrets_master_key_valid: masterKeyValid,
    secrets_master_key_error: masterKeyError,
    blockers,
    note: "After setting any env var on Cloudflare, you MUST redeploy (Pages → Deployments → Retry deployment). Env vars only load at build time.",
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
