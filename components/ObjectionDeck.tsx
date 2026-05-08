"use client";

// ObjectionDeck — the P4 "rehearsed reframe" surface.
//
// Purpose: coaches freeze when they hear "too expensive" or "need to talk to
// my wife" because they haven't rehearsed the reframe. This deck ranks the
// objection patterns for the current lead and lets the coach expand any card
// to see the reframe + follow-up question, or one-click it into Compose.
//
// This is NOT a script library. Each pattern honors the objection first, then
// reflects what it usually means, then opens a real question. The coach edits
// from the draft — the deck removes the "blank page" problem, nothing more.
//
// Ranking logic lives in lib/objection-patterns.ts (rankObjectionsForLead).

import { useState } from "react";
import {
  OBJECTION_PATTERNS,
  rankObjectionsForLead,
  renderObjectionDraft,
  type ObjectionPattern,
  type ObjectionPatternId,
} from "@/lib/objection-patterns";
import type { Lead } from "@/lib/types";

type Props = {
  lead: Lead;
  // Inject the rendered draft into the parent's Compose textarea.
  onUseTemplate?: (body: string) => void;
};

export default function ObjectionDeck({ lead, onUseTemplate }: Props) {
  const [expanded, setExpanded] = useState<ObjectionPatternId | null>(null);
  const ranked = rankObjectionsForLead(lead);
  // Cap visible deck at top 4 — the whole point is rehearsal, not a menu.
  // Coach clicks "Show all" to see the rest.
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? ranked : ranked.slice(0, 4);

  function handleUse(p: ObjectionPattern) {
    const draft = renderObjectionDraft(p, lead);
    onUseTemplate?.(draft);
    // Scroll Compose into view — assumes parent renders it below the deck.
    if (typeof window !== "undefined") {
      setTimeout(() => {
        document
          .querySelector('textarea[placeholder^="Click"]')
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-bold">Rehearsed reframes</h3>
        <span className="text-[11px] uppercase font-semibold text-gray-500">
          Ranked for this lead
        </span>
      </div>
      <p className="text-xs text-gray-600 italic mb-3">
        When they push back — honor it, reflect it, open a real question. Click to expand, tap
        &ldquo;Use this&rdquo; to draft in Compose.
      </p>

      <div className="space-y-2">
        {visible.map((p) => {
          const isOpen = expanded === p.id;
          return (
            <div
              key={p.id}
              className={`border rounded-lg overflow-hidden transition-colors ${
                isOpen ? "border-navy" : "border-gray-200"
              }`}
            >
              <button
                onClick={() => setExpanded(isOpen ? null : p.id)}
                className="w-full flex items-start justify-between gap-3 p-3 text-left hover:bg-gray-50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      {p.label}
                    </span>
                  </div>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: "#0A0F1C" }}>
                    {p.theySaid}
                  </p>
                </div>
                <span
                  className="text-xs text-gray-400 mt-1 flex-shrink-0"
                  aria-hidden="true"
                >
                  {isOpen ? "−" : "+"}
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-100 space-y-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
                      What it usually means
                    </span>
                    <p className="text-xs text-gray-700 italic mt-0.5">{p.whatItMeans}</p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
                      Reframe
                    </span>
                    <p className="text-sm whitespace-pre-wrap mt-0.5">{p.reframe}</p>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">
                      Follow-up question
                    </span>
                    <p
                      className="text-sm font-semibold mt-0.5"
                      style={{ color: "#0A0F1C" }}
                    >
                      {p.followUp}
                    </p>
                  </div>

                  {onUseTemplate && (
                    <button
                      onClick={() => handleUse(p)}
                      className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md border hover:opacity-90"
                      style={{
                        backgroundColor: "#0A0F1C",
                        color: "#00FF41",
                        borderColor: "#0A0F1C",
                      }}
                    >
                      Use this reframe →
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {ranked.length > 4 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-3 text-[11px] text-gray-500 hover:text-navy hover:underline"
        >
          {showAll ? "Show top 4 only" : `Show all ${ranked.length} patterns →`}
        </button>
      )}

      {OBJECTION_PATTERNS.length === 0 && (
        <p className="text-sm text-gray-500 italic">No patterns configured.</p>
      )}
    </div>
  );
}
