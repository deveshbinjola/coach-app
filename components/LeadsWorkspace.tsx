"use client";

// LeadsWorkspace, the /inbox interactive shell.
//
// Wraps the existing LeadList in a layer that ALSO hosts the Compose drawer.
// Compose used to be a separate top-level route (/compose) and a separate
// top-nav item, that fragmented the daily workflow. Now: one destination,
// Compose is an action you take FROM your leads.
//
// Drawer opens via:
//   1. Click the "Compose" button in the page header
//   2. Land on /inbox?compose=open (so /compose redirects, deep links work,
//      Decisions' "Start here" button still works via
//      ?compose=open&ids=a,b,c)
//
// Closing the drawer strips the compose param so refresh ≠ reopen.

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LeadList from "@/components/LeadList";
import LeadSearchBar from "@/components/inbox/LeadSearchBar";
import ComposeStudio from "@/components/ComposeStudio";
import Modal from "@/components/ui/Modal";
import type { Lead } from "@/lib/types";
import { assessSla } from "@/lib/lead-sla";

type Props = {
  leads: Lead[];
  /** Server-captured millisecond timestamp passed to LeadList for SSR/CSR
   *  recency-score parity. */
  now: number;
  coachId: string;
};

export default function LeadsWorkspace({ leads, now, coachId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Open state derived from URL. Source-of-truth in URL means deep links,
  // back/forward, and the Decisions handoff all "just work."
  const composeParam = searchParams?.get("compose");
  const open = composeParam === "open";

  // Local mirror so closing animations feel responsive (don't need to wait
  // for router.replace round-trip). Sync with URL on every change.
  const [drawerOpen, setDrawerOpen] = useState(open);
  useEffect(() => setDrawerOpen(open), [open]);

  // Pre-seed filter chips from URL when present (preserves ComposeStudio's
  // existing /compose?pain=&temp=&ids= contract, nothing else needs to change).
  const seedPain = (searchParams?.get("pain") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seedTemp = (searchParams?.get("temp") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seedIds = (searchParams?.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seedSource = searchParams?.get("source") ?? "";
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>(leads);
  const handleFiltered = useCallback((filtered: Lead[]) => {
    setFilteredLeads(filtered);
  }, []);

  const activeLeads = leads.filter(
    (lead) => lead.status !== "client" && lead.status !== "closed_lost"
  );
  const hotLeads = activeLeads.filter(
    (lead) => lead.temperature === "on_fire" || lead.temperature === "hot"
  );
  const needsTouch = activeLeads.filter((lead) => {
    const sla = assessSla(lead, now);
    const followupDue =
      !!lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= now;
    return sla.state === "overdue" || sla.state === "warning" || followupDue;
  });
  const rescueStack = needsTouch.slice(0, 3);
  const sessionMinutes = needsTouch.length > 0
    ? Math.min(24, Math.max(8, needsTouch.length * 4))
    : 10;
  const leadRoomSentence =
    leads.length === 0
      ? "Capture the first few conversations. The app will turn the book into a short action list."
      : needsTouch.length > 0
        ? `${needsTouch.length} ${needsTouch.length === 1 ? "lead needs" : "leads need"} a reply today.`
        : hotLeads.length > 0
          ? `${hotLeads.length} hot ${hotLeads.length === 1 ? "lead is" : "leads are"} ready for a next move.`
          : "No fires right now. Work the best next conversation.";

  function openCompose() {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("compose", "open");
    router.replace(`/inbox?${params.toString()}`, { scroll: false });
  }

  function closeCompose() {
    setDrawerOpen(false); // optimistic close
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("compose");
    params.delete("pain");
    params.delete("temp");
    params.delete("ids");
    params.delete("source");
    const qs = params.toString();
    router.replace(qs ? `/inbox?${qs}` : "/inbox", { scroll: false });
  }

  return (
    <>
      <section className="mb-5 space-y-3">
        {/* Status bar */}
        <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] px-4 py-3 shadow-[var(--shadow-xs)]">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-faint)] bg-white/70 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-muted)]">
              Lead Room
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand)]" />
              Session
            </div>
            <span className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
              {leadRoomSentence}
            </span>
            <div className="flex items-center gap-4 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              <span><b className="text-[color:var(--text)]">{activeLeads.length}</b> active</span>
              <span><b className="text-[color:var(--text)]">{hotLeads.length}</b> hot</span>
              <span><b className="text-[color:var(--text)]">{needsTouch.length}</b> to touch</span>
            </div>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <a
                href="/leads/capture"
                title="Paste text, speak, or drop a screenshot. AI parses each lead."
                className="inline-flex items-center justify-center h-8 px-3 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
              >
                Capture
              </a>
              <button
                type="button"
                onClick={openCompose}
                disabled={leads.length === 0}
                title={
                  leads.length === 0
                    ? "Add at least one lead before composing"
                    : "Draft a personalized message to a slice of your book"
                }
                className="inline-flex items-center justify-center h-8 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--surface-deep)] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Draft next move
              </button>
            </div>
          </div>
        </div>

        {/* Rescue strip — only shows when leads need attention */}
        {rescueStack.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto">
            <div className="shrink-0 rounded-[var(--r-md)] bg-[var(--navy)] px-3 py-2 text-[color:var(--text-inverse)]">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--brand)]">Rescue</div>
              <div className="text-[length:var(--t-caption)] font-extrabold">{sessionMinutes} min</div>
            </div>
            {rescueStack.map((lead) => (
              <a
                key={lead.id}
                href={`/leads/${lead.id}`}
                className="shrink-0 flex items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 transition hover:border-[var(--brand)] hover:-translate-y-px"
              >
                <span className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">{lead.full_name}</span>
                <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">{lead.next_honest_action ? "Has next move" : "Needs direction"}</span>
                <span className="text-[color:var(--brand)]">&rarr;</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <div className="mb-5">
        <LeadSearchBar leads={leads} onFiltered={handleFiltered} />
      </div>

      <LeadList leads={filteredLeads} now={now} />

      {/* Compose drawer, near-fullscreen on desktop, full-screen sheet on
          mobile. ComposeStudio is unchanged; we just gave it a new home. */}
      <Modal
        open={drawerOpen}
        onClose={closeCompose}
        size="xl"
        title="Compose"
        description="Pick a slice of your book. Draft one message. Personalize per-lead. Log sends."
      >
        <ComposeStudio
          leads={leads}
          coachId={coachId}
          seedPain={seedPain}
          seedTemp={seedTemp}
          seedIds={seedIds}
          seedSource={seedSource}
        />
      </Modal>
    </>
  );
}
