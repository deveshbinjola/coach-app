// lib/email/daily-brief.ts
//
// The trigger phase. The 5-day onboarding drip used to end at Day 4 and
// nothing ever reached out again, so every return after that depended on
// the coach spontaneously remembering the product existed.
//
// This is the brief the /meet archetypes already promise ("one clear brief
// each morning: leads, clients, content"). It is built from real Business
// Pulse signals, not a content calendar, so it can only say true things.
//
// THE RULE THAT MAKES THIS NOT SPAM: if there is nothing that actually
// needs the coach today, no email goes out. Quiet week, quiet inbox. The
// pull has to come from the brief being worth reading, never from a
// cadence. See feedback-mentor-panel: Facilitator quadrant only, no
// streaks, no counters, no manufactured urgency.

import type { BusinessPulse, RightNowItem } from "@/lib/ambient";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";
const FROM_EMAIL = "Coach Assistant <brand-os@elevateaisystem.com>";

const LEAF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 88 88" style="display:block;"><rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/><path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/><path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`;

export type BriefInput = {
  firstName: string;
  pulse: BusinessPulse;
};

export type RenderedBrief = {
  subject: string;
  html: string;
  text: string;
};

export type BriefDecision =
  | { send: false; reason: "nothing_to_say" }
  | { send: true; rendered: RenderedBrief };

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Is there anything real to tell this coach today?
 *  Pure and exported so the "no spam" rule is pinned by tests. */
export function hasSomethingToSay(pulse: BusinessPulse): boolean {
  if (pulse.heroItem) return true;
  if (pulse.quietList.length > 0) return true;
  const d = pulse.daySummary;
  return d.sessions > 0 || d.leadsWaiting > 0 || d.draftsReady > 0;
}

/** Subject line names the single most important thing, so the inbox
 *  preview alone is useful even if they never open it. */
export function briefSubject(pulse: BusinessPulse): string {
  const hero = pulse.heroItem;
  if (hero) {
    const who = hero.leadName?.trim();
    if (who) return `${who} needs you today`;
    return hero.reason.length <= 60 ? hero.reason : "One thing needs you today";
  }
  const d = pulse.daySummary;
  if (d.sessions > 0) {
    return d.sessions === 1 ? "One session today" : `${d.sessions} sessions today`;
  }
  if (d.leadsWaiting > 0) {
    return d.leadsWaiting === 1 ? "One lead is waiting" : `${d.leadsWaiting} leads are waiting`;
  }
  return "Your drafts are ready";
}

function itemRow(item: RightNowItem): string {
  const who = item.leadName?.trim();
  const label = who ? `${escape(who)}: ${escape(item.reason)}` : escape(item.reason);
  return `<tr>
    <td width="16" valign="top" style="padding:7px 10px 7px 0;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#0B6E23;"></span></td>
    <td style="padding:5px 0;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0A0F1C;">${label}</td>
  </tr>`;
}

function pillButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
    <tr><td align="center" bgcolor="#0B6E23" style="background-color:#0B6E23;border-radius:100px;">
      <a href="${href}" style="display:inline-block;color:#FAF8F3;font-weight:700;text-decoration:none;padding:14px 30px;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:14px;">${label}</a>
    </td></tr>
  </table>`;
}

export function renderBrief(input: BriefInput): RenderedBrief {
  const { firstName, pulse } = input;
  const hero = pulse.heroItem;
  const rest = pulse.quietList.slice(0, 4);
  const d = pulse.daySummary;

  const hello = firstName.trim() ? `${escape(firstName.trim())},` : "Morning,";

  const summaryBits = [
    d.sessions > 0 ? `${d.sessions} session${d.sessions === 1 ? "" : "s"}` : "",
    d.leadsWaiting > 0 ? `${d.leadsWaiting} lead${d.leadsWaiting === 1 ? "" : "s"} waiting` : "",
    d.draftsReady > 0 ? `${d.draftsReady} draft${d.draftsReady === 1 ? "" : "s"} ready` : "",
  ].filter(Boolean);

  const heroHtml = hero
    ? `<tr><td style="background:#0B6E23;border-radius:16px;padding:22px 24px;">
        <div style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(250,248,243,0.7);font-weight:700;padding-bottom:8px;">First thing</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;color:#FAF8F3;line-height:1.35;">${escape(hero.leadName?.trim() ? `${hero.leadName.trim()}: ${hero.reason}` : hero.reason)}</div>
        ${hero.context ? `<div style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:rgba(250,248,243,0.85);padding-top:8px;">${escape(hero.context)}</div>` : ""}
      </td></tr>
      <tr><td style="height:18px;"></td></tr>`
    : "";

  const restHtml = rest.length
    ? `<tr><td style="background:#FFFFFF;border:1px solid #E5E1D8;border-radius:16px;padding:20px 24px;">
        <div style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5A5A52;font-weight:700;padding-bottom:10px;">Also today</div>
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">${rest.map(itemRow).join("")}</table>
      </td></tr>
      <tr><td style="height:18px;"></td></tr>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAF8F3;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FAF8F3;">
<tr><td align="center" style="padding:34px 16px;">
  <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
    <tr><td style="padding-bottom:20px;">${LEAF_SVG}</td></tr>
    <tr><td style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:16px;color:#0A0F1C;padding-bottom:4px;">${hello}</td></tr>
    <tr><td style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5A5A52;padding-bottom:20px;">${summaryBits.length ? escape(summaryBits.join(" · ")) : "Here is where things stand."}</td></tr>
    ${heroHtml}
    ${restHtml}
    <tr><td align="center" style="padding:6px 0 26px;">${pillButton(`${APP_ORIGIN}/command-center`, "Open the app")}</td></tr>
    <tr><td style="border-top:1px solid #E5E1D8;padding-top:18px;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0A0F1C;font-style:italic;">${escape(pulse.honestQuestion)}</td></tr>
    <tr><td align="center" style="padding-top:26px;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#9A9A95;line-height:1.6;">
      You only get this when something needs you.<br/>
      <a href="${APP_ORIGIN}/settings" style="color:#5A5A52;">Turn the brief off</a> · ElevateAI Systems
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const textLines = [
    hello,
    summaryBits.length ? summaryBits.join(" · ") : "Here is where things stand.",
    "",
    hero ? `FIRST THING\n${hero.leadName?.trim() ? `${hero.leadName.trim()}: ` : ""}${hero.reason}${hero.context ? `\n${hero.context}` : ""}` : "",
    rest.length ? `\nALSO TODAY\n${rest.map((i) => `- ${i.leadName?.trim() ? `${i.leadName.trim()}: ` : ""}${i.reason}`).join("\n")}` : "",
    "",
    `Open the app: ${APP_ORIGIN}/command-center`,
    "",
    pulse.honestQuestion,
    "",
    `You only get this when something needs you. Turn the brief off: ${APP_ORIGIN}/settings`,
  ].filter((l) => l !== "");

  return { subject: briefSubject(pulse), html, text: textLines.join("\n") };
}

/** Full decision: render only when there is something to say. */
export function decideBrief(input: BriefInput): BriefDecision {
  if (!hasSomethingToSay(input.pulse)) return { send: false, reason: "nothing_to_say" };
  return { send: true, rendered: renderBrief(input) };
}

export async function sendBrief(
  to: string,
  rendered: RenderedBrief,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "no_resend_key" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        reply_to: "sunny.binjola@gmail.com",
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      return { ok: false, error: `resend_${res.status}: ${msg.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
