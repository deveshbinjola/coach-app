"use client";

// RewarmDeck — slotted into LeadDetail. Only renders when the SLA state is
// warning or overdue (on-pace leads don't need a nudge — keep the UI quiet).
//
// Behavior: shows the top-ranked pattern as a big primary card with "Use this"
// that populates the parent's draft textarea. Below it, the other patterns
// collapse into a thin chip row so the coach has options without clutter.

import { useState } from "react";
import type { Lead } from "@/lib/types";
import { assessSla } from "@/lib/lead-sla";
import {
  rankPatternsForLead,
  fillTemplate,
  type RewarmPattern,
} from "@/lib/rewarm-templates";

type Props = {
  lead: Lead;
  onUseTemplate: (body: string) => void;
};

export default function RewarmDeck({ lead, onUseTemplate }: Props) {
  // Hooks MUST run unconditionally on every render — React enforces a
  // stable hook call order across renders. The early-return guard
  // below has to live AFTER every hook in this component.
  const [expanded, setExpanded] = useState<string | null>(null);

  const sla = assessSla(lead);
  // Only show when the lead is going cold — otherwise this is noise.
  if (sla.state !== "warning" && sla.state !== "overdue") return null;

  const ranked = rankPatternsForLead(lead);
  const primary = ranked[0];
  const alternates = ranked.slice(1);

  const accent = sla.state === "overdue" ? "#DC2626" : "#D97706";
  const tone = sla.state === "overdue" ? "Break the silence" : "Warm check-in";

  function use(p: RewarmPattern) {
    onUseTemplate(fillTemplate(p, lead));
  }

  return (
    <div
      className="rounded-xl border p-5 mb-4"
      style={{
        backgroundColor: "#0A0F1C",
        borderColor: "#0A0F1C",
        color: "#FFFFFF",
        boxShadow: "0 10px 30px rgba(10,15,28,0.20)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: accent }}
          />
          <span
            className="text-[10px] font-extrabold uppercase tracking-widest opacity-90"
          >
            Re-warm suggestion · {tone}
          </span>
        </div>
        <span className="text-[10px] opacity-60">{sla.label}</span>
      </div>

      {/* Primary */}
      <div
        className="rounded-lg p-4"
        style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold">{primary.label}</span>
              <span
                className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ backgroundColor: "#00FF41", color: "#0A0F1C" }}
              >
                Try this
              </span>
            </div>
            <p className="text-xs opacity-80 mt-0.5">{primary.blurb}</p>
          </div>
          <button
            onClick={() => use(primary)}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-extrabold text-xs transition-all hover:opacity-90 whitespace-nowrap"
            style={{ backgroundColor: "#00FF41", color: "#0A0F1C" }}
          >
            Use this →
          </button>
        </div>
        <pre
          className="mt-3 text-[11px] whitespace-pre-wrap font-sans opacity-90 leading-relaxed"
          style={{ fontFamily: "inherit" }}
        >
          {fillTemplate(primary, lead)}
        </pre>
      </div>

      {/* Alternates — thin chip row, expand to preview */}
      {alternates.length > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2">
            Other angles
          </div>
          <div className="flex flex-wrap gap-1.5">
            {alternates.map((p) => (
              <button
                key={p.id}
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-full border transition"
                style={{
                  borderColor: expanded === p.id ? "#00FF41" : "rgba(255,255,255,0.25)",
                  color: expanded === p.id ? "#00FF41" : "rgba(255,255,255,0.85)",
                  backgroundColor: "transparent",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {expanded && (() => {
            const p = alternates.find((x) => x.id === expanded);
            if (!p) return null;
            return (
              <div
                className="mt-3 rounded-lg p-3"
                style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] opacity-80">{p.blurb}</p>
                  <button
                    onClick={() => use(p)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-bold text-[11px] hover:opacity-90 whitespace-nowrap"
                    style={{ backgroundColor: "#00FF41", color: "#0A0F1C" }}
                  >
                    Use this →
                  </button>
                </div>
                <pre
                  className="mt-2 text-[11px] whitespace-pre-wrap opacity-90 leading-relaxed"
                  style={{ fontFamily: "inherit" }}
                >
                  {fillTemplate(p, lead)}
                </pre>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
