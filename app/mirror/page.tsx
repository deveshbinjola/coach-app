// /mirror -- The Mirror, Phase 1 standalone surface.
// A coach brings one stuck thing; the app names the KIND of problem and the
// thinking-mistake. Day-one sticky. Spec: docs/the-mirror-spec.html.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import Header from "@/components/Header";
import MirrorCard from "@/components/MirrorCard";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function MirrorPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [emphasis, navUnlocks] = await Promise.all([
    loadHeaderEmphasis(supabase, user.id),
    loadNavUnlocks(supabase, user.id),
  ]);

  return (
    <>
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={emphasis}
        navUnlocks={navUnlocks}
      />
      <main className="mx-auto w-full max-w-[var(--container-md)] px-4 py-10 md:py-16">
        <div className="mx-auto max-w-xl">
          <p className="text-center text-sm leading-relaxed text-[var(--text-muted)]">
            Not advice. A read. Bring one thing you&apos;re stuck on and see what kind of
            problem it actually is, and the move you&apos;re probably missing.
          </p>
          <div className="mt-6">
            <MirrorCard />
          </div>
        </div>
      </main>
    </>
  );
}
