// lib/ambient.ts
//
// Ambient Intelligence data layer. Cross-feature queries and scoring
// that powers the Command Center's unified priority list and the
// Person Panel's signal aggregation.

// ── Server-only imports (tree-shaken in browser bundles) ──────────────
import { createClient } from "@/lib/supabase-server";
import { summarizeTrust } from "@/lib/voice-trust";

// ── Types ─────────────────────────────────────────────────────────────

export type RightNowItem = {
  id: string;
  leadId?: string;
  leadName?: string;
  priority: number; // 1-6
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

// ── Content signal extraction ─────────────────────────────────────────

export function extractUntappedTopics(
  sessionTopicSets: string[][],
  contentTitles: string[],
): ContentSignals["untappedTopics"] {
  // Count topic frequency across all sessions
  const counts = new Map<string, number>();
  for (const topics of sessionTopicSets) {
    for (const topic of topics) {
      const normalized = topic.toLowerCase().trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }

  // Filter to topics appearing in 3+ sessions
  const frequent = [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1]);

  // Subtract topics that appear in content titles (case-insensitive substring match)
  const lowerTitles = contentTitles.map((t) => t.toLowerCase());
  const untapped = frequent.filter(
    ([topic]) => !lowerTitles.some((title) => title.includes(topic)),
  );

  return untapped.map(([topic, sessionCount]) => ({ topic, sessionCount }));
}

// ── Server-side Supabase query functions ──────────────────────────────
// These use createClient (server-only) and run parallel queries.
// Only called from server components and API routes.

export async function getBusinessPulse(coachId: string, now: number): Promise<BusinessPulse> {
  const supabase = createClient();

  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setUTCHours(23, 59, 59, 999);

  const monthStart = new Date(now);
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  // Revenue window: from start of last month to now
  const lastMonthStart = new Date(monthStart);
  lastMonthStart.setUTCMonth(lastMonthStart.getUTCMonth() - 1);

  // Trust window: 28 days
  const trustWindowStart = new Date(now - 28 * 86_400_000).toISOString();

  const [
    eventsRes, capturedRes, monthSessionsRes, clientsRes,
    messagesRes, enrollmentsRes, paymentsRes, membersRes,
    contentRes, roomsRes, trustRes,
  ] = await Promise.all([
    supabase.from("cp_client_events")
      .select("id, title, starts_at, meeting_url, client_room_id")
      .eq("coach_id", coachId)
      .gte("starts_at", todayStart.toISOString())
      .lte("starts_at", todayEnd.toISOString()),
    supabase.from("cp_coaching_sessions")
      .select("id, client_id, session_date, key_topics")
      .eq("coach_id", coachId)
      .gte("session_date", todayStart.toISOString()),
    supabase.from("cp_coaching_sessions")
      .select("client_id, session_date")
      .eq("coach_id", coachId)
      .gte("session_date", monthStart.toISOString()),
    supabase.from("cp_leads")
      .select("id, full_name, status")
      .eq("coach_id", coachId)
      .eq("status", "client"),
    supabase.from("cp_lead_messages")
      .select("id, lead_id, direction, sent_at, created_at")
      .eq("coach_id", coachId)
      .eq("direction", "inbound")
      .gte("sent_at", new Date(now - 7 * 86_400_000).toISOString()),
    supabase.from("cp_sequence_enrollments")
      .select("id, lead_id, status, sequence_id")
      .eq("coach_id", coachId)
      .eq("status", "failed"),
    supabase.from("cp_payments")
      .select("amount_cents, created_at")
      .eq("coach_id", coachId)
      .gte("created_at", lastMonthStart.toISOString()),
    supabase.from("cp_offering_members")
      .select("id, status")
      .eq("status", "active"),
    supabase.from("cp_content")
      .select("id, title, status")
      .eq("coach_id", coachId)
      .eq("status", "draft"),
    supabase.from("cp_client_rooms")
      .select("id, lead_id")
      .eq("coach_id", coachId),
    supabase.from("cp_lead_messages")
      .select("id, lead_id, coach_id, channel, direction, content, ai_drafted, sent_at, purpose, external_id, synced_from, original_draft, was_edited, created_at")
      .eq("coach_id", coachId)
      .eq("ai_drafted", true)
      .not("sent_at", "is", null)
      .gte("sent_at", trustWindowStart),
  ]);

  const rawData: RawPulseData = {
    calendarEvents: eventsRes.data ?? [],
    capturedToday: capturedRes.data ?? [],
    sessionsThisMonth: monthSessionsRes.data ?? [],
    activeClients: clientsRes.data ?? [],
    waitingMessages: messagesRes.data ?? [],
    failedEnrollments: enrollmentsRes.data ?? [],
    paymentsWindow: paymentsRes.data ?? [],
    activeMembers: membersRes.data ?? [],
    draftContent: contentRes.data ?? [],
    clientRooms: roomsRes.data ?? [],
    now,
  };

  const items = scoreRightNowItems(rawData);
  const trustMessages = trustRes.data ?? [];
  const trust = summarizeTrust(trustMessages as any, now);

  const metrics = computeMetrics({
    paymentsWindow: rawData.paymentsWindow,
    activeMembers: rawData.activeMembers,
    sessionsThisMonth: rawData.sessionsThisMonth,
    trustRate: trust.asIsPct28,
    now,
  });

  const daySummary = computeDaySummary(
    items,
    rawData.capturedToday.length,
    rawData.draftContent.length,
  );

  return {
    heroItem: items[0] ?? null,
    quietList: items.slice(1, 6),
    daySummary,
    metrics,
    honestQuestion: pickHonestQuestion(now),
  };
}

export async function getPersonSignals(leadId: string): Promise<PersonSignals> {
  const supabase = createClient();

  const [leadRes, messageRes, sessionsRes, offeringRes, enrollmentRes, paymentsRes, countRes] =
    await Promise.all([
      supabase.from("cp_leads")
        .select("id, full_name, status, source, created_at, email")
        .eq("id", leadId)
        .single(),
      supabase.from("cp_lead_messages")
        .select("direction, sent_at, channel")
        .eq("lead_id", leadId)
        .order("sent_at", { ascending: false })
        .limit(1),
      supabase.from("cp_coaching_sessions")
        .select("session_date, key_topics, commitments")
        .eq("client_id", leadId)
        .order("session_date", { ascending: false })
        .limit(10),
      supabase.from("cp_offering_members")
        .select("offering_id, status, created_at, cp_offerings(name, duration_months)")
        .eq("lead_id", leadId)
        .eq("status", "active"),
      supabase.from("cp_sequence_enrollments")
        .select("sequence_id, status, current_step_id, cp_sequences(name)")
        .eq("lead_id", leadId)
        .in("status", ["active", "paused"]),
      supabase.from("cp_payments")
        .select("amount_cents")
        .eq("lead_id", leadId),
      supabase.from("cp_coaching_sessions")
        .select("id", { count: "exact", head: true })
        .eq("client_id", leadId),
    ]);

  const lead = leadRes.data;
  if (!lead) throw new Error("Lead not found");

  const now = Date.now();

  // Last message
  const lastMsg = (messageRes.data ?? [])[0] ?? null;
  const lastMessage = lastMsg
    ? {
        direction: lastMsg.direction as "inbound" | "outbound",
        date: lastMsg.sent_at,
        channel: lastMsg.channel,
      }
    : null;

  // Sessions
  const sessions = sessionsRes.data ?? [];
  const totalSessions = countRes.count ?? sessions.length;
  const lastSession = sessions[0]
    ? {
        date: sessions[0].session_date,
        keyTopics: sessions[0].key_topics ?? [],
        daysSince: Math.round(
          (now - new Date(sessions[0].session_date).getTime()) / 86_400_000,
        ),
      }
    : null;
  const rhythm = detectSessionRhythm(sessions.map((s) => s.session_date));

  // Offering
  const offeringRow = (offeringRes.data ?? [])[0] as any;
  const offering = offeringRow
    ? {
        name: offeringRow.cp_offerings?.name ?? "Program",
        monthsIn: Math.max(
          1,
          Math.ceil(
            (now - new Date(offeringRow.created_at).getTime()) / (30 * 86_400_000),
          ),
        ),
        totalMonths: offeringRow.cp_offerings?.duration_months ?? 0,
      }
    : null;

  // Sequence
  const enrollRow = (enrollmentRes.data ?? [])[0] as any;
  const sequence = enrollRow
    ? {
        name: enrollRow.cp_sequences?.name ?? "Sequence",
        currentStep: 0,
        totalSteps: 0,
      }
    : null;

  // Lifetime paid
  const lifetimePaid = (paymentsRes.data ?? []).reduce(
    (sum: number, p: { amount_cents: number }) => sum + p.amount_cents,
    0,
  );

  // Flags
  const sessionOverdue = lastSession ? lastSession.daysSince > 14 : false;
  const messageWaiting = lastMessage
    ? lastMessage.direction === "inbound" &&
      (now - new Date(lastMessage.date).getTime()) > 48 * 3600_000
    : false;

  return {
    name: lead.full_name,
    status: lead.status as "lead" | "client",
    source: lead.source,
    createdAt: lead.created_at,
    lastMessage,
    lastSession,
    totalSessions,
    sessionRhythm: rhythm,
    offering,
    sequence,
    lifetimePaid,
    flags: { sessionOverdue, messageWaiting },
  };
}

export async function getContentSignals(coachId: string): Promise<ContentSignals> {
  const supabase = createClient();

  const [sessionsRes, contentRes] = await Promise.all([
    supabase.from("cp_coaching_sessions")
      .select("key_topics")
      .eq("coach_id", coachId),
    supabase.from("cp_content")
      .select("title")
      .eq("coach_id", coachId),
  ]);

  const sessionTopics = (sessionsRes.data ?? []).map(
    (s: { key_topics: string[] }) => s.key_topics ?? [],
  );
  const contentTitles = (contentRes.data ?? []).map(
    (c: { title: string }) => c.title,
  );

  return { untappedTopics: extractUntappedTopics(sessionTopics, contentTitles) };
}

// ── Post-session draft generation (AI) ────────────────────────────────

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export async function generatePostSessionDraft(params: {
  clientName: string;
  aiSummary: string;
  commitments: string[];
  keyTopics: string[];
  voiceProfile: { voice_json: Record<string, unknown>; sample_messages: string[] } | null;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  if (!params.aiSummary) return null;

  const system = [
    "You write 2-3 sentence follow-up messages from a coach to their client after a session.",
    "Be warm, specific, direct. Reference one concrete commitment or topic from the session.",
    "Match the coach's voice style if provided. No em dashes. No generic encouragement.",
    "Return only the message text, no quotes, no greeting header.",
  ].join(" ");

  const voiceContext = params.voiceProfile
    ? `COACH VOICE:\n${JSON.stringify(params.voiceProfile.voice_json, null, 2).slice(0, 400)}\n\nSAMPLE MESSAGES:\n${params.voiceProfile.sample_messages.slice(0, 2).join("\n")}`
    : "(No voice profile available. Use a warm, direct tone.)";

  const prompt = [
    `Write a follow-up message to ${params.clientName} after today's coaching session.`,
    "",
    "SESSION SUMMARY:",
    params.aiSummary,
    "",
    "KEY TOPICS:",
    params.keyTopics.join(", ") || "(none)",
    "",
    "COMMITMENTS:",
    params.commitments.length > 0 ? params.commitments.join("\n") : "(none stated)",
    "",
    voiceContext,
  ].join("\n");

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) return null;
    const result = await response.json();
    const text = String(result?.content?.[0]?.text ?? "").trim();
    return text || null;
  } catch {
    return null;
  }
}
