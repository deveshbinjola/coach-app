// POST /api/brand-os/v5/legacy-recovery · admin trigger
//
// Runs the one-time legacy recovery backfill. Generates Snapshot artifacts
// for runs with >= 4 answers, syncs them into the coach platform Voice
// Profile + Content sections, mints recovery_tokens, queues recovery emails
// via Resend, and writes cp_brand_os_recovery_log rows.
//
// Auth: requires the BRAND_OS_ADMIN_TOKEN env var in the Authorization header.
// Idempotent: skips runs that already have a recovery_token.

import { NextResponse, type NextRequest } from "next/server";
import { runLegacyRecoveryBackfill } from "@/lib/brand-os/legacy-recovery";

export const runtime = "nodejs";       // not edge · the backfill calls the agent + Resend
export const maxDuration = 300;        // 5 minutes

export async function POST(request: NextRequest) {
  const adminToken = process.env.BRAND_OS_ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json(
      { error: "BRAND_OS_ADMIN_TOKEN not configured" },
      { status: 500 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (token !== adminToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Optional dry-run mode: ?dry=1 prints what would happen without sending
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";

  try {
    const summary = await runLegacyRecoveryBackfill({ dryRun });
    return NextResponse.json({
      ok: true,
      dryRun,
      ...summary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// Convenience GET for browser-based dry runs.
// Same auth required.
export async function GET(request: NextRequest) {
  return POST(request);
}
