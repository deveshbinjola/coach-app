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
  type LeadIncomeBand,
  type LeadNextAction,
  type LeadReadiness,
  type LeadSource,
  type LeadStatus,
  type LeadTemperature,
  type PainSignal,
} from "@/lib/types";

const SOURCES: LeadSource[] = ["ig", "linkedin", "referral", "quiz", "in_person", "podcast", "newsletter", "other"];

// Contextual placeholders for source_detail - helps the coach log *which*
// specific piece of content brought this lead in. This is the atom of
// attribution: source='ig' is useless, source='ig' + detail='reel: masculine
// leadership 2026-04-18' lets you rank content by actual pipeline impact.
const SOURCE_DETAIL_PLACEHOLDER: Record<LeadSource, string> = {
  ig: "e.g. Reel: masculine leadership 2026-04-18",
  linkedin: "e.g. Post: why coaches plateau at $10K",
  referral: "e.g. Met at men's retreat",
  quiz: "e.g. Quiz result: Avatar archetype",
  in_person: "e.g. AMLT cohort, Detroit meetup",
  podcast: "e.g. Podcast: embodied leadership ep. 14",
  newsletter: "e.g. Signal #12 - the resonance funnel",
  other: "e.g. YouTube, Twitter, word of mouth",
};

type ReferrerRef = {
  id: string;
  full_name: string;
  status: LeadStatus;
  discovery_call_completed: boolean;
};

export default function NewLeadForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [potentialReferrers, setPotentialReferrers] = useState<ReferrerRef[]>([]);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    source: "ig" as LeadSource,
    source_detail: "",
    referred_by_lead_id: "",
    temperature: "warm" as LeadTemperature,
    notes: "",
    next_honest_action: "" as LeadNextAction | "",
    pain_signal: [] as PainSignal[],
    discovery_call_completed: false,
    // P4 qualification - optional at intake, sharpened on the lead detail later.
    income_band: "" as LeadIncomeBand | "",
    readiness_signal: "" as LeadReadiness | "",
    fit_notes: "",
  });

  // Pre-load potential referrers once on mount. Sorted: clients/DC-completed
  // first, then by recency. 500 cap keeps the <select> usable while covering
  // every realistic coach roster (we'll swap to a typeahead when someone
  // actually hits this limit).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("cp_leads")
        .select("id, full_name, status, discovery_call_completed")
        .order("discovery_call_completed", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      if (!cancelled && data) setPotentialReferrers(data as ReferrerRef[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("Not authenticated");
      setSaving(false);
      return;
    }
    // Insert + grab the new lead's ID so we can fire the auto-draft engine.
    // auto_draft_eligible defaults to true at the DB level - manual single-add
    // is a "live" source, exactly what the engine is designed for.
    const { data: inserted, error } = await supabase
      .from("cp_leads")
      .insert({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        source: form.source,
        source_detail: form.source_detail.trim() || null,
        // Only persist referrer link when source is 'referral' - prevents
        // accidental orphan links if the coach switches source afterwards.
        referred_by_lead_id:
          form.source === "referral" && form.referred_by_lead_id
            ? form.referred_by_lead_id
            : null,
        temperature: form.temperature,
        notes: form.notes.trim() || null,
        next_honest_action: form.next_honest_action || null,
        pain_signal: form.pain_signal,
        discovery_call_completed: form.discovery_call_completed,
        income_band: form.income_band || null,
        readiness_signal: form.readiness_signal || null,
        fit_notes: form.fit_notes.trim() || null,
        coach_id: user.id,
        status: "new",
      })
      .select("id")
      .single();

    if (error) {
      setSaving(false);
      alert(error.message);
      return;
    }

    // Fire the Auto-Response Engine. Fire-and-forget by design - we don't
    // want the coach waiting 5 seconds on Anthropic before the page navigates.
    // The draft will be visible on the lead detail page once it lands and on
    // lead detail page once it lands (typically <30s). If the function
    // skips for any reason (no voice profile, auto-draft disabled, etc.)
    // it returns 200 - see auto-draft-response/index.ts for skip codes.
    if (inserted?.id) {
      supabase.functions
        .invoke("auto-draft-response", { body: { lead_id: inserted.id } })
        .catch((err) => console.warn("auto-draft-response invoke failed:", err));
    }

    setSaving(false);
    router.push(
      inserted?.id
        ? `/inbox?compose=open&source=start-here&ids=${encodeURIComponent(inserted.id)}`
        : "/inbox"
    );
  }

  return (
    <div className="max-w-xl">
      <form onSubmit={save} className="card p-6 space-y-4">
        <Input label="Full Name" value={form.full_name} onChange={(v) => setForm({ ...form, full_name: v })} required />
        <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Source"
            value={form.source}
            options={SOURCES}
            onChange={(v) => setForm({ ...form, source: v as LeadSource })}
          />
          <div>
            <label className="block text-xs font-semibold uppercase mb-1">Warmth</label>
            <select
              value={form.temperature}
              onChange={(e) => setForm({ ...form, temperature: e.target.value as LeadTemperature })}
              className="w-full p-2 border border-gray-300 rounded-lg"
            >
              {LEAD_TEMPERATURES.map((t) => (
                <option key={t} value={t}>{TEMPERATURE_LABEL[t]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Attribution - source_detail is the "which post/reel/podcast/etc"
            atom. Fuels the attribution block on the dashboard. */}
        <div>
          <label className="block text-xs font-semibold uppercase mb-1">
            Source detail <span className="text-gray-400 font-normal normal-case">(optional but high-ROI)</span>
          </label>
          <input
            type="text"
            value={form.source_detail}
            onChange={(e) => setForm({ ...form, source_detail: e.target.value })}
            placeholder={SOURCE_DETAIL_PLACEHOLDER[form.source]}
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
          <p className="text-[11px] text-gray-500 mt-1">
            The specific post, reel, newsletter, or conversation that brought them in.
          </p>
        </div>

        {/* Referrer picker - only shown when source='referral'. Self-FK
            lets us build referral chains and credit the referrer later. */}
        {form.source === "referral" && (
          <div>
            <label className="block text-xs font-semibold uppercase mb-1">Referred by</label>
            <select
              value={form.referred_by_lead_id}
              onChange={(e) => setForm({ ...form, referred_by_lead_id: e.target.value })}
              className="w-full p-2 border border-gray-300 rounded-lg"
            >
              <option value="">- not linked to an existing lead -</option>
              {potentialReferrers.map((r) => {
                const tag =
                  r.status === "client"
                    ? "★ client"
                    : r.discovery_call_completed
                    ? "DC ✓"
                    : r.status;
                return (
                  <option key={r.id} value={r.id}>
                    {r.full_name} · {tag}
                  </option>
                );
              })}
            </select>
            <p className="text-[11px] text-gray-500 mt-1">
              Linking the referrer unlocks a "thank them + ask for another intro" prompt on their profile.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-semibold uppercase mb-1">Next Honest Action</label>
          <select
            value={form.next_honest_action}
            onChange={(e) => setForm({ ...form, next_honest_action: e.target.value as LeadNextAction | "" })}
            className="w-full p-2 border border-gray-300 rounded-lg"
          >
            <option value="">- none -</option>
            {LEAD_NEXT_ACTIONS.map((a) => (
              <option key={a} value={a}>{NEXT_ACTION_LABEL[a]}</option>
            ))}
          </select>
        </div>

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
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={form.discovery_call_completed}
            onChange={(e) => setForm({ ...form, discovery_call_completed: e.target.checked })}
          />
          <span>Discovery call completed</span>
        </label>

        {/* P4: Qualification snapshot - optional at intake. Most coaches
            won't know income band on first contact, so these stay blank
            until the discovery call surfaces them. */}
        <div className="pt-3 border-t border-gray-100">
          <div className="mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-700">
              Qualification <span className="text-gray-400 font-normal normal-case">(optional - fill after discovery)</span>
            </h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase mb-1">Income Band</label>
              <select
                value={form.income_band}
                onChange={(e) => setForm({ ...form, income_band: e.target.value as LeadIncomeBand | "" })}
                className="w-full p-2 border border-gray-300 rounded-lg"
              >
                <option value="">- not set -</option>
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
                <option value="">- not set -</option>
                {LEAD_READINESS_SIGNALS.map((r) => (
                  <option key={r} value={r}>{READINESS_LABEL[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3">
            <label className="block text-xs font-semibold uppercase mb-1">
              Fit Notes
            </label>
            <input
              type="text"
              value={form.fit_notes}
              onChange={(e) => setForm({ ...form, fit_notes: e.target.value })}
              placeholder="Your read - the feel, not the data"
              className="w-full p-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={4}
            className="w-full p-2 border border-gray-300 rounded-lg"
          />
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? "Saving..." : "Save Lead"}
        </button>
      </form>
    </div>
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
