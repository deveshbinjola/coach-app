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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameMatches(replyLower: string, name: string): boolean {
  const n = name.trim();
  if (!n) return false;
  // Whole-word match on the full name or any token of length >= 3.
  const tokens = [n, ...n.split(/\s+/)].filter((t) => t.length >= 3);
  return tokens.some((t) => new RegExp(`\\b${escapeRegExp(t.toLowerCase())}\\b`).test(replyLower));
}

export function deriveSuggestions(
  replyText: string,
  leads: Array<{ id: string; name: string }>,
): DharaSuggestion[] {
  const out: DharaSuggestion[] = [];
  const lower = replyText.toLowerCase();
  const mentioned = leads.find((l) => nameMatches(lower, l.name));
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
