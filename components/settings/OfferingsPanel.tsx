"use client";

// OfferingsPanel — /settings card for managing the offerings catalog.
//
// Coach-defined offerings (1:1, men's group, retreat, etc.). Clients join
// offerings via the /clients → Offerings tab. This panel only manages the
// catalog itself: add, rename, recolor, set capacity/dates, archive.
//
// All reads/writes go through the Supabase browser client (RLS-scoped).

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Badge, Button, Card } from "@/components/ui";
import {
  OFFERING_KINDS,
  OFFERING_KIND_LABEL,
  type Offering,
  type OfferingKind,
} from "@/lib/types";

type NewDraft = {
  name: string;
  kind: OfferingKind;
  capacity: string;
  starts_at: string;
  ends_at: string;
};

const EMPTY_DRAFT: NewDraft = {
  name: "",
  kind: "one_on_one",
  capacity: "",
  starts_at: "",
  ends_at: "",
};

export default function OfferingsPanel() {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<NewDraft>(EMPTY_DRAFT);
  const [showArchived, setShowArchived] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("cp_offerings")
        .select("*")
        .order("status", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw new Error(error.message);
      setOfferings((data as Offering[]) ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function addOffering() {
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const capacity = draft.capacity ? parseInt(draft.capacity, 10) : null;
      const { error } = await supabase.from("cp_offerings").insert({
        coach_id: user.id,
        name,
        kind: draft.kind,
        capacity: Number.isFinite(capacity) && capacity != null && capacity > 0 ? capacity : null,
        starts_at: draft.starts_at || null,
        ends_at: draft.ends_at || null,
        sort_order: offerings.filter((o) => o.status === "active").length,
      });
      if (error) throw new Error(error.message);
      setDraft(EMPTY_DRAFT);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add offering.");
    } finally {
      setBusy(false);
    }
  }

  async function archive(id: string) {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("cp_offerings")
        .update({ status: "archived" })
        .eq("id", id);
      if (error) throw new Error(error.message);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not archive.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(id: string) {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("cp_offerings")
        .update({ status: "active" })
        .eq("id", id);
      if (error) throw new Error(error.message);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not restore.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this offering? Members will lose the link but their client rooms stay.")) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("cp_offerings").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  const active = offerings.filter((o) => o.status === "active");
  const archived = offerings.filter((o) => o.status === "archived");

  return (
    <Card className="p-5 sm:p-6 space-y-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)]">Offerings</h3>
          <Badge tone="brand" size="xs" uppercase>New</Badge>
        </div>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
          The offerings you sell. A client can be in many at once — 1:1, the men&apos;s group, a retreat. Manage members from <a className="underline" href="/clients?tab=offerings">/clients → Offerings</a>.
        </p>
      </div>

      {err && <p className="text-[length:var(--t-caption)] text-[color:var(--danger)] whitespace-pre-wrap">{err}</p>}

      {loading ? (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Loading…</p>
      ) : (
        <>
          {/* Active offerings */}
          <div className="space-y-2 pt-2 border-t border-[var(--border)]">
            {active.length === 0 && (
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] italic">No offerings yet. Add the first one below.</p>
            )}
            {active.map((o) => (
              <OfferingRow key={o.id} offering={o} onArchive={() => archive(o.id)} onDelete={() => remove(o.id)} disabled={busy} />
            ))}
          </div>

          {/* Add new */}
          <div className="rounded-[var(--r-md)] border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 space-y-3">
            <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">Add an offering</p>
            <div className="grid sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Offering name (e.g. Augmented Coach Cohort)"
                className="h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
              />
              <select
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as OfferingKind })}
                className="h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
              >
                {OFFERING_KINDS.map((k) => (
                  <option key={k} value={k}>{OFFERING_KIND_LABEL[k]}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="number"
                min={1}
                value={draft.capacity}
                onChange={(e) => setDraft({ ...draft, capacity: e.target.value })}
                placeholder="Capacity"
                className="h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
              />
              <input
                type="date"
                value={draft.starts_at}
                onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
                className="h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
              />
              <input
                type="date"
                value={draft.ends_at}
                onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
                className="h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={addOffering} disabled={busy || !draft.name.trim()}>Add offering</Button>
            </div>
          </div>

          {/* Archived */}
          {archived.length > 0 && (
            <div className="pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowArchived((s) => !s)}
                className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
              >
                {showArchived ? "Hide" : "Show"} archived ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-3 space-y-2">
                  {archived.map((o) => (
                    <OfferingRow key={o.id} offering={o} onRestore={() => restore(o.id)} onDelete={() => remove(o.id)} disabled={busy} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function OfferingRow({
  offering, onArchive, onRestore, onDelete, disabled,
}: {
  offering: Offering;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const dateRange = offering.starts_at || offering.ends_at
    ? `${offering.starts_at ?? "—"} → ${offering.ends_at ?? "—"}`
    : null;
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <strong className="text-[color:var(--text)]">{offering.name}</strong>
          <span className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
            {OFFERING_KIND_LABEL[offering.kind]}
          </span>
          {offering.status === "archived" && (
            <Badge tone="muted" size="xs" uppercase>Archived</Badge>
          )}
        </div>
        <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] flex gap-3 flex-wrap">
          {offering.capacity != null && <span>cap {offering.capacity}</span>}
          {dateRange && <span>{dateRange}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {onArchive && <Button variant="ghost" size="sm" onClick={onArchive} disabled={disabled}>Archive</Button>}
        {onRestore && <Button variant="ghost" size="sm" onClick={onRestore} disabled={disabled}>Restore</Button>}
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="text-[color:var(--text-faint)] hover:text-[color:var(--danger)] px-1.5"
          aria-label={`Delete ${offering.name}`}
        >
          ×
        </button>
      </div>
    </div>
  );
}
