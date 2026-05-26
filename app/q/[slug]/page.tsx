// /q/[slug] — public quiz page. No auth required.
//
// Server component wrapper that exports edge runtime for Cloudflare Pages.
// Delegates to QuizPageClient for the client-side quiz experience.

import QuizPageClient from "./QuizPageClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PageProps = {
  params: { slug: string };
};

export default function QuizPage({ params }: PageProps) {
  return <QuizPageClient slug={params.slug} />;
}
