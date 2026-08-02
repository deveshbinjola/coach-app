// Preview wrapper — renders the real QuizPlayer with a top banner
// showing this is a preview, with links back to editor and live URL.

"use client";

import { ArrowLeft, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import QuizPlayer from "@/components/funnels/QuizPlayer";

type FunnelConfig = {
  intro: { headline: string; subhead: string; cta_label: string };
  questions: Array<{
    id: string;
    text: string;
    choices: Array<{ key: string; text: string; scores: Record<string, number> }>;
  }>;
  results: Array<{
    key: string;
    pillar_name: string;
    headline: string;
    body: string;
    cta_text: string;
    cta_url: string;
  }>;
  branding: {
    primary_hex: string;
    accent_hex: string;
    background_hex: string;
    font_family: string;
  };
};

type Props = {
  funnelId: string;
  config: FunnelConfig;
  title: string;
  published: boolean;
  slug: string;
};

export default function PreviewClient({ funnelId, config, title, published, slug }: Props) {
  const router = useRouter();

  return (
    <div className="relative">
      {/* Preview banner */}
      <div className="sticky top-0 z-50 bg-[var(--warning)] text-[color:var(--warning)]">
        <div className="max-w-5xl mx-auto px-4 h-10 flex items-center justify-between text-xs font-bold">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push(`/funnels/${funnelId}/edit`)}
              className="flex items-center gap-1 hover:underline"
            >
              <ArrowLeft size={14} />
              Back to editor
            </button>
            <span className="opacity-60">|</span>
            <span>PREVIEW: {title}</span>
          </div>
          {published && (
            <a
              href={`/q/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:underline"
            >
              <ExternalLink size={12} />
              View live
            </a>
          )}
        </div>
      </div>

      {/* Real QuizPlayer — same component visitors see */}
      <QuizPlayer funnelId={funnelId} config={config} />
    </div>
  );
}
