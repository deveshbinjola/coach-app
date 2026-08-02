"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import VoiceMicInput from "@/components/VoiceMicInput";
import { Input, Select, Textarea } from "@/components/ui/Input";
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
  TEMPERATURE_LABEL,
  type LeadIncomeBand,
  type LeadNextAction,
  type LeadReadiness,
  type LeadSource,
  type LeadStatus,
  type LeadTemperature,
  type PainSignal,
} from "@/lib/types";
import { inferPainFromUrl } from "@/lib/pain-from-source";

const SOURCES: LeadSource[] = ["ig", "linkedin", "referral", "quiz", "in_person", "podcast", "newsletter", "other"];

// Contextual placeholders for source_detail - helps the coach log *which*
// specific piece of content brought this lead in. This is the atom of
// attribution: source='ig' is useless, source='ig' + detail='reel: weekly
// insight 2026-04-18' lets you rank content by actual pipeline impact.
const SOURCE_DETAIL_PLACEHOLDER: Record<LeadSource, string> = {
  ig: "e.g. Reel: weekly insight 2026-04-18",
  linkedin: "e.g. Post: why coaches plateau at $10K",
  referral: "e.g. Met at a retreat",
  quiz: "e.g. Quiz result: Avatar archetype",
  in_person: "e.g. cohort meetup, Detroit",
  podcast: "e.g. Podcast: embodied coaching ep. 14",
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
    source_url: "",
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
    const sourceUrl = form.source_url.trim() || null;
    let painSignal = form.pain_signal;
    if (painSignal.length === 0 && sourceUrl) {
      painSignal = inferPainFromUrl(sourceUrl);
    }

    const { data: inserted, error } = await supabase
      .from("cp_leads")
      .insert({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        source: form.source,
        source_detail: form.source_detail.trim() || null,
        source_url: sourceUrl,
        // Only persist referrer link when source is 'referral' - prevents
        // accidental orphan links if the coach switches source afterwards.
        referred_by_lead_id:
          form.source === "referral" && form.referred_by_lead_id
            ? form.referred_by_lead_id
            : null,
        temperature: form.temperature,
        notes: form.notes.trim() || null,
        next_honest_action: form.next_honest_action || null,
        pain_signal: painSignal,
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

        <div className="grid grid-cols-2 gap-3">
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
            name="temperature"
            label="Warmth"
            value={form.temperature}
            onChange={(e) => setForm({ ...form, temperature: e.target.value as LeadTemperature })}
          >
            {LEAD_TEMPERATURES.map((t) => (
              <option key={t} value={t}>{TEMPERATURE_LABEL[t]}</option>
            ))}
          </Select>
        </div>

        {/* Attribution - source_detail is the "which post/reel/podcast/etc"
            atom. Fuels the attribution block on the dashboard. */}
        <Input
          name="source_detail"
          label="Source detail"
          value={form.source_detail}
          onChange={(e) => setForm({ ...form, source_detail: e.target.value })}
          placeholder={SOURCE_DETAIL_PLACEHOLDER[form.source]}
          hint="The specific post, reel, newsletter, or conversation that brought them in."
        />

        <div className="space-y-1">
          <Input
            name="source_url"
            label="Source URL"
            type="url"
            value={form.source_url}
            onChange={(e) => setForm({ ...form, source_url: e.target.value })}
            placeholder="e.g. https://elevateaisystem.com/blog/healing-after-heartbreak"
            hint="Paste the page they came from. Pain signals are inferred from the topic."
          />
          {form.source_url && inferPainFromUrl(form.source_url).length > 0 && (
            <p className="text-[length:var(--t-caption)] font-semibold text-[color:var(--brand)]">
              Auto-detected pain: {inferPainFromUrl(form.source_url).map((p) => PAIN_SIGNAL_LABEL[p]).join(", ")}
            </p>
          )}
        </div>

        {/* Referrer picker - only shown when source='referral'. Self-FK
            lets us build referral chains and credit the referrer later. */}
        {form.source === "referral" && (
          <Select
            name="referred_by_lead_id"
            label="Referred by"
            value={form.referred_by_lead_id}
            onChange={(e) => setForm({ ...form, referred_by_lead_id: e.target.value })}
            hint="Linking the referrer unlocks a thank-them-and-ask-again prompt on their profile."
          >
            <option value="">Not linked to an existing lead</option>
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
          </Select>
        )}

        <Select
          name="next_honest_action"
          label="Next honest action"
          value={form.next_honest_action}
          onChange={(e) => setForm({ ...form, next_honest_action: e.target.value as LeadNextAction | "" })}
        >
          <option value="">None</option>
          {LEAD_NEXT_ACTIONS.map((a) => (
            <option key={a} value={a}>{NEXT_ACTION_LABEL[a]}</option>
          ))}
        </Select>

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
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[length:var(--t-body)]">
          <input
            type="checkbox"
            checked={form.discovery_call_completed}
            onChange={(e) => setForm({ ...form, discovery_call_completed: e.target.checked })}
            className="h-4 w-4 cursor-pointer accent-[var(--brand)]"
          />
          <span>Discovery call completed</span>
        </label>

        {/* P4: Qualification snapshot - optional at intake. Most coaches
            won't know income band on first contact, so these stay blank
            until the discovery call surfaces them. */}
        <div className="border-t border-[var(--border-faint)] pt-4">
          <h4 className="mb-2 text-[length:var(--t-caption)] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
            Qualification{" "}
            <span className="font-normal normal-case text-[color:var(--text-faint)]">
              (optional, fill after discovery)
            </span>
          </h4>
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
          <div className="mt-3">
            <Input
              name="fit_notes"
              label="Fit notes"
              value={form.fit_notes}
              onChange={(e) => setForm({ ...form, fit_notes: e.target.value })}
              placeholder="Your read. The feel, not the data."
            />
          </div>
        </div>

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
            rows={4}
          />
        </div>

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? "Saving..." : "Save Lead"}
        </button>
      </form>
    </div>
  );
}
