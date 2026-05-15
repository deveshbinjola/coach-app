// GET /api/cron/brand-os-digest — weekly Brand OS completion digest.
//
// Counts how many people finished Brand OS (Quick Start MVP vs Full run)
// in the last 7 days and all-time, plus how many runs are still in
// progress, and emails the summary to Sunny.
//
// Auth: pass ?key=<CRON_SECRET> (or Authorization: Bearer <CRON_SECRET>).
// Designed to be hit by a weekly scheduled task. Safe to call manually to
// preview the current numbers.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { resendSend, type ResendSender } from "@/lib/email/coach-resend";

export const runtime = "edge";

const DIGEST_TO = "sunny.binjola@gmail.com";

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────
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

  const admin = createAdminClient();
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── Counts ────────────────────────────────────────────
  // exact + head:true gives us a count without pulling rows.
  async function countRuns(filter: (q: any) => any): Promise<number> {
    const { count } = await filter(
      admin.from("cp_brand_os_runs").select("id", { count: "exact", head: true })
    );
    return count ?? 0;
  }

  const [
    weekMvp, weekFull,
    allMvp, allFull,
    inProgress,
  ] = await Promise.all([
    countRuns((q) => q.eq("state", "complete").eq("variant", "mvp").gte("completed_at", sinceIso)),
    countRuns((q) => q.eq("state", "complete").eq("variant", "full").gte("completed_at", sinceIso)),
    countRuns((q) => q.eq("state", "complete").eq("variant", "mvp")),
    countRuns((q) => q.eq("state", "complete").eq("variant", "full")),
    countRuns((q) => q.eq("state", "in_progress")),
  ]);

  const weekTotal = weekMvp + weekFull;
  const allTotal = allMvp + allFull;

  // ── Email ─────────────────────────────────────────────
  const platformKey = process.env.RESEND_API_KEY;
  if (!platformKey) {
    // No sender — still return the numbers so a manual call is useful.
    return NextResponse.json({
      sent: false,
      reason: "RESEND_API_KEY not configured",
      digest: { weekMvp, weekFull, weekTotal, allMvp, allFull, allTotal, inProgress },
    });
  }

  const sender: ResendSender = {
    apiKey: platformKey,
    from: process.env.RESEND_FROM ?? "Brand OS <brand-os@elevateaisystem.com>",
    source: "platform",
    verifiedDomain: null,
  };

  const range = `${new Date(sinceIso).toLocaleDateString()} – ${new Date().toLocaleDateString()}`;
  const subject = `Brand OS weekly: ${weekTotal} finished (${weekMvp} Quick Start · ${weekFull} Full)`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0A0F1C">
      <p style="font:600 12px/1 monospace;letter-spacing:.1em;color:#6B7280;text-transform:uppercase">Brand OS · Weekly digest</p>
      <h1 style="font-size:22px;margin:8px 0 4px">${weekTotal} people finished Brand OS this week</h1>
      <p style="color:#6B7280;font-size:13px;margin:0 0 20px">${range}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Quick Start MVP</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${weekMvp}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Full run</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${weekFull}</td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #eee">Still in progress</td>
            <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${inProgress}</td></tr>
        <tr><td style="padding:8px 0">All-time finished</td>
            <td style="padding:8px 0;text-align:right;font-weight:700">${allTotal} <span style="color:#6B7280;font-weight:400">(${allMvp} MVP · ${allFull} Full)</span></td></tr>
      </table>

      <p style="color:#6B7280;font-size:12px;margin-top:24px">
        Counts finished runs (state = complete). Sent automatically every week.
      </p>
    </div>
  `;

  const text =
    `Brand OS weekly digest — ${range}\n\n` +
    `Finished this week: ${weekTotal} (${weekMvp} Quick Start MVP, ${weekFull} Full run)\n` +
    `Still in progress: ${inProgress}\n` +
    `All-time finished: ${allTotal} (${allMvp} MVP, ${allFull} Full)\n`;

  try {
    const { id } = await resendSend(sender, { to: DIGEST_TO, subject, html, text });
    return NextResponse.json({
      sent: true,
      emailId: id,
      digest: { weekMvp, weekFull, weekTotal, allMvp, allFull, allTotal, inProgress },
    });
  } catch (err) {
    return NextResponse.json(
      {
        sent: false,
        reason: err instanceof Error ? err.message : "send failed",
        digest: { weekMvp, weekFull, weekTotal, allMvp, allFull, allTotal, inProgress },
      },
      { status: 502 }
    );
  }
}
