import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { userAvatarUrl, userDisplayName, userFirstName } from "@/lib/user-display";
import Header from "@/components/Header";
import CommandCenterView from "@/components/CommandCenterView";
import type { Lead, Content, LeadMessage, VoiceProfile } from "@/lib/types";

// /command-center — replaces /today.
//
// Shows the coach's full operation in one view:
//   1. Content pipeline — what's drafted, scheduled, and live (Brand OS powered)
//   2. Lead Rescue — who needs action right now
//   3. Reach — rolling 7-day outreach vs. weekly target
//   4. Honest question — rotating daily prompt
//
// Phase 10: Metricool performance data will backfill via Edge Function.

export const dynamic = "force-dynamic";

const DEFAULT_REACH_TARGET = 15;
const REACH_WINDOW_DAYS    = 7;
const CONTENT_PIPELINE_LIMIT = 8;

const HONEST_QUESTIONS = [
  "Who's been on your list 14+ days without a real reply from you?",
  "If you got one new coach this week, what would change in your calendar?",
  "What's the conversation you're avoiding right now?",
  "Which lead on your list do you already know won't buy, and why haven't you closed the loop?",
  "When was the last time you sent a message without asking for anything back?",
  "Who's the one person you'd work with for free if they said yes today?",
  "What message have you been drafting in your head but not sending?",
  "If your reach number stayed flat for a month, what would you do differently?",
  "Which lead did you promise to follow up with, and when?",
  "What's one assumption about your ICP you haven't actually tested with a human this week?",
  "Who on your list is outgrowing the version of you they first met?",
  "If you had to cut your list in half today, who goes first?",
  "What's a lead telling you that you don't want to hear?",
  "Where's the friction in your own pipeline, and is it yours to fix or theirs?",
];

function pickHonestQuestion(now: number): string {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - start) / 86_400_000);
  return HONEST_QUESTIONS[dayOfYear % HONEST_QUESTIONS.length];
}

export default async function CommandCenterPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now         = Date.now();
  const windowStart = new Date(now - REACH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const coachId     = user.id;

  // Voice Trust window: 28 days back so we can compute the rolling rate
  // shown on the strip + 4 weekly buckets the sparkline needs.
  const trustWindowStart = new Date(
    now - 28 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [leadsRes, messagesRes, draftsRes, contentRes, trustMessagesRes, voiceRes] =
    await Promise.all([
      supabase
        .from("cp_leads")
        .select("*")
        .order("created_at", { ascending: false }),

      supabase
        .from("cp_lead_messages")
        .select("lead_id, created_at")
        .eq("coach_id", coachId)
        .eq("direction", "outbound")
        .gte("created_at", windowStart),

      supabase
        .from("cp_lead_messages")
        .select("id, lead_id, content, created_at")
        .eq("coach_id", coachId)
        .eq("purpose", "first_response")
        .eq("direction", "draft")
        .order("created_at", { ascending: false })
        .limit(20),

      // Content pipeline — scheduled/draft upcoming + recently published
      supabase
        .from("cp_content")
        .select("*")
        .eq("coach_id", coachId)
        .order("scheduled_at", { ascending: true })
        .limit(CONTENT_PIPELINE_LIMIT),

      // Voice Trust: AI-drafted SENT messages over the last 28 days. We
      // only need rows where the trust columns are populated; partial
      // index on the table makes this fast.
      supabase
        .from("cp_lead_messages")
        .select(
          "id, lead_id, coach_id, channel, direction, content, ai_drafted, sent_at, purpose, external_id, synced_from, original_draft, was_edited, created_at"
        )
        .eq("coach_id", coachId)
        .eq("ai_drafted", true)
        .not("sent_at", "is", null)
        .gte("sent_at", trustWindowStart),

      supabase
        .from("cp_voice_profiles")
        .select("*")
        .eq("coach_id", coachId)
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const leads    = (leadsRes.data   ?? []) as Lead[];
  const content  = (contentRes.data ?? []) as Content[];
  const outboundRows = (messagesRes.data ?? []) as Array<{
    lead_id: string;
    created_at: string;
  }>;
  const reachCount = new Set(outboundRows.map((m) => m.lead_id)).size;

  // Daily reach buckets for the pill chart in ReachCard. 7 entries, oldest
  // (6 days ago) → today. Counts distinct leads contacted per UTC day so
  // multiple touches to the same lead don't double-count.
  const dailyReach: number[] = (() => {
    const buckets: Set<string>[] = Array.from({ length: 7 }, () => new Set<string>());
    const todayMidnight = new Date(now);
    todayMidnight.setUTCHours(0, 0, 0, 0);
    const todayMs = todayMidnight.getTime();
    for (const row of outboundRows) {
      const d = new Date(row.created_at);
      d.setUTCHours(0, 0, 0, 0);
      const daysAgo = Math.floor((todayMs - d.getTime()) / 86_400_000);
      if (daysAgo >= 0 && daysAgo < 7) {
        buckets[6 - daysAgo]!.add(row.lead_id);
      }
    }
    return buckets.map((s) => s.size);
  })();

  // Build justLanded drafts for Command Center.
  const draftRows = (draftsRes.data ?? []) as Array<{
    id: string; lead_id: string; content: string; created_at: string;
  }>;
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const justLanded = draftRows
    .map((d) => {
      const lead = leadById.get(d.lead_id);
      if (!lead) return null;
      return {
        draft_id:     d.id,
        lead_id:      d.lead_id,
        lead_name:    lead.full_name,
        source:       lead.source,
        source_detail: lead.source_detail,
        preview:      d.content.slice(0, 140),
        created_at:   d.created_at,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const reachTargetRaw = user.user_metadata?.reach_target_per_week;
  const reachTarget =
    typeof reachTargetRaw === "number" && reachTargetRaw > 0
      ? reachTargetRaw
      : DEFAULT_REACH_TARGET;

  return (
    <div className="min-h-screen">
      <Header
        email={user.email ?? ""}
        name={userDisplayName(user.user_metadata)}
        avatarUrl={userAvatarUrl(user.user_metadata)}
      />
      <main className="max-w-6xl mx-auto px-3 py-4 sm:px-6 sm:py-6 overflow-hidden">
        <CommandCenterView
          leads={leads}
          content={content}
          reachCount={reachCount}
          reachTarget={reachTarget}
          dailyReach={dailyReach}
          honestQuestion={pickHonestQuestion(now)}
          now={now}
          justLanded={justLanded}
          trustMessages={(trustMessagesRes.data ?? []) as LeadMessage[]}
          voiceProfile={(voiceRes.data as VoiceProfile | null) ?? null}
          coachFirstName={userFirstName(user.email, user.user_metadata)}
        />
      </main>
    </div>
  );
}
