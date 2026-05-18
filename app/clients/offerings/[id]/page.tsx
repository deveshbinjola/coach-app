// /clients/offerings/[id] — offering detail.
//
// Shows the roster, referral chains, and an "add member" picker.
// Roster rows are member views: client name, role, joined date, payment
// status, referred-by name, current focus. Pulls from cp_offering_members
// joined with cp_client_rooms and cp_leads.

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName } from "@/lib/user-display";
import Header from "@/components/Header";
import { Badge } from "@/components/ui";
import OfferingDetail, { type RosterRow, type EligibleRoom } from "@/components/clients/OfferingDetail";
import { enforceOnboardingGate } from "@/lib/onboarding";
import { loadHeaderEmphasis } from "@/lib/nav-emphasis";
import {
  OFFERING_KIND_LABEL,
  type ClientRoom,
  type Lead,
  type Offering,
  type OfferingMember,
} from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function OfferingDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const gateRedirect = await enforceOnboardingGate(supabase, user.id);
  if (gateRedirect) redirect(gateRedirect);
  const headerEmphasis = await loadHeaderEmphasis(supabase, user.id);

  // ── Offering ────────────────────────────────────────────
  const { data: offeringRow } = await supabase
    .from("cp_offerings")
    .select("*")
    .eq("id", params.id)
    .eq("coach_id", user.id)
    .maybeSingle();
  if (!offeringRow) notFound();
  const offering = offeringRow as Offering;

  // ── All this coach's rooms + leads + Stripe state ────────────────────
  const [membersRes, roomsRes, leadsRes, { data: stripeRow }, { data: linkRow }] = await Promise.all([
    supabase
      .from("cp_offering_members")
      .select("*")
      .eq("offering_id", offering.id),
    supabase
      .from("cp_client_rooms")
      .select("*")
      .eq("coach_id", user.id),
    supabase
      .from("cp_leads")
      .select("id, full_name, email, referred_by_lead_id"),
    supabase
      .from("cp_stripe_accounts")
      .select("charges_enabled")
      .eq("coach_id", user.id)
      .maybeSingle(),
    supabase
      .from("cp_payment_links")
      .select("url, active")
      .eq("offering_id", offering.id)
      .eq("coach_id", user.id)
      .maybeSingle(),
  ]);
  const members = (membersRes.data ?? []) as OfferingMember[];
  const rooms = (roomsRes.data ?? []) as ClientRoom[];
  const leads = (leadsRes.data ?? []) as Array<Pick<Lead, "id" | "full_name" | "email" | "referred_by_lead_id">>;

  const leadById = new Map(leads.map((l) => [l.id, l]));
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const roster: RosterRow[] = members
    .map((m) => {
      const room = roomById.get(m.client_room_id);
      const lead = room ? leadById.get(room.lead_id) ?? null : null;
      const referredBy = lead?.referred_by_lead_id
        ? leadById.get(lead.referred_by_lead_id)?.full_name ?? null
        : null;
      return {
        offering_id: m.offering_id,
        client_room_id: m.client_room_id,
        role: m.role,
        status: m.status,
        joined_at: m.joined_at,
        notes: m.notes,
        // joined-in display fields
        name: lead?.full_name ?? "(unnamed)",
        email: lead?.email ?? null,
        program_name: room?.program_name ?? null,
        payment_status: room?.payment_status ?? "unknown",
        current_focus: room?.current_focus ?? null,
        referred_by: referredBy,
      } satisfies RosterRow;
    })
    .sort((a, b) => (b.joined_at ?? "").localeCompare(a.joined_at ?? ""));

  // Eligible to add: this coach's rooms not already in this offering.
  const memberRoomIds = new Set(members.map((m) => m.client_room_id));
  const eligible: EligibleRoom[] = rooms
    .filter((r) => !memberRoomIds.has(r.id))
    .map((r) => {
      const lead = leadById.get(r.lead_id);
      return {
        client_room_id: r.id,
        name: lead?.full_name ?? "(unnamed)",
        email: lead?.email ?? null,
        program_name: r.program_name,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
        emphasis={headerEmphasis}
      />
      <main className="max-w-5xl mx-auto px-3 py-4 sm:px-6 sm:py-6 space-y-6">

        {/* Back link + header */}
        <Link href="/clients?tab=offerings" className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] hover:text-[color:var(--text)]">
          ← All offerings
        </Link>

        <header className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="brand" size="xs" uppercase>{OFFERING_KIND_LABEL[offering.kind]}</Badge>
            {offering.status === "archived" && <Badge tone="muted" size="xs" uppercase>Archived</Badge>}
            {offering.price_cents != null && offering.price_cents > 0 && (
              <Badge tone="brand" size="xs" uppercase>
                ${(offering.price_cents / 100).toLocaleString()} / seat
              </Badge>
            )}
            {offering.capacity != null && (
              <Badge tone="muted" size="xs" uppercase>
                {roster.filter((r) => r.status === "active").length} / {offering.capacity} active
              </Badge>
            )}
          </div>
          <h1 className="font-display text-[length:var(--t-h1)] font-extrabold tracking-tight text-[color:var(--text)] leading-tight">
            {offering.name}
          </h1>
          {offering.description && (
            <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] leading-relaxed max-w-2xl">
              {offering.description}
            </p>
          )}
          {(offering.starts_at || offering.ends_at) && (
            <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)]">
              {offering.starts_at ?? "—"} → {offering.ends_at ?? "—"}
            </p>
          )}
        </header>

        <OfferingDetail
          offeringId={offering.id}
          roster={roster}
          eligible={eligible}
          stripeReady={Boolean(stripeRow?.charges_enabled)}
          hasPriceCents={Boolean(offering.price_cents && offering.price_cents > 0)}
          existingPaymentLink={linkRow?.active ? (linkRow.url as string) : null}
        />

      </main>
    </div>
  );
}
