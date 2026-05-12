import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import ClientsWorkspace from "@/components/clients/ClientsWorkspace";
import type {
  ClientEvent,
  ClientResource,
  ClientRoom,
  ClientSession,
  ClientTask,
  Lead,
} from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [leadsRes, roomsRes, sessionsRes, tasksRes, resourcesRes, eventsRes] = await Promise.all([
    supabase
      .from("cp_leads")
      .select("*")
      .eq("coach_id", user.id)
      .eq("status", "client")
      .order("updated_at", { ascending: false }),
    supabase
      .from("cp_client_rooms")
      .select("*")
      .eq("coach_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("cp_client_sessions")
      .select("*")
      .eq("coach_id", user.id)
      .order("session_at", { ascending: false })
      .limit(100),
    supabase
      .from("cp_client_tasks")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("cp_client_resources")
      .select("*")
      .eq("coach_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("cp_client_events")
      .select("*")
      .eq("coach_id", user.id)
      .order("starts_at", { ascending: true })
      .limit(100),
  ]);

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-7xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <ClientsWorkspace
          coachId={user.id}
          leads={(leadsRes.data ?? []) as Lead[]}
          rooms={(roomsRes.data ?? []) as ClientRoom[]}
          sessions={(sessionsRes.data ?? []) as ClientSession[]}
          tasks={(tasksRes.data ?? []) as ClientTask[]}
          resources={(resourcesRes.data ?? []) as ClientResource[]}
          events={(eventsRes.data ?? []) as ClientEvent[]}
        />
      </main>
    </div>
  );
}
