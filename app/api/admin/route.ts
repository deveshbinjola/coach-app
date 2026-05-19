import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";

const ADMIN_EMAIL = "sunny.binjola@gmail.com";

export async function GET(_request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  const [coachesRes, paymentsRes, stripeRes, offeringsRes, leadsRes] = await Promise.all([
    admin.from("cp_coaches").select("id, email, full_name, business_name, plan, onboarded_at, created_at").order("created_at", { ascending: false }),
    admin.from("cp_payments").select("id, coach_id, amount_cents, currency, status, customer_email, created_at").order("created_at", { ascending: false }).limit(50),
    admin.from("cp_stripe_accounts").select("coach_id, stripe_account_id, charges_enabled, display_name, livemode"),
    admin.from("cp_offerings").select("id, coach_id, name, kind, status, price_cents, capacity"),
    admin.from("cp_leads").select("id, coach_id, created_at", { count: "exact", head: true }),
  ]);

  const totalRevenue = (paymentsRes.data ?? [])
    .filter((p) => p.status === "completed")
    .reduce((sum, p) => sum + (p.amount_cents ?? 0), 0);

  return NextResponse.json({
    coaches: coachesRes.data ?? [],
    payments: paymentsRes.data ?? [],
    stripeAccounts: stripeRes.data ?? [],
    offerings: offeringsRes.data ?? [],
    totalLeads: leadsRes.count ?? 0,
    totalRevenue,
  });
}
