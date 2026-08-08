// GET /api/cron/production-watchdog — daily production health digest.
//
// The nightly self-heal loop (docs/self-healing-nightly-runbook.md) fixes
// code from reports already filed. Nothing else watches what's actually
// happening in production between runs. This closes that gap with two
// signals pulled straight from tables that already exist:
//
//   1. Bug queue health — open reports by severity, and how long the oldest
//      high/critical one has sat unfixed. A stale high-severity report means
//      the nightly loop is falling behind or stuck on it.
//   2. Agent activity volume — API calls per coach in the last 24h. A count
//      far above the rest flags an integration or automation running away.
//
// Deliberately NOT built: an error-rate signal off cp_agent_activity.status_code.
// That column exists in the schema but no route handler ever writes it, so
// it's always null — a signal built on it would always read "zero errors"
// and give false confidence. Wire status_code from real responses first if
// that's wanted; don't fake it here.
//
// Auth: pass ?key=<CRON_SECRET> (or Authorization: Bearer <CRON_SECRET>).
// Safe to call manually to preview the current state.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { resendSend, type ResendSender } from "@/lib/email/coach-resend";
import { requireCronAuth } from "@/lib/cron/auth";
import { buildWatchdogDigest, isDigestQuiet, type CoachRow, type OpenBug } from "@/lib/cron/watchdog-digest";

export const runtime = "edge";

const DIGEST_TO = "sunny.binjola@gmail.com";
const STALE_HOURS = 24;
const HIGH_VOLUME_CALLS = 200;

export async function GET(request: NextRequest) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [bugsRes, coachesRes, activityRes] = await Promise.all([
    admin
      .from("cp_bug_reports")
      .select("id, coach_id, title, severity, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: true }),
    admin.from("cp_coaches").select("id, full_name, email"),
    admin.from("cp_agent_activity").select("coach_id").gte("created_at", sinceIso),
  ]);

  const digest = buildWatchdogDigest({
    bugs: (bugsRes.data ?? []) as OpenBug[],
    coaches: (coachesRes.data ?? []) as CoachRow[],
    activityCoachIds: ((activityRes.data ?? []) as Array<{ coach_id: string }>).map((r) => r.coach_id),
    nowMs: Date.now(),
    staleHours: STALE_HOURS,
    highVolumeCalls: HIGH_VOLUME_CALLS,
  });

  const { staleHighSeverity, agentActivity, openBugs } = digest;
  const { highVolumeCoaches } = agentActivity;
  const { bySeverity } = openBugs;

  // ── Email (skip entirely on a quiet day — silence is a valid output) ──
  const platformKey = process.env.RESEND_API_KEY;
  if (!platformKey) {
    return NextResponse.json({ sent: false, reason: "RESEND_API_KEY not configured", digest });
  }
  if (isDigestQuiet(digest)) {
    return NextResponse.json({ sent: false, reason: "quiet — nothing flagged", digest });
  }

  const sender: ResendSender = {
    apiKey: platformKey,
    from: process.env.RESEND_FROM ?? "Coach Assistant <ops@elevateaisystem.com>",
    source: "platform",
    verifiedDomain: null,
  };

  const subject = `Watchdog: ${staleHighSeverity.length} stale high-severity bug${
    staleHighSeverity.length === 1 ? "" : "s"
  }, ${highVolumeCoaches.length} volume flag${highVolumeCoaches.length === 1 ? "" : "s"}`;

  const bugRows = staleHighSeverity
    .map(
      (b) => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0">
        <strong>${escapeHtml(b.title)}</strong>
        <span style="color:#6A6A60;font-size:12px"> · ${escapeHtml(b.coach)} · ${b.severity}</span>
      </td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:#6B7280;font-size:12px;white-space:nowrap">
        ${b.hoursOpen}h open
      </td>
    </tr>`
    )
    .join("");

  const volumeRows = highVolumeCoaches
    .map(
      (c) => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0">${escapeHtml(c.name)}</td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:#6B7280;font-size:12px">
        ${c.count} calls / 24h
      </td>
    </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0A0F1C">
      <p style="font:600 12px/1 monospace;letter-spacing:.1em;color:#6B7280;text-transform:uppercase">Production Watchdog</p>
      <h1 style="font-size:22px;margin:8px 0 4px">${staleHighSeverity.length} stale high-severity · ${highVolumeCoaches.length} volume flags</h1>
      <p style="color:#6B7280;font-size:13px;margin:0 0 16px">Open queue: ${openBugs.total} (${bySeverity.critical} critical · ${bySeverity.high} high · ${bySeverity.normal} normal · ${bySeverity.low} low)</p>

      ${
        staleHighSeverity.length
          ? `<h2 style="font-size:14px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">Stale &gt;${STALE_HOURS}h, high/critical</h2>
             <table style="width:100%;border-collapse:collapse;font-size:14px">${bugRows}</table>`
          : ""
      }

      ${
        highVolumeCoaches.length
          ? `<h2 style="font-size:14px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">Agent activity above ${HIGH_VOLUME_CALLS}/24h</h2>
             <table style="width:100%;border-collapse:collapse;font-size:14px">${volumeRows}</table>`
          : ""
      }

      <p style="color:#6A6A60;font-size:12px;margin-top:24px">
        Sent automatically once a day, only when there's something to flag.
      </p>
    </div>
  `;

  const text =
    `Production Watchdog\n\n` +
    `Open bug queue: ${openBugs.total} (${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.normal} normal, ${bySeverity.low} low)\n\n` +
    `Stale >${STALE_HOURS}h, high/critical (${staleHighSeverity.length}):\n` +
    (staleHighSeverity.length
      ? staleHighSeverity.map((b) => `  - ${b.title} · ${b.coach} · ${b.severity} · ${b.hoursOpen}h open`).join("\n")
      : "  none") +
    `\n\nAgent activity above ${HIGH_VOLUME_CALLS}/24h (${highVolumeCoaches.length}):\n` +
    (highVolumeCoaches.length
      ? highVolumeCoaches.map((c) => `  - ${c.name}: ${c.count} calls`).join("\n")
      : "  none");

  try {
    const { id } = await resendSend(sender, { to: DIGEST_TO, subject, html, text });
    return NextResponse.json({ sent: true, emailId: id, digest });
  } catch (err) {
    return NextResponse.json(
      { sent: false, reason: err instanceof Error ? err.message : "send failed", digest },
      { status: 502 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
