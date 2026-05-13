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
  const [referrerRes, referralsRes] = await Promise.all([
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
        />
      </main>
    </div>
  );
}
