// lib/email/onboarding.ts
//
// Coach Platform onboarding email — fires on first successful signin.
//
// Goal: get the coach to the activation moment (Voice + AI drafting in
// their style) as fast as possible. Brand OS is the second step. Every
// other feature is one line at the bottom so the email never feels
// overwhelming.
//
// Copywriting rules applied (Books/_synthesis/2026-06-06-copywriting-playbook):
//   Sugarman   8-word first sentence. Honesty trigger.
//   Halbert    Letter to one person. Signed by Sunny.
//   Heath      Concrete next moves. No feature dump.
//   Schwartz   Matches L4-L5 awareness (just signed up).
//   Bly        Subject + first line carry the open.
//   Sunny rule No em dashes. Periods, parentheses, commas only.

export type OnboardingEmailInput = {
  to: string;
  firstName: string | null;
  /** Deep link to a claimed Snapshot reveal, if any. */
  snapshotRevealUrl?: string | null;
};

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";
const FROM_EMAIL = process.env.BRAND_OS_RECOVERY_FROM ?? "Sunny Binjola <sunny@elevateaisystem.com>";

export function renderOnboardingEmailHtml(input: {
  firstName: string | null;
  snapshotRevealUrl?: string | null;
}): { html: string; text: string; subject: string; preview: string } {
  const greet = input.firstName ? `Hey ${input.firstName}.` : "Hey.";
  const hasSnapshot = Boolean(input.snapshotRevealUrl);

  const subject = "You're in. Read this once.";
  const preview = "Three minutes. Then I get out of your way.";

  // If they came in through the public Snapshot funnel we open the loop on
  // their existing archetype. Otherwise we lead with Voice (the activation moment).
  const step1 = hasSnapshot
    ? {
        eyebrow: "Step 1 · Re-read your Snapshot",
        title: "Your archetype is already named. Open it.",
        body: "Read it slow. Put your phone down before you finish. The first thing you write after is the most you.",
        href: input.snapshotRevealUrl!,
        cta: "Open my Snapshot →",
        accent: "#0B6E23",
      }
    : {
        eyebrow: "Step 1 · Build your Voice (5 minutes)",
        title: "Teach the platform how you actually write.",
        body: "Five short prompts. The AI listens to your cadence, your refusals, the words you would never use. From this point on, every draft you see is in your voice.",
        href: `${APP_ORIGIN}/welcome`,
        cta: "Set up Voice →",
        accent: "#0B6E23",
      };

  const step2 = hasSnapshot
    ? {
        eyebrow: "Step 2 · Build your Voice",
        title: "Teach the platform how you write.",
        body: "Five short prompts. Once Voice is set, every draft you see across the app (Content, Leads, Sessions) is already in your style.",
        href: `${APP_ORIGIN}/welcome`,
        cta: "Set up Voice →",
        accent: "#0A0F1C",
      }
    : {
        eyebrow: "Step 2 · Name your voice with Brand OS",
        title: "Five questions. Ten minutes. Your archetype.",
        body: "Voice teaches the AI how you write. Brand OS teaches it what your work is for. Together they cover signal and strategy.",
        href: `${APP_ORIGIN}/brand-os`,
        cta: "Start Brand OS →",
        accent: "#0A0F1C",
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
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAF8F3;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;">

        <!-- Wordmark -->
        <tr><td style="padding:0 0 28px;">
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0B6E23;font-weight:700;">
            <span style="display:inline-block;width:8px;height:8px;background:#0B6E23;border-radius:50%;vertical-align:middle;margin-right:8px;"></span>
            ElevateAI · Coach Platform
          </div>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:0 0 8px;">
          <h1 style="margin:0;font-size:34px;line-height:1.1;font-weight:800;letter-spacing:-0.01em;color:#0A0F1C;">${greet}</h1>
        </td></tr>
        <tr><td style="padding:0 0 24px;">
          <h2 style="margin:0;font-size:22px;line-height:1.2;font-weight:700;color:#0A0F1C;">
            You are <em style="font-style:italic;color:#0B6E23;">in.</em>
          </h2>
        </td></tr>

        <!-- Halbert opening -->
        <tr><td style="padding:0 0 18px;font-size:17px;line-height:1.6;color:#0A0F1C;">
          <p style="margin:0 0 14px;">No tutorial. No welcome video. No 47-page onboarding.</p>
          <p style="margin:0 0 14px;">The platform is one promise. Every draft. Every message. Every piece of content. In your voice. Not a coach impression. Yours.</p>
          <p style="margin:0;">Two short moves get you there.</p>
        </td></tr>

        <!-- Step 1 -->
        <tr><td style="padding:20px 0 0;">
          <a href="${step1.href}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-left:4px solid ${step1.accent};border-radius:10px;padding:18px 22px;margin:0 0 12px;">
            <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${step1.accent};font-weight:700;margin-bottom:6px;">${step1.eyebrow}</div>
            <div style="font-size:17px;line-height:1.4;color:#0A0F1C;font-weight:700;margin-bottom:4px;">${step1.title}</div>
            <div style="font-size:14px;line-height:1.55;color:#5A5A52;">${step1.body}</div>
            <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-top:10px;">${step1.cta}</div>
          </a>
        </td></tr>

        <!-- Step 2 -->
        <tr><td>
          <a href="${step2.href}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-left:4px solid ${step2.accent};border-radius:10px;padding:18px 22px;margin:0 0 28px;">
            <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${step2.accent};font-weight:700;margin-bottom:6px;">${step2.eyebrow}</div>
            <div style="font-size:17px;line-height:1.4;color:#0A0F1C;font-weight:700;margin-bottom:4px;">${step2.title}</div>
            <div style="font-size:14px;line-height:1.55;color:#5A5A52;">${step2.body}</div>
            <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-top:10px;">${step2.cta}</div>
          </a>
        </td></tr>

        <!-- Platform map -->
        <tr><td style="padding:0 0 28px;">
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:14px;">
            What's inside (when you are ready)
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #E5E1D8;font-size:14px;color:#0A0F1C;">
                <strong style="color:#0B6E23;">Voice</strong> · draft anything in your style. The activation moment.
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #E5E1D8;font-size:14px;color:#0A0F1C;">
                <strong style="color:#0B6E23;">Brand OS</strong> · your archetype, voice rules, and three pillars.
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #E5E1D8;font-size:14px;color:#0A0F1C;">
                <strong style="color:#0B6E23;">Content</strong> · write, polish, publish. The AI does the boring part.
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #E5E1D8;font-size:14px;color:#0A0F1C;">
                <strong style="color:#0B6E23;">Leads + Clients</strong> · the people pipeline, drafted in your voice.
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:14px;color:#0A0F1C;">
                <strong style="color:#0B6E23;">Sessions</strong> · capture coaching calls, searchable, surfaced when relevant.
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Reply prompt -->
        <tr><td style="padding:0 0 28px;">
          <div style="background:#FFFFFF;border:1px solid #E5E1D8;border-left:4px solid #5A5A52;border-radius:10px;padding:18px 22px;">
            <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:6px;">Reply to this email</div>
            <div style="font-size:17px;line-height:1.4;color:#0A0F1C;font-weight:700;margin-bottom:4px;">Tell me one bottleneck. One sentence.</div>
            <div style="font-size:14px;line-height:1.55;color:#5A5A52;">Whatever is in the way of you actually shipping your real voice. I read every reply. This is how I learn what to build next.</div>
          </div>
        </td></tr>

        <!-- Promise + sign-off -->
        <tr><td style="padding:0 0 18px;font-size:16px;line-height:1.6;color:#0A0F1C;">
          <p style="margin:0 0 14px;">Two steps. That is the whole onboarding.</p>
          <p style="margin:0 0 14px;">Everything else fills in as you use it.</p>
          <p style="margin:0;">Sunny.</p>
        </td></tr>

        <!-- PS -->
        <tr><td style="padding:0 0 8px;border-top:1px solid #E5E1D8;">
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5A5A52;">
            <strong style="color:#0A0F1C;">PS.</strong> If the AI ever sounds like a coach instead of you, hit reply with the exact line. That is a bug I want to know about.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:32px 0 0;font-size:11px;line-height:1.6;color:#5A5A52;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:0.5px;">
          ElevateAI Systems · sunny.binjola@gmail.com<br>
          You are getting this because you signed up at elevateaisystem.com.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${greet}

You are in.

No tutorial. No welcome video. No 47-page onboarding.

The platform is one promise. Every draft. Every message. Every piece of content. In your voice.

Two short moves get you there.

STEP 1 · ${step1.eyebrow.replace(/^Step 1 · /, "")}
${step1.title}
${step1.body}
${step1.href}

STEP 2 · ${step2.eyebrow.replace(/^Step 2 · /, "")}
${step2.title}
${step2.body}
${step2.href}

WHAT IS INSIDE (when you are ready)
- Voice: draft anything in your style. The activation moment.
- Brand OS: your archetype, voice rules, and three pillars.
- Content: write, polish, publish. The AI does the boring part.
- Leads + Clients: the people pipeline, drafted in your voice.
- Sessions: capture coaching calls, surfaced when relevant.

REPLY TO THIS EMAIL
Tell me one bottleneck. One sentence. I read every reply.

Two steps. That is the whole onboarding. Everything else fills in as you use it.

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
