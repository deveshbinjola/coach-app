"use client";

import { useMemo, useState } from "react";
import ImportWizard from "@/components/ImportWizard";
import NewLeadForm from "@/components/NewLeadForm";
import VoiceLeadsPanel from "@/components/VoiceLeadsPanel";

type CaptureMode = "smart" | "manual" | "import";

const MODES: Array<{
  id: CaptureMode;
  label: string;
  title: string;
  description: string;
}> = [
  {
    id: "smart",
    label: "Smart",
    title: "Capture from messy input",
    description: "Paste notes, speak names, or drop a DM screenshot. AI structures the leads.",
  },
  {
    id: "manual",
    label: "Manual",
    title: "Add one lead",
    description: "Use this when you already know the exact person and context.",
  },
  {
    id: "import",
    label: "CSV",
    title: "Import a list",
    description: "Use this for existing spreadsheets or bulk lead backfills.",
  },
];

export default function LeadCaptureWorkspace({
  initialMode,
}: {
  initialMode: string | undefined;
}) {
  const startingMode = useMemo<CaptureMode>(() => {
    return MODES.some((mode) => mode.id === initialMode)
      ? (initialMode as CaptureMode)
      : "smart";
  }, [initialMode]);
  const [mode, setMode] = useState<CaptureMode>(startingMode);
  const active = MODES.find((item) => item.id === mode) ?? MODES[0];

  return (
    <div className="space-y-5">
      <section className="rounded-[var(--r-xl)] bg-[var(--surface-dark)] text-[color:var(--text-inverse)] p-5 sm:p-7 shadow-[var(--shadow-md)]">
        <a
          href="/inbox"
          className="text-[length:var(--t-caption)] font-bold text-white/55 hover:text-white transition"
        >
          Back to Leads
        </a>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-2xl">
            <div className="text-[length:var(--t-caption)] font-extrabold uppercase tracking-wider text-[color:var(--brand)]">
              Capture
            </div>
            <h1 className="mt-2 text-[length:var(--t-h1)] font-extrabold tracking-tight leading-[var(--leading-tight)]">
              One door for every new lead.
            </h1>
            <p className="mt-2 text-[length:var(--t-caption)] text-white/65 leading-[var(--leading-base)]">
              Start with the fastest path. Smart capture should handle most days. Manual and CSV stay here when you need precision.
            </p>
          </div>
          <div className="inline-flex rounded-[var(--r-md)] border border-white/15 bg-white/[0.06] p-1">
            {MODES.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={`h-9 rounded-[var(--r-sm)] px-3 text-[length:var(--t-caption)] font-extrabold transition ${
                  mode === item.id
                    ? "bg-[var(--brand)] text-[color:var(--text-inverse)]"
                    : "text-white/65 hover:text-white"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5">
        <div className="mb-5">
          <h2 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">
            {active.title}
          </h2>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
            {active.description}
          </p>
        </div>

        {mode === "smart" && <VoiceLeadsPanel />}
        {mode === "manual" && <NewLeadForm />}
        {mode === "import" && <ImportWizard embedded />}
      </section>
    </div>
  );
}
