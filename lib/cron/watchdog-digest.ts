// Pure computation for the Production Watchdog digest. Separated from
// app/api/cron/production-watchdog/route.ts so the branching logic (severity
// tally, staleness filter, volume threshold) is testable without mocking
// Supabase — the route stays thin: fetch, call this, send.

export type OpenBug = {
  id: string;
  coach_id: string;
  title: string;
  severity: "low" | "normal" | "high" | "critical";
  created_at: string;
};

export type CoachRow = { id: string; full_name: string | null; email: string | null };

export type WatchdogDigest = {
  openBugs: { total: number; bySeverity: Record<OpenBug["severity"], number> };
  staleHighSeverity: Array<{
    id: string;
    coach: string;
    title: string;
    severity: OpenBug["severity"];
    hoursOpen: number;
  }>;
  agentActivity: {
    windowCalls: number;
    highVolumeCoaches: Array<{ coachId: string; name: string; count: number }>;
  };
};

export function buildWatchdogDigest(args: {
  bugs: OpenBug[];
  coaches: CoachRow[];
  activityCoachIds: string[];
  nowMs: number;
  staleHours: number;
  highVolumeCalls: number;
}): WatchdogDigest {
  const { bugs, coaches, activityCoachIds, nowMs, staleHours, highVolumeCalls } = args;

  const coachById = new Map(coaches.map((c) => [c.id, c]));
  const nameFor = (id: string) => {
    const c = coachById.get(id);
    return c?.full_name?.trim() || c?.email?.split("@")[0] || "Unknown";
  };

  const bySeverity: Record<OpenBug["severity"], number> = { critical: 0, high: 0, normal: 0, low: 0 };
  for (const b of bugs) bySeverity[b.severity]++;

  const staleBeforeMs = nowMs - staleHours * 60 * 60 * 1000;
  const staleBugs = bugs.filter(
    (b) => (b.severity === "high" || b.severity === "critical") && new Date(b.created_at).getTime() < staleBeforeMs
  );

  const callsByCoach = new Map<string, number>();
  for (const coachId of activityCoachIds) {
    callsByCoach.set(coachId, (callsByCoach.get(coachId) ?? 0) + 1);
  }
  const highVolumeCoaches = [...callsByCoach.entries()]
    .filter(([, count]) => count >= highVolumeCalls)
    .sort((a, b) => b[1] - a[1])
    .map(([coachId, count]) => ({ coachId, name: nameFor(coachId), count }));

  return {
    openBugs: { total: bugs.length, bySeverity },
    staleHighSeverity: staleBugs.map((b) => ({
      id: b.id,
      coach: nameFor(b.coach_id),
      title: b.title,
      severity: b.severity,
      hoursOpen: Math.round((nowMs - new Date(b.created_at).getTime()) / (60 * 60 * 1000)),
    })),
    agentActivity: {
      windowCalls: activityCoachIds.length,
      highVolumeCoaches,
    },
  };
}

export function isDigestQuiet(digest: WatchdogDigest): boolean {
  return digest.staleHighSeverity.length === 0 && digest.agentActivity.highVolumeCoaches.length === 0;
}
