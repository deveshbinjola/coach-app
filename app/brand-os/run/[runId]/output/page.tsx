// Brand OS Agent v2 — final output page.
//
// This is the deliverable view. Renders the 8 sections from the spec:
//   1. Buyer Mirror · 2. Voice System · 3. Stance Map · 4. Funnel Map
//   5. Distribution System · 6. 45-Day Broadcast Calendar
//   7. Memory Palace recall cards (printable)
//   8. Day 14 + Day 30 Review Scripts
//
// V1 of this page: render the raw answers grouped by module. Full
// synthesis (LLM-generated Pólya calendar, push-back watermarks visible
// at the bottom, Memory Palace cards) ships in the next build alongside
// the /api/brand-os/generate-output endpoint.

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import { Badge } from "@/components/ui";
import OutputToolbar from "@/components/brand-os/OutputToolbar";
import { getQuestion, MODULE_ORDER, MODULE_META, pick, type ModuleId, type Audience } from "@/lib/brand-os/questions";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function BrandOsOutputPage({ params }: { params: { runId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: run } = await supabase
    .from("cp_brand_os_runs")
    .select("*")
    .eq("id", params.runId)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!run) notFound();

  const { data: answers } = await supabase
    .from("cp_brand_os_answers")
    .select("question_id, raw_text, refined_text, locked_at, module")
    .eq("run_id", params.runId)
    .order("module", { ascending: true });

  const { data: pushBacks } = await supabase
    .from("cp_brand_os_pushbacks")
    .select("question_id, action, override_reason")
    .eq("run_id", params.runId);

  const audience = run.audience as Audience;
  const overrideWatermarks = (pushBacks ?? []).filter((p) => p.action === "override");

  return (
    <div className="min-h-screen bg-[var(--surface)]">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-3xl mx-auto px-3 py-6 sm:px-8 sm:py-10 space-y-10 print:max-w-none print:py-4">

        {/* Header */}
        <section className="border-b border-[var(--border)] pb-6 space-y-2">
          <Badge tone="brand" size="xs" uppercase>Brand OS · {run.variant === "mvp" ? "Quick Start MVP" : "Full Run"} · Audience {audience}</Badge>
          <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight leading-[var(--leading-tight)] text-[color:var(--text)]">
            Your Brand OS — Output
          </h1>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            {run.completed_at ? `Completed ${new Date(run.completed_at).toLocaleDateString()}` : "Draft"}
            {" · "}
            {(answers ?? []).filter((a) => a.locked_at).length} of {(answers ?? []).length} answers locked
          </p>
        </section>

        {/* Toolbar */}
        <section className="print:hidden">
          <OutputToolbar runId={run.id} defaultEmail={user.email ?? ""} />
        </section>

        {/* Per-module sections */}
        {MODULE_ORDER.filter((m) => m !== "preflight" && m !== "broadcast").map((module) => {
          const moduleAnswers = (answers ?? []).filter((a) => a.module === module);
          if (moduleAnswers.length === 0) return null;
          return (
            <ModuleSection
              key={module}
              module={module}
              audience={audience}
              answers={moduleAnswers.map((a) => ({
                question_id: a.question_id,
                raw_text: a.raw_text,
                refined_text: a.refined_text,
              }))}
            />
          );
        })}

        {/* Broadcast — placeholder until LLM-synthesised calendar ships */}
        <section className="space-y-3">
          <Badge tone="muted" size="xs" uppercase>Module 6 · Broadcast</Badge>
          <h2 className="font-display text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
            45-Day Calendar
          </h2>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
            Calendar synthesis (Pólya structure + unit-econ tagging per piece) ships in the next build. For now, the inputs in Mirror / Signal / Stance / Funnel / Distribution above are everything the generator needs.
          </p>
        </section>

        {/* Watermarks */}
        {overrideWatermarks.length > 0 && (
          <section className="bg-[var(--surface-elevated)] border-l-4 border-[var(--warning)] rounded-r-[var(--r-md)] p-4 space-y-2 print:bg-white">
            <h3 className="font-bold text-[color:var(--text)]">Override watermarks</h3>
            <ul className="space-y-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              {overrideWatermarks.map((p, i) => (
                <li key={i}>
                  <code className="font-mono">{p.question_id}</code> — generic positioning retained at user override.
                  {p.override_reason && <span className="italic"> Reason: {p.override_reason}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

      </main>
    </div>
  );
}

function ModuleSection({
  module, audience, answers,
}: {
  module: ModuleId;
  audience: Audience;
  answers: Array<{ question_id: string; raw_text: string | null; refined_text: string | null }>;
}) {
  const meta = MODULE_META[module];
  return (
    <section className="space-y-4">
      <div>
        <Badge tone="brand" size="xs" uppercase>{meta.label}</Badge>
        <h2 className="font-display text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)] mt-1">
          {meta.tagline}
        </h2>
      </div>
      <div className="space-y-4">
        {answers.map((a) => {
          const q = getQuestion(a.question_id);
          if (!q) return null;
          const text = a.refined_text ?? a.raw_text ?? "(skipped)";
          return (
            <div key={a.question_id} className="border-l-2 border-[var(--border)] pl-4 space-y-1">
              <p className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text-faint)]">
                {q.id}
              </p>
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] italic">
                {pick(q.prompt, audience)}
              </p>
              <p className="text-[color:var(--text)] whitespace-pre-wrap">{text}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
