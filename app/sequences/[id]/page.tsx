import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import SequenceBuilder from "@/components/SequenceBuilder";
import { loadNavUnlocks } from "@/lib/nav-unlocks";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SequenceBuilderPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [navUnlocks, { data: sequence }, { data: steps }] = await Promise.all([
    loadNavUnlocks(supabase, user.id),
    supabase
      .from("cp_sequences")
      .select("*")
      .eq("id", params.id)
      .eq("coach_id", user.id)
      .maybeSingle(),
    supabase
      .from("cp_sequence_steps")
      .select("*")
      .eq("sequence_id", params.id)
      .eq("coach_id", user.id)
      .order("position", { ascending: true }),
  ]);

  if (!sequence) notFound();

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <SequenceBuilder
          sequence={sequence as any}
          initialSteps={(steps ?? []) as any[]}
        />
      </main>
    </div>
  );
}
