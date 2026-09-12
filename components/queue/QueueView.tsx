// components/queue/QueueView.tsx
//
// Client half of the Approval Queue. Renders the decision list and handles
// the three inline actions on a pending first-response draft:
//
//   Mark as sent → flip the draft row to direction='outbound' + sent_at,
//                  push the lead to 'contacted'. Mirrors LeadDetail's
//                  FirstResponseDraftPanel exactly so the two paths can
//                  never drift apart in meaning.
//   Copy         → clipboard only, no state change.
//   Discard      → delete the draft row (two-step confirm, no modal).
//
// Everything else (stalled sequences, content drafts) links to where the
// decision is made. Edits happen in the inline textarea and persist on
// Mark as sent, same as the lead page.

"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import type { QueueItem } from "@/lib/queue";

function ageLabel(ageMs: number): string {
  if (ageMs < 60_000) return "just now";
  if (ageMs < 3_600_000) return `${Math.round(ageMs / 60_000)}m`;
  if (ageMs < 86_400_000) return `${Math.round(ageMs / 3_600_000)}h`;
  return `${Math.round(ageMs / 86_400_000)}d`;
}

const KIND_LABEL: Record<QueueItem["kind"], string> = {
  first_response_draft: "Draft reply",
  failed_enrollment: "Stalled",
  content_draft: "Content",
};

export default function QueueView({ initialItems }: { initialItems: QueueItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [error, setError] = useState<string | null>(null);

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  return (
    <div>
      <div className="flex items-baseline justify-between pb-4">
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-[color:var(--text)]">Queue</h1>
        <span className="text-[13px] font-bold text-[color:var(--text-muted)]">
          {items.length === 0 ? "all clear" : `${items.length} decision${items.length === 1 ? "" : "s"} waiting`}
        </span>
      </div>

      {error && (
        <div className="mb-3 rounded-[var(--r-md)] bg-[var(--danger-soft)] px-4 py-2.5 text-[13px] font-semibold text-[color:var(--danger)]">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] px-5 py-8 text-center">
          <div className="text-[15px] font-bold text-[color:var(--text)]">Nothing needs a decision.</div>
          <div className="pt-1 text-[13px] text-[color:var(--text-muted)]">The machine has the rest. Go coach.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) =>
            item.kind === "first_response_draft" && item.draft ? (
              <DraftCard key={item.id} item={item} draft={item.draft} onDone={() => remove(item.id)} onError={setError} />
            ) : (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] px-[18px] py-3.5 hover:border-[var(--border-strong)] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] rounded-full px-2 py-0.5 bg-[var(--surface-deep)] text-[color:var(--text-muted)]">
                    {KIND_LABEL[item.kind]}
                  </span>
                  <span className="text-[14px] font-bold text-[color:var(--text)] truncate">{item.title}</span>
                  <span className="ml-auto shrink-0 text-[12px] text-[color:var(--text-muted)]">{ageLabel(item.ageMs)}</span>
                </div>
                <div className="pt-1 text-[13px] text-[color:var(--text-muted)] truncate">{item.detail}</div>
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function DraftCard({
  item,
  draft,
  onDone,
  onError,
}: {
  item: QueueItem;
  draft: NonNullable<QueueItem["draft"]>;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const supabase = createClient();
  const [text, setText] = useState(draft.content);
  const [acting, setActing] = useState<null | "send" | "discard">(null);
  const [copied, setCopied] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  async function markAsSent() {
    if (!text.trim() || acting) return;
    setActing("send");
    try {
      const sentAt = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("cp_lead_messages")
        .update({ content: text, direction: "outbound", sent_at: sentAt })
        .eq("id", draft.messageId);
      if (updErr) { onError(updErr.message); return; }
      if (item.leadId) {
        await supabase
          .from("cp_leads")
          .update({ status: "contacted", last_contact_at: sentAt })
          .eq("id", item.leadId);
      }
      onDone();
    } finally {
      setActing(null);
    }
  }

  async function copyText() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      onError("Could not reach the clipboard. Select the text and copy manually.");
    }
  }

  async function discard() {
    if (acting) return;
    if (!confirmingDiscard) { setConfirmingDiscard(true); return; }
    setActing("discard");
    try {
      const { error: delErr } = await supabase
        .from("cp_lead_messages")
        .delete()
        .eq("id", draft.messageId);
      if (delErr) { onError(delErr.message); return; }
      onDone();
    } finally {
      setActing(null);
      setConfirmingDiscard(false);
    }
  }

  return (
    <div className="rounded-[var(--r-lg)] bg-[var(--surface-elevated)] border border-[var(--border-faint)] shadow-[var(--shadow-sm)] overflow-hidden">
      <div className="flex items-center gap-2.5 px-[18px] pt-3.5">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] rounded-full px-2 py-0.5 bg-[var(--brand-soft,var(--surface-deep))] text-[color:var(--brand)]">
          {KIND_LABEL[item.kind]}
        </span>
        <span className="text-[14px] font-bold text-[color:var(--text)] truncate">{item.title}</span>
        <span className="ml-auto shrink-0 text-[12px] text-[color:var(--text-muted)]">waiting {ageLabel(item.ageMs)}</span>
      </div>
      <div className="px-[18px] py-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(8, Math.max(3, text.split("\n").length + 1))}
          className="w-full rounded-[var(--r-md)] border border-[var(--border-faint)] bg-transparent px-3 py-2.5 text-[14px] leading-relaxed text-[color:var(--text)] focus:outline-none focus:border-[var(--brand)]"
        />
      </div>
      <div className="flex items-center gap-2 px-[18px] pb-3.5">
        <button
          onClick={markAsSent}
          disabled={acting !== null || !text.trim()}
          className="rounded-full bg-[var(--brand)] px-4 py-1.5 text-[13px] font-bold text-[color:var(--brand-contrast,#0A0F1C)] disabled:opacity-50"
        >
          {acting === "send" ? "Saving…" : "Mark as sent"}
        </button>
        <button
          onClick={copyText}
          disabled={acting !== null}
          className="rounded-full border border-[var(--border-strong)] px-4 py-1.5 text-[13px] font-bold text-[color:var(--text)] disabled:opacity-50"
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <button
          onClick={discard}
          disabled={acting === "send"}
          className="rounded-full px-4 py-1.5 text-[13px] font-bold text-[color:var(--danger)] disabled:opacity-50"
        >
          {acting === "discard" ? "Discarding…" : confirmingDiscard ? "Confirm discard?" : "Discard"}
        </button>
        {item.leadId && (
          <Link
            href={item.href}
            className="ml-auto text-[13px] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)]"
          >
            Open lead →
          </Link>
        )}
      </div>
    </div>
  );
}
