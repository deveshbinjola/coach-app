// Shared helpers used across the Settings panels.
//
// Lives here (not lib/) because these are presentation-layer utilities —
// short relative timestamps and HTTP method palette — only useful to the
// settings UI. Kept colocated with the panels that consume them.

/** "23m ago" / "5h ago" / "3d ago" — short relative time. */
export function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Same shape as ago(), preserved as a separate name for callers that
 *  imported timeAgo specifically. They produce identical output. */
export function timeAgo(iso: string): string {
  return ago(iso);
}

/** Tailwind color palette per HTTP method, used in agent-activity rows
 *  and any other surface that wants to colorize method tags. */
export function methodColor(m: string): string {
  switch (m.toUpperCase()) {
    case "GET":
      return "bg-[var(--brand-soft)] text-[#166534] border border-[color-mix(in_srgb,var(--brand)_40%,transparent)]";
    case "POST":
      return "bg-[var(--info-soft)] text-[var(--info)] border border-[color-mix(in_srgb,var(--info)_25%,transparent)]";
    case "PATCH":
      return "bg-[var(--warning-soft)] text-[#936300] border border-[color-mix(in_srgb,var(--warning)_25%,transparent)]";
    case "DELETE":
      return "bg-[var(--danger-soft)] text-[#B42318] border border-[color-mix(in_srgb,var(--danger)_25%,transparent)]";
    default:
      return "bg-[var(--surface-deep)] text-[color:var(--text-muted)] border border-[var(--border-faint)]";
  }
}
