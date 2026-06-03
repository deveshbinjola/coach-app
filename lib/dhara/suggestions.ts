// lib/dhara/suggestions.ts
// The autonomy seam. v0 only emits "suggest"-level suggestions; the executor
// performs only safe navigation. draft/act are defined but inert.

export type DharaSuggestion = {
  level: "suggest" | "draft" | "act";
  kind: "navigate" | "compose" | "create" | "note";
  label: string;
  href?: string;
  enabled: boolean;
  payload?: Record<string, unknown>;
};

export function deriveSuggestions(
  replyText: string,
  leads: Array<{ id: string; name: string }>,
): DharaSuggestion[] {
  const out: DharaSuggestion[] = [];
  const lower = replyText.toLowerCase();
  const mentioned = leads.find((l) => {
    if (!l.name) return false;
    // Match on full name or any individual word (e.g. first name alone)
    const nameLower = l.name.toLowerCase();
    if (lower.includes(nameLower)) return true;
    return nameLower.split(/\s+/).some((word) => word.length > 2 && lower.includes(word));
  });
  if (mentioned) {
    out.push({
      level: "suggest",
      kind: "navigate",
      label: `Open ${mentioned.name}`,
      href: `/leads/${mentioned.id}`,
      enabled: true,
    });
    out.push({
      level: "suggest",
      kind: "compose",
      label: `Draft a check-in for ${mentioned.name}`,
      enabled: false,
    });
  }
  return out;
}

export function executeSuggestion(s: DharaSuggestion): { navigateTo: string } | null {
  if (s.kind === "navigate" && s.enabled && s.href) return { navigateTo: s.href };
  return null;
}
