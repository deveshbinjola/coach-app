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

export const runtime = "edge";
export const dynamic = "force-dynamic";

type RunRow = {
  id: string;
  state: "in_progress" | "complete" | "abandoned";
  variant: "mvp" | "full";
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
    .select("id, state, variant, audience, started_at, completed_at, current_module, label")
    .eq("coach_id", user.id)
    .order("started_at", { ascending: false })
    .limit(20);

  const inProgress = (runs ?? []).filter((r) => r.state === "in_progress") as RunRow[];
  const completed  = (runs ?? []).filter((r) => r.state === "complete") as RunRow[];

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-6 sm:py-10">

        <div className="mb-8">
          <Badge tone="brand" size="xs" uppercase>Brand OS · v2.1</Badge>
          <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] mt-2 leading-[var(--leading-tight)]">
            Calibrate. Embody. Refuse.
          </h1>
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] mt-2 max-w-xl leading-[var(--leading-relaxed)]">
            A 6-module run that builds your buyer mirror, voice system, stance map, funnel, distribution, and a 45-day broadcast calendar. One question at a time. The agent pushes back on generic language.
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
                  href={`/brand-os/run/${r.id}`}
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

        {/* Start new */}
        <section className="mb-8 space-y-3">
          <h2 className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Start a new run
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <form action="/brand-os/start" method="POST" id="start-full" className="scroll-mt-8">
              <input type="hidden" name="variant" value="full" />
              <Card className="p-5 h-full flex flex-col gap-3">
                <Badge tone="brand" size="xs" uppercase>Full run</Badge>
                <h3 className="font-bold text-[length:var(--t-h2)] text-[color:var(--text)] leading-[var(--leading-tight)]">
                  6 modules · 60+ questions
                </h3>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)] flex-1">
                  Mirror · Signal · Stance · Funnel · Distribution · Broadcast. Output: 45-day calendar + Memory Palace + pre-mortem.
                </p>
                <Button type="submit" block>Start full run →</Button>
              </Card>
            </form>
            <form action="/brand-os/start" method="POST">
              <input type="hidden" name="variant" value="mvp" />
              <Card className="p-5 h-full flex flex-col gap-3">
                <Badge tone="muted" size="xs" uppercase>Quick Start MVP</Badge>
                <h3 className="font-bold text-[length:var(--t-h2)] text-[color:var(--text)] leading-[var(--leading-tight)]">
                  13 questions · 60–90 min
                </h3>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)] flex-1">
                  Trip-wire version. Produces a 7-day calendar + voice system + thin stance map. Watermarked.
                </p>
                <Button type="submit" variant="ghost" block>Start MVP →</Button>
              </Card>
            </form>
          </div>
        </section>

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

function labelFor(r: { variant: "mvp" | "full"; audience: string }): string {
  return r.variant === "mvp" ? "Quick Start MVP" : "Full Brand OS run";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
