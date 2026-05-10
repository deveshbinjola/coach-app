// /compose, legacy URL.
//
// Compose was previously a separate top-level route AND a separate top-nav
// item. That fragmented the daily workflow ("am I in Leads or Compose?")
// for no real benefit, Compose is always an action you take ON your leads,
// not a separate destination. It now lives as a drawer inside /inbox.
//
// This route preserves saved bookmarks and the existing Decisions handoff
// (?pain=, ?temp=, ?ids=, ?source=) by forwarding all query params to
// /inbox?compose=open&...
//
// Server-side redirect, no flash, no client work.

import { redirect } from "next/navigation";

export const runtime = 'edge';

export const dynamic = "force-dynamic";

export default function ComposeRedirect({
  searchParams,
}: {
  searchParams: { pain?: string; temp?: string; ids?: string; source?: string };
}) {
  const params = new URLSearchParams();
  params.set("compose", "open");
  if (searchParams.pain) params.set("pain", searchParams.pain);
  if (searchParams.temp) params.set("temp", searchParams.temp);
  if (searchParams.ids) params.set("ids", searchParams.ids);
  if (searchParams.source) params.set("source", searchParams.source);
  redirect(`/inbox?${params.toString()}`);
}
