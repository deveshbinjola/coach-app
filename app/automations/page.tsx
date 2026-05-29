import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import FunnelsWorkspace from "@/components/funnels/FunnelsWorkspace";
import SequenceList from "@/components/SequenceList";
import { loadNavUnlocks } from "@/lib/nav-unlocks";
import { cookies } from "next/headers";
import type { FunnelRow } from "@/app/funnels/page";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const VALID_TABS = ["funnels", "sequences"] as const;
type TabId = (typeof VALID_TABS)[number];

export default async function AutomationsPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const navUnlocks = await loadNavUnlocks(supabase, user.id);
  try {
    cookies().set("nav-unlocks", JSON.stringify(navUnlocks), {
      path: "/",
      sameSite: "lax",
      maxAge: 86400,
    });
  } catch {}

  const rawTab = searchParams?.tab;
  const tab: TabId = VALID_TABS.includes(rawTab as TabId)
    ? (rawTab as TabId)
    : "funnels";

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        navUnlocks={navUnlocks}
      />
      <main className="max-w-5xl mx-auto px-3 py-6 sm:px-6 sm:py-10">
        <TabBar active={tab} />
        {tab === "sequences" ? (
          <SequencesTab coachId={user.id} />
        ) : (
          <FunnelsTab coachId={user.id} />
        )}
      </main>
    </div>
  );
}

// ───────────────────────── Tab bar ──────────────────────────────────────

function TabBar({ active }: { active: TabId }) {
  const tabs: Array<{ id: TabId; label: string; href: string }> = [
    { id: "funnels",   label: "Funnels",   href: "/automations" },
    { id: "sequences", label: "Sequences", href: "/automations?tab=sequences" },
  ];
  return (
    <nav
      className="mb-6 flex items-center gap-1 border-b border-[var(--border)]"
      aria-label="Automations sections"
    >
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`-mb-px px-4 py-2.5 text-[length:var(--t-body)] font-bold border-b-2 transition ${
              on
                ? "border-[var(--brand-strong)] text-[color:var(--text)]"
                : "border-transparent text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ───────────────────────── Tab content ──────────────────────────────────

async function FunnelsTab({ coachId }: { coachId: string }) {
  const supabase = createClient();
  const [{ data: funnels }, { data: brandOsRuns }] = await Promise.all([
    supabase
      .from("cp_funnels")
      .select(
        "id, slug, type, title, config, published, view_count, start_count, complete_count, email_count, created_at, updated_at"
      )
      .eq("coach_id", coachId)
      .order("created_at", { ascending: false }),
    supabase
      .from("cp_brand_os_runs")
      .select("id")
      .eq("coach_id", coachId)
      .eq("state", "complete")
      .not("synthesis_json", "is", null)
      .limit(1),
  ]);

  const hasBrandOs = (brandOsRuns?.length ?? 0) > 0;

  return (
    <FunnelsWorkspace
      funnels={(funnels as FunnelRow[] | null) ?? []}
      hasBrandOs={hasBrandOs}
    />
  );
}

async function SequencesTab({ coachId }: { coachId: string }) {
  const supabase = createClient();
  const [{ data: sequences }, { data: stepRows }, { data: enrollmentRows }] =
    await Promise.all([
      supabase
        .from("cp_sequences")
        .select("*")
        .eq("coach_id", coachId)
        .order("created_at", { ascending: false }),
      supabase
        .from("cp_sequence_steps")
        .select("sequence_id")
        .eq("coach_id", coachId),
      supabase
        .from("cp_sequence_enrollments")
        .select("sequence_id, status")
        .eq("coach_id", coachId),
    ]);

  const stepCounts: Record<string, number> = {};
  for (const s of stepRows ?? []) {
    const sid = (s as { sequence_id: string }).sequence_id;
    stepCounts[sid] = (stepCounts[sid] ?? 0) + 1;
  }

  const stats: Record<
    string,
    { enrolled: number; completed: number; failed: number }
  > = {};
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

  return <SequenceList sequences={enriched as any[]} />;
}
