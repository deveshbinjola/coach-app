"use client";

// FitCard — the P4 "should we be having this conversation" card.
//
// Shown in the LeadDetail sidebar. Three jobs:
//   1. Display the current fit band (strong/decent/weak/disqualified) + reasons
//   2. Prompt the coach to fill missing signals (income_band, readiness)
//   3. Provide the "disqualify" escape hatch with a free-text reason
//
// Fit band uses inline styles for the navy/green variant because Tailwind
// arbitrary-value classes don't always JIT-compile (same gotcha we hit in
// ParetoSection). Rest of the bands are fine with Tailwind tokens.

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import {
  INCOME_BAND_LABEL,
  LEAD_INCOME_BANDS,
  LEAD_READINESS_SIGNALS,
  READINESS_LABEL,
  type Lead,
  type LeadIncomeBand,
  type LeadReadiness,
} from "@/lib/types";
import { assessFit, FIT_BAND_LABEL, FIT_BAND_TIP } from "@/lib/lead-fit";

type Props = {
  lead: Lead;
  onChange?: (patch: Partial<Lead>) => void;
};

export default function FitCard({ lead, onChange }: Props) {
  const [income, setIncome] = useState<LeadIncomeBand | "">(lead.income_band ?? "");
  const [readiness, setReadiness] = useState<LeadReadiness | "">(
    lead.readiness_signal ?? "",
  );
  const [fitNotes, setFitNotes] = useState<string>(lead.fit_notes ?? "");
  const [disqReason, setDisqReason] = useState<string>(lead.disqualified_reason ?? "");
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showDq, setShowDq] = useState(false);

  // Build a synthetic lead with the current (pre-save) state so the score
  // reflects what the coach just typed, not what's in the DB yet.
  const liveLead: Lead = {
    ...lead,
    income_band: (income || null) as LeadIncomeBand | null,
    readiness_signal: (readiness || null) as LeadReadiness | null,
    disqualified_reason: disqReason.trim() || null,
    fit_notes: fitNotes || null,
  };
  const fit = assessFit(liveLead);

  async function persist(patch: Partial<Lead>, fieldKey: string) {
    setSavingField(fieldKey);
    const supabase = createClient();
    const { error } = await supabase.from("cp_leads").update(patch).eq("id", lead.id);
    setSavingField(null);
    if (error) {
      alert(error.message);
      return;
    }
    onChange?.(patch);
  }

  async function handleIncomeChange(v: string) {
    const val = (v || null) as LeadIncomeBand | null;
    setIncome((v as LeadIncomeBand) || "");
    await persist({ income_band: val }, "income");
  }

  async function handleReadinessChange(v: string) {
    const val = (v || null) as LeadReadiness | null;
    setReadiness((v as LeadReadiness) || "");
    await persist({ readiness_signal: val }, "readiness");
  }

  async function handleFitNotesBlur() {
    if ((lead.fit_notes ?? "") === fitNotes) return;
    await persist({ fit_notes: fitNotes.trim() || null }, "notes");
  }

  async function handleDisqualify() {
    if (!disqReason.trim()) {
      alert("Add a short reason. This feeds the 'why we disqualified' decision.");
      return;
    }
    await persist(
      { disqualified_reason: disqReason.trim(), status: "closed_lost" },
      "disqualify",
    );
  }

  async function handleClearDisqualify() {
    setDisqReason("");
    await persist({ disqualified_reason: null }, "clear-dq");
  }

  const bandStyle =
    fit.band === "strong"
      ? { backgroundColor: "#0A0F1C", color: "#4ADE80", borderColor: "#0A0F1C" }
      : fit.band === "decent"
      ? { backgroundColor: "#FFFBEB", color: "#78350F", borderColor: "#FCD34D" }
      : fit.band === "weak"
      ? { backgroundColor: "#F3F4F6", color: "#374151", borderColor: "#D1D5DB" }
      : { backgroundColor: "#FEF2F2", color: "#991B1B", borderColor: "#FCA5A5" };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase font-semibold text-[color:var(--text-faint)]">Fit assessment</span>
        <span
          className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={bandStyle}
          title={`Score: ${fit.score}/100`}
        >
          {FIT_BAND_LABEL[fit.band]} · {fit.score}
        </span>
      </div>

      <p className="text-xs text-[color:var(--text-muted)] italic mt-2">{FIT_BAND_TIP[fit.band]}</p>

      {fit.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {fit.reasons.map((r, i) => (
            <li key={i} className="text-[11px] text-[color:var(--text-muted)] flex items-start gap-1">
              <span style={{ color: "#00A12E" }}>·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Inline editors — save on change/blur, no submit button needed. */}
      <div className="mt-3 space-y-2">
        <div>
          <label className="block text-[10px] uppercase font-bold tracking-wider text-[color:var(--text-faint)] mb-0.5">
            Income band
            {savingField === "income" && <span className="ml-1 text-[10px] normal-case text-[color:var(--text-faint)]">saving…</span>}
          </label>
          <select
            value={income}
            onChange={(e) => handleIncomeChange(e.target.value)}
            className="w-full p-1.5 border border-[var(--border)] rounded-[var(--r-md)] text-sm"
          >
            <option value="">— not set —</option>
            {LEAD_INCOME_BANDS.map((b) => (
              <option key={b} value={b}>{INCOME_BAND_LABEL[b]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase font-bold tracking-wider text-[color:var(--text-faint)] mb-0.5">
            Readiness
            {savingField === "readiness" && <span className="ml-1 text-[10px] normal-case text-[color:var(--text-faint)]">saving…</span>}
          </label>
          <select
            value={readiness}
            onChange={(e) => handleReadinessChange(e.target.value)}
            className="w-full p-1.5 border border-[var(--border)] rounded-[var(--r-md)] text-sm"
          >
            <option value="">— not set —</option>
            {LEAD_READINESS_SIGNALS.map((r) => (
              <option key={r} value={r}>{READINESS_LABEL[r]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[10px] uppercase font-bold tracking-wider text-[color:var(--text-faint)] mb-0.5">
            Fit notes
            {savingField === "notes" && <span className="ml-1 text-[10px] normal-case text-[color:var(--text-faint)]">saving…</span>}
          </label>
          <textarea
            value={fitNotes}
            onChange={(e) => setFitNotes(e.target.value)}
            onBlur={handleFitNotesBlur}
            rows={2}
            placeholder="Your read — not the data, the feel."
            className="w-full p-1.5 border border-[var(--border)] rounded-[var(--r-md)] text-xs"
          />
        </div>
      </div>

      {/* Missing-signal prompts — nudge the coach to fill what drives the score. */}
      {fit.missingSignals.length > 0 && fit.band !== "disqualified" && (
        <div
          className="mt-3 rounded-md border p-2 text-[11px]"
          style={{ backgroundColor: "rgba(0,255,65,0.05)", borderColor: "#86efac" }}
        >
          <span className="font-bold" style={{ color: "#0A0F1C" }}>To sharpen this score:</span>{" "}
          <span className="text-[color:var(--text-muted)]">{fit.missingSignals.join(" · ")}</span>
        </div>
      )}

      {/* Disqualify escape hatch */}
      <div className="mt-3 pt-3 border-t border-[var(--border-faint)]">
        {fit.band === "disqualified" ? (
          <div>
            <p className="text-xs font-semibold text-[color:var(--danger)]">Disqualified</p>
            <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5 italic">{disqReason}</p>
            <button
              onClick={handleClearDisqualify}
              disabled={savingField === "clear-dq"}
              className="text-[11px] text-[color:var(--text-faint)] hover:underline mt-2"
            >
              {savingField === "clear-dq" ? "Clearing…" : "Clear disqualification"}
            </button>
          </div>
        ) : !showDq ? (
          <button
            onClick={() => setShowDq(true)}
            className="text-[11px] text-[color:var(--text-faint)] hover:text-[color:var(--danger)] hover:underline"
          >
            Not a fit? Disqualify →
          </button>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={disqReason}
              onChange={(e) => setDisqReason(e.target.value)}
              placeholder="Reason — keep it honest (e.g. below budget, wrong stage)"
              className="w-full p-1.5 border border-[var(--border)] rounded-[var(--r-md)] text-xs"
            />
            <div className="flex gap-2">
              <button
                onClick={handleDisqualify}
                disabled={savingField === "disqualify"}
                className="flex-1 px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--danger-border)] text-[color:var(--danger)] font-semibold text-xs hover:bg-[var(--danger-soft)] disabled:opacity-50"
              >
                {savingField === "disqualify" ? "Disqualifying…" : "Disqualify & close loop"}
              </button>
              <button
                onClick={() => {
                  setShowDq(false);
                  setDisqReason("");
                }}
                className="px-3 py-1.5 text-xs text-[color:var(--text-faint)] hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
