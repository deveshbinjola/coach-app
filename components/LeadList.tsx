"use client";

// LeadList — the /inbox surface.
//
// Refactored Session 3 onto the design system. Attio energy throughout:
// pipeline patterns, sharper card rhythm, hover-reveal actions, density
// without noise. Three views for three jobs:
//   - List   — scan-and-act table with sortable columns + bulk ops
//   - Kanban — by-warmth pipeline, the Attio-native shape
//   - Pain   — filter by pain signal, then compose to the matching set
//
// Logic preserved end-to-end. What changed: every hardcoded color, padding,
// radius, and font-size pulled into a token; native confirm() replaced with
// the Modal primitive; bulk pain picker rebuilt on the same Modal primitive
// so it works on mobile (bottom sheet) and matches the rest of the system.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import {
  PAIN_SIGNALS,
  PAIN_SIGNAL_LABEL,
  TEMPERATURE_LABEL,
  NEXT_ACTION_LABEL,
  LEAD_TEMPERATURES,
  type Lead,
  type PainSignal,
  type LeadTemperature,
  type LeadNextAction,
} from "@/lib/types";
import {
  computeLeadScore,
  sortByScore,
} from "@/lib/lead-score";
import { assessSla } from "@/lib/lead-sla";
import { Badge, Button, Card, Modal } from "@/components/ui";
import SlaBadge from "./SlaBadge";

// ── Local types ────────────────────────────────────────────────────────────

type ViewMode = "list" | "kanban" | "pain";
type SortKey = "score" | "sla" | "name" | "warmth" | "followup";
type SortDir = "asc" | "desc";

// ── Constants ──────────────────────────────────────────────────────────────

// Page size for the main list + pain-filtered list. Big enough to scan a
// day's work without scrolling for days; small enough that a 500-lead inbox
// doesn't render 500 rows and nuke scroll perf.
const PAGE_SIZE = 50;
const START_HERE_MAX = 5;

// Warmth ranking — higher = hotter. Mirrors the focus queue.
const WARMTH_RANK: Record<LeadTemperature, number> = {
  on_fire: 5,
  hot:     4,
  warm:    3,
  cold:    2,
  dormant: 1,
};

// SLA priority — higher = more urgent.
const SLA_PRIORITY: Record<string, number> = {
  overdue:        3,
  warning:        2,
  on_pace:        1,
  not_applicable: 0,
};

type StartHereItem = {
  lead: Lead;
  score: number;
  reason: string;
  action: string;
  weight: number;
};

// Warmth → Badge tone. Semantic, not color-named — we leave fine-grained
// "on_fire vs hot" hue gradation to the tone palette evolution later.
const WARMTH_TONE: Record<LeadTemperature, "danger" | "warning" | "info" | "muted"> = {
  on_fire: "danger",
  hot:     "danger",
  warm:    "warning",
  cold:    "info",
  dormant: "muted",
};

// Next-honest-action → Badge tone.
const ACTION_TONE: Record<LeadNextAction, "brand" | "info" | "warning" | "danger" | "muted"> = {
  invite_to_call:  "brand",
  follow_up_soft:  "info",
  send_resource:   "info",
  waiting_on_them: "warning",
  hold:            "muted",
  close_loop:      "danger",
};

// ── Component ──────────────────────────────────────────────────────────────

// `now` is REQUIRED and comes from the server component. It anchors recency
// scoring so SSR and client hydration compute identical scores.
export default function LeadList({
  leads,
  now,
}: {
  leads: Lead[];
  now:   number;
}) {
  const router = useRouter();

  // ── Bulk selection ───────────────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── Pain picker modal ────────────────────────────────────────────────────
  const [painPickerOpen, setPainPickerOpen] = useState(false);
  const [pickerSignals, setPickerSignals]   = useState<PainSignal[]>([]);
  const [pickerMode, setPickerMode]         = useState<"replace" | "append">("replace");
  const [applyingPain, setApplyingPain]     = useState(false);

  // ── Delete-confirmation modal ────────────────────────────────────────────
  // Replaces native confirm() so we get bottom-sheet behavior on mobile and
  // match the rest of the design system.
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // ── View / sort / filter state ───────────────────────────────────────────
  const [view, setView]             = useState<ViewMode>("list");
  const [sortKey, setSortKey]       = useState<SortKey>("score");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");
  const [painFilter, setPainFilter] = useState<PainSignal[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedSearch = searchQuery.trim().toLowerCase();

  // ── Pagination cursors ───────────────────────────────────────────────────
  const [listPage, setListPage] = useState(0);
  const [painPage, setPainPage] = useState(0);

  // Reset list page when sort changes; reset pain page when filter changes.
  useEffect(() => {
    setListPage(0);
  }, [sortKey, sortDir, normalizedSearch]);
  useEffect(() => {
    setPainPage(0);
  }, [painFilter, normalizedSearch]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const searchedLeads = useMemo(() => {
    if (!normalizedSearch) return leads;
    return leads.filter((lead) => leadMatchesSearch(lead, normalizedSearch));
  }, [leads, normalizedSearch]);

  const sortedLeads = useMemo(() => {
    let copy: Lead[];
    switch (sortKey) {
      case "score":
        copy = sortByScore(searchedLeads, now);
        break;
      case "name":
        copy = [...searchedLeads].sort((a, b) =>
          a.full_name.localeCompare(b.full_name)
        );
        break;
      case "warmth":
        copy = [...searchedLeads].sort(
          (a, b) => WARMTH_RANK[b.temperature] - WARMTH_RANK[a.temperature]
        );
        break;
      case "sla":
        copy = [...searchedLeads].sort((a, b) => {
          const aSla = assessSla(a, now);
          const bSla = assessSla(b, now);
          const rankDelta =
            (SLA_PRIORITY[bSla.state] ?? 0) - (SLA_PRIORITY[aSla.state] ?? 0);
          if (rankDelta !== 0) return rankDelta;
          return (bSla.hoursElapsed ?? 0) - (aSla.hoursElapsed ?? 0);
        });
        break;
      case "followup":
      default:
        copy = [...searchedLeads].sort((a, b) => {
          const fa = a.next_followup_at
            ? new Date(a.next_followup_at).getTime()
            : Infinity;
          const fb = b.next_followup_at
            ? new Date(b.next_followup_at).getTime()
            : Infinity;
          return fa - fb;
        });
        break;
    }
    return sortDir === "asc" ? copy.reverse() : copy;
  }, [searchedLeads, sortKey, sortDir, now]);

  const startHere = useMemo(() => buildStartHere(searchedLeads, now), [searchedLeads, now]);
  const startHereIds = useMemo(
    () => new Set(startHere.map((item) => item.lead.id)),
    [startHere]
  );
  const remainingSortedLeads = useMemo(
    () => sortedLeads.filter((lead) => !startHereIds.has(lead.id)),
    [sortedLeads, startHereIds]
  );
  const remainingLeads = useMemo(
    () => searchedLeads.filter((lead) => !startHereIds.has(lead.id)),
    [searchedLeads, startHereIds]
  );

  const painFilteredLeads = useMemo(() => {
    if (painFilter.length === 0) return sortByScore(remainingLeads, now);
    return sortByScore(
      remainingLeads.filter((l) =>
        (l.pain_signal ?? []).some((p) => painFilter.includes(p as PainSignal))
      ),
      now
    );
  }, [remainingLeads, painFilter, now]);

  const kanbanBuckets = useMemo(() => {
    const buckets: Record<LeadTemperature, Lead[]> = {
      on_fire: [],
      hot:     [],
      warm:    [],
      cold:    [],
      dormant: [],
    };
    for (const l of remainingLeads) buckets[l.temperature]?.push(l);
    for (const k of LEAD_TEMPERATURES) buckets[k] = sortByScore(buckets[k], now);
    return buckets;
  }, [remainingLeads, now]);

  const allIds = useMemo(() => searchedLeads.map((l) => l.id), [searchedLeads]);
  const allSelected = searchedLeads.length > 0 && allIds.every((id) => selected.has(id));
  const anySelected = selected.size > 0;

  // ── Selection helpers ────────────────────────────────────────────────────
  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }

  function togglePickerSignal(s: PainSignal) {
    setPickerSignals((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function togglePainFilter(s: PainSignal) {
    setPainFilter((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  // ── Sort header click cycle ──────────────────────────────────────────────
  function clickHeader(key: SortKey) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("desc");
      return;
    }
    if (sortDir === "desc") setSortDir("asc");
    else {
      setSortKey("score");
      setSortDir("desc");
    }
  }

  // ── Bulk actions ─────────────────────────────────────────────────────────
  async function bulkDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("cp_leads").delete().in("id", ids);
    setBulkDeleting(false);
    if (error) {
      // Surface the error inline rather than alert(); modal stays open so
      // the coach can read the message and try again or cancel.
      console.error(error);
      // eslint-disable-next-line no-alert
      alert(error.message);
      return;
    }
    setSelected(new Set());
    setConfirmDeleteOpen(false);
    router.refresh();
  }

  async function bulkApplyPainSignal() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setApplyingPain(true);
    const supabase = createClient();

    if (pickerMode === "replace") {
      const { error } = await supabase
        .from("cp_leads")
        .update({ pain_signal: pickerSignals })
        .in("id", ids);
      setApplyingPain(false);
      if (error) {
        // eslint-disable-next-line no-alert
        alert(error.message);
        return;
      }
    } else {
      const updates = leads
        .filter((l) => selected.has(l.id))
        .map((l) => {
          const merged = Array.from(
            new Set([...(l.pain_signal ?? []), ...pickerSignals])
          );
          return supabase
            .from("cp_leads")
            .update({ pain_signal: merged })
            .eq("id", l.id);
        });
      const results = await Promise.all(updates);
      setApplyingPain(false);
      const firstErr = results.find((r) => r.error);
      if (firstErr?.error) {
        // eslint-disable-next-line no-alert
        alert(firstErr.error.message);
        return;
      }
    }

    setPainPickerOpen(false);
    setPickerSignals([]);
    setPickerMode("replace");
    setSelected(new Set());
    router.refresh();
  }

  // ── Empty state ──────────────────────────────────────────────────────────
  if (leads.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <h3 className="text-[length:var(--t-h3)] font-bold text-[color:var(--text)]">
          No leads yet.
        </h3>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2 max-w-md mx-auto leading-[var(--leading-base)]">
          Capture a conversation and the app will turn it into a clean lead.
        </p>
        <div className="mt-5 flex gap-2 justify-center flex-wrap">
          <Button onClick={() => (window.location.href = "/leads/capture")}>
            Capture your first lead
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <>
      <StartHereSection items={startHere} />

      {/* ── View switcher + sort hint ────────────────────────────────── */}
      <div className="mt-8 mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)_auto] lg:items-end">
        <div>
          <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
            {normalizedSearch
              ? "Search results"
              : view === "list"
              ? "Rest of the book"
              : view === "kanban"
                ? "Rest by warmth"
                : "Rest by pain"}
          </h2>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-0.5">
            {view === "list"
              ? normalizedSearch
                ? `${searchedLeads.length} ${searchedLeads.length === 1 ? "lead" : "leads"} found for "${searchQuery.trim()}".`
                : `${remainingSortedLeads.length} ${remainingSortedLeads.length === 1 ? "lead" : "leads"} kept visible without stealing focus.`
              : view === "kanban"
                ? "A quick emotional read after the rescue queue."
                : "Find the emotional pattern without losing the top priorities."}
          </p>
        </div>

        <LeadSearchBox
          value={searchQuery}
          onChange={setSearchQuery}
          onClear={() => setSearchQuery("")}
          resultCount={searchedLeads.length}
          totalCount={leads.length}
        />

        <ViewSwitch view={view} onChange={setView} />

        {view !== "list" && (
          <p className="basis-full text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            The rescue queue stays above. These views inspect everyone else.
          </p>
        )}
      </div>

      {/* ── Bulk action bar — sticky on mobile so it stays reachable ─── */}
      {anySelected && (
        <div className="sticky top-[64px] z-20 mb-3 px-4 py-2.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] flex items-center justify-between gap-3 flex-wrap shadow-[var(--shadow-sm)]">
          <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={bulkDeleting || applyingPain}
              onClick={() => {
                setPickerSignals([]);
                setPickerMode("replace");
                setPainPickerOpen(true);
              }}
              className="inline-flex items-center justify-center h-10 px-3 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] disabled:opacity-50 transition"
            >
              Set pain signal
            </button>
            <button
              type="button"
              disabled={bulkDeleting || applyingPain}
              onClick={() => setSelected(new Set())}
              className="inline-flex items-center justify-center h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--surface-deep)] disabled:opacity-50 transition"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={bulkDeleting || applyingPain}
              onClick={() => setConfirmDeleteOpen(true)}
              className="inline-flex items-center justify-center h-10 px-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] text-[color:var(--danger)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--danger-soft)] disabled:opacity-50 transition"
            >
              Delete {selected.size}
            </button>
          </div>
        </div>
      )}

      {/* ── Bulk pain-signal modal ───────────────────────────────────── */}
      <Modal
        open={painPickerOpen}
        onClose={() => !applyingPain && setPainPickerOpen(false)}
        title="Set pain signal"
        description={`Applying to ${selected.size} ${selected.size === 1 ? "lead" : "leads"}.`}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-2 mt-1">
          {PAIN_SIGNALS.map((s) => {
            const active = pickerSignals.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => togglePickerSignal(s)}
                className={`text-left text-[length:var(--t-caption)] px-3 py-2 rounded-[var(--r-md)] border transition ${
                  active
                    ? "bg-[var(--navy)] text-[color:var(--text-inverse)] border-[var(--navy)] font-bold"
                    : "bg-[var(--surface-elevated)] text-[color:var(--text)] border-[var(--border)] hover:border-[var(--border-strong)]"
                }`}
              >
                {PAIN_SIGNAL_LABEL[s]}
              </button>
            );
          })}
        </div>

        <fieldset className="mt-4 p-3 rounded-[var(--r-md)] bg-[var(--surface-deep)] border border-[var(--border-faint)]">
          <legend className="sr-only">Application mode</legend>
          <label className="flex items-center gap-2 text-[length:var(--t-caption)] cursor-pointer">
            <input
              type="radio"
              name="pain-mode"
              checked={pickerMode === "replace"}
              onChange={() => setPickerMode("replace")}
            />
            <span>
              <strong>Replace</strong> — overwrite existing signals
            </span>
          </label>
          <label className="flex items-center gap-2 text-[length:var(--t-caption)] mt-1.5 cursor-pointer">
            <input
              type="radio"
              name="pain-mode"
              checked={pickerMode === "append"}
              onChange={() => setPickerMode("append")}
            />
            <span>
              <strong>Add</strong> — merge with existing signals
            </span>
          </label>
        </fieldset>

        <div className="mt-5 flex items-center justify-between gap-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={() => {
              setPainPickerOpen(false);
              setPickerSignals([]);
            }}
            disabled={applyingPain}
          >
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {pickerMode === "replace" && pickerSignals.length === 0 && (
              <span className="text-[length:var(--t-caption)] text-[color:var(--warning)] self-center">
                Will clear pain signal on all selected
              </span>
            )}
            <Button
              onClick={bulkApplyPainSignal}
              disabled={applyingPain}
            >
              {applyingPain
                ? "Applying…"
                : pickerMode === "replace"
                ? `Replace on ${selected.size}`
                : `Add to ${selected.size}`}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Confirm-delete modal ─────────────────────────────────────── */}
      <Modal
        open={confirmDeleteOpen}
        onClose={() => !bulkDeleting && setConfirmDeleteOpen(false)}
        title={
          selected.size === 1
            ? "Delete this lead?"
            : `Delete ${selected.size} leads?`
        }
        description="This also removes their full message history. It can't be undone."
      >
        <div className="flex gap-2 justify-end mt-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={() => setConfirmDeleteOpen(false)}
            disabled={bulkDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={bulkDelete}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? "Deleting…" : `Delete ${selected.size}`}
          </Button>
        </div>
      </Modal>

      {normalizedSearch && searchedLeads.length === 0 && (
        <Card padding="md" className="text-center">
          <p className="text-[length:var(--t-body)] font-extrabold text-[color:var(--text)]">
            No matching leads.
          </p>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            Search checks name, email, phone, source, notes, tags, pain signal, and next move.
          </p>
        </Card>
      )}

      {/* ── List view ────────────────────────────────────────────────── */}
      {view === "list" && searchedLeads.length > 0 && (
        <PaginatedList
          leads={remainingSortedLeads}
          now={now}
          page={listPage}
          onPage={setListPage}
          selected={selected}
          allSelected={allSelected}
          toggleOne={toggleOne}
          toggleAll={toggleAll}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={clickHeader}
        />
      )}

      {/* ── Kanban / by-warmth view ──────────────────────────────────── */}
      {view === "kanban" && searchedLeads.length > 0 && (
        <KanbanBoard buckets={kanbanBuckets} />
      )}

      {/* ── Pain view ────────────────────────────────────────────────── */}
      {view === "pain" && searchedLeads.length > 0 && (
        <PainView
          allLeads={remainingLeads}
          painFilter={painFilter}
          togglePainFilter={togglePainFilter}
          clearFilter={() => setPainFilter([])}
          filteredLeads={painFilteredLeads}
          now={now}
          selected={selected}
          allSelected={allSelected}
          toggleOne={toggleOne}
          toggleAll={toggleAll}
          page={painPage}
          onPage={setPainPage}
        />
      )}
    </>
  );
}

function buildStartHere(leads: Lead[], now: number): StartHereItem[] {
  return leads
    .filter((lead) => lead.status !== "client" && lead.status !== "closed_lost")
    .map((lead) => {
      const score = computeLeadScore(lead, now);
      const sla = assessSla(lead, now);
      const followupDue =
        !!lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= now;

      let weight = score;
      if (sla.state === "overdue") weight += 180;
      if (sla.state === "warning") weight += 90;
      if (followupDue) weight += 150;
      if (lead.next_honest_action === "invite_to_call") weight += 60;
      if (lead.next_honest_action === "close_loop") weight += 35;
      if (lead.discovery_call_completed) weight += 30;
      if ((lead.deal_value ?? 0) > 0) weight += 25;

      return {
        lead,
        score,
        weight,
        reason: startHereReason(lead, sla, followupDue),
        action: startHereAction(lead),
      };
    })
    .sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return (b.lead.deal_value ?? 0) - (a.lead.deal_value ?? 0);
    })
    .slice(0, START_HERE_MAX);
}

function leadMatchesSearch(lead: Lead, query: string): boolean {
  const painLabels = (lead.pain_signal ?? []).map((pain) => PAIN_SIGNAL_LABEL[pain] ?? pain);
  const nextAction = lead.next_honest_action
    ? NEXT_ACTION_LABEL[lead.next_honest_action] ?? lead.next_honest_action
    : "";
  const warmth = TEMPERATURE_LABEL[lead.temperature] ?? lead.temperature;
  const haystack = [
    lead.full_name,
    lead.email,
    lead.phone,
    lead.source,
    lead.source_detail,
    lead.status,
    warmth,
    nextAction,
    lead.notes,
    lead.fit_notes,
    lead.disqualified_reason,
    ...(lead.tags ?? []),
    ...painLabels,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ");

  return query
    .replaceAll("_", " ")
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function startHereReason(
  lead: Lead,
  sla: ReturnType<typeof assessSla>,
  followupDue: boolean
): string {
  if (followupDue) return "Promised follow-up";
  if (lead.status === "new" && sla.state === "overdue") return "No first touch yet";
  if (sla.state === "overdue") return "Conversation going cold";
  if (sla.state === "warning") return "Needs a reply today";
  if (lead.next_honest_action === "invite_to_call") return "Ready for call invite";
  if (lead.discovery_call_completed) return "Discovery call completed";
  return "Highest priority lead";
}

function startHereAction(lead: Lead): string {
  if (lead.next_honest_action) return NEXT_ACTION_LABEL[lead.next_honest_action];
  if (lead.status === "new") return "Send first touch";
  return "Draft next message";
}

function formatMoney(cents: number): string {
  if (cents <= 0) return "$0";
  const dollars = cents / 100;
  const rounded = Math.round(dollars);
  if (Math.abs(dollars - rounded) < 0.005) {
    return "$" + rounded.toLocaleString();
  }
  return "$" + dollars.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function StartHereSection({ items }: { items: StartHereItem[] }) {
  if (items.length === 0) return null;
  const ids = items.map((item) => item.lead.id).join(",");
  const totalValue = items.reduce((acc, item) => acc + (item.lead.deal_value ?? 0), 0);
  const [first, ...rest] = items;

  return (
    <section
      aria-label="Start here"
      className="rounded-[var(--r-xl)] border border-[color-mix(in_srgb,var(--brand)_18%,var(--border))] bg-[color-mix(in_srgb,var(--brand)_5%,var(--surface-elevated))] p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--success)]">
            Lead rescue
          </div>
          <h2 className="mt-1 text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">
            Work these first
          </h2>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-0.5">
            {items.length} {items.length === 1 ? "lead" : "leads"} where a reply, call invite, or close-loop move matters now.
            {totalValue > 0 ? ` ${formatMoney(totalValue)} in visible pipeline.` : ""}
          </p>
        </div>
        <a
          href={`/inbox?compose=open&source=start-here&ids=${encodeURIComponent(ids)}`}
          className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
        >
          Draft this set
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-3">
        <StartHereFeature item={first} />
        {rest.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rest.map((item, index) => (
              <StartHereCard key={item.lead.id} item={item} rank={index + 2} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function StartHereFeature({ item }: { item: StartHereItem }) {
  const { lead, reason, action } = item;
  const pain = lead.pain_signal?.[0];

  return (
    <a
      href={`/leads/${lead.id}`}
      className="group rounded-[var(--r-lg)] border border-[color-mix(in_srgb,var(--brand)_28%,var(--border))] bg-[var(--surface-elevated)] p-5 min-h-[220px] flex flex-col justify-between shadow-[var(--shadow-sm)] transition hover:-translate-y-px hover:shadow-[var(--shadow-md)]"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--success)]">
              Do this first
            </div>
            <div className="mt-2 text-2xl font-extrabold leading-tight break-words text-[color:var(--text)]">
              {lead.full_name}
            </div>
          </div>
          <span className="inline-flex items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--navy)]">
            Priority
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <SlaBadge lead={lead} compact />
          <Badge tone={WARMTH_TONE[lead.temperature]} size="xs">
            {TEMPERATURE_LABEL[lead.temperature] ?? lead.temperature}
          </Badge>
          {pain && (
            <Badge tone="muted" size="xs">
              {PAIN_SIGNAL_LABEL[pain as PainSignal] ?? pain}
            </Badge>
          )}
        </div>

        <p className="mt-4 text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-[var(--leading-relaxed)]">
          {reason}
          {lead.deal_value ? ` · ${formatMoney(lead.deal_value)}` : ""}
        </p>
      </div>

      <div className="mt-5 pt-4 border-t border-[var(--border-faint)] flex items-center justify-between gap-3 text-[length:var(--t-caption)] font-extrabold">
        <span className="text-[color:var(--text)]">{action}</span>
        <span className="text-[color:var(--brand)] group-hover:translate-x-0.5 transition">
          Open
        </span>
      </div>
    </a>
  );
}

function StartHereCard({
  item,
  rank,
}: {
  item: StartHereItem;
  rank: number;
}) {
  const { lead, reason, action } = item;
  const pain = lead.pain_signal?.[0];

  return (
    <a
      href={`/leads/${lead.id}`}
      className="group rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 min-h-[150px] flex flex-col justify-between hover:border-[var(--brand-strong)] hover:shadow-[var(--shadow-sm)] transition"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[var(--surface-deep)] text-[color:var(--text)] text-[length:var(--t-caption)] font-extrabold tabular-nums">
            {rank}
          </div>
          <span className="text-[11px] font-bold text-[color:var(--text-faint)]">
            Priority
          </span>
        </div>

        <div className="mt-4">
          <div className="font-bold text-[length:var(--t-body)] text-[color:var(--text)] leading-tight break-words">
            {lead.full_name}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <SlaBadge lead={lead} compact />
            <Badge tone={WARMTH_TONE[lead.temperature]} size="xs">
              {TEMPERATURE_LABEL[lead.temperature] ?? lead.temperature}
            </Badge>
          </div>
        </div>

        <p className="mt-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-[var(--leading-base)]">
          {reason}
          {pain ? ` · ${PAIN_SIGNAL_LABEL[pain as PainSignal] ?? pain}` : ""}
          {lead.deal_value ? ` · ${formatMoney(lead.deal_value)}` : ""}
        </p>
      </div>

      <div className="mt-4 pt-3 border-t border-[var(--border-faint)] text-[length:var(--t-caption)] font-bold text-[color:var(--text)] group-hover:text-[color:var(--brand-strong)] transition">
        {action}
      </div>
    </a>
  );
}

// ── View switcher ──────────────────────────────────────────────────────────
//
// Uses the style guide active state: --brand-soft tint + --text + thin
// brand border. Never solid green — too loud.

function ViewSwitch({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const opts: { id: ViewMode; label: string }[] = [
    { id: "list",   label: "List" },
    { id: "kanban", label: "By warmth" },
    { id: "pain",   label: "By pain" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Inbox view"
      className="inline-flex rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] overflow-hidden text-[length:var(--t-caption)]"
    >
      {opts.map((o, i) => {
        const active = view === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={[
              "px-4 h-11 font-bold transition",
              i > 0 ? "border-l border-[var(--border)]" : "",
              active
                ? "bg-[var(--brand-soft)] text-[color:var(--text)]"
                : "text-[color:var(--text-muted)] hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]",
            ].join(" ")}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function LeadSearchBox({
  value,
  onChange,
  onClear,
  resultCount,
  totalCount,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  resultCount: number;
  totalCount: number;
}) {
  const active = value.trim().length > 0;
  return (
    <label className="block min-w-0">
      <span className="sr-only">Search leads</span>
      <div className="flex min-h-11 items-center gap-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] px-3 transition focus-within:border-[var(--brand-strong)]">
        <Search size={16} className="shrink-0 text-[color:var(--text-faint)]" aria-hidden />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search leads..."
          className="min-w-0 flex-1 bg-transparent text-[length:var(--t-caption)] font-bold text-[color:var(--text)] outline-none placeholder:text-[color:var(--text-faint)]"
        />
        {active ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-[color:var(--text-muted)] transition hover:bg-[var(--surface-deep)] hover:text-[color:var(--text)]"
            aria-label="Clear lead search"
          >
            <X size={15} aria-hidden />
          </button>
        ) : null}
        <span className="hidden shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)] sm:inline">
          {active ? `${resultCount}/${totalCount}` : `${totalCount}`}
        </span>
      </div>
    </label>
  );
}

// ── Paginated list wrapper ─────────────────────────────────────────────────

function PaginatedList({
  leads,
  now,
  page,
  onPage,
  selected,
  allSelected,
  toggleOne,
  toggleAll,
  sortKey,
  sortDir,
  onSort,
}: {
  leads:       Lead[];
  now:         number;
  page:        number;
  onPage:      (n: number) => void;
  selected:    Set<string>;
  allSelected: boolean;
  toggleOne:   (id: string) => void;
  toggleAll:   () => void;
  sortKey?:    SortKey;
  sortDir?:    SortDir;
  onSort?:     (k: SortKey) => void;
}) {
  if (leads.length === 0) {
    return (
      <Card padding="md" className="text-center">
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          Everything that needs attention is already in Start here.
        </p>
      </Card>
    );
  }

  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const safePage   = Math.min(Math.max(0, page), totalPages - 1);
  const start      = safePage * PAGE_SIZE;
  const end        = Math.min(leads.length, start + PAGE_SIZE);
  const slice      = leads.slice(start, end);

  return (
    <>
      <ListTable
        leads={slice}
        now={now}
        selected={selected}
        allSelected={allSelected}
        toggleOne={toggleOne}
        toggleAll={toggleAll}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
      />
      <Pagination page={safePage} total={leads.length} onPage={onPage} />
    </>
  );
}

function Pagination({
  page,
  total,
  onPage,
}: {
  page:  number;
  total: number;
  onPage: (n: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  const totalPages    = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start         = page * PAGE_SIZE + 1;
  const end           = Math.min(total, (page + 1) * PAGE_SIZE);
  const prevDisabled  = page === 0;
  const nextDisabled  = page >= totalPages - 1;

  return (
    <div className="mt-3 px-1 flex items-center justify-between gap-3 text-[length:var(--t-caption)] flex-wrap">
      <span className="text-[color:var(--text-muted)]">
        Showing{" "}
        <strong className="text-[color:var(--text)] tabular-nums">
          {start}–{end}
        </strong>{" "}
        of <strong className="text-[color:var(--text)] tabular-nums">{total}</strong>
      </span>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={prevDisabled}
          className="px-3 h-10 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] font-bold text-[color:var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition"
          aria-label="Previous page"
        >
          ← Prev
        </button>
        <span className="px-3 h-8 inline-flex items-center font-bold text-[color:var(--text-muted)] whitespace-nowrap tabular-nums">
          Page {page + 1} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          disabled={nextDisabled}
          className="px-3 h-10 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] font-bold text-[color:var(--text)] hover:border-[var(--border-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition"
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ── List table ─────────────────────────────────────────────────────────────

function ListTable({
  leads,
  now,
  selected,
  allSelected,
  toggleOne,
  toggleAll,
  sortKey,
  sortDir,
  onSort,
}: {
  leads:       Lead[];
  now:         number;
  selected:    Set<string>;
  allSelected: boolean;
  toggleOne:   (id: string) => void;
  toggleAll:   () => void;
  sortKey?:    SortKey;
  sortDir?:    SortDir;
  onSort?:     (k: SortKey) => void;
}) {
  return (
    <>
      {/* ── Mobile card view (<md). Table is unusable at 375px; per the
          style guide "Tables collapse to cards … on small screens." */}
      <ul className="md:hidden space-y-2">
        {leads.map((lead) => {
          return (
            <li key={lead.id}>
              <MobileLeadCard
                lead={lead}
                now={now}
                selected={selected.has(lead.id)}
                onToggle={() => toggleOne(lead.id)}
              />
            </li>
          );
        })}
      </ul>

      {/* ── Desktop table view (md+). Bigger viewports get the dense table. */}
      <Card padding="none" className="hidden md:block overflow-x-auto">
        <table className="w-full text-[length:var(--t-caption)]">
        <thead className="bg-[var(--surface-deep)] text-left text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
          <tr>
            <th className="p-4 w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all"
              />
            </th>
            <SortableTh label="Lead" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="p-4">Why now</th>
            <th className="p-4">Next move</th>
            <SortableTh label="Follow-up" colKey="followup" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
            <th className="p-4 w-20 text-right">Edit</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const sla = assessSla(lead, now);
            const followupDue =
              !!lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= now;
            const whyNow = startHereReason(lead, sla, followupDue);
            const pain = lead.pain_signal?.[0];
            return (
              <tr
                key={lead.id}
                className="border-t border-[var(--border-faint)] hover:bg-[var(--surface-deep)] align-top group transition"
              >
                <td
                  className="p-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggleOne(lead.id)}
                    aria-label={`Select ${lead.full_name}`}
                  />
                </td>
                <td className="p-4">
                  <a
                    href={`/leads/${lead.id}`}
                    className="font-bold text-[color:var(--text)] hover:underline"
                  >
                    {lead.full_name}
                  </a>
                  {lead.discovery_call_completed && (
                    <Badge tone="brand" size="xs" uppercase className="ml-2">
                      DC ✓
                    </Badge>
                  )}
                  {lead.email && (
                    <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                      {lead.email}
                    </div>
                  )}
                  <div className="text-[length:var(--t-label)] text-[color:var(--text-faint)] mt-1 normal-case tracking-normal font-normal">
                    {lead.source} · {lead.status}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={WARMTH_TONE[lead.temperature]} size="xs">
                      {TEMPERATURE_LABEL[lead.temperature] ?? lead.temperature}
                    </Badge>
                    {pain && (
                      <Badge tone="muted" size="xs">
                        {PAIN_SIGNAL_LABEL[pain as PainSignal] ?? pain}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="p-4 max-w-[240px]">
                  <div className="font-bold text-[color:var(--text)] leading-[var(--leading-snug)]">
                    {whyNow}
                  </div>
                  <div className="mt-1">
                    <SlaBadge lead={lead} />
                  </div>
                </td>
                <td className="p-4">
                  {lead.next_honest_action ? (
                    <Badge tone={ACTION_TONE[lead.next_honest_action]} size="sm">
                      {NEXT_ACTION_LABEL[lead.next_honest_action]}
                    </Badge>
                  ) : (
                    <span className="text-[color:var(--text-faint)]">Draft next message</span>
                  )}
                </td>
                <td className="p-4 text-[color:var(--text-muted)] whitespace-nowrap tabular-nums">
                  {lead.next_followup_at
                    ? new Date(lead.next_followup_at).toLocaleDateString()
                    : "None"}
                </td>
                <td className="p-4 text-right">
                  {/* Edit affordance — Attio-style hover reveal. Always
                      reachable via keyboard, just visually quieter at rest
                      so the row reads cleaner. */}
                  <a
                    href={`/leads/${lead.id}/edit`}
                    className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)] group-hover:text-[color:var(--text)] hover:underline transition"
                  >
                    Edit
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </Card>
    </>
  );
}

// ── Mobile lead card ───────────────────────────────────────────────────────
//
// Shown only at <md breakpoints. Compact summary card with the most useful
// signal: score, SLA, name, warmth, next action, pain count. Tap the card to
// open the lead; tap the checkbox to toggle bulk selection.

function MobileLeadCard({
  lead,
  now,
  selected,
  onToggle,
}: {
  lead:     Lead;
  now:      number;
  selected: boolean;
  onToggle: () => void;
}) {
  const sla = assessSla(lead, now);
  const followupDue =
    !!lead.next_followup_at && new Date(lead.next_followup_at).getTime() <= now;
  const whyNow = startHereReason(lead, sla, followupDue);
  const pain = lead.pain_signal?.[0];

  return (
    <div
      className={`relative rounded-[var(--r-lg)] border bg-[var(--surface-elevated)] transition ${
        selected
          ? "border-[var(--brand-strong)] bg-[var(--brand-soft)]"
          : "border-[var(--border)]"
      }`}
    >
      {/* Checkbox — top-left, big tap target. Stops propagation so tapping
          it doesn't navigate to the lead. */}
      <label
        className="absolute top-2 left-2 inline-flex items-center justify-center w-11 h-11 cursor-pointer"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${lead.full_name}`}
          className="w-5 h-5"
        />
      </label>

      <a
        href={`/leads/${lead.id}`}
        className="block pl-14 pr-4 py-3"
      >
        {/* Top row: name + immediate reason */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-bold text-[length:var(--t-body)] text-[color:var(--text)] truncate">
              {lead.full_name}
            </div>
            {lead.email && (
              <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] truncate">
                {lead.email}
              </div>
            )}
          </div>
          <Badge tone="muted" size="xs">
            {whyNow}
          </Badge>
        </div>

        {/* Middle row: SLA + warmth + DC */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <SlaBadge lead={lead} />
          <Badge tone={WARMTH_TONE[lead.temperature]} size="xs">
            {TEMPERATURE_LABEL[lead.temperature] ?? lead.temperature}
          </Badge>
          {lead.discovery_call_completed && (
            <Badge tone="brand" size="xs" uppercase>
              DC ✓
            </Badge>
          )}
        </div>

        {/* Bottom row: next action + pain count */}
        {(lead.next_honest_action || (lead.pain_signal?.length ?? 0) > 0) && (
          <div className="mt-2 flex items-center gap-2 flex-wrap text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            {lead.next_honest_action && (
              <Badge tone={ACTION_TONE[lead.next_honest_action]} size="xs">
                {NEXT_ACTION_LABEL[lead.next_honest_action]}
              </Badge>
            )}
            {(lead.pain_signal?.length ?? 0) > 0 && (
              <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-faint)]">
                {pain
                  ? PAIN_SIGNAL_LABEL[pain as PainSignal] ?? pain
                  : `${lead.pain_signal!.length} signals`}
              </span>
            )}
          </div>
        )}

        {/* Footer hint: source + follow-up */}
        <div className="mt-2 text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-bold flex items-center justify-between gap-2 flex-wrap">
          <span className="truncate">{lead.source}</span>
          {lead.next_followup_at && (
            <span className="tabular-nums normal-case tracking-normal">
              Follow-up: {new Date(lead.next_followup_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </a>
    </div>
  );
}

// ── Kanban board (Attio pipeline) ─────────────────────────────────────────
//
// Soft column tints so swimlanes are scannable without screaming. Card surface
// is white-on-tint — the Attio look. Hover lifts the card border to brand,
// giving a "click me" affordance without changing the layout.

function KanbanBoard({
  buckets,
}: {
  buckets:  Record<LeadTemperature, Lead[]>;
}) {
  // Soft column tints — pulled from semantic tokens, not raw color.
  const columnTint: Record<LeadTemperature, string> = {
    on_fire: "bg-[var(--danger-soft)] border-[color-mix(in_srgb,var(--danger)_20%,transparent)]",
    hot:     "bg-[color-mix(in_srgb,var(--danger)_8%,var(--surface-elevated))] border-[color-mix(in_srgb,var(--danger)_15%,transparent)]",
    warm:    "bg-[var(--warning-soft)] border-[color-mix(in_srgb,var(--warning)_18%,transparent)]",
    cold:    "bg-[var(--info-soft)] border-[color-mix(in_srgb,var(--info)_18%,transparent)]",
    dormant: "bg-[var(--surface-deep)] border-[var(--border)]",
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {LEAD_TEMPERATURES.map((t) => {
        const col = buckets[t] ?? [];
        return (
          <section
            key={t}
            className={`rounded-[var(--r-lg)] border p-3 min-h-[200px] ${columnTint[t]}`}
            aria-label={`${TEMPERATURE_LABEL[t]} column`}
          >
            <header className="flex items-center justify-between mb-3">
              <h3 className="text-[length:var(--t-label)] font-bold uppercase tracking-wider text-[color:var(--text)]">
                {TEMPERATURE_LABEL[t]}
              </h3>
              <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] tabular-nums">
                {col.length}
              </span>
            </header>
            <div className="space-y-2">
              {col.length === 0 ? (
                <div className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] italic">
                  — empty —
                </div>
              ) : (
                col.map((lead) => {
                  const action = startHereAction(lead);
                  return (
                    <a
                      key={lead.id}
                      href={`/leads/${lead.id}`}
                      className="block bg-[var(--surface-elevated)] rounded-[var(--r-md)] border border-[var(--border)] p-3 hover:border-[var(--brand-strong)] hover:shadow-[var(--shadow-sm)] transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-[length:var(--t-body)] text-[color:var(--text)] leading-tight min-w-0 break-words">
                          {lead.full_name}
                        </div>
                      </div>
                      <div className="mt-2 text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                        {action}
                      </div>
                      {lead.pain_signal?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {lead.pain_signal.slice(0, 2).map((p) => (
                            <Badge key={p} tone="warning" size="xs">
                              {PAIN_SIGNAL_LABEL[p as PainSignal] ?? p}
                            </Badge>
                          ))}
                          {lead.pain_signal.length > 2 && (
                            <span className="text-[length:var(--t-label)] text-[color:var(--text-muted)] self-center">
                              +{lead.pain_signal.length - 2}
                            </span>
                          )}
                        </div>
                      ) : null}
                      {lead.discovery_call_completed && (
                        <div className="mt-2">
                          <Badge tone="brand" size="xs" uppercase>
                            DC ✓
                          </Badge>
                        </div>
                      )}
                    </a>
                  );
                })
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Pain view ──────────────────────────────────────────────────────────────

function PainView({
  allLeads,
  painFilter,
  togglePainFilter,
  clearFilter,
  filteredLeads,
  now,
  selected,
  allSelected,
  toggleOne,
  toggleAll,
  page,
  onPage,
}: {
  allLeads:        Lead[];
  painFilter:      PainSignal[];
  togglePainFilter: (s: PainSignal) => void;
  clearFilter:     () => void;
  filteredLeads:   Lead[];
  now:             number;
  selected:        Set<string>;
  allSelected:     boolean;
  toggleOne:       (id: string) => void;
  toggleAll:       () => void;
  page:            number;
  onPage:          (n: number) => void;
}) {
  // Count leads per signal for the chip badges.
  const counts = useMemo(() => {
    const c: Record<PainSignal, number> = {
      heartbreak:            0,
      relationship_conflict: 0,
      purpose_confusion:     0,
      emotional_numbness:    0,
      masculinity_identity:  0,
      business_pressure:     0,
      burnout:               0,
    };
    for (const l of allLeads) {
      for (const p of l.pain_signal ?? []) {
        if (p in c) c[p as PainSignal]++;
      }
    }
    return c;
  }, [allLeads]);

  const matchedQuery =
    painFilter.length > 0
      ? `Matching ${painFilter.length === 1 ? "signal" : "any of " + painFilter.length + " signals"}`
      : "All leads (no filter selected)";

  return (
    <>
      <Card padding="md" className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
          <div>
            <h3 className="text-[length:var(--t-h3)] font-bold text-[color:var(--text)]">
              Filter by pain signal
            </h3>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-0.5">
              Pick one or more — shows leads matching <strong>any</strong>{" "}
              selected signal.
            </p>
          </div>
          {painFilter.length > 0 && (
            <button
              type="button"
              onClick={clearFilter}
              className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] underline"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {PAIN_SIGNALS.map((s) => {
            const active = painFilter.includes(s);
            const count  = counts[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => togglePainFilter(s)}
                className={[
                  "text-[length:var(--t-caption)] px-3 h-8 inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border transition",
                  active
                    ? "bg-[var(--navy)] text-[color:var(--text-inverse)] border-[var(--navy)] font-bold"
                    : "bg-[var(--surface-elevated)] text-[color:var(--text)] border-[var(--border)] hover:border-[var(--border-strong)]",
                ].join(" ")}
              >
                {PAIN_SIGNAL_LABEL[s]}{" "}
                <span
                  className={`text-[length:var(--t-label)] tabular-nums ${
                    active ? "text-[color:var(--brand)]" : "text-[color:var(--text-muted)]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-3 pt-3 border-t border-[var(--border-faint)] flex items-center justify-between text-[length:var(--t-caption)] gap-2 flex-wrap">
          <span className="text-[color:var(--text-muted)]">{matchedQuery}</span>
          <span className="font-bold text-[color:var(--text)] tabular-nums">
            {filteredLeads.length}{" "}
            {filteredLeads.length === 1 ? "lead" : "leads"}
          </span>
        </div>

        {painFilter.length > 0 && filteredLeads.length > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--border-faint)]">
            <a
              href={`/compose?pain=${painFilter.join(",")}`}
              className="inline-flex items-center justify-center h-9 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition"
            >
              Compose message to these {filteredLeads.length}
            </a>
          </div>
        )}
      </Card>

      {filteredLeads.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            No leads match this filter. Try a different signal, or clear the
            filter.
          </p>
        </Card>
      ) : (
        <PaginatedList
          leads={filteredLeads}
          now={now}
          page={page}
          onPage={onPage}
          selected={selected}
          allSelected={allSelected}
          toggleOne={toggleOne}
          toggleAll={toggleAll}
        />
      )}
    </>
  );
}

// ── Sort helpers ───────────────────────────────────────────────────────────

/** Clickable <th> for the ListTable. Falls back to a plain header when sort
 *  callbacks aren't provided (e.g. PainView, which doesn't sort by column). */
function SortableTh({
  label,
  colKey,
  w,
  sortKey,
  sortDir,
  onSort,
}: {
  label:    string;
  colKey:   SortKey;
  w?:       string;
  sortKey?: SortKey;
  sortDir?: SortDir;
  onSort?:  (k: SortKey) => void;
}) {
  const widthClass = w ? ` ${w}` : "";
  if (!onSort) {
    return <th className={`p-4${widthClass}`}>{label}</th>;
  }
  const active = sortKey === colKey;
  const arrow  = !active ? "" : sortDir === "desc" ? "↓" : "↑";
  return (
    <th
      className={`p-4${widthClass}`}
      aria-sort={
        active ? (sortDir === "desc" ? "descending" : "ascending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(colKey)}
        className={`text-left text-[length:var(--t-caption)] font-bold transition hover:text-[color:var(--text)] ${
          active ? "text-[color:var(--text)]" : "text-[color:var(--text-faint)]"
        }`}
      >
        {label}
        {active && (
          <span className="ml-1 text-[color:var(--brand-strong)]">{arrow}</span>
        )}
      </button>
    </th>
  );
}
