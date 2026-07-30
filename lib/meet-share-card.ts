// Archetype share card — 1080x1350 PNG for the /meet teaser result.
// Same brand canvas language as lib/share-card.ts (navy, neon, Fraunces-ish
// serif fallback since canvas can't rely on webfont load timing).

import type { Archetype } from "@/lib/assistant-interview";

const W = 1080;
const H = 1350;

const NAVY = "#060a14";
const GREEN = "#00FF41";
const CREAM = "#FAFAF8";

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Plus Jakarta Sans', -apple-system, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

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

  // Background + aurora wash.
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, W, H);
  const wash = ctx.createRadialGradient(W / 2, -100, 50, W / 2, -100, 700);
  wash.addColorStop(0, "rgba(0,255,65,0.16)");
  wash.addColorStop(1, "rgba(0,255,65,0)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, 700);

  const PAD = 90;

  // Eyebrow.
  ctx.font = `500 26px ${MONO}`;
  ctx.fillStyle = GREEN;
  ctx.fillText("M Y  A S S I S T A N T  A R C H E T Y P E", PAD, 110);

  // Archetype name.
  ctx.font = `800 110px ${SERIF}`;
  ctx.fillStyle = CREAM;
  const nameLines = wrapText(ctx, archetype.name, W - PAD * 2);
  let y = 190;
  for (const line of nameLines) {
    ctx.fillText(line, PAD, y);
    y += 122;
  }

  // Green rule.
  ctx.fillStyle = GREEN;
  ctx.fillRect(PAD, y + 20, 120, 8);
  y += 80;

  // Tagline.
  ctx.font = `600 42px ${SANS}`;
  ctx.fillStyle = "rgba(250,250,248,0.85)";
  for (const line of wrapText(ctx, archetype.tagline, W - PAD * 2)) {
    ctx.fillText(line, PAD, y);
    y += 58;
  }
  y += 50;

  // Week-one box.
  const boxTop = y;
  const boxH = H - boxTop - 260;
  ctx.strokeStyle = "rgba(0,255,65,0.35)";
  ctx.lineWidth = 2;
  ctx.fillStyle = "rgba(0,255,65,0.05)";
  ctx.beginPath();
  ctx.roundRect(PAD, boxTop, W - PAD * 2, boxH, 28);
  ctx.fill();
  ctx.stroke();

  ctx.font = `500 24px ${MONO}`;
  ctx.fillStyle = "rgba(250,250,248,0.55)";
  ctx.fillText("IN WEEK ONE, MY ASSISTANT WILL", PAD + 50, boxTop + 50);

  ctx.font = `500 34px ${SANS}`;
  let by = boxTop + 120;
  for (const item of archetype.weekOne) {
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(PAD + 62, by + 18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(250,250,248,0.9)";
    for (const line of wrapText(ctx, item, W - PAD * 2 - 160)) {
      ctx.fillText(line, PAD + 95, by);
      by += 46;
    }
    by += 22;
  }

  // Footer brand.
  ctx.font = `800 40px ${SERIF}`;
  ctx.fillStyle = CREAM;
  ctx.fillText("Coach ", PAD, H - 150);
  const cw = ctx.measureText("Coach ").width;
  ctx.fillStyle = "#00CC34";
  ctx.fillText("Assistant", PAD + cw, H - 150);
  ctx.font = `500 24px ${MONO}`;
  ctx.fillStyle = "rgba(250,250,248,0.4)";
  ctx.fillText("app.elevateaisystem.com/meet", PAD, H - 90);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}
