import { describe, it, expect } from "vitest";
import { resolveMergeTags } from "@/lib/sequence-merge";

describe("resolveMergeTags", () => {
  const lead = {
    full_name: "Marcus Chen",
    email: "marcus@example.com",
    status: "qualified",
  };
  const coachName = "Sunny Binjola";

  it("replaces all known merge tags", () => {
    const template = "Hi {{first_name}}, your status is {{status}}.";
    const result = resolveMergeTags(template, lead, coachName);
    expect(result).toBe("Hi Marcus, your status is qualified.");
  });

  it("replaces {{full_name}}", () => {
    const result = resolveMergeTags("Hello {{full_name}}", lead, coachName);
    expect(result).toBe("Hello Marcus Chen");
  });

  it("replaces {{email}}", () => {
    const result = resolveMergeTags("Reply to {{email}}", lead, coachName);
    expect(result).toBe("Reply to marcus@example.com");
  });

  it("replaces {{coach_name}}", () => {
    const result = resolveMergeTags("From {{coach_name}}", lead, coachName);
    expect(result).toBe("From Sunny Binjola");
  });

  it("handles missing email gracefully", () => {
    const noEmailLead = { full_name: "Test", email: null, status: "new" };
    const result = resolveMergeTags("Email: {{email}}", noEmailLead, coachName);
    expect(result).toBe("Email: ");
  });

  it("handles single-name leads", () => {
    const singleName = { full_name: "Prince", email: null, status: "new" };
    const result = resolveMergeTags("Hi {{first_name}}", singleName, coachName);
    expect(result).toBe("Hi Prince");
  });

  it("leaves unknown tags untouched", () => {
    const result = resolveMergeTags("Hi {{unknown_tag}}", lead, coachName);
    expect(result).toBe("Hi {{unknown_tag}}");
  });

  it("handles multiple occurrences of the same tag", () => {
    const result = resolveMergeTags(
      "{{first_name}}, hey {{first_name}}!",
      lead,
      coachName
    );
    expect(result).toBe("Marcus, hey Marcus!");
  });
});
