// lib/email/referral-invite.ts
//
// Sent FROM Sunny TO a friend when someone refers them via /refer.
//
// "Hey {Friend}. {Referrer} thought of you." Warm. Personal.
// Includes the optional one-line note from the referrer. CTA: free Snapshot.

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";
const FROM_EMAIL = process.env.BRAND_OS_RECOVERY_FROM ?? "Sunny Binjola <sunny@elevateaisystem.com>";

const LEAF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 88 88" style="display:block;"><rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/><path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/><path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`;

export type ReferralInviteInput = {
  to: string;
  friendFirstName: string;
  referrerFirstName: string;
  note?: string | null;
};

export type RenderedReferral = {
  subject: string;
  preview: string;
  html: string;
  text: string;
};

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Email-safe button: table-based bgcolor + inline color on <a>.
// Gmail strips background-color from <a> inline styles. The TD bgcolor survives.
function pillButton(href: string, label: string, bg: string, fg: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:0 auto;">
    <tr>
      <td align="center" bgcolor="${bg}" style="background-color:${bg};border-radius:100px;padding:0;">
        <a href="${href}" style="display:inline-block;color:${fg};font-weight:700;text-decoration:none;padding:14px 28px;font-family:'Plus Jakarta Sans',Helvetica,Arial,sans-serif;font-size:14px;letter-spacing:0.01em;">${label}</a>
      </td>
    </tr>
  </table>`;
}

export function renderReferralInviteEmail(input: ReferralInviteInput): RenderedReferral {
  const friend = input.friendFirstName.trim();
  const referrer = input.referrerFirstName.trim();
  const greet = friend ? `${friend}.` : "Hey.";

  const snapshotLink = `${APP_ORIGIN}/snapshot?email=${encodeURIComponent(input.to)}&first_name=${encodeURIComponent(friend)}&audience=M&ref=${encodeURIComponent(referrer)}`;

  const noteBlock = input.note?.trim()
    ? `<p style="margin:0 0 16px;font-style:italic;color:#0B6E23;font-weight:600;border-left:3px solid #0B6E23;padding-left:14px;">${escape(input.note.trim())}</p>
       <p style="margin:0 0 16px;font-size:12pt;color:#5A5A52;text-align:right;">— ${escape(referrer)}</p>`
    : "";

  const subject = `${referrer} sent you this.`;
  const preview = "A short personalized voice + brand profile. Free.";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F3;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0A0F1C;">
  <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${preview}</span>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAF8F3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;width:100%;">

        <tr><td align="center" style="padding:0 0 28px;">
          ${LEAF_SVG}
          <div style="font-family:'JetBrains Mono','SF Mono',Menlo,Consolas,monospace;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-top:14px;">
            From ${escape(referrer)}, via Sunny
          </div>
        </td></tr>

        <tr><td align="center" style="padding:32px 0 12px;">
          <h1 style="margin:0;font-size:40pt;line-height:1.05;font-weight:800;letter-spacing:-0.02em;color:#0A0F1C;font-family:'Playfair Display',Georgia,serif;">${escape(greet)}</h1>
        </td></tr>
        <tr><td align="center" style="padding:0 0 36px;">
          <h2 style="margin:0;font-size:22pt;line-height:1.2;font-weight:600;color:#0A0F1C;font-family:'Playfair Display',Georgia,serif;">
            ${escape(referrer)} thought of <em style="font-style:italic;color:#0B6E23;font-weight:700;">you.</em>
          </h2>
        </td></tr>

        <tr><td style="padding:0 8px 28px;font-size:17px;line-height:1.65;color:#0A0F1C;">
          ${noteBlock}
          <p style="margin:0 0 14px;">${escape(referrer)} just finished their Brand OS with us. A short profile pulled from a few quick answers. <strong>Their archetype. Voice rules. Three pillars.</strong> They thought you would want yours too.</p>
          <p style="margin:0;">It is free. Ten minutes. No account needed to start.</p>
        </td></tr>

        <tr><td align="center" style="padding:0 0 32px;">
          <div style="display:inline-block;width:32px;height:2px;background:#0B6E23;border-radius:2px;"></div>
        </td></tr>

        <tr><td style="padding:0 0 24px;">
          <a href="${snapshotLink}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-radius:14px;padding:28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:64px;vertical-align:top;padding-right:18px;">
                  <div style="font-family:'Playfair Display',Georgia,serif;font-size:42pt;line-height:1;font-weight:700;color:#0B6E23;letter-spacing:-0.02em;">01</div>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-family:'JetBrains Mono',monospace;font-size:10pt;letter-spacing:1.8px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:6px;">
                    Name your voice <span style="color:#0B6E23;">· 10 minutes</span>
                  </div>
                  <div style="font-size:19pt;line-height:1.35;color:#0A0F1C;font-weight:700;margin-bottom:8px;font-family:'Playfair Display',Georgia,serif;">Your archetype, voice rules, three pillars.</div>
                  <div style="font-size:14pt;line-height:1.6;color:#5A5A52;margin-bottom:18px;">Five questions. The platform reads you back. The first thing you write after is the most you.</div>
                </td>
              </tr>
            </table>
          </a>
        </td></tr>

        <tr><td align="center" style="padding:0 0 36px;">
          ${pillButton(snapshotLink, "Start your Snapshot →", "#0B6E23", "#FFFFFF")}
        </td></tr>

        <tr><td style="padding:0 8px 28px;font-size:16pt;line-height:1.65;color:#0A0F1C;">
          <p style="margin:0 0 14px;">Reply to this email if anything is unclear. I read every one.</p>
          <p style="margin:0;">Sunny.</p>
        </td></tr>

        <tr><td align="center" style="padding:32px 0 0;font-size:11pt;line-height:1.7;color:#5A5A52;font-family:'JetBrains Mono',monospace;letter-spacing:0.5px;">
          ElevateAI Systems · sunny.binjola@gmail.com
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${greet}

${referrer} thought of you.

${input.note?.trim() ? `"${input.note.trim()}"\n  — ${referrer}\n\n` : ""}${referrer} just finished their Brand OS with us. A short profile pulled from a few quick answers. Their archetype. Voice rules. Three pillars. They thought you would want yours too.

It is free. Ten minutes. No account needed to start.

Start your Snapshot: ${snapshotLink}

Reply to this email if anything is unclear. I read every one.

Sunny.

ElevateAI Systems · sunny.binjola@gmail.com`;

  return { subject, preview, html, text };
}

export async function sendReferralInviteEmail(input: ReferralInviteInput): Promise<{ ok: boolean; error?: string; rendered: RenderedReferral }> {
  const rendered = renderReferralInviteEmail(input);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "no_resend_key", rendered };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: input.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        reply_to: "sunny.binjola@gmail.com",
      }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => "");
      return { ok: false, error: `resend_${res.status}: ${msg.slice(0, 200)}`, rendered };
    }
    return { ok: true, rendered };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), rendered };
  }
}
