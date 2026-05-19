"use client";

// AddOfferingForm — inline "new offering" composer at the top of
// /clients?tab=offerings. Collapsed by default; one click expands.
//
// Lives where offerings are actually used. Settings keeps Identity / Brand
// / Delivery. Catalog management (rename, archive, delete) happens on the
// offering detail page.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Button } from "@/components/ui";
import {
  OFFERING_KINDS,
  OFFERING_KIND_LABEL,
  type OfferingKind,
} from "@/lib/types";

type Draft = {
  name: string;
  kind: OfferingKind;
  price: string;
  capacity: string;
  starts_at: string;
  ends_at: string;
  description: string;
};

const EMPTY: Draft = {
  name: "",
  kind: "one_on_one",
  price: "",
  capacity: "",
  starts_at: "",
  ends_at: "",
  description: "",
};

export default function AddOfferingForm({ open: openInitial = false }: { open?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(openInitial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const name = draft.name.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const capacity = draft.capacity ? parseInt(draft.capacity, 10) : null;
      const priceDollars = draft.price ? parseFloat(draft.price) : null;
      const priceCents = priceDollars != null && Number.isFinite(priceDollars) && priceDollars > 0
        ? Math.round(priceDollars * 100)
        : null;
      const { error } = await supabase.from("cp_offerings").insert({
        coach_id: user.id,
        name,
        kind: draft.kind,
        price_cents: priceCents,
        capacity: Number.isFinite(capacity) && capacity != null && capacity > 0 ? capacity : null,
        starts_at: draft.starts_at || null,
        ends_at: draft.ends_at || null,
        description: draft.description.trim() || null,
      });
      if (error) throw new Error(error.message);
      setDraft(EMPTY);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add offering.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
            Your offerings
          </h2>
        </div>
        <Button onClick={() => setOpen(true)}>+ Add offering</Button>
      </div>
    );
  }

  return (
    <div className="mb-5 rounded-[var(--r-lg)] border-2 border-dashed border-[var(--brand-strong)] bg-[var(--brand-soft)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)]">
            New offering
          </h2>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            Name it like you sell it. You can drop clients in right after.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setOpen(false); setErr(null); setDraft(EMPTY); }}
          className="text-[color:var(--text-faint)] hover:text-[color:var(--text)] px-2"
          aria-label="Cancel"
        >
          ×
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Name">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder="e.g. Augmented Coach Cohort"
            className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
            autoFocus
          />
        </Field>
        <Field label="Kind">
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ ...draft, kind: e.target.value as OfferingKind })}
            className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
          >
            {OFFERING_KINDS.map((k) => (
              <option key={k} value={k}>{OFFERING_KIND_LABEL[k]}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Short description (optional)">
        <textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          rows={2}
          placeholder="One sentence on what this offering does. Shown on the card."
          className="w-full px-3 py-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none resize-none"
        />
      </Field>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Price ($)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={draft.price}
            onChange={(e) => setDraft({ ...draft, price: e.target.value })}
            placeholder="e.g. 2000"
            className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
          />
        </Field>
        <Field label="Capacity">
          <input
            type="number"
            min={1}
            value={draft.capacity}
            onChange={(e) => setDraft({ ...draft, capacity: e.target.value })}
            placeholder="e.g. 10"
            className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
          />
        </Field>
        <Field label="Starts">
          <input
            type="date"
            value={draft.starts_at}
            onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
            className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
          />
        </Field>
        <Field label="Ends">
          <input
            type="date"
            value={draft.ends_at}
            onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
            className="w-full h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
          />
        </Field>
      </div>

      {err && (
        <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">{err}</p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={() => { setOpen(false); setDraft(EMPTY); setErr(null); }} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={busy || !draft.name.trim()}>
          {busy ? "Adding…" : "Add offering"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
        {label}
      </span>
      {children}
    </label>
  );
}
