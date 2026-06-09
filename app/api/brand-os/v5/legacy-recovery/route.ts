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

// Cloudflare Pages requires edge runtime on all routes. The backfill makes
// 5 Anthropic calls × 12 coaches plus 12 Resend sends. That can exceed the
// edge CPU limit when run synchronously, so the endpoint takes a `?batch_size=N`
// query param. Pass batch_size=2 or 3 to process coaches in chunks and fire
// the endpoint multiple times. Idempotent — already-processed runs are skipped.
export const runtime = "edge";

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

  // Optional dry-run mode: ?dry=1 prints what would happen without sending.
  // Optional ?limit=N to process N coaches per call (edge runtime CPU budget).
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry") === "1";
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Math.max(1, parseInt(limitParam, 10)) : undefined;

  try {
    const summary = await runLegacyRecoveryBackfill({ dryRun, limit });
    return NextResponse.json({
      ok: true,
      dryRun,
      limit: limit ?? "all",
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
