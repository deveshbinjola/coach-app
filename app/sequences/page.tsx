import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import SequenceList from "@/components/SequenceList";
import { loadNavUnlocks } from "@/lib/nav-unlocks";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SequencesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [navUnlocks, { data: sequences }, { data: stepRows }, { data: enrollmentRows }] =
    await Promise.all([
      loadNavUnlocks(supabase, user.id),
      supabase
        .from("cp_sequences")
        .select("*")
        .eq("coach_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("cp_sequence_steps")
        .select("sequence_id")
        .eq("coach_id", user.id),
      supabase
        .from("cp_sequence_enrollments")
        .select("sequence_id, status")
        .eq("coach_id", user.id),
    ]);

  // Compute step counts per sequence.
  const stepCounts: Record<string, number> = {};
  for (const s of stepRows ?? []) {
    const sid = (s as { sequence_id: string }).sequence_id;
    stepCounts[sid] = (stepCounts[sid] ?? 0) + 1;
  }

  // Compute enrollment stats per sequence.
  const stats: Record<string, { enrolled: number; completed: number; failed: number }> = {};
  for (const e of enrollmentRows ?? []) {
    const sid = (e as { sequence_id: string; status: string }).sequence_id;
    const st = (e as { sequence_id: string; status: string }).status;
    if (!stats[sid]) stats[sid] = { enrolled: 0, completed: 0, failed: 0 };
    stats[sid]!.enrolled++;
    if (st === "completed") stats[sid]!.completed++;
    if (st === "failed") stats[sid]!.failed++;
  }

  const enriched = (sequences ?? []).map((seq: Record<string, unknown>) => ({
    ...seq,
    step_count: stepCounts[seq.id as string] ?? 0,
    stats: stats[seq.id as string] ?? { enrolled: 0, completed: 0, failed: 0 },
  }));

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-5xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <SequenceList sequences={enriched as any[]} />
      </main>
    </div>
  );
}
