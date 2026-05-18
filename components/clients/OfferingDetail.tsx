"use client";

// OfferingDetail — roster + referral chains + add member, for one offering.
//
// Server component (page.tsx) prepares the joined data and passes it down;
// this client component handles writes (add / change role / change status /
// remove) via Supabase browser client (RLS-scoped).

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Badge, Button, Card } from "@/components/ui";
import {
  OFFERING_MEMBER_ROLES,
  OFFERING_MEMBER_ROLE_LABEL,
  OFFERING_MEMBER_STATUSES,
  OFFERING_MEMBER_STATUS_LABEL,
  type OfferingMemberRole,
  type OfferingMemberStatus,
  type ClientPaymentStatus,
} from "@/lib/types";

export type RosterRow = {
  offering_id: string;
  client_room_id: string;
  role: OfferingMemberRole;
  status: OfferingMemberStatus;
  joined_at: string;
  notes: string | null;
  // Joined-in display fields
  name: string;
  email: string | null;
  program_name: string | null;
  payment_status: ClientPaymentStatus;
  current_focus: string | null;
  referred_by: string | null;
};

export type EligibleRoom = {
  client_room_id: string;
  name: string;
  email: string | null;
  program_name: string;
};

type Props = {
  offeringId: string;
  roster: RosterRow[];
  eligible: EligibleRoom[];
  stripeReady: boolean;
  hasPriceCents: boolean;
  existingPaymentLink: string | null;
};

export default function OfferingDetail({ offeringId, roster, eligible, stripeReady, hasPriceCents, existingPaymentLink }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<string>("");

  // Group roster by status for visual scanning. Active first.
  const grouped = useMemo(() => {
    const order: OfferingMemberStatus[] = ["active", "paused", "completed", "dropped"];
    return order.map((s) => ({
      status: s,
      rows: roster.filter((r) => r.status === s),
    }));
  }, [roster]);

  // Referral chains — for each member, follow .referred_by upward through
  // members until we hit a dead end. Surfaces "Marcus → Sarah → Tom".
  const chains = useMemo(() => buildReferralChains(roster), [roster]);

  async function addMember() {
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("cp_offering_members")
        .insert({ offering_id: offeringId, client_room_id: picked });
      if (error) throw new Error(error.message);
      setPicked("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add member.");
    } finally {
      setBusy(false);
    }
  }

  async function updateMember(roomId: string, patch: { role?: OfferingMemberRole; status?: OfferingMemberStatus }) {
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("cp_offering_members")
        .update(patch)
        .eq("offering_id", offeringId)
        .eq("client_room_id", roomId);
      if (error) throw new Error(error.message);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not update.");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(roomId: string) {
    if (!confirm("Remove this member from the offering? Their client room stays — only the membership is removed.")) return;
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("cp_offering_members")
        .delete()
        .eq("offering_id", offeringId)
        .eq("client_room_id", roomId);
      if (error) throw new Error(error.message);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {err && (
        <div className="rounded-[var(--r-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[length:var(--t-caption)] font-bold text-[color:var(--danger)]">
          {err}
        </div>
      )}

      {/* Payment link */}
      <PaymentLinkSection
        offeringId={offeringId}
        stripeReady={stripeReady}
        hasPriceCents={hasPriceCents}
        existingLink={existingPaymentLink}
      />

      {/* Roster */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-3 sm:px-5 border-b border-[var(--border-faint)] flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">Roster</h2>
            <p className="mt-0.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Every member, with their role, status, and who referred them.
            </p>
          </div>
          <Badge tone="muted" size="xs" uppercase>
            {roster.length} total
          </Badge>
        </div>

        {roster.length === 0 ? (
          <p className="p-8 text-center text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            No members yet. Add the first one below.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-faint)]">
            {grouped.map((g) =>
              g.rows.length === 0 ? null : (
                <div key={g.status}>
                  <p className="px-4 sm:px-5 pt-3 pb-1 text-[length:var(--t-label)] uppercase tracking-wider font-bold text-[color:var(--text-faint)]">
                    {OFFERING_MEMBER_STATUS_LABEL[g.status]}
                  </p>
                  {g.rows.map((r) => (
                    <MemberRow
                      key={r.client_room_id}
                      row={r}
                      onRoleChange={(role) => updateMember(r.client_room_id, { role })}
                      onStatusChange={(status) => updateMember(r.client_room_id, { status })}
                      onRemove={() => removeMember(r.client_room_id)}
                      disabled={busy}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </Card>

      {/* Add member */}
      {eligible.length > 0 ? (
        <Card className="p-5 space-y-3">
          <div>
            <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">Add a member</h2>
            <p className="mt-0.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Pull an existing client into this offering. They can be in multiple offerings at once.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="flex-1 h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface-elevated)] text-[length:var(--t-body)] focus:border-[var(--brand-strong)] focus:outline-none"
            >
              <option value="">— pick a client —</option>
              {eligible.map((e) => (
                <option key={e.client_room_id} value={e.client_room_id}>
                  {e.name}{e.email ? ` · ${e.email}` : ""} — {e.program_name}
                </option>
              ))}
            </select>
            <Button onClick={addMember} disabled={busy || !picked}>Add</Button>
          </div>
        </Card>
      ) : roster.length > 0 ? (
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] italic">
          Every client you have is already in this offering. New clients (status = client) appear here automatically.
        </p>
      ) : null}

      {/* Referral chains */}
      {chains.length > 0 && (
        <Card className="p-5 space-y-3">
          <div>
            <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">Referral chains</h2>
            <p className="mt-0.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              Who came from whom — based on each lead&apos;s referrer.
            </p>
          </div>
          <ul className="space-y-1">
            {chains.map((chain, i) => (
              <li key={i} className="text-[length:var(--t-body)] text-[color:var(--text)] font-mono">
                {chain.join("  →  ")}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function PaymentLinkSection({
  offeringId, stripeReady, hasPriceCents, existingLink,
}: {
  offeringId: string;
  stripeReady: boolean;
  hasPriceCents: boolean;
  existingLink: string | null;
}) {
  const router = useRouter();
  const [linkUrl, setLinkUrl] = useState<string | null>(existingLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!stripeReady) {
    return (
      <Card className="p-5">
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          <a href="/settings" className="underline text-[color:var(--brand-strong)]">Connect Stripe</a> in Settings to generate payment links for this offering.
        </p>
      </Card>
    );
  }

  if (!hasPriceCents) {
    return (
      <Card className="p-5">
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          Set a price on this offering to generate a payment link.
        </p>
      </Card>
    );
  }

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offering_id: offeringId }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "Failed to create payment link.");
        return;
      }
      setLinkUrl(json.url);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (linkUrl) {
    return (
      <Card className="p-5 space-y-3">
        <div>
          <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">Payment link</h2>
          <p className="mt-0.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            Share this link with clients. When they pay, they are auto-enrolled.
          </p>
        </div>
        <div className="flex gap-2 items-center">
          <input
            readOnly
            value={linkUrl}
            className="flex-1 h-10 px-3 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[length:var(--t-caption)] text-[color:var(--text-muted)] font-mono truncate"
          />
          <Button onClick={copyLink}>
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-3">
      <div>
        <h2 className="text-[length:var(--t-h2)] font-extrabold tracking-tight text-[color:var(--text)]">Payment link</h2>
        <p className="mt-0.5 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          Generate a Stripe payment link for this offering. Clients who pay are auto-enrolled.
        </p>
      </div>
      <Button onClick={createLink} disabled={busy}>
        {busy ? "Creating…" : "Create payment link"}
      </Button>
      {error && (
        <p className="text-[length:var(--t-caption)] text-[color:var(--danger)]">{error}</p>
      )}
    </Card>
  );
}

function MemberRow({
  row, onRoleChange, onStatusChange, onRemove, disabled,
}: {
  row: RosterRow;
  onRoleChange: (role: OfferingMemberRole) => void;
  onStatusChange: (status: OfferingMemberStatus) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="px-4 sm:px-5 py-3 grid sm:grid-cols-[1.4fr_0.9fr_0.7fr_0.7fr_auto] gap-3 items-center">
      <div className="min-w-0">
        <p className="font-bold text-[color:var(--text)] truncate">{row.name}</p>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] truncate">
          {row.email ?? "—"}
          {row.referred_by ? <> · referred by <strong className="text-[color:var(--text)]">{row.referred_by}</strong></> : null}
        </p>
        {row.current_focus && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] truncate italic">
            Focus: {row.current_focus}
          </p>
        )}
      </div>
      <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
        Joined {formatDate(row.joined_at)}
      </div>
      <select
        value={row.role}
        onChange={(e) => onRoleChange(e.target.value as OfferingMemberRole)}
        disabled={disabled}
        className="h-9 px-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[length:var(--t-caption)]"
      >
        {OFFERING_MEMBER_ROLES.map((r) => (
          <option key={r} value={r}>{OFFERING_MEMBER_ROLE_LABEL[r]}</option>
        ))}
      </select>
      <select
        value={row.status}
        onChange={(e) => onStatusChange(e.target.value as OfferingMemberStatus)}
        disabled={disabled}
        className="h-9 px-2 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] text-[length:var(--t-caption)]"
      >
        {OFFERING_MEMBER_STATUSES.map((s) => (
          <option key={s} value={s}>{OFFERING_MEMBER_STATUS_LABEL[s]}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className="text-[color:var(--text-faint)] hover:text-[color:var(--danger)] px-1.5"
        aria-label={`Remove ${row.name}`}
      >
        ×
      </button>
    </div>
  );
}

/** Build readable "A → B → C" chains by walking referred_by upward through
 *  the members of this offering. Only emits a chain when there's at least
 *  one link (two names). */
function buildReferralChains(roster: RosterRow[]): string[][] {
  const byName = new Map(roster.map((r) => [r.name, r]));
  // Identify chain "heads": members whose referrer is NOT another member
  // (or has no referrer) AND who themselves referred at least one other
  // member.
  const referrerNames = new Set(
    roster.filter((r) => r.referred_by).map((r) => r.referred_by as string)
  );
  const heads = roster.filter(
    (r) => referrerNames.has(r.name) && (!r.referred_by || !byName.has(r.referred_by))
  );
  // For each head, walk downstream: who did this member refer? (members
  // whose referred_by == head.name) and continue.
  const chains: string[][] = [];
  for (const head of heads) {
    let line: string[] = [head.name];
    let cursor: RosterRow = head;
    // Naive — pick the first downstream child each step. For a tree we'd
    // emit multiple lines; this gives one representative chain.
    while (true) {
      const next = roster.find((r) => r.referred_by === cursor.name);
      if (!next) break;
      line.push(next.name);
      cursor = next;
    }
    if (line.length >= 2) chains.push(line);
  }
  return chains;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "—";
  }
}
