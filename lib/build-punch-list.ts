import type { Content } from "@/lib/types";
import type { JustLandedItem } from "@/components/command-center/CommandCenterView";

export type PunchListItem = {
  id: string;
  type: "rescue" | "new-lead" | "content" | "reach";
  label: string;
  href: string;
};

type RescueItem = {
  lead: { id: string; full_name: string };
  reason: string;
};

const MAX_ITEMS = 5;

export function buildPunchList(
  rescueItems: RescueItem[],
  justLandedLeads: JustLandedItem[],
  contentPipeline: Content[],
  reachCount: number,
  reachTarget: number,
): { items: PunchListItem[]; total: number } {
  const all: PunchListItem[] = [];

  for (const r of rescueItems) {
    all.push({
      id:    `rescue:${r.lead.id}`,
      type:  "rescue",
      label: `${r.lead.full_name} — ${r.reason}`,
      href:  `/inbox?compose=open&ids=${r.lead.id}&autoDraft=true`,
    });
  }

  for (const jl of justLandedLeads) {
    all.push({
      id:    `new-lead:${jl.lead_id}`,
      type:  "new-lead",
      label: `Welcome ${jl.lead_name} — new lead`,
      href:  `/inbox?compose=open&ids=${jl.lead_id}&autoDraft=true`,
    });
  }

  for (const c of contentPipeline) {
    if (c.status !== "draft") continue;
    all.push({
      id:    `content:${c.id}`,
      type:  "content",
      label: `Finish draft: ${c.title}`,
      href:  "/content",
    });
  }

  if (reachCount < reachTarget) {
    const gap = reachTarget - reachCount;
    all.push({
      id:    "reach:gap",
      type:  "reach",
      label: `Send ${gap} more to hit ${reachTarget}/week goal`,
      href:  "/inbox?compose=open",
    });
  }

  return {
    items: all.slice(0, MAX_ITEMS),
    total: all.length,
  };
}
