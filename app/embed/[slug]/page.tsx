// /embed/[slug] — embeddable quiz page. No auth, no app chrome.
//
// Same as /q/[slug] but stripped of all navigation, headers, footers
// so it works cleanly inside an iframe on a coach's website.

import EmbedClient from "./EmbedClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PageProps = {
  params: { slug: string };
};

export default function EmbedPage({ params }: PageProps) {
  return <EmbedClient slug={params.slug} />;
}
