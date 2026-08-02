// Share card renderer.
//
// Word-of-mouth is the design bar. We need a single beautiful image a coach
// can fire off in iMessage, Slack, or a DM with one tap. This module owns
// the canvas-based render of the magic-moment reveal (Generic AI vs Your
// Voice) into a 1080x1500 PNG sized for IG/Twitter portrait.
//
// Why canvas instead of html2canvas: the rendered output is identical
// regardless of the coach's viewport, font availability, or theme. No
// external dependency. ~150 lines of math + drawText.
//
// The image is the marketing. So the layout is deliberately optimized for
// "screenshot-glanceable in 2 seconds":
//   1. Brand wordmark at top (subtle, not loud)
//   2. The inbound message (italic, small, sets the scene)
//   3. Generic AI card (muted, neutral)
//   4. Your Voice card (brand green, anchored)
//   5. One-line tagline + URL at the bottom (the seed)

const CARD_W = 1080;
const CARD_H = 1500;
const PADDING = 64;
const COL_GAP = 24;

// Brand tokens. Hardcoded so the share image is theme-independent and
// matches the marketing site, not whatever surface the coach is on.
const COLORS = {
  bg: "#FAFAF8",          // --surface
  bgSoft: "#F0F0EB",      // --surface-deep
  navy: "#0A0F1C",        // --navy
  brand: "#0B6E23",       // --brand (forest, warm-light system)
  brandSoft: "#E7F0E6",   // --brand-soft (approx)
  border: "#D6D6D0",      // --border
  text: "#0A0F1C",
  textMuted: "#5C5C5C",
  textFaint: "#9A9A95",
};

const FONT_FAMILY = "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export type ShareCardInput = {
  inbound: string;
  generic: string;
  voice: string;
  /** Optional, used in the bottom CTA line when present. */
  coachFirstName?: string;
};

/**
 * Render the side-by-side comparison as a PNG Blob suitable for Web Share
 * API or download. Works in modern browsers. Throws on canvas failure.
 */
export async function renderShareCard(
  input: ShareCardInput
): Promise<Blob> {
  // 2x device density so the output is sharp on retina screens. Canvas
  // dimensions stay logical (1080x1500); we scale the context once.
  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * dpr;
  canvas.height = CARD_H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.scale(dpr, dpr);

  // Antialiasing on text rendering.
  ctx.textBaseline = "top";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Background.
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Warm forest wash at top. Was rgba(0,255,65,...): the palette below had
  // already moved to the warm-light system, but these two canvas fills were
  // left behind, so every share card a coach posted carried the retired neon.
  const wash = ctx.createLinearGradient(0, 0, 0, 320);
  wash.addColorStop(0, "rgba(11, 110, 35, 0.12)");
  wash.addColorStop(1, "rgba(11, 110, 35, 0.0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, CARD_W, 320);

  let y = PADDING;

  // ── Top wordmark + leaf logo ───────────────────────────────────────────
  drawLogo(ctx, PADDING, y, 36);
  ctx.fillStyle = COLORS.navy;
  ctx.font = `800 22px ${FONT_FAMILY}`;
  ctx.fillText("ElevateAI", PADDING + 50, y + 4);
  ctx.fillStyle = COLORS.brand;
  ctx.font = `800 22px ${FONT_FAMILY}`;
  // Position "Coach" after "ElevateAI" by measuring.
  const elevateW = ctx.measureText("ElevateAI ").width;
  ctx.fillStyle = COLORS.navy;
  ctx.fillText(" Coach", PADDING + 50 + elevateW, y + 4);

  // Right-aligned tag.
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = `700 13px ${FONT_FAMILY}`;
  const tagText = "VOICE-MATCHED AI";
  const tagW = ctx.measureText(tagText).width;
  ctx.fillText(tagText, CARD_W - PADDING - tagW, y + 12);

  y += 70;

  // ── Headline ───────────────────────────────────────────────────────────
  ctx.fillStyle = COLORS.text;
  ctx.font = `800 56px ${FONT_FAMILY}`;
  const headline1 = "Same lead.";
  const headline2 = "Two AIs.";
  ctx.fillText(headline1, PADDING, y);
  y += 64;
  ctx.fillStyle = COLORS.brand;
  // Filled brand text needs a darker stroke for legibility on cream.
  ctx.fillStyle = COLORS.navy;
  ctx.fillText("One sounds like me.", PADDING, y);
  y += 84;

  // ── Inbound message (small italic block) ───────────────────────────────
  ctx.fillStyle = COLORS.textFaint;
  ctx.font = `800 11px ${FONT_FAMILY}`;
  ctx.fillText("WHAT THEY SENT", PADDING, y);
  y += 22;

  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `italic 500 22px ${FONT_FAMILY}`;
  const inboundLines = wrapText(
    ctx,
    `"${truncate(input.inbound.trim(), 220)}"`,
    CARD_W - PADDING * 2
  );
  for (const line of inboundLines.slice(0, 3)) {
    ctx.fillText(line, PADDING, y);
    y += 30;
  }
  y += 24;

  // ── Two cards side by side ─────────────────────────────────────────────
  const cardW = (CARD_W - PADDING * 2 - COL_GAP) / 2;
  const cardX1 = PADDING;
  const cardX2 = PADDING + cardW + COL_GAP;
  const cardY = y;
  const cardH = 580;

  // Generic card (left)
  drawCard(ctx, {
    x: cardX1,
    y: cardY,
    w: cardW,
    h: cardH,
    bg: "#FFFFFF",
    border: COLORS.border,
    title: "GENERIC AI",
    titleColor: COLORS.textFaint,
    body: input.generic,
    bodyColor: COLORS.textMuted,
    footer: "What every other tool writes",
    footerColor: COLORS.textFaint,
    accent: false,
  });

  // Voice card (right) — brand-accented, dominant.
  drawCard(ctx, {
    x: cardX2,
    y: cardY,
    w: cardW,
    h: cardH,
    bg: COLORS.brandSoft,
    border: COLORS.brand,
    borderWidth: 3,
    title: "MY VOICE",
    titleColor: COLORS.text,
    body: input.voice,
    bodyColor: COLORS.text,
    bodyBold: true,
    footer: "Sounds like me.",
    footerColor: COLORS.text,
    accent: true,
  });

  y = cardY + cardH + 40;

  // ── Bottom seed line ───────────────────────────────────────────────────
  ctx.fillStyle = COLORS.text;
  ctx.font = `700 26px ${FONT_FAMILY}`;
  const seedText = input.coachFirstName
    ? `${input.coachFirstName}'s AI writes back in ${input.coachFirstName}'s voice.`
    : "Your AI. Your voice. Built in 5 minutes.";
  const seedLines = wrapText(ctx, seedText, CARD_W - PADDING * 2);
  for (const line of seedLines) {
    ctx.fillText(line, PADDING, y);
    y += 34;
  }
  y += 16;

  ctx.fillStyle = COLORS.textMuted;
  ctx.font = `600 18px ${FONT_FAMILY}`;
  ctx.fillText("elevateaisystem.com/coach-platform", PADDING, y);

  // Convert to PNG blob.
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob returned null"));
      },
      "image/png",
      0.95
    );
  });
}

/**
 * Save the rendered card to the user's device. Tries the Web Share API
 * first (opens system share sheet on mobile / supported desktops), falls
 * back to a direct download. Returns true if a share sheet was opened.
 */
export async function shareOrDownload(
  blob: Blob,
  filename = "voice-vs-generic.png"
): Promise<{ method: "share" | "download" }> {
  const file = new File([blob], filename, { type: "image/png" });

  // Web Share API w/ files (iOS 15+, Android Chrome, recent Safari/Edge).
  if (
    typeof navigator !== "undefined" &&
    "canShare" in navigator &&
    navigator.canShare?.({ files: [file] }) &&
    "share" in navigator
  ) {
    try {
      await navigator.share({
        files: [file],
        title: "My AI writes in my voice",
        text: "Same lead, two AIs. One sounds like me.",
      });
      return { method: "share" };
    } catch (err) {
      // User cancelled or share failed, fall through to download.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("abort")) {
        return { method: "share" };
      }
    }
  }

  // Fallback: trigger a direct download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a tick so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { method: "download" };
}

// ── canvas helpers ────────────────────────────────────────────────────────

type DrawCardOpts = {
  x: number;
  y: number;
  w: number;
  h: number;
  bg: string;
  border: string;
  borderWidth?: number;
  title: string;
  titleColor: string;
  body: string;
  bodyColor: string;
  bodyBold?: boolean;
  footer: string;
  footerColor: string;
  accent: boolean;
};

function drawCard(ctx: CanvasRenderingContext2D, o: DrawCardOpts) {
  const r = 20;
  // Card bg with rounded corners + border.
  roundRect(ctx, o.x, o.y, o.w, o.h, r);
  ctx.fillStyle = o.bg;
  ctx.fill();
  ctx.lineWidth = o.borderWidth ?? 1;
  ctx.strokeStyle = o.border;
  ctx.stroke();

  const innerPad = 28;
  let cy = o.y + innerPad;

  // Title
  ctx.fillStyle = o.titleColor;
  ctx.font = `800 13px ${FONT_FAMILY}`;
  ctx.fillText(o.title, o.x + innerPad, cy);
  cy += 30;

  // Body (wrapped, max ~10 lines).
  ctx.fillStyle = o.bodyColor;
  ctx.font = `${o.bodyBold ? "600" : "500"} 22px ${FONT_FAMILY}`;
  const bodyLines = wrapText(ctx, o.body.trim(), o.w - innerPad * 2);
  const maxBodyLines = 13;
  const visible = bodyLines.slice(0, maxBodyLines);
  // If we truncated, append an ellipsis to the last visible line.
  if (bodyLines.length > maxBodyLines) {
    const last = visible[visible.length - 1];
    if (last) visible[visible.length - 1] = last.replace(/\s*\S*$/, "…");
  }
  for (const line of visible) {
    ctx.fillText(line, o.x + innerPad, cy);
    cy += 32;
  }

  // Footer (anchored to bottom of card).
  const footerY = o.y + o.h - innerPad - 14;
  // Divider line above footer.
  ctx.strokeStyle = o.accent
    ? "rgba(11, 110, 35, 0.4)"
    : "rgba(0, 0, 0, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(o.x + innerPad, footerY - 18);
  ctx.lineTo(o.x + o.w - innerPad, footerY - 18);
  ctx.stroke();

  ctx.fillStyle = o.footerColor;
  ctx.font = `${o.accent ? "800" : "700"} 12px ${FONT_FAMILY}`;
  const footerLabel = o.accent ? `✓  ${o.footer.toUpperCase()}` : o.footer.toUpperCase();
  ctx.fillText(footerLabel, o.x + innerPad, footerY);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Greedy word-wrapping that respects newlines in the input. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const lines: string[] = [];
  const paragraphs = text.split(/\n+/);
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let cur = "";
    for (const w of words) {
      const tentative = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(tentative).width <= maxWidth) {
        cur = tentative;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    // Empty line between paragraphs (skipped if we'd start with one).
    if (lines.length > 0) lines.push("");
  }
  // Trim trailing empty line.
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/** Brand leaf logo, scaled to fit a square of size `size`. */
function drawLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number
) {
  // Rounded-square background.
  roundRect(ctx, x, y, size, size, size * 0.22);
  ctx.fillStyle = COLORS.brand;
  ctx.fill();

  // Leaf shape (matches the SVG used in the app).
  const cx = x + size / 2;
  const cy_ = y + size / 2;
  const s = size / 100;
  ctx.fillStyle = "#020802";
  ctx.beginPath();
  // M50 20 C 35 20, 25 35, 25 55 C 25 75, 40 80, 50 80
  ctx.moveTo(cx, cy_ - 30 * s);
  ctx.bezierCurveTo(cx - 15 * s, cy_ - 30 * s, cx - 25 * s, cy_ - 15 * s, cx - 25 * s, cy_ + 5 * s);
  ctx.bezierCurveTo(cx - 25 * s, cy_ + 25 * s, cx - 10 * s, cy_ + 30 * s, cx, cy_ + 30 * s);
  ctx.bezierCurveTo(cx + 10 * s, cy_ + 30 * s, cx + 25 * s, cy_ + 25 * s, cx + 25 * s, cy_ + 5 * s);
  ctx.bezierCurveTo(cx + 25 * s, cy_ - 15 * s, cx + 15 * s, cy_ - 30 * s, cx, cy_ - 30 * s);
  ctx.closePath();
  ctx.fill();

  // Stem.
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = "#020802";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cx, cy_ + 30 * s);
  ctx.lineTo(cx, cy_ + 38 * s);
  ctx.stroke();
}
