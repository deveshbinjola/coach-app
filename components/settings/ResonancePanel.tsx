"use client";

// ResonancePanel — /settings card for the Resonance Layer.
//
// Three things, one card:
//   1. Pain points — coach-defined objects. Leads carry one + a stage.
//   2. Tags — multi-axis (program / source / custom).
//   3. Sacred zones — content kinds the AI won't generate net-new.
//
// Pain points + tags read/write through the Supabase browser client (RLS).
// Sacred zones go through /api/coach/sacred-zones. See
// docs/2026-05-14-resonance-layer-spec.md.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { Badge, Button, Card } from "@/components/ui";
import {
  TAG_AXES,
  TAG_AXIS_LABEL,
  type PainPoint,
  type Tag,
  type TagAxis,
} from "@/lib/types";
import {
  SACRED_ZONE_KINDS,
  SACRED_ZONE_LABEL,
  type SacredZoneKind,
} from "@/lib/brand-os/sacred-zones";

export default function ResonancePanel() {
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [sacred, setSacred] = useState<SacredZoneKind[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // New pain point / tag drafts
  const [newPain, setNewPain] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");
  const [newTagAxis, setNewTagAxis] = useState<TagAxis>("program");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const supabase = createClient();
      const [ppRes, tagRes, szRes] = await Promise.all([
        supabase.from("cp_pain_points").select("*").order("sort_order", { ascending: true }),
        supabase.from("cp_tags").select("*").order("axis", { ascending: true }),
        fetch("/api/coach/sacred-zones"),
      ]);
      if (ppRes.error) throw new Error(ppRes.error.message);
      if (tagRes.error) throw new Error(tagRes.error.message);
      setPainPoints((ppRes.data as PainPoint[]) ?? []);
      setTags((tagRes.data as Tag[]) ?? []);
      if (szRes.ok) {
        const d = await szRes.json();
        setSacred(Array.isArray(d?.sacred_zones) ? d.sacred_zones : []);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void refresh(); }, []);

  async function addPainPoint() {
    const name = newPain.trim();
    if (!name) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const { error } = await supabase.from("cp_pain_points").insert({
        coach_id: user.id,
        name,
        sort_order: painPoints.length,
      });
      if (error) throw new Error(error.message);
      setNewPain("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add pain point.");
    } finally {
      setBusy(false);
    }
  }

  async function deletePainPoint(id: string) {
    if (!confirm("Delete this pain point? Leads keep their record but lose the link.")) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("cp_pain_points").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  async function addTag() {
    const label = newTagLabel.trim();
    if (!label) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const { error } = await supabase.from("cp_tags").insert({
        coach_id: user.id,
        axis: newTagAxis,
        label,
      });
      if (error) throw new Error(error.message);
      setNewTagLabel("");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add tag.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTag(id: string) {
    if (!confirm("Delete this tag? It's removed from every lead it's on.")) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from("cp_tags").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSacred(kind: SacredZoneKind) {
    const next = sacred.includes(kind)
      ? sacred.filter((k) => k !== kind)
      : [...sacred, kind];
    setSacred(next); // optimistic
    try {
      const res = await fetch("/api/coach/sacred-zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sacred_zones: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save sacred zones.");
      await refresh(); // roll back to server truth
    }
  }

  return (
    <Card className="p-5 sm:p-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[length:var(--t-h3)] font-extrabold tracking-tight text-[color:var(--text)]">Resonance layer</h3>
          <Badge tone="brand" size="xs" uppercase>New</Badge>
        </div>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">
          Mirror how you already see your people. Pain points and tags become the way you sort, segment, and broadcast. Sacred zones tell the AI what it&apos;s <strong>not</strong> allowed to write from scratch.
        </p>
      </div>

      {err && <p className="text-[length:var(--t-caption)] text-[color:var(--danger)] whitespace-pre-wrap">{err}</p>}

      {loading ? (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">Loading…</p>
      ) : (
        <>
          {/* ── Pain points ─────────────────────────────── */}
          <section className="pt-2 border-t border-[var(--border)] space-y-3">
            <SectionHead
              title="Pain points"
              hint="Each one is an object — a lead carries a primary pain point and a stage. This is the wedge: sort and segment by what people are actually moving through."
            />
            <div className="flex flex-wrap gap-2">
              {painPoints.length === 0 && (
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] italic">No pain points yet. Add the ones you think in.</p>
              )}
              {painPoints.map((pp) => (
                <span key={pp.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[length:var(--t-caption)]">
                  <strong className="text-[color:var(--text)]">{pp.name}</strong>
                  <button
                    type="button"
                    onClick={() => deletePainPoint(pp.id)}
                    disabled={busy}
                    className="text-[color:var(--text-faint)] hover:text-[color:var(--danger)]"
                    aria-label={`Delete ${pp.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPain}
                onChange={(e) => setNewPain(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addPainPoint(); } }}
                placeholder="e.g. Heartbreak, Purpose confusion"
                className="flex-1 h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
              />
              <Button onClick={addPainPoint} disabled={busy || !newPain.trim()}>Add</Button>
            </div>
          </section>

          {/* ── Tags ────────────────────────────────────── */}
          <section className="pt-4 border-t border-[var(--border)] space-y-3">
            <SectionHead
              title="Tags"
              hint="Multi-axis. Program (108 Days alumni, 1:1, discovery), source (Insight Timer, referral), or free custom tags."
            />
            {TAG_AXES.map((axis) => {
              const axisTags = tags.filter((t) => t.axis === axis);
              return (
                <div key={axis} className="space-y-1">
                  <p className="text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
                    {TAG_AXIS_LABEL[axis]}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {axisTags.length === 0 && (
                      <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] italic">none</span>
                    )}
                    {axisTags.map((t) => (
                      <span key={t.id} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface)] text-[length:var(--t-caption)]">
                        {t.label}
                        <button
                          type="button"
                          onClick={() => deleteTag(t.id)}
                          disabled={busy}
                          className="text-[color:var(--text-faint)] hover:text-[color:var(--danger)]"
                          aria-label={`Delete ${t.label}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            <div className="flex gap-2">
              <select
                value={newTagAxis}
                onChange={(e) => setNewTagAxis(e.target.value as TagAxis)}
                className="h-10 px-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-caption)] focus:border-[var(--brand-strong)] focus:outline-none"
              >
                {TAG_AXES.map((a) => (
                  <option key={a} value={a}>{TAG_AXIS_LABEL[a]}</option>
                ))}
              </select>
              <input
                type="text"
                value={newTagLabel}
                onChange={(e) => setNewTagLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addTag(); } }}
                placeholder="Tag label"
                className="flex-1 h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
              />
              <Button onClick={addTag} disabled={busy || !newTagLabel.trim()}>Add</Button>
            </div>
          </section>

          {/* Sacred zones moved to /content — managed inline where drafts
              are generated. See components/content/SacredZonesInline.tsx. */}
        </>
      )}
    </Card>
  );
}

function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-0.5">
      <h4 className="text-[length:var(--t-body)] font-bold text-[color:var(--text)]">{title}</h4>
      <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] leading-relaxed">{hint}</p>
    </div>
  );
}
