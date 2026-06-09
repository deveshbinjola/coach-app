// lib/email/onboarding-sequence.ts
//
// 5-email onboarding drip. One feature per day.
//
//   Day 0  Welcome           Voice + Brand OS (activation)
//   Day 1  Content           write, polish, publish in your voice
//   Day 2  Leads + Clients   the people pipeline
//   Day 3  Sessions          coaching captured + surfaced
//   Day 4  Automations       Quizzes + Sequences (conversion machine)
//
// Cron at /api/cron/onboarding-drip iterates coaches where step < 5 AND
// last_sent_at < NOW() - 23h, sends next email, increments step.
//
// Sunny's rules applied across every email:
//   - Zero em dashes.
//   - Same visual scaffold (leaf + centered hero + numbered card + pill CTA + navy reply card).
//   - Each email ends with a one-line tease for tomorrow (except Day 4).
//   - Always Halbert-letter voice. Sunny signs.

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "https://app.elevateaisystem.com";

const LEAF_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 88 88" style="display:block;"><rect x="6" y="8" width="72" height="72" rx="18" fill="#0B6E23"/><path d="M26 56C24.9 44.1 27.9 34.6 36.5 28.8C43 24.4 50.8 24.8 58.8 18.9C62.2 34.2 58 47.3 47.1 53.2C40.1 57 33 56.7 28.2 54.7L26 56Z" fill="#FAF8F3"/><path d="M24.4 58.9C28.8 49.3 36.1 42.1 46.2 36.9" stroke="#FAF8F3" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`;

export type DripDayInput = {
  firstName: string | null;
  snapshotRevealUrl?: string | null; // only relevant for Day 0
};

export type RenderedEmail = {
  subject: string;
  preview: string;
  html: string;
  text: string;
};

// ============================================================
// Shared scaffold
// ============================================================

type ScaffoldInput = {
  firstName: string | null;
  eyebrow: string;          // top-right caption (e.g. "Day 2 of 5 · Pipeline")
  heroLineOne: string;      // "Hey Sunny."
  heroLineTwoStart: string; // "You are"
  heroAccent: string;       // "in." (italic green)
  promise: { one: string; two: string };
  bodyCard: BodyCardInput;
  teaseTomorrow: string | null;
  signOff?: string;
};

type BodyCardInput = {
  num: string;
  eyebrow: string;
  time?: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  accentColor: "green" | "ink"; // pill background
};

function scaffoldHtml(scaffold: ScaffoldInput): string {
  const pillBg = scaffold.bodyCard.accentColor === "green" ? "#0B6E23" : "#0A0F1C";
  const numColor = scaffold.bodyCard.accentColor === "green" ? "#0B6E23" : "#0A0F1C";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${scaffold.eyebrow}</title>
</head>
<body style="margin:0;padding:0;background:#FAF8F3;font-family:-apple-system,BlinkMacSystemFont,'Plus Jakarta Sans',Segoe UI,sans-serif;color:#0A0F1C;">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#FAF8F3;padding:48px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="540" style="max-width:540px;width:100%;">

        <!-- Brand mark + day counter -->
        <tr><td align="center" style="padding:0 0 28px;">
          ${LEAF_SVG}
          <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-top:14px;">
            ${scaffold.eyebrow}
          </div>
        </td></tr>

        <!-- Hero -->
        <tr><td align="center" style="padding:32px 0 12px;">
          <h1 style="margin:0;font-size:40px;line-height:1.05;font-weight:800;letter-spacing:-0.02em;color:#0A0F1C;">${scaffold.heroLineOne}</h1>
        </td></tr>
        <tr><td align="center" style="padding:0 0 36px;">
          <h2 style="margin:0;font-size:24px;line-height:1.2;font-weight:600;color:#0A0F1C;">
            ${scaffold.heroLineTwoStart} <em style="font-style:italic;color:#0B6E23;font-weight:700;">${scaffold.heroAccent}</em>
          </h2>
        </td></tr>

        <!-- Promise -->
        <tr><td align="center" style="padding:0 24px 40px;">
          <p style="margin:0 0 10px;font-size:18px;line-height:1.55;color:#0A0F1C;font-weight:500;">${scaffold.promise.one}</p>
          <p style="margin:0 0 14px;font-size:18px;line-height:1.55;color:#5A5A52;">${scaffold.promise.two}</p>
          <div style="display:inline-block;width:32px;height:2px;background:#0B6E23;border-radius:2px;"></div>
        </td></tr>

        <!-- Single feature card -->
        <tr><td style="padding:0 0 36px;">
          <a href="${scaffold.bodyCard.href}" style="display:block;text-decoration:none;color:inherit;background:#FFFFFF;border:1px solid #E5E1D8;border-radius:14px;padding:28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:64px;vertical-align:top;padding-right:18px;">
                  <div style="font-family:'Playfair Display',Georgia,serif;font-size:42px;line-height:1;font-weight:700;color:${numColor};letter-spacing:-0.02em;">${scaffold.bodyCard.num}</div>
                </td>
                <td style="vertical-align:top;">
                  <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#5A5A52;font-weight:700;margin-bottom:6px;">
                    ${scaffold.bodyCard.eyebrow}${scaffold.bodyCard.time ? ` <span style="color:#0B6E23;">· ${scaffold.bodyCard.time}</span>` : ""}
                  </div>
                  <div style="font-size:19px;line-height:1.35;color:#0A0F1C;font-weight:700;margin-bottom:8px;">${scaffold.bodyCard.title}</div>
                  <div style="font-size:14px;line-height:1.6;color:#5A5A52;margin-bottom:14px;">${scaffold.bodyCard.body}</div>
                  <div style="display:inline-block;font-size:14px;color:#FAF8F3;background:${pillBg};font-weight:700;padding:9px 16px;border-radius:100px;">${scaffold.bodyCard.cta} →</div>
                </td>
              </tr>
            </table>
          </a>
        </td></tr>

        <!-- Tease tomorrow -->
        ${scaffold.teaseTomorrow ? `
        <tr><td align="center" style="padding:0 0 32px;">
          <p style="margin:0;font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#5A5A52;font-weight:700;">${scaffold.teaseTomorrow}</p>
        </td></tr>` : ""}

        <!-- Reply prompt -->
        <tr><td style="padding:0 0 36px;">
          <div style="background:#0A0F1C;border-radius:14px;padding:28px;text-align:center;">
            <div style="font-family:'JetBrains Mono',ui-monospace,monospace;font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:#0B6E23;font-weight:700;margin-bottom:10px;">Reply to this email</div>
            <div style="font-size:20px;line-height:1.35;color:#FAF8F3;font-weight:700;margin-bottom:8px;">Tell me one bottleneck.</div>
            <div style="font-size:14px;line-height:1.6;color:#FAF8F3;opacity:0.7;">One sentence. I read every reply.</div>
          </div>
        </td></tr>

        <!-- Sign-off -->
        <tr><td align="center" style="padding:0 0 32px;font-size:16px;line-height:1.6;color:#0A0F1C;">
          <p style="margin:0;">${scaffold.signOff ?? "Sunny."}</p>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:24px 0 0;font-size:11px;line-height:1.7;color:#5A5A52;font-family:'JetBrains Mono',ui-monospace,monospace;letter-spacing:0.5px;border-top:1px solid #E5E1D8;">
          ElevateAI Systems · sunny.binjola@gmail.com
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function plainText(scaffold: ScaffoldInput): string {
  const tail = scaffold.teaseTomorrow ? `\n\n${scaffold.teaseTomorrow}` : "";
  return `${scaffold.heroLineOne}

${scaffold.heroLineTwoStart} ${scaffold.heroAccent}

${scaffold.promise.one}
${scaffold.promise.two}

${scaffold.bodyCard.num} · ${scaffold.bodyCard.eyebrow}${scaffold.bodyCard.time ? ` · ${scaffold.bodyCard.time}` : ""}
${scaffold.bodyCard.title}
${scaffold.bodyCard.body}
${scaffold.bodyCard.href}${tail}

REPLY TO THIS EMAIL
Tell me one bottleneck. One sentence. I read every reply.

${scaffold.signOff ?? "Sunny."}

ElevateAI Systems · sunny.binjola@gmail.com`;
}

// ============================================================
// Day 0 · Welcome
// ============================================================

export function renderDay0(input: DripDayInput): RenderedEmail {
  const greet = input.firstName ? `Hey ${input.firstName}.` : "Hey.";
  const hasSnapshot = Boolean(input.snapshotRevealUrl);

  const bodyCard: BodyCardInput = hasSnapshot
    ? {
        num: "01",
        eyebrow: "Re-read your Snapshot",
        time: "3 minutes",
        title: "Your archetype is already named.",
        body: "Read it slow. The first thing you write after is the most you.",
        href: input.snapshotRevealUrl!,
        cta: "Open my Snapshot",
        accentColor: "green",
      }
    : {
        num: "01",
        eyebrow: "Build your Voice",
        time: "5 minutes",
        title: "Teach the platform how you write.",
        body: "Five prompts. From this point on, every draft you see is in your voice.",
        href: `${APP_ORIGIN}/welcome`,
        cta: "Set up Voice",
        accentColor: "green",
      };

  const scaffold: ScaffoldInput = {
    firstName: input.firstName,
    eyebrow: "Day 1 of 5 · Welcome",
    heroLineOne: greet,
    heroLineTwoStart: "You are",
    heroAccent: "in.",
    promise: {
      one: "The platform is one promise.",
      two: "Every draft. Every message. In your voice.",
    },
    bodyCard,
    teaseTomorrow: "Tomorrow · Content",
  };

  return {
    subject: "You're in.",
    preview: "The platform is one promise. One move today.",
    html: scaffoldHtml(scaffold),
    text: plainText(scaffold),
  };
}

// ============================================================
// Day 1 · Content
// ============================================================

export function renderDay1(input: DripDayInput): RenderedEmail {
  const greet = input.firstName ? `${input.firstName}.` : "Hey.";

  const scaffold: ScaffoldInput = {
    firstName: input.firstName,
    eyebrow: "Day 2 of 5 · Content",
    heroLineOne: greet,
    heroLineTwoStart: "Write once.",
    heroAccent: "Ship.",
    promise: {
      one: "Content is the part most coaches dread.",
      two: "It is the part the platform makes weightless.",
    },
    bodyCard: {
      num: "02",
      eyebrow: "Open Content",
      time: "Try one post",
      title: "Write rough. Polish keeps the voice.",
      body: "Paste a rough draft. The polish step refines the rhythm without flattening you. The post that leaves your hands is recognizable as you.",
      href: `${APP_ORIGIN}/content`,
      cta: "Open Content",
      accentColor: "green",
    },
    teaseTomorrow: "Tomorrow · Leads + Clients",
  };

  return {
    subject: "Write once. Ship.",
    preview: "The part you dread, made weightless.",
    html: scaffoldHtml(scaffold),
    text: plainText(scaffold),
  };
}

// ============================================================
// Day 2 · Leads + Clients
// ============================================================

export function renderDay2(input: DripDayInput): RenderedEmail {
  const greet = input.firstName ? `${input.firstName}.` : "Hey.";

  const scaffold: ScaffoldInput = {
    firstName: input.firstName,
    eyebrow: "Day 3 of 5 · Pipeline",
    heroLineOne: greet,
    heroLineTwoStart: "The pipeline,",
    heroAccent: "in your voice.",
    promise: {
      one: "Most coaches lose deals at the reply.",
      two: "Generic message. Generic response. Generic ghost.",
    },
    bodyCard: {
      num: "03",
      eyebrow: "Leads + Clients",
      time: "First lead = first proof",
      title: "Every message drafted in your voice.",
      body: "A new lead lands. The platform drafts the reply already sounding like you. You read it. You hit send. The conversation moves the way it would if you wrote it from scratch.",
      href: `${APP_ORIGIN}/inbox`,
      cta: "Open Leads",
      accentColor: "green",
    },
    teaseTomorrow: "Tomorrow · Sessions",
  };

  return {
    subject: "The pipeline, in your voice.",
    preview: "First lead = first proof.",
    html: scaffoldHtml(scaffold),
    text: plainText(scaffold),
  };
}

// ============================================================
// Day 3 · Sessions
// ============================================================

export function renderDay3(input: DripDayInput): RenderedEmail {
  const greet = input.firstName ? `${input.firstName}.` : "Hey.";

  const scaffold: ScaffoldInput = {
    firstName: input.firstName,
    eyebrow: "Day 4 of 5 · Sessions",
    heroLineOne: greet,
    heroLineTwoStart: "Your coaching,",
    heroAccent: "remembered.",
    promise: {
      one: "Every session you run has signal underneath it.",
      two: "The platform catches it. So you can use it later.",
    },
    bodyCard: {
      num: "04",
      eyebrow: "Sessions",
      time: "Capture one call",
      title: "Coaching calls that come back when you need them.",
      body: "Drop a recording or paste notes. Sessions become searchable. The platform surfaces a relevant moment the next time a similar client lands. You stop forgetting your own best work.",
      href: `${APP_ORIGIN}/sessions/new`,
      cta: "Open Sessions",
      accentColor: "green",
    },
    teaseTomorrow: "Last one tomorrow · Automations",
  };

  return {
    subject: "Your coaching, remembered.",
    preview: "Every session has signal underneath it.",
    html: scaffoldHtml(scaffold),
    text: plainText(scaffold),
  };
}

// ============================================================
// Day 4 · Automations (Quizzes + Sequences)
// ============================================================

export function renderDay4(input: DripDayInput): RenderedEmail {
  const greet = input.firstName ? `${input.firstName}.` : "Hey.";

  const scaffold: ScaffoldInput = {
    firstName: input.firstName,
    eyebrow: "Day 5 of 5 · Automations",
    heroLineOne: greet,
    heroLineTwoStart: "The conversion",
    heroAccent: "machine.",
    promise: {
      one: "Quizzes capture intent. Sequences turn it into clients.",
      two: "Both in your voice. Both running while you sleep.",
    },
    bodyCard: {
      num: "05",
      eyebrow: "Automations",
      time: "Build one this week",
      title: "Quizzes + Sequences. Plug it in once.",
      body: "Spin up a quiz funnel that surfaces who actually needs you. Wire a sequence that follows up in your voice. The first $7 you make from a quiz that runs itself changes how you think about the platform.",
      href: `${APP_ORIGIN}/automations`,
      cta: "Open Automations",
      accentColor: "ink",
    },
    teaseTomorrow: null,
    signOff: "That is the whole map.\n\nSunny.",
  };

  return {
    subject: "The conversion machine.",
    preview: "Quizzes + Sequences. Running while you sleep.",
    html: scaffoldHtml(scaffold),
    text: plainText(scaffold),
  };
}

// ============================================================
// Dispatch · pick template by step
// ============================================================

export function renderDripEmail(step: number, input: DripDayInput): RenderedEmail | null {
  switch (step) {
    case 0: return renderDay0(input);
    case 1: return renderDay1(input);
    case 2: return renderDay2(input);
    case 3: return renderDay3(input);
    case 4: return renderDay4(input);
    default: return null;
  }
}

// ============================================================
// Resend send
// ============================================================

const FROM_EMAIL = process.env.BRAND_OS_RECOVERY_FROM ?? "Sunny Binjola <sunny@elevateaisystem.com>";

export async function sendDripEmail(opts: {
  to: string;
  rendered: RenderedEmail;
}): Promise<{ ok: boolean; skipped?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, skipped: "no_resend_key" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: opts.to,
        subject: opts.rendered.subject,
        html: opts.rendered.html,
        text: opts.rendered.text,
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
