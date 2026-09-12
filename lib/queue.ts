// lib/queue.ts
//
// The Approval Queue — everything awaiting a coach decision, as one ordered
// list. P0 slice 2 (roadmap/p0-one-surface.md): the second of the two
// moments in the One Surface ("read the brief, clear the queue").
//
// Pure builders only. Pages fetch rows and hand them in; nothing here
// touches the network, so ordering and copy stay pinned by tests.
//
// Ordering rule: pending first-response drafts come first, OLDEST first —
// the whole point of the auto-response engine is speed-to-lead, so the most
// overdue draft is the most urgent decision in the building. Failed
// sequence enrollments next (a promise the machine could not keep). Content
// drafts last (important, never urgent).

export type QueueItemKind =
  | "first_response_draft"
  | "failed_enrollment"
  | "content_draft";

export type QueueItem = {
  /** Stable id: `${kind}:${rowId}` — safe as a React key. */
  id: string;
  kind: QueueItemKind;
  /** One line naming the decision, e.g. "Reply to Marcus". */
  title: string;
  /** Supporting context: draft preview, failure reason, content title. */
  detail: string;
  /** Where the decision gets made when not inline. */
  href: string;
  ageMs: number;
  leadId?: string;
  leadName?: string;
  /** Present only for first_response_draft — enables inline approve. */
  draft?: { messageId: string; content: string };
};

export type QueueInput = {
  now: number;
  pendingDrafts: {
    id: string;
    lead_id: string;
    content: string;
    created_at: string;
    leadName: string | null;
  }[];
  failedEnrollments: {
    id: string;
    lead_id: string;
    created_at: string;
    error: string | null;
    leadName: string | null;
    sequenceName: string | null;
  }[];
  contentDrafts: {
    id: string;
    title: string | null;
    created_at: string;
  }[];
};

const PREVIEW_LEN = 140;

function preview(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= PREVIEW_LEN ? oneLine : `${oneLine.slice(0, PREVIEW_LEN - 1)}…`;
}

function ageOf(now: number, createdAt: string): number {
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) ? Math.max(0, now - t) : 0;
}

export function buildQueue(input: QueueInput): QueueItem[] {
  const drafts: QueueItem[] = input.pendingDrafts
    .map((d) => ({
      id: `first_response_draft:${d.id}`,
      kind: "first_response_draft" as const,
      title: d.leadName?.trim() ? `Reply to ${d.leadName.trim()}` : "Reply to a new lead",
      detail: preview(d.content),
      href: `/leads/${d.lead_id}`,
      ageMs: ageOf(input.now, d.created_at),
      leadId: d.lead_id,
      leadName: d.leadName ?? undefined,
      draft: { messageId: d.id, content: d.content },
    }))
    .sort((a, b) => b.ageMs - a.ageMs); // oldest pending draft first

  const failures: QueueItem[] = input.failedEnrollments
    .map((f) => ({
      id: `failed_enrollment:${f.id}`,
      kind: "failed_enrollment" as const,
      title: f.leadName?.trim()
        ? `Sequence stalled for ${f.leadName.trim()}`
        : "A sequence stalled",
      detail: [f.sequenceName?.trim(), f.error?.trim()].filter(Boolean).join(" · ") ||
        "The machine could not finish this one; it needs a human look.",
      href: `/leads/${f.lead_id}`,
      ageMs: ageOf(input.now, f.created_at),
      leadId: f.lead_id,
      leadName: f.leadName ?? undefined,
    }))
    .sort((a, b) => b.ageMs - a.ageMs);

  const content: QueueItem[] = input.contentDrafts
    .map((c) => ({
      id: `content_draft:${c.id}`,
      kind: "content_draft" as const,
      title: "Content draft ready",
      detail: c.title?.trim() || "Untitled draft",
      href: `/content`,
      ageMs: ageOf(input.now, c.created_at),
    }))
    .sort((a, b) => b.ageMs - a.ageMs);

  return [...drafts, ...failures, ...content];
}

/** The number the Brief and the nav badge share. Counts decisions, not rows
 *  of UI — one item, one decision. */
export function queueCount(items: QueueItem[]): number {
  return items.length;
}
