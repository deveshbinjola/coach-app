// lib/email/archetype-result.ts
//
// Sent when a /meet visitor asks for their assistant archetype by email.
// Same email-safe scaffold as the other platform emails (tables, pill
// button, leaf mark). Platform Resend only; there is no coach yet.
//
// Sunny's rules: zero em dashes, plain honest copy, one CTA.

import type { Archetype } from "@/lib/assistant-interview";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";
const FROM_EMAIL = "Coach Assistant <brand-os@elevateaisystem.com>";

const LEAF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 88 88" style="display:block;"><rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/><path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/><path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`;

function pillButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="#0B6E23" style="background-color:#0B6E23;border-radius:100px;padding:0;">
        <a href="${href}" style="display:inline-block;color:#FAF8F3;font-weight:700;text-decoration:none;padding:14px 28px;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:14px;letter-spacing:0.01em;">${label}</a>
      </td>
    </tr>
  </table>`;
}

export type RenderedArchetypeEmail = {
  subject: string;
  html: string;
  text: string;
};

export function renderArchetypeEmail(archetype: Archetype): RenderedArchetypeEmail {
  const subject = `Your assistant archetype: ${archetype.name}`;

  const weekOneHtml = archetype.weekOne
    .map(
      (item) => `<tr>
        <td width="18" valign="top" style="padding:6px 10px 6px 0;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#0B6E23;"></span></td>
        <td style="padding:4px 0;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0A0F1C;">${item}</td>
      </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#FAF8F3;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FAF8F3;">
    <tr><td align="center" style="padding:36px 16px;">
      <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;width:100%;">
        <tr><td align="center" style="padding-bottom:22px;">${LEAF_SVG}</td></tr>
        <tr><td align="center" style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#0B6E23;font-weight:700;padding-bottom:12px;">Your assistant archetype</td></tr>
        <tr><td align="center" style="font-family:Georgia,'Times New Roman',serif;font-size:34px;font-weight:800;color:#0A0F1C;padding-bottom:10px;">${archetype.name}</td></tr>
        <tr><td align="center" style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#5A5A52;padding-bottom:26px;">${archetype.tagline}</td></tr>
        <tr><td style="background:#FFFFFF;border:1px solid #E5E1D8;border-radius:16px;padding:24px 26px;">
          <div style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#5A5A52;font-weight:700;padding-bottom:12px;">In week one, your assistant will</div>
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">${weekOneHtml}</table>
        </td></tr>
        <tr><td align="center" style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#0A0F1C;padding:26px 10px 20px;">
          It already knows this much about you from three questions. Imagine what it does with your voice, your leads, and your content.
        </td></tr>
        <tr><td align="center" style="padding-bottom:30px;">${pillButton(`${APP_ORIGIN}/login`, "Meet your assistant")}</td></tr>
        <tr><td align="center" style="font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:12px;color:#6A6A60;line-height:1.6;">
          Free to start. No credit card. Your answers travel with you.<br/>
          ElevateAI Systems · sunny.binjola@gmail.com
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `Your assistant archetype: ${archetype.name}

${archetype.tagline}

In week one, your assistant will:
${archetype.weekOne.map((i) => `- ${i}`).join("\n")}

It already knows this much about you from three questions. Imagine what it does with your voice, your leads, and your content.

Meet your assistant: ${APP_ORIGIN}/login

Free to start. No credit card. Your answers travel with you.
ElevateAI Systems · sunny.binjola@gmail.com`;

  return { subject, html, text };
}

export async function sendArchetypeEmail(
  to: string,
  archetype: Archetype,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "no_resend_key" };
  const rendered = renderArchetypeEmail(archetype);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
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
