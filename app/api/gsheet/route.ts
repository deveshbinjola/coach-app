import { NextRequest, NextResponse } from "next/server";

export const runtime = 'edge';

// Server-side proxy that fetches a public Google Sheets CSV export.
// Sidesteps browser CORS (some Google responses don't include ACAO headers).
// The client sends the transformed export URL; we fetch it and return the text.
//
// Security: only accepts URLs on docs.google.com/spreadsheets/d/*/export to
// prevent this endpoint from being used as an open proxy.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get("url");
  if (!urlParam) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(urlParam);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  const allowedHost = target.hostname === "docs.google.com";
  const allowedPath = target.pathname.startsWith("/spreadsheets/d/") && target.pathname.includes("/export");
  if (!allowedHost || !allowedPath) {
    return NextResponse.json({ error: "Only Google Sheets export URLs are allowed" }, { status: 400 });
  }

  try {
    const res = await fetch(target.toString(), { redirect: "follow" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream ${res.status}`, status: res.status },
        { status: res.status === 401 || res.status === 403 ? 403 : 502 }
      );
    }
    const text = await res.text();
    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": "text/csv; charset=utf-8" },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Fetch failed" }, { status: 502 });
  }
}
