// lib/funnel.ts
//
// Pure logic for onboarding-funnel measurement. No I/O. The logger
// (lib/funnel-log.ts) and report script (scripts/funnel-baseline.mjs)
// import from here so the event vocabulary has one source of truth.

/** Ordered funnel stages. The report renders them in this order and
 *  computes drop-off between consecutive stages. */
export const FUNNEL_STAGES = [
  "signup_completed",
  "brand_os_started",
  "brand_os_completed",
  "reality_questions_completed",
  "content_created",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];

/** All loggable event names = the ordered stages plus the repeatable
 *  retention ping. */
export const FUNNEL_EVENTS = [...FUNNEL_STAGES, "app_opened"] as const;

export type FunnelEventName = (typeof FUNNEL_EVENTS)[number];

export function isFunnelEvent(name: string): name is FunnelEventName {
  return (FUNNEL_EVENTS as readonly string[]).includes(name);
}

export type FunnelEventRow = {
  coach_id: string;
  name: string;
  created_at: string; // ISO timestamp
};

export type FunnelStageStat = {
  stage: FunnelStage;
  coaches: number;     // distinct coaches who hit this stage
  pctOfStart: number;  // % of stage[0] coaches (0-100, rounded)
  dropFromPrev: number; // % drop from the previous stage (0-100, rounded)
};

export type FunnelReport = {
  stages: FunnelStageStat[];
  brandOsAbandoned: number; // started, never completed
  returnedDay7: number;     // app_opened on/after signup + 7 days
  totalCoaches: number;     // distinct coaches at stage[0]
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Build the set of distinct coach_ids that fired a given event name. */
function coachesWith(events: FunnelEventRow[], name: string): Set<string> {
  const set = new Set<string>();
  for (const e of events) if (e.name === name) set.add(e.coach_id);
  return set;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export function computeFunnel(events: FunnelEventRow[], now: Date = new Date()): FunnelReport {
  const perStage = FUNNEL_STAGES.map((stage) => coachesWith(events, stage));
  const startCount = perStage[0]?.size ?? 0;

  const stages: FunnelStageStat[] = FUNNEL_STAGES.map((stage, i) => {
    const coaches = perStage[i].size;
    const prev = i === 0 ? coaches : perStage[i - 1].size;
    return {
      stage,
      coaches,
      pctOfStart: pct(coaches, startCount),
      dropFromPrev: i === 0 ? 0 : pct(prev - coaches, prev),
    };
  });

  // brand_os_abandoned: started minus those who also completed.
  const started = coachesWith(events, "brand_os_started");
  const completed = coachesWith(events, "brand_os_completed");
  let brandOsAbandoned = 0;
  for (const c of started) if (!completed.has(c)) brandOsAbandoned += 1;

  // returned_day_7: first signup time per coach; any app_opened >= +7d.
  const signupAt = new Map<string, number>();
  for (const e of events) {
    if (e.name !== "signup_completed") continue;
    const t = Date.parse(e.created_at);
    const cur = signupAt.get(e.coach_id);
    if (cur === undefined || t < cur) signupAt.set(e.coach_id, t);
  }
  const returned = new Set<string>();
  for (const e of events) {
    if (e.name !== "app_opened") continue;
    const s = signupAt.get(e.coach_id);
    if (s === undefined) continue;
    if (Date.parse(e.created_at) - s >= 7 * DAY_MS) returned.add(e.coach_id);
  }

  void now; // reserved for future windowing; keeps signature stable
  return {
    stages,
    brandOsAbandoned,
    returnedDay7: returned.size,
    totalCoaches: startCount,
  };
}
