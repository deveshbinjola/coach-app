// GET /api/cron/brand-os-digest — weekly Brand OS completion digest.
//
// Reports who finished Brand OS (Quick Start MVP vs Full run), who started
// but hasn't finished, and who bought the trip-wire but never started a run.
// Emails the summary to Sunny and returns a `people` array the weekly
// routine syncs into a Notion database.
//
// Auth: pass ?key=<CRON_SECRET> (or Authorization: Bearer <CRON_SECRET>).
// Safe to call manually to preview the current state.

import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { resendSend, type ResendSender } from "@/lib/email/coach-resend";
import { syncBuyersToNotion, type BuyerPerson } from "@/lib/notion/buyers-sync";

export const runtime = "edge";

const DIGEST_TO = "sunny.binjola@gmail.com";

type RunStatus = "finished" | "in_progress" | "bought_not_started";

type Person = {
  name: string;
  email: string;
  status: RunStatus;
  variant: "mvp" | "full" | null;
  started_at: string | null;
  completed_at: string | null;
  last_module: string | null;
};

const VARIANT_LABEL: Record<"mvp" | "full", string> = {
  mvp: "Quick Start MVP",
  full: "Full run",
};
const STATUS_LABEL: Record<RunStatus, string> = {
  finished: "Finished",
  in_progress: "In progress",
  bought_not_started: "Bought, not started",
};

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
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sinceIso = new Date(sinceMs).toISOString();

  // ── Pull runs + the coaches behind them ───────────────
  // One run row per coach is the norm; if a coach has several we keep the
  // "best" one (finished > in_progress) so each person shows once.
  const [runsRes, coachesRes] = await Promise.all([
    admin
      .from("cp_brand_os_runs")
      .select("coach_id, state, variant, started_at, completed_at, current_module")
      .order("started_at", { ascending: false }),
    admin
      .from("cp_coaches")
      .select("id, full_name, email, plan, created_at"),
  ]);

  const runs = (runsRes.data ?? []) as Array<{
    coach_id: string;
    state: string | null;
    variant: string | null;
    started_at: string | null;
    completed_at: string | null;
    current_module: string | null;
  }>;
  const coaches = (coachesRes.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
    plan: string | null;
    created_at: string | null;
  }>;

  const coachById = new Map(coaches.map((c) => [c.id, c]));
  const nameFor = (id: string) => {
    const c = coachById.get(id);
    return c?.full_name?.trim() || c?.email?.split("@")[0] || "Unknown";
  };
  const emailFor = (id: string) => coachById.get(id)?.email ?? "";

  // Reduce to one record per coach. Rank: finished beats in_progress beats
  // anything else; within finished, most recent completion wins.
  const rank = (state: string | null) =>
    state === "complete" ? 2 : state === "in_progress" ? 1 : 0;
  const bestRunByCoach = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    const prev = bestRunByCoach.get(r.coach_id);
    if (!prev || rank(r.state) > rank(prev.state)) {
      bestRunByCoach.set(r.coach_id, r);
    }
  }

  // ── Build the people list ─────────────────────────────
  const people: Person[] = [];

  for (const [coachId, r] of bestRunByCoach) {
    if (r.state === "complete") {
      people.push({
        name: nameFor(coachId),
        email: emailFor(coachId),
        status: "finished",
        variant: r.variant === "mvp" ? "mvp" : "full",
        started_at: r.started_at,
        completed_at: r.completed_at,
        last_module: null,
      });
    } else if (r.state === "in_progress") {
      people.push({
        name: nameFor(coachId),
        email: emailFor(coachId),
        status: "in_progress",
        variant: r.variant === "mvp" ? "mvp" : r.variant === "full" ? "full" : null,
        started_at: r.started_at,
        completed_at: null,
        last_module: r.current_module,
      });
    }
  }

  // Bought the trip-wire (plan = 'trial') but never created a run at all.
  for (const c of coaches) {
    if (c.plan === "trial" && !bestRunByCoach.has(c.id)) {
      people.push({
        name: c.full_name?.trim() || c.email?.split("@")[0] || "Unknown",
        email: c.email ?? "",
        status: "bought_not_started",
        variant: null,
        started_at: null,
        completed_at: c.created_at,
        last_module: null,
      });
    }
  }

  const finished = people.filter((p) => p.status === "finished");
  const inProgressPeople = people.filter((p) => p.status === "in_progress");
  const boughtNotStarted = people.filter((p) => p.status === "bought_not_started");

  const finishedThisWeek = finished.filter(
    (p) => p.completed_at && new Date(p.completed_at).getTime() >= sinceMs
  );
  const weekMvp = finishedThisWeek.filter((p) => p.variant === "mvp").length;
  const weekFull = finishedThisWeek.filter((p) => p.variant === "full").length;
  const weekTotal = finishedThisWeek.length;
  const allMvp = finished.filter((p) => p.variant === "mvp").length;
  const allFull = finished.filter((p) => p.variant === "full").length;
  const allTotal = finished.length;

  const digest = {
    weekMvp, weekFull, weekTotal,
    allMvp, allFull, allTotal,
    inProgress: inProgressPeople.length,
    boughtNotStarted: boughtNotStarted.length,
  };

  // ── Notion sync ───────────────────────────────────────
  // Done before the email so the digest can report what landed in Notion.
  // Safe to skip silently if env vars aren't set yet.
  const notion = await syncBuyersToNotion(people as BuyerPerson[]);

  // ── Email ─────────────────────────────────────────────
  const platformKey = process.env.RESEND_API_KEY;
  if (!platformKey) {
    return NextResponse.json({
      sent: false,
      reason: "RESEND_API_KEY not configured",
      digest,
      people,
      notion,
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

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString() : "—";

  const personRow = (p: Person, dateLabel: string, dateVal: string | null, extra?: string) => `
    <tr>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0">
        <strong>${escapeHtml(p.name)}</strong>
        <span style="color:#6A6A60;font-size:12px"> · ${escapeHtml(p.email)}</span>
        ${extra ? `<br><span style="color:#6B7280;font-size:12px">${escapeHtml(extra)}</span>` : ""}
      </td>
      <td style="padding:6px 0;border-bottom:1px solid #f0f0f0;text-align:right;color:#6B7280;font-size:12px;white-space:nowrap">
        ${dateLabel} ${dateVal}
      </td>
    </tr>`;

  const peopleSection = (title: string, rows: string) =>
    rows
      ? `<h2 style="font-size:14px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">${title}</h2>
         <table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`
      : `<h2 style="font-size:14px;margin:22px 0 6px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">${title}</h2>
         <p style="color:#6A6A60;font-size:13px;margin:0">None.</p>`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#0A0F1C">
      <p style="font:600 12px/1 monospace;letter-spacing:.1em;color:#6B7280;text-transform:uppercase">Brand OS · Weekly digest</p>
      <h1 style="font-size:22px;margin:8px 0 4px">${weekTotal} finished this week · ${inProgressPeople.length} in progress · ${boughtNotStarted.length} bought, not started</h1>
      <p style="color:#6B7280;font-size:13px;margin:0 0 16px">${range}</p>

      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;border-bottom:1px solid #eee">Finished this week</td>
            <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${weekTotal} <span style="color:#6B7280;font-weight:400">(${weekMvp} MVP · ${weekFull} Full)</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #eee">All-time finished</td>
            <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${allTotal} <span style="color:#6B7280;font-weight:400">(${allMvp} MVP · ${allFull} Full)</span></td></tr>
        <tr><td style="padding:6px 0;border-bottom:1px solid #eee">In progress</td>
            <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:700">${inProgressPeople.length}</td></tr>
        <tr><td style="padding:6px 0">Bought, not started</td>
            <td style="padding:6px 0;text-align:right;font-weight:700">${boughtNotStarted.length}</td></tr>
      </table>

      ${peopleSection(
        "Finished",
        finished
          .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
          .map((p) => personRow(p, "done", fmtDate(p.completed_at), VARIANT_LABEL[p.variant ?? "full"]))
          .join("")
      )}

      ${peopleSection(
        "Started, not finished",
        inProgressPeople
          .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""))
          .map((p) =>
            personRow(
              p,
              "started",
              fmtDate(p.started_at),
              `${p.variant ? VARIANT_LABEL[p.variant] : "run"}${p.last_module ? ` · last in ${p.last_module}` : ""}`
            )
          )
          .join("")
      )}

      ${peopleSection(
        "Bought, never started",
        boughtNotStarted
          .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))
          .map((p) => personRow(p, "bought", fmtDate(p.completed_at)))
          .join("")
      )}

      <p style="color:#6A6A60;font-size:12px;margin-top:24px">
        Notion sync: ${
          notion.ok
            ? `${notion.created} created, ${notion.updated} updated`
            : `not synced (${escapeHtml(notion.reason ?? "see response")})`
        }. Sent automatically every week.
      </p>
    </div>
  `;

  const textLines = (label: string, list: Person[]) =>
    `${label} (${list.length}):\n` +
    (list.length
      ? list.map((p) => `  - ${p.name} <${p.email}>`).join("\n")
      : "  none") +
    "\n";

  const text =
    `Brand OS weekly digest — ${range}\n\n` +
    `Finished this week: ${weekTotal} (${weekMvp} MVP, ${weekFull} Full)\n` +
    `All-time finished: ${allTotal}\n\n` +
    textLines("Finished", finished) +
    "\n" +
    textLines("Started, not finished", inProgressPeople) +
    "\n" +
    textLines("Bought, never started", boughtNotStarted);

  try {
    const { id } = await resendSend(sender, { to: DIGEST_TO, subject, html, text });
    return NextResponse.json({ sent: true, emailId: id, digest, people, notion });
  } catch (err) {
    return NextResponse.json(
      {
        sent: false,
        reason: err instanceof Error ? err.message : "send failed",
        digest,
        people,
        notion,
      },
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
