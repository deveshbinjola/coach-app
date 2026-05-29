// lib/ambient.ts
//
// Ambient Intelligence data layer. Cross-feature queries and scoring
// that powers the Command Center's unified priority list and the
// Person Panel's signal aggregation.

// ── Types ─────────────────────────────────────────────────────────────

export type RightNowItem = {
  id: string;
  leadId?: string;
  leadName?: string;
  priority: number; // 1-7
  reason: string;
  context?: string;
  action: { label: string; href?: string; type: "link" | "compose" | "capture" };
  source: "session" | "sequence" | "message" | "overdue" | "content" | "content_suggestion";
};

export type BusinessPulse = {
  heroItem: RightNowItem | null;
  quietList: RightNowItem[];
  daySummary: { sessions: number; draftsReady: number; leadsWaiting: number };
  metrics: {
    revenue: { amount: number; trend: "up" | "down" | "flat" };
    activeMembers: number;
    sessionsThisMonth: number;
    trustRate: number | null;
  };
  honestQuestion: string;
};

export type PersonSignals = {
  name: string;
  status: "lead" | "client";
  source: string | null;
  createdAt: string;
  lastMessage: { direction: "inbound" | "outbound"; date: string; channel: string } | null;
  lastSession: { date: string; keyTopics: string[]; daysSince: number } | null;
  totalSessions: number;
  sessionRhythm: string | null;
  offering: { name: string; monthsIn: number; totalMonths: number } | null;
  sequence: { name: string; currentStep: number; totalSteps: number } | null;
  lifetimePaid: number;
  flags: { sessionOverdue: boolean; messageWaiting: boolean };
};

export type ContentSignals = {
  untappedTopics: Array<{ topic: string; sessionCount: number }>;
};

// ── Raw data shapes for scoring ───────────────────────────────────────

export type RawPulseData = {
  calendarEvents: Array<{
    id: string;
    title: string;
    starts_at: string;
    meeting_url: string | null;
    client_room_id: string | null;
  }>;
  capturedToday: Array<{
    id: string;
    client_id: string;
    session_date: string;
    key_topics: string[];
  }>;
  sessionsThisMonth: Array<{
    client_id: string;
    session_date: string;
  }>;
  activeClients: Array<{
    id: string;
    full_name: string;
    status: string;
  }>;
  waitingMessages: Array<{
    id: string;
    lead_id: string;
    direction: string;
    sent_at: string | null;
    created_at: string;
  }>;
  failedEnrollments: Array<{
    id: string;
    lead_id: string;
    status: string;
    sequence_id: string;
  }>;
  paymentsWindow: Array<{
    amount_cents: number;
    created_at: string;
  }>;
  activeMembers: Array<{
    id: string;
    status: string;
  }>;
  draftContent: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  clientRooms: Array<{
    id: string;
    lead_id: string;
  }>;
  now: number;
};

// ── Scoring ───────────────────────────────────────────────────────────

const MAX_RIGHT_NOW = 6; // 1 hero + 5 quiet list

export function scoreRightNowItems(data: RawPulseData): RightNowItem[] {
  const items: RightNowItem[] = [];
  const clientMap = new Map(data.activeClients.map((c) => [c.id, c.full_name]));
  const roomToLead = new Map(data.clientRooms.map((r) => [r.id, r.lead_id]));

  // Priority 1 & 6: Sessions today (< 1hr = P1, later today = P6)
  const oneHourFromNow = data.now + 60 * 60_000;
  for (const ev of data.calendarEvents) {
    const startsAt = new Date(ev.starts_at).getTime();
    const leadId = ev.client_room_id ? roomToLead.get(ev.client_room_id) ?? null : null;
    const leadName = leadId ? clientMap.get(leadId) ?? null : null;
    const minutesUntil = Math.round((startsAt - data.now) / 60_000);

    if (startsAt > data.now && startsAt <= oneHourFromNow) {
      items.push({
        id: `session-soon-${ev.id}`,
        leadId: leadId ?? undefined,
        leadName: leadName ?? ev.title,
        priority: 1,
        reason: `session in ${minutesUntil} min`,
        action: ev.meeting_url
          ? { label: "Join call", href: ev.meeting_url, type: "link" }
          : { label: "Prep", href: "/clients?tab=sessions", type: "link" },
        source: "session",
      });
    } else if (startsAt > oneHourFromNow) {
      const time = new Date(ev.starts_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      items.push({
        id: `session-later-${ev.id}`,
        leadId: leadId ?? undefined,
        leadName: leadName ?? ev.title,
        priority: 6,
        reason: `session at ${time}`,
        action: { label: "Prep", href: "/clients?tab=sessions", type: "link" },
        source: "session",
      });
    }
  }

  // Priority 2: Sequence failures
  for (const enr of data.failedEnrollments) {
    const leadName = clientMap.get(enr.lead_id);
    items.push({
      id: `seq-fail-${enr.id}`,
      leadId: enr.lead_id,
      leadName: leadName ?? "Unknown",
      priority: 2,
      reason: "follow-up sequence failed",
      action: { label: "View", href: `/leads/${enr.lead_id}`, type: "link" },
      source: "sequence",
    });
  }

  // Priority 3: Inbound messages waiting > 48h
  const fortyEightHoursAgo = data.now - 48 * 3600_000;
  for (const msg of data.waitingMessages) {
    const sentAt = new Date(msg.sent_at ?? msg.created_at).getTime();
    if (sentAt < fortyEightHoursAgo && msg.direction === "inbound") {
      const leadName = clientMap.get(msg.lead_id);
      const daysAgo = Math.round((data.now - sentAt) / 86_400_000);
      items.push({
        id: `msg-wait-${msg.id}`,
        leadId: msg.lead_id,
        leadName: leadName ?? "Unknown",
        priority: 3,
        reason: `replied ${daysAgo} day${daysAgo === 1 ? "" : "s"} ago, waiting on you`,
        action: { label: "Reply", href: `/inbox?compose=open&ids=${msg.lead_id}`, type: "compose" },
        source: "message",
      });
    }
  }

  // Priority 4: No session in 14+ days (active clients only)
  const fourteenDaysAgo = data.now - 14 * 86_400_000;
  const lastSessionByClient = new Map<string, number>();
  for (const s of data.sessionsThisMonth) {
    const d = new Date(s.session_date).getTime();
    const prev = lastSessionByClient.get(s.client_id) ?? 0;
    if (d > prev) lastSessionByClient.set(s.client_id, d);
  }
  for (const client of data.activeClients) {
    if (client.status !== "client") continue;
    const lastSession = lastSessionByClient.get(client.id);
    if (!lastSession || lastSession < fourteenDaysAgo) {
      const weeksSince = lastSession
        ? Math.round((data.now - lastSession) / (7 * 86_400_000))
        : null;
      items.push({
        id: `overdue-${client.id}`,
        leadId: client.id,
        leadName: client.full_name,
        priority: 4,
        reason: weeksSince
          ? `no session in ${weeksSince} week${weeksSince === 1 ? "" : "s"}`
          : "no sessions recorded",
        action: { label: "Capture", href: "/sessions/new", type: "capture" },
        source: "overdue",
      });
    }
  }

  // Priority 5: Content drafts ready
  for (const c of data.draftContent) {
    items.push({
      id: `content-${c.id}`,
      leadName: undefined,
      priority: 5,
      reason: `Content draft ready: "${c.title}"`,
      action: { label: "Review", href: "/content", type: "link" },
      source: "content",
    });
  }

  // Sort by priority (lower = more urgent), then deduplicate by leadId
  items.sort((a, b) => a.priority - b.priority);

  const seenLeads = new Set<string>();
  const deduplicated: RightNowItem[] = [];
  for (const item of items) {
    if (item.leadId) {
      if (seenLeads.has(item.leadId)) continue;
      seenLeads.add(item.leadId);
    }
    deduplicated.push(item);
    if (deduplicated.length >= MAX_RIGHT_NOW) break;
  }

  return deduplicated;
}

// ── Metrics computation ───────────────────────────────────────────────

export function computeMetrics(data: {
  paymentsWindow: Array<{ amount_cents: number; created_at: string }>;
  activeMembers: Array<{ id: string; status: string }>;
  sessionsThisMonth: Array<{ client_id: string; session_date: string }>;
  trustRate: number | null;
  now: number;
}): BusinessPulse["metrics"] {
  const thisMonthStart = new Date(data.now);
  thisMonthStart.setUTCDate(1);
  thisMonthStart.setUTCHours(0, 0, 0, 0);

  const lastMonthStart = new Date(thisMonthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);

  let thisMonthRevenue = 0;
  let lastMonthRevenue = 0;

  for (const p of data.paymentsWindow) {
    const d = new Date(p.created_at);
    if (d >= thisMonthStart) {
      thisMonthRevenue += p.amount_cents;
    } else if (d >= lastMonthStart) {
      lastMonthRevenue += p.amount_cents;
    }
  }

  const trend: "up" | "down" | "flat" =
    thisMonthRevenue > lastMonthRevenue
      ? "up"
      : thisMonthRevenue < lastMonthRevenue
        ? "down"
        : "flat";

  return {
    revenue: { amount: thisMonthRevenue, trend },
    activeMembers: data.activeMembers.filter((m) => m.status === "active").length,
    sessionsThisMonth: data.sessionsThisMonth.length,
    trustRate: data.trustRate,
  };
}

// ── Day summary ───────────────────────────────────────────────────────

export function computeDaySummary(
  items: RightNowItem[],
  capturedToday: number,
  draftContent: number,
): BusinessPulse["daySummary"] {
  const leadsWaiting = items.filter(
    (i) => i.source === "message" || i.source === "sequence",
  ).length;
  return {
    sessions: capturedToday,
    draftsReady: draftContent,
    leadsWaiting,
  };
}

// ── Session rhythm detection ──────────────────────────────────────────

export function detectSessionRhythm(
  sessionDates: string[],
): string | null {
  if (sessionDates.length < 2) return null;

  const sorted = [...sessionDates]
    .map((d) => new Date(d).getTime())
    .sort((a, b) => b - a);

  let consecutiveWeeks = 1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapDays = (sorted[i] - sorted[i + 1]) / 86_400_000;
    if (gapDays >= 5 && gapDays <= 9) {
      consecutiveWeeks++;
    } else {
      break;
    }
  }

  if (consecutiveWeeks >= 2) {
    return `${ordinal(consecutiveWeeks)} consecutive week`;
  }
  return null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ── Honest questions ──────────────────────────────────────────────────

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

export function pickHonestQuestion(now: number): string {
  const d = new Date(now);
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((d.getTime() - start) / 86_400_000);
  return HONEST_QUESTIONS[dayOfYear % HONEST_QUESTIONS.length];
}
