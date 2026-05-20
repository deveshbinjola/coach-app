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
        className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition hover:opacity-90"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "#00FF41",
          color: "#0A0F1C",
        }}
        title="Log that they replied — resets the SLA clock"
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "#00FF41" }}
        />
        Log reply received
      </button>
    );
  }

  return (
    <div
      className="rounded-xl border p-4 mb-4"
      style={{
        backgroundColor: "rgba(0,255,65,0.06)",
        borderColor: "#00FF41",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-extrabold uppercase tracking-widest text-navy">
            Log inbound reply
          </div>
          <p className="text-[11px] text-gray-600 mt-0.5">
            Resets the SLA clock and {lead.status === "new" ? "promotes status → contacted" : "keeps status where it is"}.
          </p>
        </div>
        <button
          onClick={() => {
            setOpen(false);
            setContent("");
          }}
          disabled={saving}
          className="text-xs text-gray-500 hover:text-navy"
        >
          Cancel
        </button>
      </div>

      <div className="mb-2">
        <label className="block text-[10px] uppercase font-bold tracking-wider text-gray-500 mb-1">
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
                  : "bg-white text-gray-800 border-gray-300 hover:border-gray-500"
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
          className="w-full p-2.5 pr-10 border border-gray-300 rounded-lg text-sm"
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
          className="inline-flex items-center gap-1 rounded-lg px-4 py-2 font-extrabold text-xs transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "#00FF41", color: "#0A0F1C" }}
        >
          {saving ? "Logging..." : "Log reply →"}
        </button>
      </div>
    </div>
  );
}
