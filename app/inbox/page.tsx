import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import LeadsWorkspace from "@/components/LeadsWorkspace";
import Header from "@/components/Header";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Fetch all leads; client sorts by score by default. Fallback server order
  // is created_at desc so the initial render is deterministic.
  const { data: leads } = await supabase
    .from("cp_leads")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen">
      <Header
        email={user?.email ?? ""}
        name={userDisplayName(user?.user_metadata)}
        avatarUrl={userAvatarUrl(user?.user_metadata)}
      />
      <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        {/* `now` is captured on the server and passed through the workspace
            so SSR and client hydration compute identical recency scores.
            Without this, leads near the 7d/30d boundary can reorder between
            renders and trigger a Next.js hydration mismatch. */}
        <LeadsWorkspace
          leads={(leads ?? []) as Lead[]}
          now={Date.now()}
          coachId={user?.id ?? ""}
        />
      </main>
    </div>
  );
}
