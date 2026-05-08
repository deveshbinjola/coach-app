"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import {
  PAIN_SIGNALS,
  PAIN_SIGNAL_LABEL,
  LEAD_TEMPERATURES,
  TEMPERATURE_LABEL,
  LEAD_NEXT_ACTIONS,
  NEXT_ACTION_LABEL,
  type Lead,
  type LeadTemperature,
  type PainSignal,
  type LeadStatus,
  type LeadNextAction,
  type MessagePurpose,
  type VoiceProfile,
} from "@/lib/types";
import { computeLeadScore, sortByScore, scoreTier, SCORE_TIER_CLASS } from "@/lib/lead-score";
import { computeWasEdited, scoreVoiceFit } from "@/lib/voice-trust";
import VoiceFitPanel from "@/components/VoiceFitPanel";
import { useError, useConfirm } from "@/components/ui";

const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "booked", "client", "closed_lost"];
const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  booked: "Booked",
  client: "Client",
  closed_lost: "Closed (lost)",
};

type DiscoveryFilter = "any" | "yes" | "no";

export default function ComposeStudio({
  leads,
  coachId,
  seedPain,
  seedTemp,
  seedIds = [],
  seedSource = "",
}: {
  leads: Lead[];
  coachId: string;
  seedPain: string[];
  seedTemp: string[];
  seedIds?: string[];
  seedSource?: string;
}) {
  const router = useRouter();
  // Replace 4 alert() and 1 confirm() with brand-styled equivalents.
  const { setError, ErrorBanner } = useError();
  const { ConfirmDialog, askConfirm } = useConfirm();
  const supabase = createClient();

  // Filter state
  const [painFilter, setPainFilter] = useState<PainSignal[]>(
    seedPain.filter((s): s is PainSignal => (PAIN_SIGNALS as string[]).includes(s))
  );
  const [tempFilter, setTempFilter] = useState<LeadTemperature[]>(
    seedTemp.filter((s): s is LeadTemperature => (LEAD_TEMPERATURES as string[]).includes(s))
  );
  const [statusFilter, setStatusFilter] = useState<LeadStatus[]>([]);
  const [actionFilter, setActionFilter] = useState<LeadNextAction[]>([]);
  const [discoveryFilter, setDiscoveryFilter] = useState<DiscoveryFilter>("any");
  // Hard ID pin from Decisions ?ids=a,b,c, only apply on initial load.
  // User can clear with the filter reset button.
  const [idPin, setIdPin] = useState<string[]>(seedIds);

  // Message state
  const [template, setTemplate] = useState("");
  // Voice Trust Loop: snapshot of the AI's original tokenized template the
  // moment it returned. `template` is the coach-editable version. At send
  // time we compare them to determine was_edited per logged message.
  const [originalAiTemplate, setOriginalAiTemplate] = useState<string | null>(
    null
  );
  const [drafting, setDrafting] = useState(false);
  const [improvingVoice, setImprovingVoice] = useState(false);
  const [logging, setLogging] = useState<string | null>(null); // lead.id currently being logged
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null); // preview lead id
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);

  useEffect(() => {
    let alive = true;
    async function loadVoiceProfile() {
      const { data } = await supabase
        .from("cp_voice_profiles")
        .select("*")
        .eq("coach_id", coachId)
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (alive) setVoiceProfile((data as VoiceProfile | null) ?? null);
    }
    void loadVoiceProfile();
    return () => {
      alive = false;
    };
  }, [coachId]);

  const voiceFit = useMemo(
    () => scoreVoiceFit(template, voiceProfile),
    [template, voiceProfile]
  );

  // Apply filters (AND across dimensions, OR within each)
  // idPin is a HARD filter, when set (from Decisions ?ids=), only those leads
  // are included. Other filters still apply on top. Clear resets idPin too.
  const matched = useMemo(() => {
    const filtered = leads.filter((l) => {
      if (idPin.length > 0 && !idPin.includes(l.id)) return false;
      if (tempFilter.length > 0 && !tempFilter.includes(l.temperature)) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(l.status)) return false;
      if (actionFilter.length > 0) {
        if (!l.next_honest_action || !actionFilter.includes(l.next_honest_action)) {
          return false;
        }
      }
      if (discoveryFilter === "yes" && !l.discovery_call_completed) return false;
      if (discoveryFilter === "no" && l.discovery_call_completed) return false;
      if (painFilter.length > 0) {
        const has = (l.pain_signal ?? []).some((p) =>
          painFilter.includes(p as PainSignal)
        );
        if (!has) return false;
      }
      return true;
    });
    return sortByScore(filtered);
  }, [leads, idPin, painFilter, tempFilter, statusFilter, actionFilter, discoveryFilter]);

  function togglePain(p: PainSignal) {
    setPainFilter((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }
  function toggleTemp(t: LeadTemperature) {
    setTempFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }
  function toggleStatus(s: LeadStatus) {
    setStatusFilter((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  function toggleAction(a: LeadNextAction) {
    setActionFilter((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }
  function clearFilters() {
    setPainFilter([]);
    setTempFilter([]);
    setStatusFilter([]);
    setActionFilter([]);
    setDiscoveryFilter("any");
    setIdPin([]);
  }

  /**
   * Personalize a template for a specific lead.
   * Supported tokens:
   *   [FIRST_NAME] , first word of full_name
   *   [FULL_NAME]
   *   [WARMTH]     , e.g. "warm"
   *   [PAIN]       , first pain signal label, or "" if none
   */
  function personalize(tpl: string, lead: Lead): string {
    const first = (lead.full_name ?? "").split(/\s+/)[0] ?? "";
    const pain = lead.pain_signal?.[0]
      ? PAIN_SIGNAL_LABEL[lead.pain_signal[0] as PainSignal]
      : "";
    return tpl
      .replaceAll("[FIRST_NAME]", first)
      .replaceAll("[FULL_NAME]", lead.full_name)
      .replaceAll("[WARMTH]", lead.temperature)
      .replaceAll("[PAIN]", pain);
  }

  /**
   * Generate an AI draft based on the FIRST matched lead (as representative).
   * The draft is a template, the coach edits it, then personalizes per-lead
   * via token substitution at send time.
   */
  async function generateDraft() {
    if (matched.length === 0) return;
    setDrafting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const representative = matched[0];
      const purpose = segmentIntent?.purpose ?? inferLeadPurpose(representative);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/draft-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({
            lead_id: representative.id,
            purpose,
            persist: false,
            segment_size: matched.length,
          }),
        }
      );
      const json = await res.json();
      if (json.draft) {
        // Try to convert the name in the returned draft into a token, so it
        // becomes reusable across the segment. Best-effort only, coach can edit.
        const firstName = (representative.full_name ?? "").split(/\s+/)[0];
        const templated = firstName
          ? json.draft.replaceAll(firstName, "[FIRST_NAME]")
          : json.draft;
        setTemplate(templated);
        // Snapshot the tokenized template so was_edited reflects the coach's
        // edits to the AI's intent, not the per-lead token substitutions.
        setOriginalAiTemplate(templated);
      } else {
        setError(`Draft failed: ${json.error ?? "unknown"}`);
      }
    } catch (e) {
      setError(`Draft failed: ${(e as Error).message}`);
    } finally {
      setDrafting(false);
    }
  }

  async function improveTemplateVoice() {
    if (!template.trim()) return;
    setImprovingVoice(true);
    try {
      const res = await fetch("/api/voice/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft: template }),
      });
      const json = await res.json();
      if (!res.ok || !json.draft) {
        setError(`Voice tune failed: ${json.error ?? "unknown"}`);
        return;
      }
      setTemplate(json.draft);
    } finally {
      setImprovingVoice(false);
    }
  }

  /**
   * Log a personalized message as sent for a single lead.
   * Resend isn't wired yet (Day 30, Week 3), so this is a manual "I sent this
   * outside the app, record it here" flow.
   */
  async function logAsSent(lead: Lead) {
    if (!template.trim()) return;
    setLogging(lead.id);
    const content = personalize(template, lead);

    // Voice Trust Loop. Two paths:
    //   - Compose used an AI draft (originalAiTemplate set) -> record
    //     ai_drafted=true, original_draft=personalized version of original,
    //     was_edited computed against the COACH'S template (not per-lead
    //     personalization) so token substitution doesn't count as editing.
    //   - Coach typed the template themselves -> ai_drafted=false, both
    //     trust columns NULL.
    const aiDrafted = originalAiTemplate !== null;
    let originalDraft: string | null = null;
    let wasEdited: boolean | null = null;
    if (aiDrafted) {
      // Compare templates, token-level, so substitutions don't pollute
      // the signal. The personalized originalDraft we save is for
      // future diff/similarity work.
      wasEdited = computeWasEdited(originalAiTemplate!, template);
      originalDraft = personalize(originalAiTemplate!, lead);
    }

    const { error: msgError } = await supabase.from("cp_lead_messages").insert({
      lead_id: lead.id,
      coach_id: coachId,
      channel: "email",
      direction: "outbound",
      content,
      ai_drafted: aiDrafted,
      original_draft: originalDraft,
      was_edited: wasEdited,
      purpose: inferLeadPurpose(lead),
      sent_at: new Date().toISOString(),
    });
    if (msgError) {
      setLogging(null);
      setError(msgError.message);
      return;
    }
    // Update last_contact_at and bump status if still "new"
    const patch: Record<string, unknown> = {
      last_contact_at: new Date().toISOString(),
    };
    if (lead.status === "new") patch.status = "contacted";
    await supabase.from("cp_leads").update(patch).eq("id", lead.id);

    setSentIds((prev) => new Set(prev).add(lead.id));
    setLogging(null);
  }

  async function logAllAsSent() {
    if (matched.length === 0 || !template.trim()) return;
    const remaining = matched.filter((l) => !sentIds.has(l.id));
    if (remaining.length === 0) return;
    const ok = await askConfirm({
      title:        `Log ${remaining.length} message${remaining.length === 1 ? "" : "s"} as sent?`,
      description:  `You'll still need to send ${remaining.length === 1 ? "it" : "them"} from your inbox or DM. This just records them in the lead history so the rescue queue knows the conversation moved.`,
      confirmLabel: "Log as sent",
    });
    if (!ok) return;

    for (const lead of remaining) {
      await logAsSent(lead);
    }
    router.refresh();
  }

  const anyFilter =
    painFilter.length > 0 ||
    tempFilter.length > 0 ||
    statusFilter.length > 0 ||
    actionFilter.length > 0 ||
    discoveryFilter !== "any" ||
    idPin.length > 0;

  const previewLead = preview ? matched.find((l) => l.id === preview) ?? matched[0] : matched[0];
  const rescueMode = idPin.length > 0 && (seedSource === "start-here" || seedSource === "rescue");
  const segmentLabel = rescueMode
    ? seedSource === "rescue"
      ? "Lead Rescue"
      : "Start here"
    : idPin.length > 0
    ? "Pinned leads"
    : "Segment";
  const segmentIntent = rescueMode
    ? inferSegmentIntent(matched)
    : null;
  const unsentCount = matched.filter((lead) => !sentIds.has(lead.id)).length;
  const pipelineValue = matched.reduce((acc, lead) => acc + (lead.deal_value ?? 0), 0);
  const actionTitle = rescueMode ? segmentLabel : "Compose";
  const actionDescription = rescueMode
    ? "One selected set. One honest message. Log it, then move on."
    : "Build a focused slice of your book, then draft one message in your voice.";

  return (
    <div className="space-y-5">
      {ErrorBanner}
      {ConfirmDialog}
      <section className="rounded-[var(--r-lg)] bg-[var(--navy)] text-[color:var(--text-inverse)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--brand)]">
              {rescueMode ? "Action set" : "Message studio"}
            </div>
            <h2 className="text-2xl font-bold tracking-tight mt-1 leading-[var(--leading-tight)]">
              {actionTitle}
            </h2>
            <p className="text-[length:var(--t-caption)] text-white/65 mt-2 max-w-xl leading-[var(--leading-base)]">
              {actionDescription}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-right">
            <Metric label="matched" value={String(matched.length)} />
            <Metric label="unsent" value={String(unsentCount)} />
            <Metric label="pipeline" value={pipelineValue > 0 ? formatMoney(pipelineValue) : "live"} />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_340px] gap-5">
      {/* Left: filter builder */}
      <aside className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 h-fit lg:sticky lg:top-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[length:var(--t-h2)]">
            {rescueMode ? "Selected leads" : "Segment"}
          </h2>
          {anyFilter && (
            <button
              onClick={clearFilters}
              className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] underline decoration-dotted underline-offset-4"
            >
              Clear
            </button>
          )}
        </div>

        {idPin.length > 0 && (
          <div
            className="mb-4 p-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[var(--brand-soft)] text-[length:var(--t-caption)] flex items-center gap-2"
          >
            <span
              className="px-1.5 py-0.5 rounded-[var(--r-sm)] bg-[var(--navy)] text-[color:var(--brand)] font-extrabold text-[10px]"
            >
              {rescueMode ? "ACTION" : "PINNED"}
            </span>
            <span className="flex-1 text-[color:var(--text)]">
              {segmentLabel}: <strong>{idPin.length}</strong>{" "}
              {idPin.length === 1 ? "lead" : "leads"}
            </span>
            <button
              onClick={() => setIdPin([])}
              className="text-[10px] font-bold underline decoration-dotted underline-offset-2 text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
            >
              unpin
            </button>
          </div>
        )}

        <FilterGroup label="Warmth">
          <div className="flex flex-wrap gap-1.5">
            {LEAD_TEMPERATURES.map((t) => (
              <Chip
                key={t}
                label={TEMPERATURE_LABEL[t]}
                active={tempFilter.includes(t)}
                onClick={() => toggleTemp(t)}
              />
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Pain signal">
          <div className="flex flex-wrap gap-1.5">
            {PAIN_SIGNALS.map((p) => (
              <Chip
                key={p}
                label={PAIN_SIGNAL_LABEL[p]}
                active={painFilter.includes(p)}
                onClick={() => togglePain(p)}
              />
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Status">
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <Chip
                key={s}
                label={STATUS_LABEL[s]}
                active={statusFilter.includes(s)}
                onClick={() => toggleStatus(s)}
              />
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Next honest action">
          <div className="flex flex-wrap gap-1.5">
            {LEAD_NEXT_ACTIONS.map((a) => (
              <Chip
                key={a}
                label={NEXT_ACTION_LABEL[a]}
                active={actionFilter.includes(a)}
                onClick={() => toggleAction(a)}
              />
            ))}
          </div>
        </FilterGroup>

        <FilterGroup label="Discovery call">
          <div className="flex gap-1.5 text-xs">
            {(["any", "yes", "no"] as DiscoveryFilter[]).map((d) => (
              <button
                key={d}
                onClick={() => setDiscoveryFilter(d)}
                className={`px-3 py-1.5 rounded-full border transition ${
                  discoveryFilter === d
                    ? "bg-navy text-white border-navy font-semibold"
                    : "bg-white text-gray-800 border-gray-300 hover:border-gray-500"
                }`}
              >
                {d === "any" ? "Any" : d === "yes" ? "Completed" : "Not yet"}
              </button>
            ))}
          </div>
        </FilterGroup>

        <div className="mt-5 pt-4 border-t border-[var(--border-faint)]">
          <div className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-bold">Matched</div>
          <div className="text-4xl font-extrabold mt-1 tabular-nums text-[color:var(--text)]">
            {matched.length}
          </div>
          <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            of {leads.length} {leads.length === 1 ? "lead" : "leads"}
          </div>
        </div>
      </aside>

      {/* Middle: draft composer */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 h-fit">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-[length:var(--t-h2)]">Draft</h2>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-0.5">
              {rescueMode
                ? "Write the next message for this set."
                : "Write once. Personalize per lead."}
            </p>
          </div>
          <button
            onClick={generateDraft}
            disabled={matched.length === 0 || drafting}
            className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition disabled:opacity-50"
          >
            {drafting ? "Drafting..." : matched.length === 0 ? "No leads matched" : "AI draft"}
          </button>
        </div>

        {segmentIntent && (
          <div className="mt-4 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_35%,transparent)] bg-[var(--brand-soft)] p-3">
            <div className="text-[length:var(--t-caption)] font-extrabold text-[color:var(--text)]">
              Recommended purpose: {purposeLabel(segmentIntent.purpose)}
            </div>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1 leading-[var(--leading-base)]">
              {segmentIntent.reason}
            </p>
          </div>
        )}

        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder={`Hey [FIRST_NAME],\n\nI've been thinking about what you shared about [PAIN]. One thing I've seen land with men in your spot...`}
          rows={14}
          className="mt-4 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] p-4 text-[length:var(--t-body)] leading-[var(--leading-relaxed)] focus:outline-none focus:border-[var(--brand-strong)]"
        />
        <VoiceFitPanel
          fit={voiceFit}
          onImprove={improveTemplateVoice}
          improving={improvingVoice}
        />

        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <span className="text-[color:var(--text-muted)] mr-1">Tokens:</span>
          {["[FIRST_NAME]", "[FULL_NAME]", "[WARMTH]", "[PAIN]"].map((t) => (
            <button
              key={t}
              onClick={() => setTemplate((prev) => prev + t)}
              className="px-2 py-1 rounded-[var(--r-sm)] bg-[var(--surface-deep)] text-[color:var(--text-muted)] hover:text-[color:var(--text)] font-mono transition"
            >
              {t}
            </button>
          ))}
        </div>

        {/* Preview */}
        {template && previewLead && (
          <div className="mt-4 p-4 rounded-[var(--r-md)] bg-[var(--surface-deep)] border border-[var(--border-faint)]">
            <div className="flex items-center justify-between text-[length:var(--t-caption)] text-[color:var(--text-muted)] mb-2 gap-3">
              <span>Preview for {previewLead.full_name}</span>
              {matched.length > 1 && (
                <select
                  value={previewLead.id}
                  onChange={(e) => setPreview(e.target.value)}
                  className="text-[length:var(--t-caption)] rounded-[var(--r-sm)] border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 font-semibold text-[color:var(--text)]"
                >
                  {matched.slice(0, 20).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.full_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <pre className="text-[length:var(--t-body)] whitespace-pre-wrap font-sans text-[color:var(--text)] leading-[var(--leading-relaxed)]">
              {personalize(template, previewLead)}
            </pre>
          </div>
        )}
      </div>

      {/* Right: matched leads + log buttons */}
      <div className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 h-fit">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-[length:var(--t-h2)]">Recipients</h2>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-0.5">
              {unsentCount} left to log
            </p>
          </div>
          <button
            onClick={logAllAsSent}
            disabled={
              matched.length === 0 ||
              !template.trim() ||
              matched.every((l) => sentIds.has(l.id))
            }
            className="inline-flex items-center justify-center h-10 px-4 rounded-[var(--r-md)] bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-caption)] font-bold hover:bg-[var(--brand-strong)] transition disabled:opacity-50"
          >
            Log all as sent
          </button>
        </div>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-3 leading-[var(--leading-base)]">
          Resend isn&apos;t wired yet, this logs each personalized message to the
          lead&apos;s thread and bumps last-contact. You still send from your actual
          inbox or DM.
        </p>

        {matched.length === 0 ? (
          <div className="mt-5 p-6 text-center text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            Pick filters on the left to see recipients.
          </div>
        ) : (
          <div className="mt-4 space-y-1.5 max-h-[480px] overflow-y-auto pr-1">
            {matched.map((lead) => {
              const score = computeLeadScore(lead);
              const tier = scoreTier(score);
              const sent = sentIds.has(lead.id);
              const isLogging = logging === lead.id;
              const purpose = inferLeadPurpose(lead);
              return (
                <div
                  key={lead.id}
                  className={`flex items-center gap-2 p-2.5 rounded-[var(--r-md)] border transition ${
                    sent
                      ? "bg-[var(--brand-soft)] border-[color-mix(in_srgb,var(--brand)_35%,transparent)]"
                      : "bg-[var(--surface-elevated)] border-[var(--border)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <span
                    className={`inline-flex items-center justify-center min-w-[34px] px-1.5 py-0.5 rounded border text-[11px] ${SCORE_TIER_CLASS[tier]}`}
                  >
                    {score}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[length:var(--t-body)] font-bold text-[color:var(--text)] truncate">
                      {lead.full_name}
                    </div>
                    <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] truncate">
                      {purposeLabel(purpose)} | {lead.email ?? "no email"}
                    </div>
                  </div>
                  <button
                    onClick={() => logAsSent(lead)}
                    disabled={!template.trim() || sent || isLogging}
                    className={`text-[11px] px-2 py-1 rounded-[var(--r-sm)] font-bold transition ${
                      sent
                        ? "bg-[var(--brand)] text-[color:var(--navy)]"
                        : "bg-[var(--navy)] text-[color:var(--brand)] hover:opacity-90 disabled:opacity-40"
                    }`}
                  >
                    {sent ? "Logged" : isLogging ? "..." : "Log"}
                  </button>
                  <button
                    onClick={() => setPreview(lead.id)}
                    className="p-1 text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
                    title="Preview this lead's message"
                  >
                    <Eye size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {sentIds.size > 0 && (
          <div className="mt-3 pt-3 border-t border-[var(--border-faint)] text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            <strong>{sentIds.size}</strong> logged this session.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// ---------- helpers ----------

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[78px] rounded-[var(--r-md)] border border-white/10 bg-white/[0.06] px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/45">
        {label}
      </div>
      <div className="mt-1 text-lg font-extrabold tabular-nums text-[color:var(--text-inverse)]">
        {value}
      </div>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
        active
          ? "bg-navy text-white border-navy font-semibold"
          : "bg-white text-gray-800 border-gray-300 hover:border-gray-500"
      }`}
    >
      {label}
    </button>
  );
}

function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function inferLeadPurpose(lead: Lead): MessagePurpose {
  if (lead.status === "new") return "first_response";
  if (lead.temperature === "dormant") return "rewarm";
  if (lead.next_honest_action === "close_loop") return "follow_up";
  if (lead.last_contact_at) {
    const daysSilent =
      (Date.now() - new Date(lead.last_contact_at).getTime()) / 86_400_000;
    if (Number.isFinite(daysSilent) && daysSilent >= 7) return "rewarm";
  }
  return "follow_up";
}

function inferSegmentIntent(leads: Lead[]): { purpose: MessagePurpose; reason: string } | null {
  if (leads.length === 0) return null;
  const counts = leads.reduce(
    (acc, lead) => {
      acc[inferLeadPurpose(lead)] += 1;
      return acc;
    },
    {
      first_response: 0,
      follow_up: 0,
      rewarm: 0,
      ad_hoc: 0,
    } satisfies Record<MessagePurpose, number>
  );
  const purpose = (Object.entries(counts) as Array<[MessagePurpose, number]>)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "follow_up";

  if (purpose === "first_response") {
    return {
      purpose,
      reason: "Most of these leads need a clean first touch. Keep it short, human, and easy to answer.",
    };
  }
  if (purpose === "rewarm") {
    return {
      purpose,
      reason: "Most of these conversations have gone quiet. Break the loop without sounding needy.",
    };
  }
  return {
    purpose,
    reason: "These leads need the next honest message, not a campaign blast.",
  };
}

function purposeLabel(purpose: MessagePurpose): string {
  switch (purpose) {
    case "first_response":
      return "First response";
    case "follow_up":
      return "Follow-up";
    case "rewarm":
      return "Rewarm";
    case "ad_hoc":
    default:
      return "Ad hoc";
  }
}
