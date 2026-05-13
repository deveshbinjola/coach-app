"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  NEXT_ACTION_LABEL,
  PAIN_SIGNAL_LABEL,
  TEMPERATURE_LABEL,
  type Lead,
  type LeadMessage,
  type LeadStatus,
  type MessagePurpose,
  type PainSignal,
  type VoiceProfile,
} from "@/lib/types";
import { computeWasEdited, scoreVoiceFit } from "@/lib/voice-trust";
import {
  leadMemoryFromTags,
  leadMemoryTag,
  suggestLeadMemory,
  type LeadMemory,
} from "@/lib/memory";
import SlaBadge from "./SlaBadge";
import RewarmDeck from "./RewarmDeck";
import LogInboundButton from "./LogInboundButton";
import FitCard from "./FitCard";
import ObjectionDeck from "./ObjectionDeck";
import VoiceFitPanel from "./VoiceFitPanel";
import { Badge, Button, Card, Modal, useError } from "@/components/ui";

const STATUSES: LeadStatus[] = ["new", "contacted", "qualified", "booked", "client", "closed_lost"];

type ReferralRef = { id: string; full_name: string; status: string };

export default function LeadDetail({
  lead,
  initialMessages,
  referrer,
  referrals,
  voiceProfileSlug,
}: {
  lead: Lead;
  initialMessages: LeadMessage[];
  // Upstream: who referred this lead in. NULL if not a referral.
  referrer?: ReferralRef | null;
  // Downstream: leads this person has referred to us.
  referrals?: ReferralRef[];
  // Audience-aware voice profile slug. Drives ObjectionDeck variant.
  voiceProfileSlug?: import("@/lib/voice-profiles").VoiceProfileSlug;
}) {
  const router = useRouter();
  // Error banner — replaces the 8 native alert() calls in this component
  // with a styled, dismissible inline banner that matches the brand.
  const { setError, ErrorBanner } = useError();
  const [messages, setMessages] = useState<LeadMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  // Voice Trust Loop: snapshot of the AI's draft text the moment it returned.
  // Compared against the final `draft` at send-time to compute was_edited.
  // Reset when the coach manually clears or the lead changes.
  const [originalAiDraft, setOriginalAiDraft] = useState<string | null>(null);
  const [draftPurpose, setDraftPurpose] = useState<MessagePurpose | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [improvingVoice, setImprovingVoice] = useState(false);
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [clientRoomReady, setClientRoomReady] = useState(lead.status === "client");
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  // Local mirror so FitCard patches (disqualify, income_band, etc.) reflect
  // immediately in downstream surfaces like ObjectionDeck without waiting
  // for router.refresh() to complete.
  const [currentLead, setCurrentLead] = useState<Lead>(lead);

  const supabase = createClient();

  useEffect(() => {
    let alive = true;
    async function loadVoiceProfile() {
      const { data } = await supabase
        .from("cp_voice_profiles")
        .select("*")
        .eq("coach_id", lead.coach_id)
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
  }, [lead.coach_id]);

  const voiceFit = useMemo(
    () => scoreVoiceFit(draft, voiceProfile),
    [draft, voiceProfile]
  );
  const approvedLeadMemory = useMemo(
    () => leadMemoryFromTags(currentLead.tags),
    [currentLead.tags]
  );
  const suggestedLeadMemory = useMemo(
    () => suggestLeadMemory(currentLead, messages),
    [currentLead, messages]
  );

  async function quickDelete() {
    setDeleting(true);
    const { error } = await supabase.from("cp_leads").delete().eq("id", lead.id);
    setDeleting(false);
    if (error) {
      // eslint-disable-next-line no-alert
      setError(error.message);
      return;
    }
    setConfirmDeleteOpen(false);
    router.push("/inbox");
    router.refresh();
  }

  async function generateDraft() {
    setDrafting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const purpose = inferLeadPurpose(currentLead, messages);
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/draft-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.session?.access_token}`,
          },
          body: JSON.stringify({ lead_id: lead.id, purpose }),
        }
      );
      const json = await res.json();
      if (json.draft) {
        setDraft(json.draft);
        // Snapshot the original — this is what we compare against at send
        // time to know if the coach edited or sent as-is. The Trust Loop
        // depends on this number being honest.
        setOriginalAiDraft(json.draft);
        setDraftPurpose((json.purpose as MessagePurpose | undefined) ?? purpose);
      } else setError(`Draft failed: ${json.error ?? "unknown"}`);
    } finally {
      setDrafting(false);
    }
  }

  async function improveDraftVoice() {
    if (!draft.trim()) return;
    setImprovingVoice(true);
    try {
      const res = await fetch("/api/voice/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft }),
      });
      const json = await res.json();
      if (!res.ok || !json.draft) {
        setError(`Voice tune failed: ${json.error ?? "unknown"}`);
        return;
      }
      setDraft(json.draft);
    } finally {
      setImprovingVoice(false);
    }
  }

  async function sendMessage() {
    if (!draft.trim()) return;
    setSending(true);

    // Voice Trust Loop bookkeeping. Three cases:
    //   - There's a snapshot AND it's an AI draft → was_edited = compare()
    //   - No snapshot → coach typed from scratch, ai_drafted=false
    //   - Snapshot exists but coach blew it away to write fresh → still
    //     counts as ai_drafted=true with was_edited=true (they used the
    //     scaffold to start; a heavy rewrite is still a partial trust signal)
    const aiDrafted = originalAiDraft !== null;
    const wasEdited = aiDrafted
      ? computeWasEdited(originalAiDraft!, draft)
      : null;

    const { data, error } = await supabase
      .from("cp_lead_messages")
      .insert({
        lead_id: lead.id,
        coach_id: lead.coach_id,
        channel: "email",
        direction: "outbound",
        content: draft,
        ai_drafted: aiDrafted,
        original_draft: aiDrafted ? originalAiDraft : null,
        was_edited: wasEdited,
        purpose: draftPurpose ?? inferLeadPurpose(currentLead, messages),
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();
    setSending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessages([...messages, data as LeadMessage]);
    setDraft("");
    setOriginalAiDraft(null);
    setDraftPurpose(null);
    await supabase
      .from("cp_leads")
      .update({ last_contact_at: new Date().toISOString(), status: "contacted" })
      .eq("id", lead.id);
  }

  async function changeStatus(newStatus: LeadStatus) {
    setStatus(newStatus);
    const { data, error } = await supabase
      .from("cp_leads")
      .update({ status: newStatus })
      .eq("id", lead.id)
      .select()
      .single();
    if (error) {
      setError(error.message);
      setStatus(currentLead.status);
      return;
    }
    setCurrentLead((data as Lead | null) ?? { ...currentLead, status: newStatus });
    if (newStatus === "client") {
      await ensureClientRoom();
    }
  }

  async function ensureClientRoom() {
    const { error } = await supabase
      .from("cp_client_rooms")
      .upsert(
        {
          coach_id: lead.coach_id,
          lead_id: lead.id,
          program_name: "Coaching container",
          current_focus: currentLead.fit_notes || currentLead.notes || "Create the first-session plan.",
        },
        { onConflict: "coach_id,lead_id", ignoreDuplicates: true }
      );
    if (error) {
      setError(error.message);
      return;
    }
    setClientRoomReady(true);
    router.refresh();
  }

  async function approveLeadMemory(memory: LeadMemory) {
    const tag = leadMemoryTag(memory.text);
    const nextTags = Array.from(new Set([...(currentLead.tags ?? []), tag]));
    const { data, error } = await supabase
      .from("cp_leads")
      .update({ tags: nextTags })
      .eq("id", currentLead.id)
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setCurrentLead((data as Lead | null) ?? { ...currentLead, tags: nextTags });
  }

  return (
    <div className="space-y-4">
      {ErrorBanner}
      <div className="grid md:grid-cols-3 gap-6">
      {/* ── Confirm-delete modal ─────────────────────────────────────── */}
      <Modal
        open={confirmDeleteOpen}
        onClose={() => !deleting && setConfirmDeleteOpen(false)}
        title={`Delete ${lead.full_name}?`}
        description="This removes the lead and the full message history. It can't be undone."
      >
        <div className="flex gap-2 justify-end mt-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={() => setConfirmDeleteOpen(false)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={quickDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>

      <aside className="rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--surface-elevated)] p-5 h-fit">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[length:var(--t-h2)] font-bold text-[color:var(--text)] leading-[var(--leading-tight)] min-w-0 break-words">
            {lead.full_name}
          </h2>
          <a
            href={`/leads/${lead.id}/edit`}
            className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] hover:underline whitespace-nowrap"
          >
            Edit
          </a>
        </div>
        <div className="mt-2">
          <SlaBadge lead={lead} />
        </div>
        {lead.email && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2 break-all">
            {lead.email}
          </p>
        )}
        {lead.phone && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            {lead.phone}
          </p>
        )}

        <div className="mt-4 space-y-3 text-sm">
          <div>
            <label className="block text-xs uppercase font-semibold text-gray-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => changeStatus(e.target.value as LeadStatus)}
              className="w-full p-2 border border-gray-300 rounded-lg"
            >
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {status === "client" && (
            <a
              href="/clients"
              className="inline-flex min-h-10 w-full items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-3 text-[length:var(--t-caption)] font-extrabold text-[color:var(--navy)] transition hover:bg-[var(--brand-strong)]"
            >
              {clientRoomReady ? "Open client room" : "Create client room"}
            </a>
          )}
          <div>
            <span className="text-xs uppercase font-semibold text-gray-500">Warmth</span>
            <p className="font-semibold">{TEMPERATURE_LABEL[lead.temperature] ?? lead.temperature}</p>
          </div>
          {lead.next_honest_action && (
            <div>
              <span className="text-xs uppercase font-semibold text-gray-500">Next Honest Action</span>
              <p className="font-semibold">{NEXT_ACTION_LABEL[lead.next_honest_action]}</p>
            </div>
          )}
          {lead.pain_signal?.length > 0 && (
            <div>
              <span className="text-xs uppercase font-semibold text-gray-500">Pain Signal</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {lead.pain_signal.map((p) => (
                  <span
                    key={p}
                    className="text-[11px] bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded"
                  >
                    {PAIN_SIGNAL_LABEL[p as PainSignal] ?? p}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <span className="text-xs uppercase font-semibold text-gray-500">Discovery Call</span>
            <p className={`font-semibold ${lead.discovery_call_completed ? "text-green-700" : "text-gray-500"}`}>
              {lead.discovery_call_completed ? "✓ Completed" : "Not yet"}
            </p>
          </div>
          <div>
            <span className="text-xs uppercase font-semibold text-gray-500">Source</span>
            <p>{lead.source}</p>
            {lead.source_detail && (
              <p className="text-xs text-gray-600 italic mt-0.5">{lead.source_detail}</p>
            )}
          </div>

          {/* Referral chain — upstream: who sent them. */}
          {referrer && (
            <div>
              <span className="text-xs uppercase font-semibold text-gray-500">Referred by</span>
              <a
                href={`/leads/${referrer.id}`}
                className="block font-semibold hover:underline"
                style={{ color: "#00A12E" }}
              >
                {referrer.full_name}
                {referrer.status === "client" && (
                  <span className="ml-1.5 text-[10px] font-bold uppercase text-amber-700">★ client</span>
                )}
              </a>
            </div>
          )}

          {/* Referral chain — downstream: who this lead has sent to us.
              Shown only if this lead has referred at least one person. Acts
              as a trust signal + prompt for the coach to ask for more intros. */}
          {referrals && referrals.length > 0 && (
            <div>
              <span className="text-xs uppercase font-semibold text-gray-500">
                Referrals from {lead.full_name.split(" ")[0]} ({referrals.length})
              </span>
              <div className="mt-1 space-y-0.5">
                {referrals.map((r) => (
                  <a
                    key={r.id}
                    href={`/leads/${r.id}`}
                    className="block text-sm hover:underline"
                    style={{ color: "#00A12E" }}
                  >
                    → {r.full_name}
                    <span className="ml-1 text-[11px] text-gray-500">({r.status})</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {(currentLead.tags ?? []).filter((tag) => !tag.startsWith("memory:")).length > 0 && (
            <div>
              <span className="text-xs uppercase font-semibold text-gray-500">Tags</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {(currentLead.tags ?? [])
                  .filter((tag) => !tag.startsWith("memory:"))
                  .map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            </div>
          )}
          {lead.notes && (
            <div>
              <span className="text-xs uppercase font-semibold text-gray-500">Notes</span>
              <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
            </div>
          )}
        </div>

        {/* P4: Fit assessment — "should we even be having this conversation?"
            Separate card below the info block so the qualification surface
            feels distinct from the descriptive fields above it. */}
        <div className="mt-4">
          <FitCard
            lead={currentLead}
            onChange={(patch) => {
              setCurrentLead((prev) => ({ ...prev, ...patch }));
              if (patch.status) setStatus(patch.status);
              router.refresh();
            }}
          />
        </div>

        <div className="mt-4">
          <LeadMemoryCard
            approved={approvedLeadMemory}
            suggestions={suggestedLeadMemory}
            onApprove={approveLeadMemory}
          />
        </div>

        <div className="mt-5 pt-4 border-t border-[var(--border-faint)] flex gap-2">
          <a
            href={`/leads/${lead.id}/edit`}
            className="flex-1 inline-flex items-center justify-center h-9 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[color:var(--text)] text-[length:var(--t-caption)] font-bold hover:border-[var(--border-strong)] transition"
          >
            Edit
          </a>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deleting}
            className="flex-1"
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </aside>

      <section className="md:col-span-2 space-y-6">
        {/* Phase 7: Auto-Response Engine first-touch draft, surfaced at the
            very top so it's the first thing the coach sees on a fresh lead.
            Renders only when the engine has produced a pending draft. */}
        <FirstResponseDraftPanel
          lead={currentLead}
          messages={messages}
          onMessagesChange={setMessages}
          onLeadChange={setCurrentLead}
        />

        {/* P2: Re-warm suggestions — only renders when SLA is warning/overdue */}
        <RewarmDeck lead={currentLead} onUseTemplate={(body) => setDraft(body)} />

        {/* P4: Rehearsed reframes for common objections. Always renders — the
            coach benefits from seeing patterns ranked for this lead even
            before an objection surfaces, as prep. */}
        <ObjectionDeck lead={currentLead} onUseTemplate={(body) => setDraft(body)} voiceProfileSlug={voiceProfileSlug} />

        <Card padding="md" className="border-[color-mix(in_srgb,var(--brand)_22%,var(--border))]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="max-w-xl">
              <div className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                Market signal
              </div>
              <h3 className="mt-1 text-[length:var(--t-h3)] font-bold text-[color:var(--text)]">
                Turn this lead into content.
              </h3>
              <p className="mt-1 text-[length:var(--t-caption)] leading-[var(--leading-base)] text-[color:var(--text-muted)]">
                Use their objection, pain signal, and notes as the seed for an Instagram post, LinkedIn post, newsletter, or carousel.
              </p>
            </div>
            <a
              href={`/content?lead=${lead.id}`}
              className="inline-flex min-h-10 items-center justify-center rounded-[var(--r-md)] bg-[var(--brand)] px-4 text-[length:var(--t-caption)] font-extrabold text-[color:var(--navy)] transition hover:bg-[var(--brand-strong)]"
            >
              Create content
            </a>
          </div>
        </Card>

        {/* P2: Quick inbound-reply logger — resets the SLA clock */}
        <div className="flex items-center justify-end">
          <LogInboundButton
            lead={lead}
            onLogged={(msg) => {
              setMessages((prev) => [...prev, msg]);
              // Local hint — router.refresh() will re-read lead row with fresh
              // last_contact_at and status; SLA badges recompute from new data.
              router.refresh();
            }}
          />
        </div>

        <Card padding="md">
          <h3 className="text-[length:var(--t-h3)] font-bold text-[color:var(--text)] mb-4">
            Conversation
          </h3>
          {messages.length === 0 && (
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              No messages yet. Draft your first below.
            </p>
          )}
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`p-3 rounded-[var(--r-md)] text-[length:var(--t-body)] leading-[var(--leading-base)] ${
                  m.direction === "outbound"
                    ? "bg-[var(--navy)] text-[color:var(--text-inverse)] ml-12"
                    : "bg-[var(--surface-deep)] text-[color:var(--text)] mr-12"
                }`}
              >
                <div
                  className={`flex justify-between text-[length:var(--t-caption)] font-bold mb-1 ${
                    m.direction === "outbound"
                      ? "text-[color:var(--text-faint)]"
                      : "text-[color:var(--text-muted)]"
                  }`}
                >
                  <span className="flex items-center gap-2 flex-wrap">
                    <span>
                      {m.channel} · {m.direction}
                    </span>
                    {/* Voice Trust per-message badge. Three states:
                        - AI + sent as-is  → "Sent in your voice" (brand)
                        - AI + edited      → "Edited"             (muted)
                        - AI but pre-Trust → "AI"                 (muted, fallback)
                        - Not AI           → nothing
                        Inline so the conversation reads naturally; coach
                        gets daily reinforcement of trust without leaving
                        the lead. */}
                    {m.ai_drafted && m.was_edited === false && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[var(--brand)] text-[color:var(--navy)] text-[length:var(--t-label)] uppercase tracking-widest font-extrabold"
                        title="Sent without editing the AI draft"
                      >
                        ✓ In your voice
                      </span>
                    )}
                    {m.ai_drafted && m.was_edited === true && (
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[color-mix(in_srgb,currentColor_15%,transparent)] text-[length:var(--t-label)] uppercase tracking-widest font-bold"
                        title="You edited the AI draft before sending"
                      >
                        Edited
                      </span>
                    )}
                    {m.ai_drafted && m.was_edited === null && (
                      <span className="text-[length:var(--t-label)] uppercase tracking-widest font-bold opacity-70">
                        AI
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="text-[length:var(--t-h3)] font-bold text-[color:var(--text)]">
              Compose
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={generateDraft}
              disabled={drafting}
            >
              {drafting ? "Drafting…" : "AI Draft (in your voice)"}
            </Button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            className="w-full p-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] text-[color:var(--text)] leading-[var(--leading-base)] focus:outline-none focus:border-[var(--brand-strong)]"
            placeholder="Click 'AI Draft' to generate, or write from scratch..."
          />
          <VoiceFitPanel
            fit={voiceFit}
            onImprove={improveDraftVoice}
            improving={improvingVoice}
          />
          <div className="flex justify-end mt-3">
            <Button onClick={sendMessage} disabled={sending || !draft.trim()}>
              {sending ? "Logging…" : "Mark as Sent"}
            </Button>
          </div>
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2 leading-[var(--leading-base)]">
            v1 logs the message in your CRM. v2 will send via your connected
            channel (email/IG).
          </p>
        </Card>
      </section>
      </div>
    </div>
  );
}

function inferLeadPurpose(lead: Lead, messages: LeadMessage[]): MessagePurpose {
  if (lead.status === "new") return "first_response";
  if (lead.temperature === "dormant") return "rewarm";
  const latestOutbound = [...messages]
    .reverse()
    .find((m) => m.direction === "outbound" && (m.sent_at || m.created_at));
  if (latestOutbound) {
    const iso = latestOutbound.sent_at ?? latestOutbound.created_at;
    const daysSilent = (Date.now() - new Date(iso).getTime()) / 86_400_000;
    if (Number.isFinite(daysSilent) && daysSilent >= 7) return "rewarm";
  }
  return "follow_up";
}

function LeadMemoryCard({
  approved,
  suggestions,
  onApprove,
}: {
  approved: LeadMemory[];
  suggestions: LeadMemory[];
  onApprove: (memory: LeadMemory) => Promise<void>;
}) {
  const [savingId, setSavingId] = useState<string | null>(null);

  async function approve(memory: LeadMemory) {
    setSavingId(memory.id);
    try {
      await onApprove(memory);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Card padding="md" className="border-[color-mix(in_srgb,var(--brand)_24%,var(--border))]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[length:var(--t-label)] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
            Lead memory
          </div>
          <h3 className="text-[length:var(--t-h3)] font-bold text-[color:var(--text)] mt-1">
            What to remember here.
          </h3>
        </div>
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
          {approved.length} saved
        </span>
      </div>

      {approved.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {approved.map((memory) => (
            <span
              key={memory.id}
              className="rounded-full bg-[var(--brand-soft)] px-2.5 py-1 text-[length:var(--t-caption)] font-bold text-[color:var(--text)]"
            >
              {memory.text}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {suggestions.length === 0 ? (
          <p className="rounded-[var(--r-md)] bg-[var(--surface-deep)] p-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            No new lead memory suggestions yet.
          </p>
        ) : (
          suggestions.map((memory) => (
            <div
              key={memory.id}
              className="rounded-[var(--r-md)] border border-[var(--border-faint)] bg-[var(--surface-deep)] p-3"
            >
              <div className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)] leading-[var(--leading-base)]">
                {memory.text}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[color:var(--text-faint)]">
                  Suggested
                </span>
                <Button
                  size="sm"
                  onClick={() => approve(memory)}
                  disabled={savingId === memory.id}
                  className="bg-[var(--navy)] text-[color:var(--brand)] uppercase tracking-wider hover:enabled:bg-[var(--navy-soft)]"
                >
                  {savingId === memory.id ? "Saving..." : "Approve"}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

// ---------- Phase 7: First-Response Draft Panel ----------

/** Renders the Auto-Response Engine's first-touch draft as the prominent
 *  top panel of the lead page. Only shows when there's a pending draft
 *  with purpose='first_response' and direction='draft'. Three actions:
 *
 *    Mark as sent → flip the draft row to direction='outbound', set
 *                   sent_at, update lead.status='contacted' and
 *                   lead.last_contact_at. Use this AFTER you've actually
 *                   pasted into Gmail/IG/wherever and sent the message.
 *
 *    Copy        → put the (possibly edited) text on the clipboard. No
 *                   state change. Coach can mark sent separately.
 *
 *    Discard     → delete the draft row entirely. Lead stays in 'new'
 *                   for manual handling via the regular Compose flow below.
 *
 *  Edits to the textarea persist via an explicit save on send/copy.
 */
function FirstResponseDraftPanel({
  lead,
  messages,
  onMessagesChange,
  onLeadChange,
}: {
  lead: Lead;
  messages: LeadMessage[];
  onMessagesChange: (msgs: LeadMessage[]) => void;
  onLeadChange: (lead: Lead) => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  // Three alert() sites in this panel (update / clipboard copy / delete-draft
  // failure) all share one inline error banner via useError.
  const { setError, ErrorBanner } = useError();

  // Find the pending first-response draft. There can only be one because
  // of the uq_first_response_per_lead unique partial index.
  const draftMsg = useMemo(
    () =>
      messages.find(
        (m) => m.purpose === "first_response" && m.direction === "draft"
      ) ?? null,
    [messages]
  );

  const [text, setText] = useState(draftMsg?.content ?? "");
  const [acting, setActing] = useState<null | "send" | "copy" | "discard">(null);
  const [copied, setCopied] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Early return — keeps everything below this line non-null without TS having
  // to chase the narrowing through async handlers.
  if (!draftMsg) return null;

  // Locked-in non-null reference so the handlers below close over a definite
  // LeadMessage (TS can't narrow useMemo results across handler closures).
  const msg = draftMsg;

  const ageMs = Date.now() - new Date(msg.created_at).getTime();
  const ageLabel = ageMs < 60_000
    ? "just now"
    : ageMs < 3_600_000
      ? `${Math.round(ageMs / 60_000)}m ago`
      : `${Math.round(ageMs / 3_600_000)}h ago`;

  async function markAsSent() {
    if (!text.trim()) return;
    setActing("send");
    try {
      const sentAt = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("cp_lead_messages")
        .update({
          content: text,
          direction: "outbound",
          sent_at: sentAt,
        })
        .eq("id", msg.id);
      if (updErr) {
        setError(updErr.message);
        return;
      }
      // Mirror locally so we don't need a full router.refresh().
      onMessagesChange(
        messages.map((m) =>
          m.id === msg.id
            ? { ...m, content: text, direction: "outbound", sent_at: sentAt }
            : m
        )
      );

      // Lead gets pushed to 'contacted' + last_contact_at updated.
      const { data: updatedLead } = await supabase
        .from("cp_leads")
        .update({
          status: "contacted",
          last_contact_at: sentAt,
        })
        .eq("id", lead.id)
        .select()
        .single();
      if (updatedLead) onLeadChange(updatedLead as Lead);

      router.refresh();
    } finally {
      setActing(null);
    }
  }

  async function copyToClipboard() {
    setActing("copy");
    try {
      await navigator.clipboard.writeText(text);
      // Persist the (possibly edited) text so the next visit sees the latest.
      if (text !== msg.content) {
        await supabase
          .from("cp_lead_messages")
          .update({ content: text })
          .eq("id", msg.id);
        onMessagesChange(
          messages.map((m) =>
            m.id === msg.id ? { ...m, content: text } : m
          )
        );
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError("Could not copy to clipboard. Select the text and copy manually.");
    } finally {
      setActing(null);
    }
  }

  async function discard() {
    setActing("discard");
    try {
      const { error: delErr } = await supabase
        .from("cp_lead_messages")
        .delete()
        .eq("id", msg.id);
      if (delErr) {
        // eslint-disable-next-line no-alert
        setError(delErr.message);
        return;
      }
      onMessagesChange(messages.filter((m) => m.id !== msg.id));
      setConfirmDiscardOpen(false);
      router.refresh();
    } finally {
      setActing(null);
    }
  }

  const dirty = text !== msg.content;

  return (
    <>
      {ErrorBanner}
      {/* ── Confirm-discard modal ────────────────────────────────────── */}
      <Modal
        open={confirmDiscardOpen}
        onClose={() => acting !== "discard" && setConfirmDiscardOpen(false)}
        title="Discard this draft?"
        description="You can write a new one from scratch below. The original prompt won't be re-run automatically."
      >
        <div className="flex gap-2 justify-end mt-2 flex-wrap">
          <Button
            variant="ghost"
            onClick={() => setConfirmDiscardOpen(false)}
            disabled={acting === "discard"}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={discard}
            disabled={acting === "discard"}
          >
            {acting === "discard" ? "Discarding…" : "Discard"}
          </Button>
        </div>
      </Modal>

      {/* ── AI hero panel ────────────────────────────────────────────── */}
      <Card
        variant="elevated"
        padding="md"
        className="border-2 border-[var(--brand)] bg-[var(--brand-soft)]"
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div>
            <Badge tone="brand" size="xs" uppercase>
              AI-drafted first response
            </Badge>
            <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-1.5">
              Generated {ageLabel} in your voice ·{" "}
              {msg.channel.replace("_", " ")} · review and send
            </div>
          </div>
          {dirty && (
            <Badge tone="warning" size="xs" uppercase>
              edited
            </Badge>
          )}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.max(5, Math.min(12, text.split("\n").length + 2))}
          className="w-full p-3 rounded-[var(--r-md)] border border-[color-mix(in_srgb,var(--brand)_40%,transparent)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] text-[color:var(--text)] leading-[var(--leading-relaxed)] focus:outline-none focus:border-[var(--brand-strong)]"
        />

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <Button
            onClick={markAsSent}
            disabled={acting !== null || !text.trim()}
          >
            {acting === "send" ? "Marking…" : "✓ Mark as sent"}
          </Button>
          <Button
            variant="ghost"
            onClick={copyToClipboard}
            disabled={acting !== null}
          >
            {acting === "copy" ? "Copying…" : copied ? "Copied!" : "Copy"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDiscardOpen(true)}
            disabled={acting !== null}
            className="ml-auto border-0 hover:enabled:text-[#B42318]"
          >
            {acting === "discard" ? "Discarding…" : "Discard"}
          </Button>
        </div>

        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2 leading-[var(--leading-base)]">
          Mark as sent <em>after</em> you've pasted this into Gmail / IG /
          wherever you actually send. Once Gmail integration ships, "Mark as
          sent" becomes "Send via Gmail" — one click.
        </p>
      </Card>
    </>
  );
}
