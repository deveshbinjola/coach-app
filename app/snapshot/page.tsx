// /snapshot · public landing for the free Brand OS Snapshot
//
// Two modes:
//   1. No query params → render the email gate (capture email, first name, audience)
//   2. ?email=...&first_name=...&audience=... → server-side create the anonymous
//      run, redirect to /snapshot/[runId]. Designed so elevateaisystem.com/brand-os
//      can submit a plain form to this page and the visitor lands in the quiz.

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type Search = { email?: string; first_name?: string; audience?: string };

export default async function SnapshotLanding({
  searchParams,
}: {
  searchParams: Search;
}) {
  const email = (searchParams.email ?? "").trim().toLowerCase();
  const firstName = (searchParams.first_name ?? "").trim();
  const audienceRaw = (searchParams.audience ?? "X").trim().toUpperCase();
  const audience: "M" | "W" | "X" =
    audienceRaw === "M" ? "M" : audienceRaw === "W" ? "W" : "X";

  // Mode 2: query params present → create the run + bounce into the runner.
  if (email && email.includes("@")) {
    const admin = createAdminClient();

    // Resume any existing unclaimed in-progress run for this email.
    const { data: existing } = await admin
      .from("cp_brand_os_runs")
      .select("id")
      .eq("email_for_claim", email)
      .is("claimed_at", null)
      .is("coach_id", null)
      .eq("variant_v", "v5")
      .eq("tier", "snapshot")
      .eq("state", "in_progress")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      redirect(`/snapshot/${existing.id}`);
    }

    const { data: created } = await admin
      .from("cp_brand_os_runs")
      .insert({
        coach_id: null,
        email_for_claim: email,
        first_name_for_claim: firstName || null,
        variant: "designed",
        variant_v: "v5",
        tier: "snapshot",
        audience,
        current_module: "snapshot",
        current_question_id: "snapshot.audience",
      })
      .select("id")
      .single();

    if (created?.id) {
      redirect(`/snapshot/${created.id}`);
    }
  }

  // Mode 1: render the email gate inline.
  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <main className="mx-auto max-w-xl px-6 py-20">
        <div className="mb-8 text-center">
          <span className="inline-block text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--brand-strong)]">
            Brand OS · Free
          </span>
          <h1 className="mt-3 font-display text-4xl font-bold leading-tight text-[color:var(--text)]">
            Your voice. Named in <em className="italic text-[color:var(--brand-strong)]">ten minutes.</em>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base text-[color:var(--text-muted)]">
            Five questions. One archetype. Three pillars. Free forever.
          </p>
        </div>

        <form action="/snapshot" method="GET" className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] p-6">
          <div>
            <label htmlFor="first_name" className="mb-1 block text-sm font-semibold text-[color:var(--text)]">
              First name
            </label>
            <input
              id="first_name"
              name="first_name"
              type="text"
              required
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[color:var(--text)] focus:border-[var(--brand)] focus:outline-none"
              placeholder="Sunny"
            />
          </div>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-semibold text-[color:var(--text)]">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base text-[color:var(--text)] focus:border-[var(--brand)] focus:outline-none"
              placeholder="you@yourbrand.com"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-semibold text-[color:var(--text)]">
              Who do you mostly serve?
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex cursor-pointer items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[color:var(--text)] has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]">
                <input type="radio" name="audience" value="M" className="sr-only" defaultChecked />
                Men
              </label>
              <label className="flex cursor-pointer items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[color:var(--text)] has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]">
                <input type="radio" name="audience" value="W" className="sr-only" />
                Women
              </label>
              <label className="flex cursor-pointer items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[color:var(--text)] has-[:checked]:border-[var(--brand)] has-[:checked]:bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]">
                <input type="radio" name="audience" value="X" className="sr-only" />
                Mixed
              </label>
            </div>
          </div>
          <button
            type="submit"
            className="mt-2 w-full rounded-md bg-[var(--brand)] px-6 py-3 text-base font-bold text-[var(--surface)] hover:bg-[var(--brand-strong)]"
          >
            Start your Snapshot →
          </button>
          <p className="text-center text-xs text-[color:var(--text-muted)]">
            No payment. No account needed yet. You get your Snapshot, then choose if you want to go deeper.
          </p>
        </form>
      </main>
    </div>
  );
}
