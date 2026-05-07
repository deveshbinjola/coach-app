type UserMetadata = Record<string, unknown> | undefined;

export function userDisplayName(metadata: UserMetadata): string | undefined {
  return (
    stringValue(metadata?.full_name) ??
    stringValue(metadata?.name) ??
    stringValue(metadata?.user_name)
  );
}

export function userAvatarUrl(metadata: UserMetadata): string | undefined {
  return (
    stringValue(metadata?.avatar_url) ??
    stringValue(metadata?.picture) ??
    stringValue(metadata?.photo_url)
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// First name extraction for greetings ("Aloha, Sunny."). Falls back to the
// email prefix when auth metadata has no name. Centralized here so the
// /welcome and /command-center hero greetings agree on what to call you.
export function userFirstName(
  email: string | undefined,
  metadata: UserMetadata
): string {
  const full = userDisplayName(metadata);
  if (full) return full.split(" ")[0] ?? full;
  const prefix = (email ?? "").split("@")[0] ?? "";
  const stem = prefix.split(/[._\-+]/)[0] ?? "";
  if (!stem) return "there";
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}
