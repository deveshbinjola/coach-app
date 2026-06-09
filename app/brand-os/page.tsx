// Brand OS Agent v2 — landing page.
//
// Coach lands here from /command-center → "Run Brand OS". This page:
//   1. Shows any in-progress runs (resume link)
//   2. Shows completed runs (view-output link)
//   3. Offers "Start new run" — picks variant (mvp / full)
//
// Single source of truth: lib/brand-os/questions.ts + cp_brand_os_runs.

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

export default async function BrandOsLanding() {
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

  // v5 is the default. Coaches land on the free Snapshot (5 questions, 10 min)
  // and upgrade to the $7 Full Round inside the reveal. Legacy variants stay
  // visible as a "more options" affordance for admin / staging.

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-6 sm:py-10">

        <div className="mb-8">
          <Badge tone="brand" size="xs" uppercase>Brand OS · v5</Badge>
          <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] mt-2 leading-[var(--leading-tight)]">
            Your voice. Named in ten minutes.
          </h1>
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-2 max-w-xl leading-[var(--leading-relaxed)]">
            Five questions. One Snapshot. The first thing you write after is the most you. Continue for $7 and you get the full Round (eleven questions, twenty-four hour hold, one calendar week of content).
          </p>
        </div>

        {/* In-progress runs */}
        {inProgress.length > 0 && (
          <section className="mb-8">
            <h2 className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)] mb-3">
              Resume in progress
            </h2>
            <div className="space-y-2">
              {inProgress.map((r) => (
                <Link
                  key={r.id}
                  href={resumeHref(r)}
                  className="block rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 hover:border-[var(--brand-strong)] transition"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-[color:var(--text)]">
                        {r.label ?? labelFor(r)} · audience {r.audience}
                      </div>
                      <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                        Last in <strong>{r.current_module}</strong> · started {formatDate(r.started_at)}
                      </div>
                    </div>
                    <span className="text-[color:var(--brand-strong)] text-[length:var(--t-caption)] font-bold">
                      Resume →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Start with Voice */}
        <section className="mb-8">
          <Link
            href="/brand-os/voice-discovery"
            className="block rounded-[var(--r-lg)] border-2 border-[var(--brand)] bg-[var(--surface-elevated)] px-5 py-4 hover:bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface-elevated))] transition"
          >
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-[var(--brand)] flex items-center justify-center">
                <Mic className="w-5 h-5 text-[color:var(--surface)]" />
              </div>
              <div>
                <h3 className="font-bold text-[length:var(--t-h2)] text-[color:var(--text)] leading-[var(--leading-tight)]">
                  Start with Voice
                </h3>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)]">
                  Have a conversation instead of filling out forms. Talk about your brand and the AI builds your Brand OS from what you say.
                </p>
              </div>
              <span className="text-[color:var(--brand-strong)] text-[length:var(--t-caption)] font-bold ml-auto flex-shrink-0">
                Start →
              </span>
            </div>
          </Link>
        </section>

        {/* Start new — v5 Snapshot is the primary path */}
        <section className="mb-8 space-y-3">
          <h2 className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Start a new run
          </h2>
          <form action="/brand-os/start" method="POST" id="start-snapshot" className="scroll-mt-8">
            <input type="hidden" name="variant" value="designed" />
            <input type="hidden" name="tier" value="snapshot" />
            <Card className="p-5 h-full flex flex-col gap-3 border-2 border-[var(--brand)]">
              <Badge tone="brand" size="xs" uppercase>Snapshot · Free</Badge>
              <h3 className="font-bold text-[length:var(--t-h2)] text-[color:var(--text)] leading-[var(--leading-tight)]">
                5 questions. 10 minutes. One archetype.
              </h3>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)] flex-1">
                You walk out with your archetype, three voice rules pulled from the way you actually answered, and three content pillars. Continue inside for the full Round ($7).
              </p>
              <Button type="submit" block>Start Snapshot →</Button>
            </Card>
          </form>
        </section>

        {/* Legacy variants — hidden under a details affordance for admin */}
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

        {/* Completed runs */}
        {completed.length > 0 && (
          <section>
            <h2 className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)] mb-3">
              Completed
            </h2>
            <div className="space-y-2">
              {completed.map((r) => (
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
                        Completed {r.completed_at ? formatDate(r.completed_at) : "—"}
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
  // v5: Snapshot done but unpaid → land on reveal (upsell). Full Round in hold
  // → land on hold screen. Otherwise the runner page picks up where they left off.
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
