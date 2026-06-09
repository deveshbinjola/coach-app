// lib/email/post-call-invite.ts
//
// "After our call" outreach email Sunny sends from /admin/outreach.
//
// Same warm scaffold as the Day 0 welcome email (centered leaf + hero,
// promise lines, two stacked cards with ↓ arrow, navy reply card,
// signed by Sunny). Two cards:
//
//   01  Open the platform · 30 seconds (magic-link auto-send)
//   02  Name your voice with Brand OS · 10 minutes
//
// Personal touch is the first name in the hero (entered in the form).
// PS line is optional, the only other admin-controlled copy.

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";
const FROM_EMAIL = process.env.BRAND_OS_RECOVERY_FROM ?? "Sunny Binjola <sunny@elevateaisystem.com>";

const LEAF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 88 88" style="display:block;"><rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/><path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/><path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`;

export type PostCallInviteInput = {
  to: string;
  firstName: string;
  /** Optional. Custom PS line at the bottom of the email. */
  ps?: string | null;
};

export type RenderedPostCall = {
  subject: string;
  preview: string;
  html: string;
  text: string;
  /** First-touch link Sunny may want to log/use. */
  entryLink: string;
};

export function renderPostCallInviteEmail(input: PostCallInviteInput): RenderedPostCall {
  const first = input.firstName.trim();
  const greet = first ? `${first}.` : "Hey.";

  // Both cards route through /login with email prefilled. The /login page
  // auto-fires the magic-link send on mount; after they click the magic link,
  // /auth/callback respects the ?next=... so they land where each card promised.
  const openPlatformUrl = `${APP_ORIGIN}/login?email=${encodeURIComponent(input.to)}&next=/welcome`;
  const brandOsUrl = `${APP_ORIGIN}/login?email=${encodeURIComponent(input.to)}&next=/brand-os`;

  const psBlock = input.ps?.trim()
    ? `
        <tr><td style="padding:24px 0 0;border-top:1px solid #E5E1D8;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#5A5A52;">
            <strong style="color:#0A0F1C;">PS.</strong> ${escape(input.ps.trim())}
          </p>
        </td></tr>`
    : "";

  const subject = first ? `${first}. Good talk.` : "Good talk.";
  const preview = "The platform is one promise. Two moves to feel it.";

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

        <!-- Brand mark + caption -->
        <tr><td align="center" style="padding:0 0 28px;">
          ${LEAF_SVG}
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-top:14px;">
            After our call
          </div>
        </td></tr>

        <!-- Hero -->
        <tr><td align="center" style="padding:32px 0 12px;">
          <h1 style="margin:0;font-size:40px;line-height:1.05;font-weight:800;letter-spacing:-0.02em;color:#0A0F1C;">${escape(greet)}</h1>
        </td></tr>
        <tr><td align="center" style="padding:0 0 36px;">
          <h2 style="margin:0;font-size:24px;line-height:1.2;font-weight:600;color:#0A0F1C;">
            Good <em style="font-style:italic;color:#0B6E23;font-weight:700;">talk.</em>
          </h2>
        </td></tr>

        <!-- Promise · same warmth as Day 0 welcome -->
        <tr><td align="center" style="padding:0 24px 40px;">
          <p style="margin:0 0 10px;font-size:18px;line-height:1.55;color:#0A0F1C;font-weight:500;">
            The platform is one promise.
          </p>
          <p style="margin:0 0 14px;font-size:18px;line-height:1.55;color:#5A5A52;">
            Every draft. Every message. In your voice.
          </p>
          <div style="display:inline-block;width:32px;height:2px;background:#0B6E23;border-radius:2px;"></div>
        </td></tr>

        <!-- Card 01 · Open the platform -->
        <tr><td style="padding:0 0 16px;">
          <a href="${openPlatformUrl}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-radius:14px;padding:28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:64px;vertical-align:top;padding-right:18px;">
                  <div style="font-family:'Playfair Display',Georgia,serif;font-size:42px;line-height:1;font-weight:700;color:#0B6E23;letter-spacing:-0.02em;">01</div>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:6px;">
                    Open the platform <span style="color:#0B6E23;">· 30 seconds</span>
                  </div>
                  <div style="font-size:19px;line-height:1.35;color:#0A0F1C;font-weight:700;margin-bottom:8px;">One click. We send a magic link.</div>
                  <div style="font-size:14px;line-height:1.6;color:#5A5A52;margin-bottom:14px;">You click it once and you are in. No password to remember.</div>
                  <div style="display:inline-block;font-size:14px;color:#FAF8F3;background:#0B6E23;font-weight:700;padding:9px 16px;border-radius:100px;">Open the platform →</div>
                </td>
              </tr>
            </table>
          </a>
        </td></tr>

        <!-- ↓ flow indicator -->
        <tr><td align="center" style="padding:6px 0;">
          <div style="font-size:18px;color:#0B6E23;opacity:0.45;line-height:1;">↓</div>
        </td></tr>

        <!-- Card 02 · Brand OS -->
        <tr><td style="padding:0 0 36px;">
          <a href="${brandOsUrl}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-radius:14px;padding:28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:64px;vertical-align:top;padding-right:18px;">
                  <div style="font-family:'Playfair Display',Georgia,serif;font-size:42px;line-height:1;font-weight:700;color:#0A0F1C;letter-spacing:-0.02em;">02</div>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:6px;">
                    Name your voice <span style="color:#0B6E23;">· 10 minutes</span>
                  </div>
                  <div style="font-size:19px;line-height:1.35;color:#0A0F1C;font-weight:700;margin-bottom:8px;">Your archetype with Brand OS.</div>
                  <div style="font-size:14px;line-height:1.6;color:#5A5A52;margin-bottom:14px;">Five questions. The platform reads you back. The first thing you write after is the most you.</div>
                  <div style="display:inline-block;font-size:14px;color:#FAF8F3;background:#0A0F1C;font-weight:700;padding:9px 16px;border-radius:100px;">Start Brand OS →</div>
                </td>
              </tr>
            </table>
          </a>
        </td></tr>

        <!-- Reply card -->
        <tr><td style="padding:0 0 36px;">
          <div style="background:#0A0F1C;border-radius:14px;padding:28px;text-align:center;">
            <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#0B6E23;font-weight:700;margin-bottom:10px;">Reply to this email</div>
            <div style="font-size:20px;line-height:1.35;color:#FAF8F3;font-weight:700;margin-bottom:8px;">Tell me one bottleneck.</div>
            <div style="font-size:14px;line-height:1.6;color:#FAF8F3;opacity:0.7;">One sentence. I read every reply.</div>
          </div>
        </td></tr>

        <!-- Sign-off -->
        <tr><td align="center" style="padding:0 0 18px;font-size:16px;line-height:1.6;color:#0A0F1C;">
          <p style="margin:0;">Sunny.</p>
        </td></tr>

        <!-- What to expect next · sets expectation for the 5-day drip -->
        <tr><td align="center" style="padding:0 0 24px;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#5A5A52;font-style:italic;">
            You will get a few short emails over the next few days. Each one shows you one more part of the platform.
          </p>
        </td></tr>

        ${psBlock}

        <!-- Footer -->
        <tr><td align="center" style="padding:32px 0 0;font-size:11px;line-height:1.7;color:#5A5A52;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:0.5px;">
          ElevateAI Systems · sunny.binjola@gmail.com
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${greet}

Good talk.

The platform is one promise.
Every draft. Every message. In your voice.

01 · OPEN THE PLATFORM · 30 SECONDS
One click. We send a magic link.
You click it once and you are in.
${openPlatformUrl}

   ↓

02 · NAME YOUR VOICE · 10 MINUTES
Your archetype with Brand OS.
Five questions. The platform reads you back.
${brandOsUrl}

REPLY TO THIS EMAIL
Tell me one bottleneck. One sentence. I read every reply.

Sunny.

You will get a few short emails over the next few days. Each one shows you one more part of the platform.${input.ps?.trim() ? `\n\nPS. ${input.ps.trim()}` : ""}

ElevateAI Systems · sunny.binjola@gmail.com`;

  return { subject, preview, html, text, entryLink: openPlatformUrl };
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

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
