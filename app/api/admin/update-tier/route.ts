import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";

const ADMIN_EMAIL = "sunny.binjola@gmail.com";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { coach_id, plan } = body;

  if (!coach_id || !plan) {
    return NextResponse.json({ error: "coach_id and plan required" }, { status: 400 });
  }

  const validPlans = ["founding", "standard", "premium"];
  if (!validPlans.includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("cp_coaches")
    .update({ plan })
    .eq("id", coach_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
