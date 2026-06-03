// lib/dhara/conversation.ts
// Turn a raw conversation log into a valid Anthropic Messages array.
// Anthropic requires: non-empty content, roles alternate, first message is
// user. Our log can contain orphan user turns (e.g. when an assistant reply
// failed to persist), so we filter empties, merge consecutive same-role
// turns, and drop any leading assistant turns. Pure + unit-tested.

export type ConvRow = { role: "user" | "assistant"; content: string };

export function toAnthropicMessages(rows: ConvRow[]): ConvRow[] {
  const cleaned = rows.filter((r) => typeof r.content === "string" && r.content.trim().length > 0);

  const merged: ConvRow[] = [];
  for (const r of cleaned) {
    const last = merged[merged.length - 1];
    if (last && last.role === r.role) {
      last.content = `${last.content}\n\n${r.content}`;
    } else {
      merged.push({ role: r.role, content: r.content });
    }
  }

  // Anthropic requires the first message to be from the user.
  while (merged.length > 0 && merged[0].role !== "user") merged.shift();

  return merged;
}
