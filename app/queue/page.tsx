// app/queue/page.tsx
//
// The Approval Queue — the second moment of the One Surface
// (roadmap/p0-one-surface.md). One screen holding every decision waiting on
// the coach: pending first-response drafts, stalled sequences, content
// drafts. The coach approves, edits, or skips; the machine does the rest.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import QueueView from "@/components/queue/QueueView";
import { buildQueue } from "@/lib/queue";
import { enforceOnboardingGate } from "@/lib/onboarding";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const gateRedirect = await enforceOnboardingGate(supabase, user.id);
  if (gateRedirect) redirect(gateRedirect);

  const [headerEmphasis, navUnlocks] = await Promise.all([
    loadHeaderEmphasis(supabase, user.id),
    loadNavUnlocks(supabase, user.id),
  ]);

  const [draftsRes, failedRes, contentRes, sequencesRes] = await Promise.all([
    supabase.from("cp_lead_messages")
      .select("id, lead_id, content, created_at")
      .eq("coach_id", user.id)
      .eq("direction", "draft"),
    supabase.from("cp_sequence_enrollments")
      .select("id, lead_id, sequence_id, error, created_at")
      .eq("coach_id", user.id)
      .eq("status", "failed"),
    supabase.from("cp_content")
      .select("id, title, created_at")
      .eq("coach_id", user.id)
      .eq("status", "draft"),
    supabase.from("cp_sequences")
      .select("id, name")
      .eq("coach_id", user.id),
  ]);

  const drafts = draftsRes.data ?? [];
  const failed = failedRes.data ?? [];

  // One name lookup for every lead the queue mentions.
  const leadIds = [...new Set([...drafts, ...failed].map((r) => r.lead_id))];
  const namesById = new Map<string, string | null>();
  if (leadIds.length > 0) {
    const { data: leadRows } = await supabase
      .from("cp_leads")
      .select("id, full_name")
      .in("id", leadIds);
    for (const l of leadRows ?? []) namesById.set(l.id, l.full_name);
  }
  const seqNameById = new Map((sequencesRes.data ?? []).map((s) => [s.id, s.name]));

  const items = buildQueue({
    now: Date.now(),
    pendingDrafts: drafts.map((d) => ({
      id: d.id,
      lead_id: d.lead_id,
      content: d.content,
      created_at: d.created_at,
      leadName: namesById.get(d.lead_id) ?? null,
    })),
    failedEnrollments: failed.map((f) => ({
      id: f.id,
      lead_id: f.lead_id,
      created_at: f.created_at,
      error: f.error,
      leadName: namesById.get(f.lead_id) ?? null,
      sequenceName: seqNameById.get(f.sequence_id) ?? null,
    })),
    contentDrafts: (contentRes.data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      created_at: c.created_at,
    })),
  });

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-6">
        <QueueView initialItems={items} />
      </main>
    </div>
  );
}
