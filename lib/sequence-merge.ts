// lib/sequence-merge.ts
//
// Pure merge-tag resolution for sequence email templates.
// No side effects, no Supabase, no network calls.
//
// Supported tags: {{first_name}}, {{full_name}}, {{email}},
// {{coach_name}}, {{status}}. Unknown tags pass through unchanged.

type MergeableLead = {
  full_name: string;
  email: string | null;
  status: string;
};

const TAG_REGEX = /\{\{(\w+)\}\}/g;

export function resolveMergeTags(
  template: string,
  lead: MergeableLead,
  coachName: string,
): string {
  const firstName = lead.full_name.split(" ")[0] ?? lead.full_name;

  const values: Record<string, string> = {
    first_name: firstName,
    full_name: lead.full_name,
    email: lead.email ?? "",
    coach_name: coachName,
    status: lead.status,
  };

  return template.replace(TAG_REGEX, (match, tag: string) => {
    return tag in values ? values[tag]! : match;
  });
}
