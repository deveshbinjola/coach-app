import type { Content } from "@/lib/types";
import type { JustLandedItem } from "@/components/command-center/CommandCenterView";

export type PunchListItem = {
  id: string;
  type: "rescue" | "new-lead" | "content" | "reach" | "activation";
  label: string;
  href: string;
};

export type ActivationState = {
  totalLeads: number;
  hasContent: boolean;
  hasVoiceProfile: boolean;
};

type RescueItem = {
  lead: { id: string; full_name: string };
  reason: string;
};

const MAX_ITEMS = 5;
const MAX_RESCUE = 3;

export function buildPunchList(
  rescueItems: RescueItem[],
  justLandedLeads: JustLandedItem[],
  contentPipeline: Content[],
  reachCount: number,
  reachTarget: number,
  activation?: ActivationState,
): { items: PunchListItem[]; total: number } {
  const all: PunchListItem[] = [];

  // Empty/early coach: no leads AND no content yet. Lead with activation
  // steps instead of the steady-state rescue/reach items.
  const isEarly = !!activation && activation.totalLeads === 0 && !activation.hasContent;

  if (isEarly) {
    if (!activation!.hasVoiceProfile) {
      all.push({
        id: "activation:voice",
        type: "activation",
        label: "Set up your voice so drafts sound like you",
        href: "/voice",
      });
    }
    all.push({
      id: "activation:first-content",
      type: "activation",
      label: "Create your first piece of content",
      href: "/content",
    });
    all.push({
      id: "activation:first-lead",
      type: "activation",
      label: "Add your first lead",
      href: "/leads",
    });
    return { items: all.slice(0, MAX_ITEMS), total: all.length };
  }

  for (const r of rescueItems.slice(0, MAX_RESCUE)) {
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
