// Archetype share card — 1080x1350 PNG for the /meet teaser result.
// Warm-light brand canvas: paper background, forest green accent, navy ink.
// Serif fallback since canvas can't rely on webfont load timing.

import type { Archetype } from "@/lib/assistant-interview";

const W = 1080;
const H = 1350;

const PAPER = "#FAF8F3";
const FOREST = "#0B6E23";
const INK = "#0A0F1C";
const MUTED = "#5A5A52";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Plus Jakarta Sans', -apple-system, sans-serif";

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderArchetypeCard(archetype: Archetype): Promise<Blob> {
  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "top";

  // Paper background with a soft green wash at the top.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createRadialGradient(W / 2, -100, 50, W / 2, -100, 700);
  wash.addColorStop(0, "rgba(11,110,35,0.10)");
  wash.addColorStop(1, "rgba(11,110,35,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 700);

  const PAD = 90;

  // Eyebrow.
  ctx.font = `700 26px ${SANS}`;
  ctx.fillStyle = FOREST;
  ctx.fillText("M Y  A S S I S T A N T  A R C H E T Y P E", PAD, 110);

  // Archetype name.
  ctx.font = `800 110px ${SERIF}`;
  ctx.fillStyle = INK;
  const nameLines = wrapText(ctx, archetype.name, W - PAD * 2);
  let y = 190;
  for (const line of nameLines) {
    ctx.fillText(line, PAD, y);
    y += 122;
  }

  // Green rule.
  ctx.fillStyle = FOREST;
  ctx.fillRect(PAD, y + 20, 120, 8);
  y += 80;

  // Tagline.
  ctx.font = `600 42px ${SANS}`;
  ctx.fillStyle = MUTED;
  for (const line of wrapText(ctx, archetype.tagline, W - PAD * 2)) {
    ctx.fillText(line, PAD, y);
    y += 58;
  }
  y += 50;

  // Week-one box: the bold forest moment, matching the on-page result card.
  const boxTop = y;
  const boxH = H - boxTop - 260;
  ctx.fillStyle = FOREST;
  ctx.beginPath();
  ctx.roundRect(PAD, boxTop, W - PAD * 2, boxH, 28);
  ctx.fill();

  ctx.font = `700 24px ${SANS}`;
  ctx.fillStyle = "rgba(250,248,243,0.7)";
  ctx.fillText("IN WEEK ONE, MY ASSISTANT WILL", PAD + 50, boxTop + 50);

  ctx.font = `500 34px ${SANS}`;
  let by = boxTop + 120;
  for (const item of archetype.weekOne) {
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.arc(PAD + 62, by + 18, 7, 0, Math.PI * 2);
    ctx.fill();
    for (const line of wrapText(ctx, item, W - PAD * 2 - 160)) {
      ctx.fillText(line, PAD + 95, by);
      by += 46;
    }
    by += 22;
  }

  // Footer brand.
  ctx.font = `800 40px ${SERIF}`;
  ctx.fillStyle = INK;
  ctx.fillText("Coach ", PAD, H - 150);
  const cw = ctx.measureText("Coach ").width;
  ctx.fillStyle = FOREST;
  ctx.fillText("Assistant", PAD + cw, H - 150);
  ctx.font = `500 24px ${SANS}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("app.elevateaisystem.com/meet", PAD, H - 90);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}
