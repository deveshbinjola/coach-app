// POST /api/brand-os/email
//
// Sends the Brand OS synthesis to the coach via Resend. Body: { runId, email }.
//
// If RESEND_API_KEY is missing we DON'T silently swallow — we surface a
// 503 with a clear message so the coach knows email delivery isn't live
// yet (vs. the previous "captured but never sent" silent failure).

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { renderSynthesisMarkdown } from "@/lib/brand-os/render-markdown";
import { userDisplayName } from "@/lib/user-display";
import type { BrandOsSynthesis } from "@/app/api/brand-os/synthesize/route";

export const runtime = "edge";

const FROM_DEFAULT = "Brand OS <brand-os@elevateaisystem.com>";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { runId?: string; email?: string };
  try {
    body = (await request.json()) as { runId?: string; email?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const runId = (body.runId ?? "").trim();
  const email = (body.email ?? "").trim();
  if (!runId || !email) return NextResponse.json({ error: "runId and email required" }, { status: 400 });

  // Verify ownership + pull synthesis.
  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("synthesis_json, completed_at")
    .eq("id", runId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!run) return NextResponse.json({ error: "run_not_found" }, { status: 404 });
  if (!run.synthesis_json) {
    return NextResponse.json({ error: "synthesis_not_ready", message: "Open the output page first so we can generate the deliverable." }, { status: 400 });
  }

  // Always capture the address — useful as a lead artifact even if send fails.
  await supabase
    .from("cp_brand_os_runs")
    .update({ delivery_email: email })
    .eq("id", runId);

  const synthesis = run.synthesis_json as BrandOsSynthesis;
  const coachName = userDisplayName(user.user_metadata);
  const completedAt = run.completed_at ? new Date(run.completed_at as string).toLocaleString() : undefined;
  const md = renderSynthesisMarkdown(synthesis, { coachName, completedAt });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({
      error: "email_not_configured",
      message: "Email delivery isn't live yet (add RESEND_API_KEY to env). Your address was saved — for now, use Download .md or Print PDF.",
    }, { status: 503 });
  }

  const from = process.env.RESEND_FROM ?? FROM_DEFAULT;
  const html = markdownToBasicHtml(md);

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: `Your Brand OS — ${synthesis.positioning_line?.slice(0, 60) ?? "Deliverable"}`,
      html,
      text: md,
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    return NextResponse.json({ error: "resend_error", detail: detail.slice(0, 500) }, { status: 502 });
  }

  await supabase
    .from("cp_brand_os_runs")
    .update({ emailed_at: new Date().toISOString() })
    .eq("id", runId);

  return NextResponse.json({ ok: true, sent: email });
}

// Tiny markdown→HTML for the email body. Keeps the output portable without
// pulling in a heavy markdown lib at the edge. Email clients render this
// cleanly because Resend wraps it in their own template.
function markdownToBasicHtml(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inList = false;
  let inBlockquote = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    const closeList = () => { if (inList) { html.push("</ul>"); inList = false; } };
    const closeQuote = () => { if (inBlockquote) { html.push("</blockquote>"); inBlockquote = false; } };
    if (line.startsWith("# ")) { closeList(); closeQuote(); html.push(`<h1>${esc(line.slice(2))}</h1>`); continue; }
    if (line.startsWith("## ")) { closeList(); closeQuote(); html.push(`<h2 style="margin-top:32px;border-top:2px solid #00FF41;padding-top:16px;">${esc(line.slice(3))}</h2>`); continue; }
    if (line.startsWith("### ")) { closeList(); closeQuote(); html.push(`<h3>${esc(line.slice(4))}</h3>`); continue; }
    if (line.startsWith("> ")) {
      closeList();
      if (!inBlockquote) { html.push(`<blockquote style="border-left:4px solid #00FF41;padding:8px 16px;margin:12px 0;color:#444;font-style:italic;">`); inBlockquote = true; }
      html.push(`<p>${inline(line.slice(2))}</p>`);
      continue;
    }
    if (line.startsWith("- ")) {
      closeQuote();
      if (!inList) { html.push(`<ul>`); inList = true; }
      html.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (line === "---") { closeList(); closeQuote(); html.push(`<hr style="border:none;border-top:1px solid #ddd;margin:24px 0;">`); continue; }
    if (line === "") { closeList(); closeQuote(); html.push(""); continue; }
    closeList(); closeQuote();
    html.push(`<p>${inline(line)}</p>`);
  }
  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:32px;color:#111;line-height:1.6;">${html.join("\n")}</body></html>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:2px 6px;border-radius:4px;font-family:monospace;">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
