// lib/email/onboarding.ts
//
// Coach Platform onboarding email — fires on first successful signin.
//
// Tight + warm. No throat-clearing. The opener IS the promise.
// Two steps. A simple map. One reply prompt. Sunny signs his name.

export type OnboardingEmailInput = {
  to: string;
  firstName: string | null;
  /** Deep link to a claimed Snapshot reveal, if any. */
  snapshotRevealUrl?: string | null;
};

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";
const FROM_EMAIL = process.env.BRAND_OS_RECOVERY_FROM ?? "Sunny Binjola <sunny@elevateaisystem.com>";

// Inline brand leaf — keeps the wordmark visual even when images are blocked.
const LEAF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 88 88" style="display:block;"><rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/><path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/><path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`;

export function renderOnboardingEmailHtml(input: {
  firstName: string | null;
  snapshotRevealUrl?: string | null;
}): { html: string; text: string; subject: string; preview: string } {
  const greet = input.firstName ? `Hey ${input.firstName}.` : "Hey.";
  const hasSnapshot = Boolean(input.snapshotRevealUrl);

  const subject = "You're in.";
  const preview = "The platform is one promise. Two moves to feel it.";

  const step1 = hasSnapshot
    ? {
        num: "01",
        eyebrow: "Re-read your Snapshot",
        time: "3 minutes",
        title: "Your archetype is already named.",
        body: "Read it slow. The first thing you write after is the most you.",
        href: input.snapshotRevealUrl!,
        cta: "Open my Snapshot",
      }
    : {
        num: "01",
        eyebrow: "Build your Voice",
        time: "5 minutes",
        title: "Teach the platform how you write.",
        body: "Five prompts. From this point on, every draft you see is in your voice.",
        href: `${APP_ORIGIN}/welcome`,
        cta: "Set up Voice",
      };

  const step2 = hasSnapshot
    ? {
        num: "02",
        eyebrow: "Build your Voice",
        time: "5 minutes",
        title: "Teach the platform how you write.",
        body: "Five prompts. Every draft from now on lands in your voice.",
        href: `${APP_ORIGIN}/welcome`,
        cta: "Set up Voice",
      }
    : {
        num: "02",
        eyebrow: "Name your voice",
        time: "10 minutes",
        title: "Your archetype with Brand OS.",
        body: "Voice teaches the AI how you write. Brand OS teaches it what your work is for.",
        href: `${APP_ORIGIN}/brand-os`,
        cta: "Start Brand OS",
      };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F3;font-family:-apple-system,BlinkMacSystemFont,'Plus Jakarta Sans',Segoe UI,sans-serif;color:#0A0F1C;">
  <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${preview}</span>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAF8F3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;width:100%;">

        <!-- Brand mark · centered -->
        <tr><td align="center" style="padding:0 0 28px;">
          ${LEAF_SVG}
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-top:14px;">
            ElevateAI · Coach Platform
          </div>
        </td></tr>

        <!-- Hero · centered + spacious -->
        <tr><td align="center" style="padding:32px 0 12px;">
          <h1 style="margin:0;font-size:40px;line-height:1.05;font-weight:800;letter-spacing:-0.02em;color:#0A0F1C;">
            ${greet}
          </h1>
        </td></tr>
        <tr><td align="center" style="padding:0 0 36px;">
          <h2 style="margin:0;font-size:24px;line-height:1.2;font-weight:600;color:#0A0F1C;">
            You are <em style="font-style:italic;color:#0B6E23;font-weight:700;">in.</em>
          </h2>
        </td></tr>

        <!-- Promise · centered, fewer words -->
        <tr><td align="center" style="padding:0 24px 40px;">
          <p style="margin:0 0 10px;font-size:18px;line-height:1.55;color:#0A0F1C;font-weight:500;">
            The platform is one promise.
          </p>
          <p style="margin:0 0 14px;font-size:18px;line-height:1.55;color:#5A5A52;">
            Every draft. Every message. In your voice.
          </p>
          <div style="display:inline-block;width:32px;height:2px;background:#0B6E23;border-radius:2px;"></div>
        </td></tr>

        <!-- STEP 01 -->
        <tr><td style="padding:0 0 16px;">
          <a href="${step1.href}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-radius:14px;padding:28px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:64px;vertical-align:top;padding-right:18px;">
                  <div style="font-family:'Playfair Display',Georgia,serif;font-size:42px;line-height:1;font-weight:700;color:#0B6E23;letter-spacing:-0.02em;">${step1.num}</div>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:6px;">
                    ${step1.eyebrow} <span style="color:#0B6E23;">· ${step1.time}</span>
                  </div>
                  <div style="font-size:19px;line-height:1.35;color:#0A0F1C;font-weight:700;margin-bottom:8px;">${step1.title}</div>
                  <div style="font-size:14px;line-height:1.6;color:#5A5A52;margin-bottom:14px;">${step1.body}</div>
                  <div style="display:inline-block;font-size:14px;color:#FAF8F3;background:#0B6E23;font-weight:700;padding:9px 16px;border-radius:100px;">${step1.cta} →</div>
                </td>
              </tr>
            </table>
          </a>
        </td></tr>

        <!-- Soft visual flow indicator -->
        <tr><td align="center" style="padding:6px 0 6px;">
          <div style="font-size:18px;color:#0B6E23;opacity:0.45;line-height:1;">↓</div>
        </td></tr>

        <!-- STEP 02 -->
        <tr><td style="padding:0 0 40px;">
          <a href="${step2.href}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-radius:14px;padding:28px 28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:64px;vertical-align:top;padding-right:18px;">
                  <div style="font-family:'Playfair Display',Georgia,serif;font-size:42px;line-height:1;font-weight:700;color:#0A0F1C;letter-spacing:-0.02em;">${step2.num}</div>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:6px;">
                    ${step2.eyebrow} <span style="color:#0B6E23;">· ${step2.time}</span>
                  </div>
                  <div style="font-size:19px;line-height:1.35;color:#0A0F1C;font-weight:700;margin-bottom:8px;">${step2.title}</div>
                  <div style="font-size:14px;line-height:1.6;color:#5A5A52;margin-bottom:14px;">${step2.body}</div>
                  <div style="display:inline-block;font-size:14px;color:#FAF8F3;background:#0A0F1C;font-weight:700;padding:9px 16px;border-radius:100px;">${step2.cta} →</div>
                </td>
              </tr>
            </table>
          </a>
        </td></tr>

        <!-- Divider -->
        <tr><td align="center" style="padding:0 0 32px;">
          <div style="display:inline-block;width:32px;height:2px;background:#E5E1D8;border-radius:2px;"></div>
        </td></tr>

        <!-- What's inside · simpler -->
        <tr><td style="padding:0 0 36px;">
          <div align="center" style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:18px;text-align:center;">
            Everything else fills in as you use it
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td width="50%" style="padding:0 6px 12px 0;vertical-align:top;">
                <div style="background:#FFFFFF;border:1px solid #E5E1D8;border-radius:10px;padding:14px 16px;">
                  <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-bottom:2px;">Voice</div>
                  <div style="font-size:12px;color:#5A5A52;line-height:1.45;">Draft anything in your style.</div>
                </div>
              </td>
              <td width="50%" style="padding:0 0 12px 6px;vertical-align:top;">
                <div style="background:#FFFFFF;border:1px solid #E5E1D8;border-radius:10px;padding:14px 16px;">
                  <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-bottom:2px;">Brand OS</div>
                  <div style="font-size:12px;color:#5A5A52;line-height:1.45;">Archetype, voice rules, pillars.</div>
                </div>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding:0 6px 12px 0;vertical-align:top;">
                <div style="background:#FFFFFF;border:1px solid #E5E1D8;border-radius:10px;padding:14px 16px;">
                  <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-bottom:2px;">Content</div>
                  <div style="font-size:12px;color:#5A5A52;line-height:1.45;">Write, polish, publish.</div>
                </div>
              </td>
              <td width="50%" style="padding:0 0 12px 6px;vertical-align:top;">
                <div style="background:#FFFFFF;border:1px solid #E5E1D8;border-radius:10px;padding:14px 16px;">
                  <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-bottom:2px;">Leads + Clients</div>
                  <div style="font-size:12px;color:#5A5A52;line-height:1.45;">Your people pipeline.</div>
                </div>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:0;">
                <div style="background:#FFFFFF;border:1px solid #E5E1D8;border-radius:10px;padding:14px 16px;">
                  <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-bottom:2px;">Sessions</div>
                  <div style="font-size:12px;color:#5A5A52;line-height:1.45;">Capture coaching calls. Searchable. Surfaced when relevant.</div>
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Reply prompt · warmer -->
        <tr><td style="padding:0 0 36px;">
          <div style="background:#0A0F1C;border-radius:14px;padding:28px;text-align:center;">
            <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#0B6E23;font-weight:700;margin-bottom:10px;">
              Reply to this email
            </div>
            <div style="font-size:20px;line-height:1.35;color:#FAF8F3;font-weight:700;margin-bottom:8px;">
              Tell me one bottleneck.
            </div>
            <div style="font-size:14px;line-height:1.6;color:#FAF8F3;opacity:0.7;">
              One sentence. I read every reply.
            </div>
          </div>
        </td></tr>

        <!-- Sign-off · short -->
        <tr><td align="center" style="padding:0 0 32px;font-size:16px;line-height:1.6;color:#0A0F1C;">
          <p style="margin:0;">Sunny.</p>
        </td></tr>

        <!-- PS -->
        <tr><td style="padding:24px 0 0;border-top:1px solid #E5E1D8;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#5A5A52;">
            <strong style="color:#0A0F1C;">PS.</strong> If the AI ever sounds like a coach instead of you, hit reply with the exact line. That is a bug I want to know about.
          </p>
        </td></tr>

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

You are in.

The platform is one promise.
Every draft. Every message. In your voice.

STEP 01 · ${step1.eyebrow} · ${step1.time}
${step1.title}
${step1.body}
${step1.href}

  ↓

STEP 02 · ${step2.eyebrow} · ${step2.time}
${step2.title}
${step2.body}
${step2.href}

EVERYTHING ELSE FILLS IN AS YOU USE IT
- Voice: draft anything in your style.
- Brand OS: archetype, voice rules, pillars.
- Content: write, polish, publish.
- Leads + Clients: your people pipeline.
- Sessions: capture coaching calls.

REPLY TO THIS EMAIL
Tell me one bottleneck. One sentence. I read every reply.

Sunny.

PS. If the AI ever sounds like a coach instead of you, hit reply with the exact line.

ElevateAI Systems · sunny.binjola@gmail.com`;

  return { html, text, subject, preview };
}

export async function sendOnboardingEmail(input: OnboardingEmailInput): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: "no_resend_key" };

  const { html, text, subject } = renderOnboardingEmailHtml({
    firstName: input.firstName,
    snapshotRevealUrl: input.snapshotRevealUrl ?? null,
  });

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
        subject,
        html,
        text,
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
