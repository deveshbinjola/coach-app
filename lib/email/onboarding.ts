// lib/email/onboarding.ts
//
// Brand OS onboarding email — fires on first successful signin.
//
// Copywriting rules applied (from Books/_synthesis/2026-06-06-copywriting-playbook):
//  - Sugarman: 8-word first sentence. Honesty trigger. No multisyllabic words at the top.
//  - Halbert: written as a letter to one person. No corporate "we".
//  - Heath: concrete over abstract. Specific next moves. No generic features list.
//  - Schwartz: matches L4–L5 awareness (they just signed up; they know the product).
//  - Bly: subject + first line carry 80% of the open + engagement.
//  - Sunny rule: NO em dashes. Periods, parentheses, commas only.

export type OnboardingEmailInput = {
  to: string;
  firstName: string | null;
  /** If they have a Snapshot run already, deep-link straight to the reveal. */
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

  const snapshotBlock = hasSnapshot
    ? `
      <a href="${input.snapshotRevealUrl}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-left:4px solid #0B6E23;border-radius:10px;padding:18px 22px;margin:0 0 12px;">
        <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#0B6E23;font-weight:700;margin-bottom:6px;">Step 1 · Re-read your Snapshot</div>
        <div style="font-size:17px;line-height:1.4;color:#0A0F1C;font-weight:700;margin-bottom:4px;">Your archetype is already named. Open it.</div>
        <div style="font-size:14px;line-height:1.55;color:#5A5A52;">Read it slow. Put your phone down before you finish. The first thing you write after is the most you.</div>
        <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-top:10px;">Open my Snapshot →</div>
      </a>`
    : `
      <a href="${APP_ORIGIN}/brand-os" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-left:4px solid #0B6E23;border-radius:10px;padding:18px 22px;margin:0 0 12px;">
        <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#0B6E23;font-weight:700;margin-bottom:6px;">Step 1 · Name your voice</div>
        <div style="font-size:17px;line-height:1.4;color:#0A0F1C;font-weight:700;margin-bottom:4px;">Five questions. Ten minutes. Your archetype.</div>
        <div style="font-size:14px;line-height:1.55;color:#5A5A52;">If you have not taken the Snapshot yet, start there. It is the door to everything else.</div>
        <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-top:10px;">Start Snapshot →</div>
      </a>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${subject}</title>
<style>
  @media (prefers-color-scheme: dark) {
    body, .frame { background:#FAF8F3 !important; color:#0A0F1C !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#FAF8F3;font-family:-apple-system,BlinkMacSystemFont,'Plus Jakarta Sans',Segoe UI,sans-serif;color:#0A0F1C;">
  <span style="display:none;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">${preview}</span>
  <table role="presentation" class="frame" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAF8F3;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="max-width:560px;width:100%;">

        <!-- Wordmark -->
        <tr><td style="padding:0 0 28px;">
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#0B6E23;font-weight:700;">
            <span style="display:inline-block;width:8px;height:8px;background:#0B6E23;border-radius:50%;vertical-align:middle;margin-right:8px;"></span>
            ElevateAI · Brand OS
          </div>
        </td></tr>

        <!-- Hero -->
        <tr><td style="padding:0 0 8px;">
          <h1 style="margin:0;font-size:34px;line-height:1.1;font-weight:800;letter-spacing:-0.01em;color:#0A0F1C;">
            ${greet}
          </h1>
        </td></tr>
        <tr><td style="padding:0 0 24px;">
          <h2 style="margin:0;font-size:22px;line-height:1.2;font-weight:700;color:#0A0F1C;">
            You are <em style="font-style:italic;color:#0B6E23;">in.</em>
          </h2>
        </td></tr>

        <!-- Halbert opening: short sentences, letter voice -->
        <tr><td style="padding:0 0 18px;font-size:17px;line-height:1.6;color:#0A0F1C;">
          <p style="margin:0 0 14px;">No tutorial. No welcome video. No 47-page onboarding.</p>
          <p style="margin:0 0 14px;">Brand OS is a mirror. You answer. It reads you back. That is it.</p>
          <p style="margin:0 0 0;">Here is the only path you need today.</p>
        </td></tr>

        <!-- Step 1 -->
        <tr><td style="padding:20px 0 0;">${snapshotBlock}</td></tr>

        <!-- Step 2 -->
        <tr><td>
          <a href="${APP_ORIGIN}/brand-os" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-left:4px solid #0A0F1C;border-radius:10px;padding:18px 22px;margin:0 0 12px;">
            <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#0A0F1C;font-weight:700;margin-bottom:6px;">Step 2 · When you are ready</div>
            <div style="font-size:17px;line-height:1.4;color:#0A0F1C;font-weight:700;margin-bottom:4px;">Go deeper. The Full Round.</div>
            <div style="font-size:14px;line-height:1.55;color:#5A5A52;">Eleven more questions. Twenty-two minutes. The draft is held twenty-four hours before you can publish it. Free.</div>
            <div style="font-size:13px;color:#0B6E23;font-weight:700;margin-top:10px;">Open the app →</div>
          </a>
        </td></tr>

        <!-- Step 3 -->
        <tr><td>
          <div style="background:#FFFFFF;border:1px solid #E5E1D8;border-left:4px solid #5A5A52;border-radius:10px;padding:18px 22px;margin:0 0 28px;">
            <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:6px;">Step 3 · Reply to this email</div>
            <div style="font-size:17px;line-height:1.4;color:#0A0F1C;font-weight:700;margin-bottom:4px;">Tell me one bottleneck. One sentence.</div>
            <div style="font-size:14px;line-height:1.55;color:#5A5A52;">Whatever is in the way of you actually shipping your real voice. I read every reply. This is how I learn what to build next.</div>
          </div>
        </td></tr>

        <!-- Promise + sign-off -->
        <tr><td style="padding:0 0 18px;font-size:16px;line-height:1.6;color:#0A0F1C;">
          <p style="margin:0 0 14px;">Sit with the Snapshot first. Sleep on it. The draft is allowed to be uncomfortable.</p>
          <p style="margin:0 0 14px;">The best work comes out of the hold.</p>
          <p style="margin:0 0 0;">Sunny.</p>
        </td></tr>

        <!-- PS · Heath: specific, concrete -->
        <tr><td style="padding:0 0 8px;border-top:1px solid #E5E1D8;margin-top:24px;">
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#5A5A52;">
            <strong style="color:#0A0F1C;">PS.</strong> If the AI ever sounds like a coach instead of you, hit reply with the exact line. That is a bug I want to know about.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:32px 0 0;font-size:11px;line-height:1.6;color:#5A5A52;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:0.5px;">
          ElevateAI Systems · sunny.binjola@gmail.com<br>
          You are getting this because you signed up for Brand OS at elevateaisystem.com.
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${greet}

You are in.

No tutorial. No welcome video. No 47-page onboarding.

Brand OS is a mirror. You answer. It reads you back. That is it.

Here is the only path you need today.

STEP 1 · ${hasSnapshot ? "Re-read your Snapshot" : "Name your voice"}
${hasSnapshot
  ? `Your archetype is already named. Open it slow. Put your phone down before you finish.
${input.snapshotRevealUrl}`
  : `Five questions. Ten minutes. Your archetype.
${APP_ORIGIN}/brand-os`}

STEP 2 · When you are ready
Go deeper. The Full Round. Eleven more questions. Twenty-two minutes. The draft is held twenty-four hours before you can publish it. Free.
${APP_ORIGIN}/brand-os

STEP 3 · Reply to this email
Tell me one bottleneck. One sentence. I read every reply.

Sit with the Snapshot first. Sleep on it. The draft is allowed to be uncomfortable. The best work comes out of the hold.

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
