// POST /api/brand-os/import-url
//
// Fetches a public URL, strips HTML chrome, and returns the extracted text
// so the coach can populate Signal Module Q1 / Q2 without copy-pasting an
// entire blog post into the textarea.
//
// V1 extraction: pull <title>, then strip <script>/<style>/<nav>/<header>/
// <footer>, then collapse whitespace and decode entities. Good enough for
// most blog posts, newsletters (Beehiiv, Substack), and personal sites.
// Not robust against single-page apps that render their content client-side
// — the response will be too sparse and we surface a clear error.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export const runtime = "edge";

type Body = { url?: string };

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000; // ~1.5 MB safeguard
const MIN_EXTRACTED_CHARS = 120;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  const rawUrl = (body.url ?? "").trim();
  if (!rawUrl) return NextResponse.json({ error: "URL is required." }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "That doesn't look like a valid URL." }, { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only http(s) URLs are supported." }, { status: 400 });
  }

  // Refuse private / localhost / metadata addresses — coaches shouldn't be
  // pulling from internal networks, and this prevents SSRF.
  if (isPrivateHost(parsed.hostname)) {
    return NextResponse.json({ error: "Refused — that's not a public URL." }, { status: 400 });
  }

  // Fetch with timeout. AbortController is supported on Workers edge.
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(parsed.toString(), {
      signal: ctrl.signal,
      headers: {
        // Identify ourselves so site owners can distinguish from generic crawlers.
        "User-Agent": "ElevateAI Brand-OS Importer (+https://elevateaisystem.com)",
        "Accept": "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "URL took too long to load (12s)." }, { status: 504 });
    }
    return NextResponse.json({ error: "Could not reach that URL." }, { status: 502 });
  }
  clearTimeout(timeout);

  if (!res.ok) {
    return NextResponse.json({ error: `That URL returned ${res.status}.` }, { status: 502 });
  }
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    return NextResponse.json({ error: "That URL isn't HTML — try a public blog/newsletter post." }, { status: 415 });
  }

  // Cap the body so a 50 MB page doesn't blow up the edge function.
  const reader = res.body?.getReader();
  if (!reader) return NextResponse.json({ error: "Empty response." }, { status: 502 });

  let received = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > MAX_BYTES) {
        await reader.cancel();
        return NextResponse.json({ error: "Page is too large (>1.5 MB) — try a more focused URL." }, { status: 413 });
      }
      chunks.push(value);
    }
  }
  const html = new TextDecoder("utf-8").decode(concatChunks(chunks));

  const title = extractTitle(html) ?? parsed.hostname;
  const text = extractText(html);

  if (text.length < MIN_EXTRACTED_CHARS) {
    return NextResponse.json({
      error: "Couldn't extract enough text from that URL — site might render content with JavaScript. Try pasting the text directly instead.",
    }, { status: 422 });
  }

  return NextResponse.json({ title, text });
}

// ────────────────────────────────────────────────────────────────────────
// Helpers

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv4 private + link-local + loopback ranges.
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return true;
  // AWS metadata + GCP metadata.
  if (h === "metadata.google.internal" || h === "169.254.169.254") return true;
  // IPv6 loopback / link-local.
  if (h === "::1" || h.startsWith("fe80::") || h.startsWith("fc") || h.startsWith("fd")) return true;
  return false;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  return decodeEntities(m[1]).trim().slice(0, 200);
}

/** Very pragmatic HTML→text extractor. Drops chrome elements, strips tags,
 *  collapses whitespace. Good enough for static-rendered content. */
function extractText(html: string): string {
  let s = html;
  // Drop common chrome containers wholesale.
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, " ");
  s = s.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ");
  s = s.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ");
  s = s.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ");
  s = s.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ");
  s = s.replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, " ");
  // Convert block elements to newlines so paragraphs stay separated.
  s = s.replace(/<\/(p|h[1-6]|li|blockquote|div|article|section|br)\s*>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // Strip remaining tags + decode entities.
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  // Collapse runs of whitespace, but keep double newlines as paragraph breaks.
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&rdquo;/g, "”")
    .replace(/&ldquo;/g, "“")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
