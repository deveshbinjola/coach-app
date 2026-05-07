import Header from "@/components/Header";
import LeadCaptureWorkspace from "@/components/LeadCaptureWorkspace";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";

export const dynamic = "force-dynamic";

export default async function CaptureLeadsPage({
  searchParams,
}: {
  searchParams: { mode?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <Header
        email={user?.email ?? ""}
        name={userDisplayName(user?.user_metadata)}
        avatarUrl={userAvatarUrl(user?.user_metadata)}
      />
      <main className="max-w-5xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <LeadCaptureWorkspace initialMode={searchParams.mode} />
      </main>
    </div>
  );
}
