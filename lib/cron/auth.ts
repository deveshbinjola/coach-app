// Shared CRON_SECRET check for scheduled digest routes.
//
// One implementation so a change to how the secret is read or compared
// doesn't have to be copied by hand into every cron route. Second copy of
// this exact block (production-watchdog) is what prompted extracting it —
// see docs/design-system.md's "paved path" rule.

import { NextResponse, type NextRequest } from "next/server";

/** Returns a NextResponse to return immediately if unauthorized or
 *  misconfigured, or null if the request is authorized and the caller
 *  should proceed. Accepts ?key=<secret> or Authorization: Bearer <secret>. */
export function requireCronAuth(request: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const url = new URL(request.url);
  const provided =
    url.searchParams.get("key") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
