// Brand OS v5 — in-app landing page.
//
// Order matters here. The Snapshot CTA is the headline action and sits
// directly under the hero. Resume + voice + legacy options are below the
// fold. Brand OS is free across the board — no $7 anywhere on this page.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import { Badge, Button, Card } from "@/components/ui";
import { Mic } from "lucide-react";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  state: "in_progress" | "complete" | "abandoned";
  variant: "mvp" | "full" | "designed";
  variant_v: "legacy" | "v5" | null;
  tier: "snapshot" | "full_round" | null;
  audience: "M" | "W" | "X";
  started_at: string;
  completed_at: string | null;
  current_module: string;
  label: string | null;
};

export default async function BrandOsLanding({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: runs } = await supabase
    .from("cp_brand_os_runs")
    .select("id, state, variant, variant_v, tier, audience, started_at, completed_at, current_module, label")
    .eq("coach_id", user.id)
    .order("started_at", { ascending: false })
    .limit(20);

  const inProgress = (runs ?? []).filter((r) => r.state === "in_progress") as RunRow[];
  const completed  = (runs ?? []).filter((r) => r.state === "complete") as RunRow[];
  const mostRecentInProgress = inProgress[0]; // single most-recent only
  const otherInProgressCount = Math.max(0, inProgress.length - 1);

  const errorMsg = searchParams.error ? decodeURIComponent(searchParams.error) : null;

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-6 sm:py-10">

        {/* Hero */}
        <div className="mb-6">
          <Badge tone="brand" size="xs" uppercase>Brand OS · v5</Badge>
          <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] mt-2 leading-[var(--leading-tight)]">
            Your voice. Named in ten minutes.
          </h1>
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-2 max-w-xl leading-[var(--leading-relaxed)]">
            Five questions to your archetype, voice rules, and three pillars. Free. Continue inside for the full Round when you are ready.
          </p>
        </div>

        {/* Debug: surface POST errors that previously bounced silently */}
        {errorMsg && (
          <div className="mb-6 rounded-[var(--r-lg)] border border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface-elevated))] px-4 py-3 text-[length:var(--t-caption)] text-[color:var(--text)]">
            Could not start a new run: <strong>{errorMsg}</strong>
          </div>
        )}

        {/* PRIMARY: Start Snapshot */}
        <section className="mb-8">
          <form action="/brand-os/start" method="POST" id="start-snapshot">
            <input type="hidden" name="variant" value="designed" />
            <input type="hidden" name="tier" value="snapshot" />
            <Card className="p-6 flex flex-col gap-3 border-2 border-[var(--brand)]">
              <Badge tone="brand" size="xs" uppercase>Snapshot · Free</Badge>
              <h3 className="font-bold text-[length:var(--t-h2)] text-[color:var(--text)] leading-[var(--leading-tight)]">
                5 questions. 10 minutes. One archetype.
              </h3>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)]">
                You walk out with your archetype, three voice rules pulled from the way you actually answered, and three content pillars. Continue inside for the full Round when you want it.
              </p>
              <Button type="submit" block>Start Snapshot →</Button>
            </Card>
          </form>
        </section>

        {/* Completed runs */}
        {completed.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)] mb-3">
              Completed
            </h2>
            <div className="space-y-2">
              {completed.slice(0, 3).map((r) => (
                <Link
                  key={r.id}
                  href={`/brand-os/run/${r.id}/output`}
                  className="block rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 hover:border-[var(--brand-strong)] transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[color:var(--text)]">
                        {r.label ?? labelFor(r)} · audience {r.audience}
                      </div>
                      <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                        Completed {r.completed_at ? formatDate(r.completed_at) : ""}
                      </div>
                    </div>
                    <span className="text-[color:var(--brand-strong)] text-[length:var(--t-caption)] font-bold">
                      View output →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Single most-recent resume (the rest hidden behind "Show more") */}
        {mostRecentInProgress && (
          <section className="mb-8">
            <h2 className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)] mb-3">
              Resume
            </h2>
            <Link
              href={resumeHref(mostRecentInProgress)}
              className="block rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 hover:border-[var(--brand-strong)] transition"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-[color:var(--text)]">
                    {mostRecentInProgress.label ?? labelFor(mostRecentInProgress)} · audience {mostRecentInProgress.audience}
                  </div>
                  <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                    Last in <strong>{mostRecentInProgress.current_module}</strong> · started {formatDate(mostRecentInProgress.started_at)}
                  </div>
                </div>
                <span className="text-[color:var(--brand-strong)] text-[length:var(--t-caption)] font-bold">
                  Resume →
                </span>
              </div>
            </Link>
            {otherInProgressCount > 0 && (
              <details className="mt-2">
                <summary className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] cursor-pointer hover:text-[color:var(--text-muted)] list-none">
                  <span className="underline decoration-dotted">
                    {otherInProgressCount} more in progress
                  </span>
                </summary>
                <div className="space-y-2 mt-2">
                  {inProgress.slice(1).map((r) => (
                    <Link
                      key={r.id}
                      href={resumeHref(r)}
                      className="block rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 hover:border-[var(--brand-strong)] transition text-[length:var(--t-caption)]"
                    >
                      <span className="text-[color:var(--text)]">{r.label ?? labelFor(r)}</span>
                      <span className="text-[color:var(--text-muted)]"> · {formatDate(r.started_at)}</span>
                    </Link>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}

        {/* Voice path · secondary, below the fold */}
        <section className="mb-8">
          <Link
            href="/brand-os/voice-discovery"
            className="block rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-5 py-4 hover:border-[var(--brand-strong)] transition"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[color-mix(in_srgb,var(--brand)_15%,var(--surface-elevated))] flex items-center justify-center">
                <Mic className="w-4 h-4 text-[color:var(--brand-strong)]" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-[length:var(--t-body)] text-[color:var(--text)]">
                  Or start with Voice
                </h3>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                  Talk instead of type. The agent builds your Brand OS from what you say.
                </p>
              </div>
              <span className="text-[color:var(--brand-strong)] text-[length:var(--t-caption)] font-bold ml-auto flex-shrink-0">
                Start →
              </span>
            </div>
          </Link>
        </section>

        {/* Legacy variants · hidden under details for admin */}
        <details className="mb-8 group">
          <summary className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] cursor-pointer hover:text-[color:var(--text-muted)] list-none">
            <span className="underline decoration-dotted">More options (legacy)</span>
          </summary>
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <form action="/brand-os/start" method="POST">
              <input type="hidden" name="variant" value="full" />
              <Card className="p-4 h-full flex flex-col gap-2">
                <Badge tone="muted" size="xs" uppercase>Legacy · Full</Badge>
                <h3 className="font-bold text-[length:var(--t-body)] text-[color:var(--text)]">
                  6 modules. 60+ questions.
                </h3>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] flex-1">
                  The original Brand OS run. 45-day calendar + Memory Palace.
                </p>
                <Button type="submit" variant="ghost" block>Start legacy full →</Button>
              </Card>
            </form>
            <form action="/brand-os/start" method="POST">
              <input type="hidden" name="variant" value="mvp" />
              <Card className="p-4 h-full flex flex-col gap-2">
                <Badge tone="muted" size="xs" uppercase>Legacy · MVP</Badge>
                <h3 className="font-bold text-[length:var(--t-body)] text-[color:var(--text)]">
                  13 questions. 60 to 90 min.
                </h3>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] flex-1">
                  Original trip-wire build. 7-day calendar. Watermarked.
                </p>
                <Button type="submit" variant="ghost" block>Start legacy MVP →</Button>
              </Card>
            </form>
          </div>
        </details>

      </main>
    </div>
  );
}

function labelFor(r: { variant: string; variant_v: "legacy" | "v5" | null; tier: "snapshot" | "full_round" | null }): string {
  if (r.variant_v === "v5") {
    return r.tier === "full_round" ? "Full Round" : "Snapshot";
  }
  return r.variant === "mvp" ? "Quick Start MVP" : "Full Brand OS run";
}

function resumeHref(r: RunRow): string {
  if (r.variant_v === "v5") {
    if (r.tier === "snapshot" && r.current_module === "reveal") {
      return `/brand-os/reveal/${r.id}`;
    }
    if (r.tier === "full_round" && r.current_module === "hold") {
      return `/brand-os/hold/${r.id}`;
    }
  }
  return `/brand-os/run/${r.id}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
