import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import LeadDetail from "@/components/LeadDetail";
import type { Lead, LeadMessage } from "@/lib/types";
import { notFound } from "next/navigation";

export const runtime = 'edge';

export const dynamic = "force-dynamic";

export default async function LeadPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: lead } = await supabase
    .from("cp_leads")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!lead) notFound();

  const { data: messages } = await supabase
    .from("cp_lead_messages")
    .select("*")
    .eq("lead_id", params.id)
    .order("created_at", { ascending: true });

  // Referral context — who referred this lead (upstream) and who this lead
  // has referred (downstream). Both are cheap single queries; we parallelize
  // them with Promise.all so the page still renders fast.
  const typedLead = lead as Lead;
  const [referrerRes, referralsRes, sessionsRes, paymentsRes, brandOsRes, funnelRes, tripRes, enrollmentsRes, automationLogsRes] = await Promise.all([
    typedLead.referred_by_lead_id
      ? supabase
          .from("cp_leads")
          .select("id, full_name, status")
          .eq("id", typedLead.referred_by_lead_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("cp_leads")
      .select("id, full_name, status")
      .eq("referred_by_lead_id", params.id),
    supabase
      .from("cp_coaching_sessions")
      .select("*")
      .eq("client_id", params.id)
      .eq("coach_id", user?.id ?? "")
      .order("session_date", { ascending: false }),
    typedLead.email
      ? supabase
          .from("cp_payments")
          .select("id, amount_cents, currency, status, customer_email, created_at")
          .eq("customer_email", typedLead.email)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("cp_brand_os_runs")
      .select("id, coach_id, audience, current_module, started_at, completed_at, label")
      .eq("coach_id", user?.id ?? "")
      .order("started_at", { ascending: false }),
    supabase
      .from("cp_funnel_events")
      .select("id, coach_id, name, meta, created_at")
      .eq("coach_id", user?.id ?? "")
      .order("created_at", { ascending: false })
      .limit(20),
    typedLead.email
      ? supabase
          .from("cp_tripwire_purchases")
          .select("id, email, amount, created_at")
          .eq("email", typedLead.email)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from("cp_sequence_enrollments")
      .select("id, sequence_id, current_step_id, status, execute_at, enrolled_at, cp_sequences(name)")
      .eq("lead_id", params.id)
      .eq("coach_id", user?.id ?? "")
      .order("enrolled_at", { ascending: false }),
    supabase
      .from("cp_sequence_step_logs")
      .select("id, enrollment_id, step_id, coach_id, lead_id, status, error, resend_message_id, executed_at, cp_sequence_enrollments(cp_sequences(name)), cp_sequence_steps(position)")
      .eq("lead_id", params.id)
      .eq("coach_id", user?.id ?? "")
      .order("executed_at", { ascending: false })
      .limit(50),
  ]);

  const referrer = (referrerRes as { data: { id: string; full_name: string; status: string } | null }).data;
  const referrals = (referralsRes.data ?? []) as { id: string; full_name: string; status: string }[];

  // Audience-aware: pick up the coach's voice profile slug so ObjectionDeck
  // can render reframes in the right voice register.
  const { data: coachRow } = user?.id
    ? await supabase
        .from("cp_coaches")
        .select("voice_profile_slug")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };
  const voiceProfileSlug =
    ((coachRow as { voice_profile_slug?: string } | null)?.voice_profile_slug as
      | "m-coach-m-aud" | "m-coach-w-aud" | "f-coach-w-aud" | "f-coach-m-aud" | "i-coach-single" | "i-coach-mixed"
      | undefined);

  return (
    <div className="min-h-screen">
      <Header
        email={user?.email ?? ""}
        name={userDisplayName(user?.user_metadata)}
        avatarUrl={userAvatarUrl(user?.user_metadata)}
      />
      <main className="max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <a
          href="/inbox"
          className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] hover:underline mb-5 inline-block"
        >
          ← Back to inbox
        </a>
        <LeadDetail
          lead={typedLead}
          initialMessages={(messages ?? []) as LeadMessage[]}
          referrer={referrer}
          referrals={referrals}
          voiceProfileSlug={voiceProfileSlug}
          sessions={(sessionsRes.data ?? []) as any[]}
          payments={(paymentsRes.data ?? []) as any[]}
          brandOsRuns={(brandOsRes.data ?? []) as any[]}
          funnelEvents={(funnelRes.data ?? []) as any[]}
          tripwires={(tripRes.data ?? []) as any[]}
          enrollments={(enrollmentsRes.data ?? []) as any[]}
          automationLogs={(automationLogsRes.data ?? []).map((log: any) => ({
            ...log,
            sequence_name: log.cp_sequence_enrollments?.cp_sequences?.name,
            step_position: log.cp_sequence_steps?.position,
          })) as any[]}
        />
      </main>
    </div>
  );
}
