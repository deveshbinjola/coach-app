// /leads/resonance — manage pain points + tags where they're actually used.
//
// Moved out of Settings. The Resonance management surface lives next to
// /leads because that's where pain points and tags do their job — they
// shape sorting, segmenting, and how the AI talks to each lead.
// Sacred zones moved to /content (inline, since that's where drafts get
// generated).

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import ResonancePanel from "@/components/settings/ResonancePanel";
import { Badge } from "@/components/ui";
import { enforceOnboardingGate } from "@/lib/onboarding";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ResonancePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const gateRedirect = await enforceOnboardingGate(supabase, user.id);
  if (gateRedirect) redirect(gateRedirect);
  const headerEmphasis = await loadHeaderEmphasis(supabase, user.id);

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
      />
      <main className="max-w-3xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-6">

        <Link href="/leads" className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
          ← All leads
        </Link>

        <header className="space-y-2">
          <Badge tone="brand" size="xs" uppercase>Resonance layer</Badge>
          <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
            How you see your people.
          </h1>
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-relaxed max-w-2xl">
            Pain points and tags mirror how you already think — so sorting,
            segmenting, and drafting all snap to your worldview. Set these here, use them on every lead.
          </p>
        </header>

        <ResonancePanel />

      </main>
    </div>
  );
}
