"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Input, Select, Textarea } from "@/components/ui/Input";
import VoiceMicInput from "@/components/VoiceMicInput";
import {
  INCOME_BAND_LABEL,
  LEAD_INCOME_BANDS,
  LEAD_NEXT_ACTIONS,
  LEAD_READINESS_SIGNALS,
  LEAD_TEMPERATURES,
  NEXT_ACTION_LABEL,
  PAIN_SIGNALS,
  PAIN_SIGNAL_LABEL,
  READINESS_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  TEMPERATURE_LABEL,
  type Lead,
  type LeadIncomeBand,
  type LeadNextAction,
  type LeadReadiness,
  type LeadSource,
  type LeadStatus,
  type LeadTemperature,
  type PainSignal,
  type PainPoint,
  type Tag,
} from "@/lib/types";

const SOURCES: LeadSource[] = ["ig", "linkedin", "referral", "quiz", "in_person", "podcast", "newsletter", "other"];
const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "booked", "client", "closed_lost"];
const TEMPS: LeadTemperature[] = LEAD_TEMPERATURES;

// Format an ISO string into YYYY-MM-DD for a <input type="date">.
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

type ReferrerRef = {
  id: string;
  full_name: string;
  status: LeadStatus;
  discovery_call_completed: boolean;
};

export default function EditLeadForm({
  lead,
  potentialReferrers = [],
}: {
  lead: Lead;
  potentialReferrers?: ReferrerRef[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resonance Layer — pain point object + program tags. Loaded on mount via
  // the browser client (RLS-scoped to this coach).
  const [painPoints, setPainPoints] = useState<PainPoint[]>([]);
  const [programTags, setProgramTags] = useState<Tag[]>([]);
  const [painPointId, setPainPointId] = useState<string>(lead.primary_pain_point_id ?? "");
  const [painStage, setPainStage] = useState<string>(lead.pain_stage ?? "");
  const [leadTagIds, setLeadTagIds] = useState<string[]>([]);
  const [resonanceLoaded, setResonanceLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [ppRes, tagRes, leadTagRes] = await Promise.all([
        supabase.from("cp_pain_points").select("*").order("sort_order", { ascending: true }),
        supabase.from("cp_tags").select("*").eq("axis", "program"),
        supabase.from("cp_lead_tags").select("tag_id").eq("lead_id", lead.id),
      ]);
      if (cancelled) return;
      setPainPoints((ppRes.data as PainPoint[]) ?? []);
      setProgramTags((tagRes.data as Tag[]) ?? []);
      setLeadTagIds(((leadTagRes.data as { tag_id: string }[]) ?? []).map((r) => r.tag_id));
      setResonanceLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [lead.id]);

  const activePainPoint = painPoints.find((p) => p.id === painPointId) ?? null;

  function toggleLeadTag(id: string) {
    setLeadTagIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const [form, setForm] = useState({
    full_name: lead.full_name,
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    source: lead.source,
    source_detail: lead.source_detail ?? "",
    source_url: lead.source_url ?? "",
    referred_by_lead_id: lead.referred_by_lead_id ?? "",
    status: lead.status,
    temperature: lead.temperature,
    notes: lead.notes ?? "",
    tags: (lead.tags ?? []).join(", "),
    next_followup_at: toDateInput(lead.next_followup_at),
    next_honest_action: (lead.next_honest_action ?? "") as LeadNextAction | "",
    pain_signal: (lead.pain_signal ?? []) as PainSignal[],
    discovery_call_completed: !!lead.discovery_call_completed,
    // P4 qualification
    income_band: (lead.income_band ?? "") as LeadIncomeBand | "",
    readiness_signal: (lead.readiness_signal ?? "") as LeadReadiness | "",
    fit_notes: lead.fit_notes ?? "",
    disqualified_reason: lead.disqualified_reason ?? "",
    // Phase 2 Decisions: deal value displayed in WHOLE DOLLARS (rendered
    // string), persisted in CENTS to the DB. Empty string = unset.
    deal_value: lead.deal_value != null ? String(lead.deal_value / 100) : "",
  });

  function togglePain(s: PainSignal) {
    setForm((f) => ({
      ...f,
      pain_signal: f.pain_signal.includes(s)
        ? f.pain_signal.filter((x) => x !== s)
        : [...f.pain_signal, s],
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = createClient();

    const payload: any = {
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      source: form.source,
      source_detail: form.source_detail.trim() || null,
      source_url: form.source_url.trim() || null,
      referred_by_lead_id: form.referred_by_lead_id || null,
      status: form.status,
      temperature: form.temperature,
      notes: form.notes.trim() || null,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      next_followup_at: form.next_followup_at
        ? new Date(form.next_followup_at).toISOString()
        : null,
      next_honest_action: form.next_honest_action || null,
      pain_signal: form.pain_signal,
      // Resonance Layer — pain point object + stage.
      primary_pain_point_id: painPointId || null,
      pain_stage: painPointId && painStage ? painStage : null,
      discovery_call_completed: form.discovery_call_completed,
      // P4 qualification — empty strings become null so the DB stays clean.
      income_band: form.income_band || null,
      readiness_signal: form.readiness_signal || null,
      fit_notes: form.fit_notes.trim() || null,
      disqualified_reason: form.disqualified_reason.trim() || null,
      // Deal value: trim, parse, multiply to cents. Empty/non-numeric → null.
      deal_value: (() => {
        const raw = form.deal_value.trim().replace(/[$,\s]/g, "");
        if (!raw) return null;
        const dollars = parseFloat(raw);
        if (!Number.isFinite(dollars) || dollars < 0) return null;
        return Math.round(dollars * 100);
      })(),
    };

    const { error } = await supabase.from("cp_leads").update(payload).eq("id", lead.id);
    if (error) {
      setSaving(false);
      setError(error.message);
      return;
    }

    // Reconcile program-axis tags. We only touch program tags here — other
    // axes (source, custom) are managed elsewhere and left intact.
    if (resonanceLoaded && programTags.length > 0) {
      const programIds = programTags.map((t) => t.id);
      const selected = leadTagIds.filter((id) => programIds.includes(id));
      const { error: delErr } = await supabase
        .from("cp_lead_tags")
        .delete()
        .eq("lead_id", lead.id)
        .in("tag_id", programIds);
      if (!delErr && selected.length > 0) {
        await supabase
          .from("cp_lead_tags")
          .insert(selected.map((tag_id) => ({ lead_id: lead.id, tag_id })));
      }
    }

    setSaving(false);
    router.push(`/leads/${lead.id}`);
    router.refresh();
  }

  async function doDelete() {
    setDeleting(true);
    setError(null);
    const supabase = createClient();
    // cp_lead_messages and cp_lead_activities cascade via FK ON DELETE CASCADE
    const { error } = await supabase.from("cp_leads").delete().eq("id", lead.id);
    setDeleting(false);
    if (error) {
      setError(error.message);
      setConfirmDelete(false);
      return;
    }
    router.push("/inbox");
    router.refresh();
  }

  return (
    <>
      <a href={`/leads/${lead.id}`} className="text-[length:var(--t-body)] text-[color:var(--text-muted)] hover:underline">
        ← Back to lead
      </a>
      <h1 className="text-2xl font-extrabold mt-2 mb-4">Edit Lead</h1>

      {error && (
        <div className="mb-4 rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-soft)] p-3 text-[length:var(--t-body)] text-[color:var(--danger)]">
          {error}
        </div>
      )}

      <form onSubmit={save} className="card p-6 space-y-4">
        <Input
          name="full_name"
          label="Full name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          required
        />
        <Input
          name="email"
          label="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          name="phone"
          label="Phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <div className="grid grid-cols-3 gap-3">
          <Select
            name="source"
            label="Source"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value as LeadSource })}
          >
            {SOURCES.map((o) => (
              <option key={o} value={o}>{SOURCE_LABEL[o]}</option>
            ))}
          </Select>
          <Select
            name="status"
            label="Status"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })}
          >
            {STATUSES.map((o) => (
              <option key={o} value={o}>{STATUS_LABEL[o]}</option>
            ))}
          </Select>
          <Select
            name="temperature"
            label="Warmth"
            value={form.temperature}
            onChange={(e) => setForm({ ...form, temperature: e.target.value as LeadTemperature })}
          >
            {TEMPS.map((t) => (
              <option key={t} value={t}>{TEMPERATURE_LABEL[t]}</option>
            ))}
          </Select>
        </div>

        {/* P3: Attribution — which specific piece of content brought them */}
        <Input
          name="source_detail"
          label="Source detail"
          value={form.source_detail}
          onChange={(e) => setForm({ ...form, source_detail: e.target.value })}
          hint="Know which content is bringing you leads. Keep it short and searchable."
          placeholder={
              form.source === "ig" ? "e.g. IG reel: weekly insight 2026-04-18"
              : form.source === "linkedin" ? "e.g. LinkedIn post on burnout"
              : form.source === "newsletter" ? "e.g. The Signal — issue 12"
              : form.source === "quiz" ? "e.g. Brand OS quiz"
              : form.source === "podcast" ? "e.g. The Mindset Mentor ep 421"
              : form.source === "referral" ? "e.g. warm intro via event"
            : "Specific content / context"
          }
        />

        <Input
          name="source_url"
          label="Source URL"
          type="url"
          value={form.source_url}
          onChange={(e) => setForm({ ...form, source_url: e.target.value })}
          placeholder="e.g. https://elevateaisystem.com/blog/healing-after-heartbreak"
          hint="Blog post or landing page URL. Pain signals are inferred from the topic."
        />

        {/* P3: Referral chain — if they were referred, who by */}
        {form.source === "referral" && (
          <Select
            name="referred_by_lead_id"
            label="Referred by"
            value={form.referred_by_lead_id}
            onChange={(e) => setForm({ ...form, referred_by_lead_id: e.target.value })}
            hint="Links this lead to the person who referred them, which builds the referral chain."
          >
            <option value="">Not linked to an existing lead</option>
            {potentialReferrers.map((r) => {
              const tag = r.status === "client" ? "★ client"
                        : r.discovery_call_completed ? "DC ✓"
                        : r.status;
              return (
                <option key={r.id} value={r.id}>
                  {r.full_name} · {tag}
                </option>
              );
            })}
          </Select>
        )}

        {/* Next Honest Action — action-oriented replacement for vague "status" */}
        <Select
          name="next_honest_action"
          label="Next honest action"
          value={form.next_honest_action}
          onChange={(e) => setForm({ ...form, next_honest_action: e.target.value as LeadNextAction | "" })}
          hint="What actually needs to happen next with this lead."
        >
          <option value="">None</option>
          {LEAD_NEXT_ACTIONS.map((a) => (
            <option key={a} value={a}>{NEXT_ACTION_LABEL[a]}</option>
          ))}
        </Select>

        {/* Pain Signal — the differentiator. Multi-select. Feeds the AI drafter. */}
        <div>
          <p className="mb-1 block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
            Pain signal
          </p>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Pain signal">
            {PAIN_SIGNALS.map((s) => {
              const active = form.pain_signal.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => togglePain(s)}
                  aria-pressed={active}
                  className={`min-h-11 cursor-pointer rounded-[var(--r-md)] border px-3 py-2 text-left text-xs transition ${
                    active
                      ? "border-[var(--brand)] bg-[var(--brand)] font-semibold text-[color:var(--text-inverse)]"
                      : "border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {PAIN_SIGNAL_LABEL[s]}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            What they're moving through. Used by the AI drafter to land in the right register.
          </p>
        </div>

        {/* Resonance Layer — pain point as an object + stage. The wedge:
            sort and segment leads by what they're actually moving through. */}
        <div className="space-y-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-deep)] p-3">
          <div>
            {painPoints.length === 0 ? (
              <>
                <p className="mb-1 block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
                  Primary pain point
                </p>
                <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                  No pain points defined yet. Add them in{" "}
                  <a href="/settings" className="underline">Settings, Resonance layer</a>.
                </p>
              </>
            ) : (
              <Select
                name="primary_pain_point"
                label="Primary pain point"
                value={painPointId}
                onChange={(e) => { setPainPointId(e.target.value); setPainStage(""); }}
              >
                <option value="">None</option>
                {painPoints.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            )}
          </div>

          {activePainPoint && activePainPoint.stages.length > 0 && (
            <Select
              name="pain_stage"
              label="Stage"
              value={painStage}
              onChange={(e) => setPainStage(e.target.value)}
            >
              <option value="">Unset</option>
              {activePainPoint.stages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          )}

          <div>
            <p className="mb-1 block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]">
              Program
            </p>
            {programTags.length === 0 ? (
              <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
                No program tags yet. Add them in{" "}
                <a href="/settings" className="underline">Settings, Resonance layer</a>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Program">
                {programTags.map((t) => {
                  const active = leadTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleLeadTag(t.id)}
                      aria-pressed={active}
                      className={`min-h-11 cursor-pointer rounded-[var(--r-md)] border px-3 py-1.5 text-xs transition ${
                        active
                          ? "border-[var(--brand)] bg-[var(--brand)] font-semibold text-[color:var(--text-inverse)]"
                          : "border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Discovery call completed */}
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[length:var(--t-body)]">
          <input
            type="checkbox"
            checked={form.discovery_call_completed}
            onChange={(e) =>
              setForm({ ...form, discovery_call_completed: e.target.checked })
            }
            className="h-4 w-4 cursor-pointer accent-[var(--brand)]"
          />
          <span>Discovery call completed</span>
        </label>

        {/* P4: Qualification — income + readiness feed the fit score. These
            also live in the sidebar FitCard on the lead detail page with
            live scoring, but surfacing them in the edit form lets the coach
            update them during a longer sit-down review. */}
        <div className="border-t border-[var(--border-faint)] pt-4">
          <div className="mb-2">
            <h4 className="text-[length:var(--t-caption)] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
              Qualification
            </h4>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Feeds the fit score: should we even be having this conversation?
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              name="income_band"
              label="Income band"
              value={form.income_band}
              onChange={(e) => setForm({ ...form, income_band: e.target.value as LeadIncomeBand | "" })}
            >
              <option value="">Not set</option>
              {LEAD_INCOME_BANDS.map((b) => (
                <option key={b} value={b}>{INCOME_BAND_LABEL[b]}</option>
              ))}
            </Select>
            <Select
              name="readiness_signal"
              label="Readiness"
              value={form.readiness_signal}
              onChange={(e) => setForm({ ...form, readiness_signal: e.target.value as LeadReadiness | "" })}
            >
              <option value="">Not set</option>
              {LEAD_READINESS_SIGNALS.map((r) => (
                <option key={r} value={r}>{READINESS_LABEL[r]}</option>
              ))}
            </Select>
          </div>

          {/* Deal value: drives MRR / pipeline-value / avg-deal-size on
              /command-center + /decisions. Whole-dollar input here; we
              persist as cents at save time. */}
          <div className="mt-3">
            <Input
              name="deal_value"
              label="Deal value"
              inputMode="decimal"
              value={form.deal_value}
              onChange={(e) => setForm({ ...form, deal_value: e.target.value })}
              placeholder="2000"
              hint="USD. Actual for clients, expected for in-flight."
              leadingIcon={<span className="font-semibold">$</span>}
            />
          </div>

          <div className="relative mt-3">
            <Textarea
              name="fit_notes"
              label="Fit notes"
              value={form.fit_notes}
              onChange={(e) => setForm({ ...form, fit_notes: e.target.value })}
              rows={2}
              placeholder="Your read. The feel, not the data."
              className="pr-10"
            />
            <VoiceMicInput
              onTranscript={(t) => setForm((f) => ({ ...f, fit_notes: f.fit_notes ? f.fit_notes + " " + t : t }))}
              className="absolute right-1.5 top-7"
            />
          </div>
          <div className="mt-3">
            <Input
              name="disqualified_reason"
              label="Disqualified reason"
              value={form.disqualified_reason}
              onChange={(e) => setForm({ ...form, disqualified_reason: e.target.value })}
              placeholder="e.g. below budget, wrong season"
              hint="Leave blank if qualified. Setting a reason flips the fit band to Disqualified."
            />
          </div>
        </div>

        <Input
          name="next_followup_at"
          label="Next follow-up"
          type="date"
          value={form.next_followup_at}
          onChange={(e) => setForm({ ...form, next_followup_at: e.target.value })}
        />

        {/* Tags field hidden — pain_signal + next_honest_action already
            categorize. Tags invited DIY-taxonomy creep. Column kept in DB
            for back-compat; no UI surface. */}

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <label
              htmlFor="notes"
              className="block text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)]"
            >
              Notes
            </label>
            <VoiceMicInput
              onTranscript={(t) => setForm((f) => ({ ...f, notes: f.notes ? f.notes + " " + t : t }))}
            />
          </div>
          <Textarea
            name="notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={5}
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <a href={`/leads/${lead.id}`} className="btn-ghost">Cancel</a>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>

      {/* Danger zone */}
      <div className="card mt-6 border border-[var(--danger)] p-6">
        <h3 className="mb-1 font-bold text-[color:var(--danger)]">Danger zone</h3>
        <p className="mb-3 text-[length:var(--t-body)] text-[color:var(--text-muted)]">
          Deletes this lead and its message history. Can&apos;t be undone.
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-11 cursor-pointer rounded-[var(--r-md)] border border-[var(--danger)] px-4 py-2 text-[length:var(--t-body)] font-semibold text-[color:var(--danger)] transition hover:bg-[var(--danger-soft)]"
          >
            Delete lead
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Are you sure?</span>
            <button
              type="button"
              onClick={doDelete}
              disabled={deleting}
              className="min-h-11 cursor-pointer rounded-[var(--r-md)] bg-[var(--danger)] px-4 py-2 text-[length:var(--t-body)] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="btn-ghost"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </>
  );
}
