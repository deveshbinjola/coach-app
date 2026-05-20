"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
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
      <a href={`/leads/${lead.id}`} className="text-sm text-gray-600 hover:underline">
        ← Back to lead
      </a>
      <h1 className="text-2xl font-extrabold mt-2 mb-4">Edit Lead</h1>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={save} className="card p-6 space-y-4">
        <Input label="Full Name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
        <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />

        <div className="grid grid-cols-3 gap-3">
          <Select label="Source" value={form.source} options={SOURCES} onChange={(v) => setForm({ ...form, source: v as LeadSource })} />
          <Select label="Status" value={form.status} options={STATUSES} onChange={(v) => setForm({ ...form, status: v as LeadStatus })} />
          <div>
            <label className="block text-xs font-semibold uppercase mb-1">Warmth</label>
            <select
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: e.target.value as LeadTemperature })}
              className="w-full p-2 border border-gray-300 rounded-lg"
            >
              {TEMPS.map((t) => (
                <option key={t} value={t}>{TEMPERATURE_LABEL[t]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* P3: Attribution — which specific piece of content brought them */}
        <div>
          <label className="block text-xs font-semibold uppercase mb-1">
            Source Detail <span className="text-gray-400 font-normal">(which post/reel/newsletter)</span>
          </label>
          <input
            type="text"
            value={form.source_detail}
            onChange={(e) => setForm({ ...form, source_detail: e.target.value })}
            placeholder={
              form.source === "ig" ? "e.g. IG reel: weekly insight 2026-04-18"
              : form.source === "linkedin" ? "e.g. LinkedIn post on burnout"
              : form.source === "newsletter" ? "e.g. The Signal — issue 12"
              : form.source === "quiz" ? "e.g. Brand OS quiz"
              : form.source === "podcast" ? "e.g. The Mindset Mentor ep 421"
              : form.source === "referral" ? "e.g. warm intro via event"
              : "Specific content / context"
            }
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">
            Know which content is bringing you leads. Keep it short and searchable.
          </p>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase mb-1">
            Source URL <span className="text-gray-400 font-normal normal-case">(page they came from)</span>
          </label>
          <input
            type="url"
            value={form.source_url}
            onChange={(e) => setForm({ ...form, source_url: e.target.value })}
            placeholder="e.g. https://elevateaisystem.com/blog/healing-after-heartbreak"
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
          <p className="text-xs text-gray-500 mt-1">
            Blog post or landing page URL. Pain signals are auto-inferred from the article topic.
          </p>
        </div>

        {/* P3: Referral chain — if they were referred, who by */}
        {form.source === "referral" && (
          <div>
            <label className="block text-xs font-semibold uppercase mb-1">
              Referred By <span className="text-gray-400 font-normal">(existing lead)</span>
            </label>
            <select
              value={form.referred_by_lead_id}
              onChange={(e) => setForm({ ...form, referred_by_lead_id: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-lg"
            >
              <option value="">— not linked to an existing lead —</option>
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
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Links this lead to the person who referred them — shows up as a referral chain.
            </p>
          </div>
        )}

        {/* Next Honest Action — action-oriented replacement for vague "status" */}
        <div>
          <label className="block text-xs font-semibold uppercase mb-1">Next Honest Action</label>
          <select
            value={form.next_honest_action}
            onChange={(e) => setForm({ ...form, next_honest_action: e.target.value as LeadNextAction | "" })}
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="">— none —</option>
            {LEAD_NEXT_ACTIONS.map((a) => (
              <option key={a} value={a}>{NEXT_ACTION_LABEL[a]}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            What actually needs to happen next with this lead.
          </p>
        </div>

        {/* Pain Signal — the differentiator. Multi-select. Feeds the AI drafter. */}
        <div>
          <label className="block text-xs font-semibold uppercase mb-1">Pain Signal</label>
          <div className="grid grid-cols-2 gap-2">
            {PAIN_SIGNALS.map((s) => {
              const active = form.pain_signal.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => togglePain(s)}
                  className={`text-left text-xs px-3 py-2 rounded-lg border transition ${
                    active
                      ? "bg-navy text-white border-navy font-semibold"
                      : "bg-white text-gray-800 border-gray-300 hover:border-gray-500"
                  }`}
                >
                  {PAIN_SIGNAL_LABEL[s]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            What they're moving through. Used by the AI drafter to land in the right register.
          </p>
        </div>

        {/* Resonance Layer — pain point as an object + stage. The wedge:
            sort and segment leads by what they're actually moving through. */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase mb-1">Primary Pain Point</label>
            {painPoints.length === 0 ? (
              <p className="text-xs text-gray-500">
                No pain points defined yet. Add them in{" "}
                <a href="/settings" className="underline">Settings → Resonance layer</a>.
              </p>
            ) : (
              <select
                value={painPointId}
                onChange={(e) => { setPainPointId(e.target.value); setPainStage(""); }}
                className="w-full p-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">— none —</option>
                {painPoints.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {activePainPoint && activePainPoint.stages.length > 0 && (
            <div>
              <label className="block text-xs font-semibold uppercase mb-1">Stage</label>
              <select
                value={painStage}
                onChange={(e) => setPainStage(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="">— unset —</option>
                {activePainPoint.stages.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase mb-1">Program</label>
            {programTags.length === 0 ? (
              <p className="text-xs text-gray-500">
                No program tags yet. Add them in{" "}
                <a href="/settings" className="underline">Settings → Resonance layer</a>.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {programTags.map((t) => {
                  const active = leadTagIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleLeadTag(t.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition ${
                        active
                          ? "bg-navy text-white border-navy font-semibold"
                          : "bg-white text-gray-800 border-gray-300 hover:border-gray-500"
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
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.discovery_call_completed}
            onChange={(e) =>
              setForm({ ...form, discovery_call_completed: e.target.checked })
            }
          />
          <span>Discovery call completed</span>
        </label>

        {/* P4: Qualification — income + readiness feed the fit score. These
            also live in the sidebar FitCard on the lead detail page with
            live scoring, but surfacing them in the edit form lets the coach
            update them during a longer sit-down review. */}
        <div className="pt-3 border-t border-gray-100">
          <div className="mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
              Qualification
            </h4>
            <p className="text-[11px] text-gray-500">
              Feeds the fit score — &ldquo;should we even be having this conversation?&rdquo;
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase mb-1">Income Band</label>
              <select
                value={form.income_band}
                onChange={(e) => setForm({ ...form, income_band: e.target.value as LeadIncomeBand | "" })}
                className="w-full p-2 border border-gray-300 rounded-lg"
              >
                <option value="">— not set —</option>
                {LEAD_INCOME_BANDS.map((b) => (
                  <option key={b} value={b}>{INCOME_BAND_LABEL[b]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase mb-1">Readiness</label>
              <select
                value={form.readiness_signal}
                onChange={(e) => setForm({ ...form, readiness_signal: e.target.value as LeadReadiness | "" })}
                className="w-full p-2 border border-gray-300 rounded-lg"
              >
                <option value="">— not set —</option>
                {LEAD_READINESS_SIGNALS.map((r) => (
                  <option key={r} value={r}>{READINESS_LABEL[r]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Deal value: drives MRR / pipeline-value / avg-deal-size on
              /command-center + /decisions. Whole-dollar input here; we
              persist as cents at save time. */}
          <div className="mt-3">
            <label className="block text-xs font-semibold uppercase mb-1">
              Deal Value <span className="text-gray-400 font-normal">(USD, optional: actual for clients, expected for in-flight)</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold pointer-events-none">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.deal_value}
                onChange={(e) => setForm({ ...form, deal_value: e.target.value })}
                placeholder="2000"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-xs font-semibold uppercase mb-1">
              Fit Notes <span className="text-gray-400 font-normal">(qualitative read)</span>
            </label>
            <textarea
              value={form.fit_notes}
              onChange={(e) => setForm({ ...form, fit_notes: e.target.value })}
              rows={2}
              placeholder="Your read, not the data, the feel. 'Nervous about cost', 'wife on board', etc."
              className="w-full p-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="mt-3">
            <label className="block text-xs font-semibold uppercase mb-1">
              Disqualified Reason <span className="text-gray-400 font-normal">(leave blank if qualified)</span>
            </label>
            <input
              type="text"
              value={form.disqualified_reason}
              onChange={(e) => setForm({ ...form, disqualified_reason: e.target.value })}
              placeholder="e.g. below budget, wrong season. Feeds targeting decisions"
              className="w-full p-2 border border-gray-300 rounded-lg text-sm"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Setting a reason flips fit band to &ldquo;Disqualified&rdquo; and closes the loop.
            </p>
          </div>
        </div>

        <Input
          label="Next Follow-up"
          type="date"
          value={form.next_followup_at}
          onChange={(v) => setForm({ ...form, next_followup_at: v })}
        />

        {/* Tags field hidden — pain_signal + next_honest_action already
            categorize. Tags invited DIY-taxonomy creep. Column kept in DB
            for back-compat; no UI surface. */}

        <div>
          <label className="block text-xs font-semibold uppercase mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={5}
            className="w-full p-2 border border-gray-300 rounded-lg"
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
      <div className="card p-6 mt-6 border border-red-200">
        <h3 className="font-bold text-red-700 mb-1">Danger zone</h3>
        <p className="text-sm text-gray-600 mb-3">
          Deletes this lead and its message history. Can't be undone.
        </p>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="px-4 py-2 rounded-lg border border-red-300 text-red-700 font-semibold text-sm hover:bg-red-50"
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
              className="px-4 py-2 rounded-lg bg-red-600 text-white font-semibold text-sm hover:bg-red-700 disabled:opacity-50"
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

function Input({
  label,
  value,
  onChange,
  type = "text",
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase mb-1">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full p-2 border border-gray-300 rounded-lg"
      />
    </div>
  );
}

function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="w-full p-2 border border-gray-300 rounded-lg"
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
