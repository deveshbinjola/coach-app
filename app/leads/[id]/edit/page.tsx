import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import EditLeadForm from "@/components/EditLeadForm";
import type { Lead } from "@/lib/types";
import { notFound } from "next/navigation";

export const runtime = 'edge';

export const dynamic = "force-dynamic";

export default async function EditLeadPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: lead } = await supabase
    .from("cp_leads")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!lead) notFound();

  // Potential referrers — all OTHER leads, sorted by client/completed-discovery first,
  // then by recent activity. Used in the "Referred by" picker.
  const { data: otherLeads } = await supabase
    .from("cp_leads")
    .select("id, full_name, status, discovery_call_completed")
    .neq("id", params.id)
    .order("discovery_call_completed", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div className="min-h-screen">
      <Header
        email={user?.email ?? ""}
        name={userDisplayName(user?.user_metadata)}
        avatarUrl={userAvatarUrl(user?.user_metadata)}
      />
      <main className="max-w-xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <EditLeadForm lead={lead as Lead} potentialReferrers={otherLeads ?? []} />
      </main>
    </div>
  );
}
