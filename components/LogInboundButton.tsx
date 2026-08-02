"use client";

// LogInboundButton — the other half of closing the SLA feedback loop.
//
// Until we wire real IG/email ingestion (webhooks, OAuth, etc.), the coach
// manually says "they replied" when it happens. One click → asks for optional
// content and channel → writes a cp_lead_messages row with direction='inbound',
// bumps last_contact_at, and flips status from 'new' to 'contacted' if needed.
//
// The UX is pop-up-on-click (not a modal) — fast, quiet, one tap away. The
// whole point is that logging a reply should take 3 seconds, not 30.

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import VoiceMicInput from "@/components/VoiceMicInput";
import type { Lead, LeadMessage, MessageChannel } from "@/lib/types";

type Props = {
  lead: Lead;
  onLogged: (msg: LeadMessage) => void;
};

const CHANNELS: { id: MessageChannel; label: string }[] = [
  { id: "email", label: "Email" },
  { id: "dm_ig", label: "IG DM" },
  { id: "dm_linkedin", label: "LinkedIn" },
  { id: "sms", label: "Text" },
  { id: "call", label: "Call" },
  { id: "other", label: "Other" },
];

export default function LogInboundButton({ lead, onLogged }: Props) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [channel, setChannel] = useState<MessageChannel>("email");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const supabase = createClient();
    const nowIso = new Date().toISOString();
    const { data: msg, error } = await supabase
      .from("cp_lead_messages")
      .insert({
        lead_id: lead.id,
        coach_id: lead.coach_id,
        channel,
        direction: "inbound",
        content: content.trim() || "(Reply received — no content logged)",
        ai_drafted: false,
        sent_at: nowIso,
      })
      .select()
      .single();

    if (error) {
      setSaving(false);
      alert(error.message);
      return;
    }

    // Reset SLA clock + promote status if still 'new'
    const patch: Record<string, unknown> = { last_contact_at: nowIso };
    if (lead.status === "new") patch.status = "contacted";
    await supabase.from("cp_leads").update(patch).eq("id", lead.id);

    setSaving(false);
    setContent("");
    setOpen(false);
    onLogged(msg as LeadMessage);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-[var(--r-md)] border px-3 py-1.5 text-xs font-bold transition hover:opacity-90"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "#0B6E23",
          color: "#0A0F1C",
        }}
        title="Log that they replied — resets the SLA clock"
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "#0B6E23" }}
        />
        Log reply received
      </button>
    );
  }

  return (
    <div
      className="rounded-[var(--r-lg)] border p-4 mb-4"
      style={{
        backgroundColor: "rgba(11,110,35,0.07)",
        borderColor: "#0B6E23",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-widest text-navy">
            Log inbound reply
          </div>
          <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
            Resets the SLA clock and {lead.status === "new" ? "promotes status → contacted" : "keeps status where it is"}.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            setContent("");
          }}
          disabled={saving}
          className="text-xs text-[color:var(--text-faint)] hover:text-navy"
        >
          Cancel
        </button>
      </div>

      <div className="mb-2">
        <label className="block text-[length:var(--t-eyebrow)] uppercase font-bold tracking-[var(--tracking-eyebrow)] text-[color:var(--text-faint)] mb-1">
          Channel
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              onClick={() => setChannel(c.id)}
              disabled={saving}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition ${
                channel === c.id
                  ? "bg-navy text-white border-navy"
                  : "bg-[var(--surface-elevated)] text-[color:var(--text)] border-[var(--border)] hover:border-[var(--border-strong)]"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          disabled={saving}
          placeholder="What did they say? (optional — leave blank to just log that a reply came in)"
          className="w-full p-2.5 pr-10 border border-[var(--border)] rounded-[var(--r-md)] text-sm"
        />
        <VoiceMicInput
          onTranscript={(t) => setContent((prev) => prev ? prev + " " + t : t)}
          disabled={saving}
          className="absolute top-2 right-2"
        />
      </div>

      <div className="flex justify-end mt-3 gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-[var(--r-md)] px-4 py-2 font-extrabold text-xs transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "#0B6E23", color: "#FAF8F3" }}
        >
          {saving ? "Logging..." : "Log reply →"}
        </button>
      </div>
    </div>
  );
}
