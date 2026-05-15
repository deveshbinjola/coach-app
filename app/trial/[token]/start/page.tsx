// /trial/[token]/start — variant picker for trip-wire buyers.
//
// The $7 buyer lands here on their first visit (the entry route redirects
// here when no run exists yet). They choose: Quick Start MVP or Full run.
// Each card POSTs to /api/trial/[token]/start, which creates the run with
// the chosen variant and drops them into the runner.

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-admin";
import { verifyTrialToken } from "@/lib/brand-os/trial-token";
import { Badge, Button, Card } from "@/components/ui";
import TrialHeader from "@/components/brand-os/TrialHeader";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function TrialStartPage({
  params,
}: {
  params: { token: string };
}) {
  const verify = await verifyTrialToken(params.token);
  if (!verify.ok) redirect(`/brand-os/trial/expired?reason=${verify.reason}`);
  const { coachId } = verify.payload;

  const admin = createAdminClient();

  // Already have a run? Don't show the picker — bounce through the entry
  // route, which routes to resume/output.
  const { data: existing } = await admin
    .from("cp_brand_os_runs")
    .select("id")
    .eq("coach_id", coachId)
    .limit(1)
    .maybeSingle();
  if (existing) redirect(`/trial/${params.token}`);

  const { data: coachRow } = await admin
    .from("cp_coaches")
    .select("email")
    .eq("id", coachId)
    .maybeSingle();
  const email = (coachRow?.email as string | null) ?? "";

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <TrialHeader email={email} />
      <main className="max-w-3xl mx-auto px-3 py-8 sm:px-8 sm:py-12 space-y-8">

        <div className="space-y-2">
          <Badge tone="brand" size="xs" uppercase>You&apos;re in</Badge>
          <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-[var(--leading-tight)]">
            Pick how deep you want to go.
          </h1>
          <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] max-w-xl leading-[var(--leading-relaxed)]">
            Both build a real Brand OS in your voice. Start with the Quick Start if you want a result today — you can always run the Full version later.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {/* Quick Start MVP */}
          <form action={`/api/trial/${params.token}/start`} method="POST">
            <input type="hidden" name="variant" value="mvp" />
            <Card className="p-5 h-full flex flex-col gap-3">
              <Badge tone="muted" size="xs" uppercase>Quick Start</Badge>
              <h3 className="font-bold text-[length:var(--t-h2)] text-[color:var(--text)] leading-[var(--leading-tight)]">
                13 questions · 60–90 min
              </h3>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)] flex-1">
                The fast path. Produces your voice system, a thin stance map, and a 7-day content calendar. Best if you want something usable today.
              </p>
              <Button type="submit" variant="ghost" block>Start Quick Start →</Button>
            </Card>
          </form>

          {/* Full run */}
          <form action={`/api/trial/${params.token}/start`} method="POST">
            <input type="hidden" name="variant" value="full" />
            <Card className="p-5 h-full flex flex-col gap-3 border-[var(--brand-strong)]">
              <Badge tone="brand" size="xs" uppercase>Full run</Badge>
              <h3 className="font-bold text-[length:var(--t-h2)] text-[color:var(--text)] leading-[var(--leading-tight)]">
                6 modules · 60+ questions
              </h3>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)] flex-1">
                The whole thing. Mirror · Signal · Stance · Funnel · Distribution · Broadcast. Output: 45-day calendar, Memory Palace, pre-mortem.
              </p>
              <Button type="submit" block>Start Full run →</Button>
            </Card>
          </form>
        </div>

        <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
          Your Brand OS is yours to keep either way. No card, nothing to cancel.
        </p>

      </main>
    </div>
  );
}
