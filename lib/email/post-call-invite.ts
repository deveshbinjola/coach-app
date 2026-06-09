// lib/email/post-call-invite.ts
//
// The "after our call" outreach email Sunny sends manually from /admin/outreach.
// Designed to:
//   1. Acknowledge the call. (Halbert letter voice.)
//   2. Quote one alive thing they said (if Sunny entered a note).
//   3. Hand them the one move next: a prefilled link into the public Snapshot
//      funnel. They open it, the email field is filled, they click through.
//   4. When they finish Snapshot + sign up, /auth/callback fires Day 0 welcome
//      and the daily cron picks them up for Day 1 onward.
//
// One personal touch from Sunny + the 5-day drip behind it.

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";
const MARKETING_ORIGIN = "https://elevateaisystem.com";
const FROM_EMAIL = process.env.BRAND_OS_RECOVERY_FROM ?? "Sunny Binjola <sunny@elevateaisystem.com>";

const LEAF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 88 88" style="display:block;"><rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/><path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/><path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`;

export type PostCallInviteInput = {
  to: string;
  firstName: string;
  /** Optional. Paraphrase or direct quote of the moment Sunny wants to mirror back. */
  note?: string | null;
  /** Optional. Override the default Snapshot CTA. */
  ctaOverride?: {
    href: string;
    title: string;
    description: string;
    cta: string;
    eyebrow?: string;
    time?: string;
  } | null;
  /** Optional. Custom PS line. */
  ps?: string | null;
};

export type RenderedPostCall = {
  subject: string;
  preview: string;
  html: string;
  text: string;
  snapshotLink: string;
};

export function renderPostCallInviteEmail(input: PostCallInviteInput): RenderedPostCall {
  const first = input.firstName.trim();
  const greet = first ? `${first}.` : "Hey.";

  // Post-call recipients have already talked to Sunny. They trust him.
  // Skip the Snapshot funnel and drop them straight into the app:
  //   /login?email=...&next=/welcome auto-fires the magic-link send on
  //   mount. They see "Check your inbox" within a second of clicking.
  //   They click the magic link → /auth/callback → Day 0 + drip starts.
  const snapshotLink = `${APP_ORIGIN}/login?email=${encodeURIComponent(input.to)}&next=/welcome`;

  const cta = input.ctaOverride ?? {
    href: snapshotLink,
    eyebrow: "Your first move",
    time: "30 seconds",
    title: "Open the platform.",
    description: "One click. We send a magic link to this inbox. You click it once and you are in. No password to remember.",
    cta: "Open the platform",
  };

  const noteBlock = input.note?.trim()
    ? `
        <p style="margin:0 0 16px;">The thing that stayed with me after we hung up:</p>
        <p style="margin:0 0 16px;font-style:italic;color:#0B6E23;font-weight:600;border-left:3px solid #0B6E23;padding-left:14px;">
          ${escape(input.note.trim())}
        </p>
        <p style="margin:0;">That is the part the platform is built to hold.</p>`
    : `
        <p style="margin:0 0 16px;">Good talk. I want to make sure you have what we discussed in front of you.</p>
        <p style="margin:0;">The platform is one promise. Every draft. Every message. In your voice.</p>`;

  const psBlock = input.ps?.trim()
    ? `
        <tr><td style="padding:24px 0 0;border-top:1px solid #E5E1D8;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#5A5A52;">
            <strong style="color:#0A0F1C;">PS.</strong> ${escape(input.ps.trim())}
          </p>
        </td></tr>`
    : "";

  const subject = first ? `${first}. Good talk.` : "Good talk. One move next.";
  const preview = "One thing from our call. One move next.";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F3;font-family:-apple-system,BlinkMacSystemFont,'Plus Jakarta Sans',Segoe UI,sans-serif;color:#0A0F1C;">
  <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${preview}</span>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAF8F3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;width:100%;">

        <tr><td align="center" style="padding:0 0 28px;">
          ${LEAF_SVG}
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-top:14px;">
            After our call
          </div>
        </td></tr>

        <tr><td align="center" style="padding:32px 0 12px;">
          <h1 style="margin:0;font-size:40px;line-height:1.05;font-weight:800;letter-spacing:-0.02em;color:#0A0F1C;">${escape(greet)}</h1>
        </td></tr>
        <tr><td align="center" style="padding:0 0 36px;">
          <h2 style="margin:0;font-size:24px;line-height:1.2;font-weight:600;color:#0A0F1C;">
            Good talk <em style="font-style:italic;color:#0B6E23;font-weight:700;">today.</em>
          </h2>
        </td></tr>

        <tr><td style="padding:0 4px 32px;font-size:17px;line-height:1.65;color:#0A0F1C;">
          ${noteBlock}
        </td></tr>

        <tr><td align="center" style="padding:0 0 32px;">
          <div style="display:inline-block;width:32px;height:2px;background:#0B6E23;border-radius:2px;"></div>
        </td></tr>

        <tr><td style="padding:0 0 36px;">
          <a href="${cta.href}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-radius:14px;padding:28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:64px;vertical-align:top;padding-right:18px;">
                  <div style="font-family:'Playfair Display',Georgia,serif;font-size:42px;line-height:1;font-weight:700;color:#0B6E23;letter-spacing:-0.02em;">01</div>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:6px;">
                    ${escape(cta.eyebrow ?? "Your first move")} <span style="color:#0B6E23;">· ${escape(cta.time ?? "10 min")}</span>
                  </div>
                  <div style="font-size:19px;line-height:1.35;color:#0A0F1C;font-weight:700;margin-bottom:8px;">${escape(cta.title)}</div>
                  <div style="font-size:14px;line-height:1.6;color:#5A5A52;margin-bottom:14px;">${escape(cta.description)}</div>
                  <div style="display:inline-block;font-size:14px;color:#FAF8F3;background:#0B6E23;font-weight:700;padding:9px 16px;border-radius:100px;">${escape(cta.cta)} →</div>
                </td>
              </tr>
            </table>
          </a>
        </td></tr>

        <tr><td style="padding:0 4px 28px;font-size:17px;line-height:1.65;color:#0A0F1C;">
          <p style="margin:0 0 14px;">Reply to this email when you have done the first move. One sentence is enough.</p>
          <p style="margin:0 0 14px;">If anything sticks or anything trips, I want to know.</p>
          <p style="margin:0;">Sunny.</p>
        </td></tr>

        ${psBlock}

        <tr><td align="center" style="padding:32px 0 0;font-size:11px;line-height:1.7;color:#5A5A52;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:0.5px;">
          ElevateAI Systems · sunny.binjola@gmail.com
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${greet}

Good talk today.

${input.note?.trim() ? `The thing that stayed with me after we hung up:\n\n"${input.note.trim()}"\n\nThat is the part the platform is built to hold.` : `Good talk. I want to make sure you have what we discussed in front of you.\n\nThe platform is one promise. Every draft. Every message. In your voice.`}

YOUR FIRST MOVE · ${cta.time ?? "10 min"}
${cta.title}
${cta.description}
${cta.href}

Reply to this email when you have done the first move. One sentence is enough.
If anything sticks or anything trips, I want to know.

Sunny.${input.ps?.trim() ? `\n\nPS. ${input.ps.trim()}` : ""}

ElevateAI Systems · sunny.binjola@gmail.com`;

  return { subject, preview, html, text, snapshotLink };
}

export async function sendPostCallInviteEmail(input: PostCallInviteInput): Promise<{ ok: boolean; error?: string; rendered: RenderedPostCall }> {
  const rendered = renderPostCallInviteEmail(input);
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

// Minimal HTML escape for user-provided strings (note, ps, names).
function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
