import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";

export const runtime = "edge";

const SEVERITIES = ["low", "normal", "high", "critical"] as const;
type Severity = (typeof SEVERITIES)[number];

export async function POST(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed } = rateLimitByUser(user.id, "bug-reports", 10, 60_000);
  if (!allowed) {
    return NextResponse.json({ error: "Too many reports — give it a minute." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);

  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (title.length < 3) {
    return NextResponse.json({ error: "Give the bug a short title." }, { status: 400 });
  }

  const description = typeof body?.description === "string" ? body.description.trim() : null;
  const severity: Severity = SEVERITIES.includes(body?.severity) ? body.severity : "normal";
  const pageUrl = typeof body?.page_url === "string" ? body.page_url.slice(0, 2000) : null;
  const consoleError = typeof body?.console_error === "string" ? body.console_error.slice(0, 8000) : null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;

  const { data, error } = await supabase
    .from("cp_bug_reports")
    .insert({
      coach_id: user.id,
      title: title.slice(0, 300),
      description: description ? description.slice(0, 5000) : null,
      severity,
      page_url: pageUrl,
      console_error: consoleError,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not save the report." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: data.id });
}
