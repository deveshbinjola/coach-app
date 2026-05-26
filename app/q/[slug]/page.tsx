// /q/[slug] — public quiz page. No auth required.
//
// Fetches the published funnel config client-side via /api/funnels/public
// (which uses the admin client internally). This avoids needing the
// SUPABASE_SERVICE_ROLE_KEY in page-level server components.
//
// "Powered by ElevateAI" always shown (per spec).

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import QuizPlayer from "@/components/funnels/QuizPlayer";

type FunnelConfig = {
  intro: {
    headline: string;
    subhead: string;
    cta_label: string;
  };
  questions: Array<{
    id: string;
    text: string;
    choices: Array<{
      key: string;
      text: string;
      scores: Record<string, number>;
    }>;
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

type FunnelData = {
  id: string;
  slug: string;
  title: string;
  config: FunnelConfig;
  type: string;
};

export default function QuizPage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    fetch(`/api/funnels/public?slug=${encodeURIComponent(slug)}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => {
        setFunnel(data.funnel);
        // Set document title
        document.title = data.funnel.config?.intro?.headline || data.funnel.title || "Quiz";
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Loading state
  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "#0A0F1C" }}
      >
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-[#00FF41] border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Not found
  if (error || !funnel) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          backgroundColor: "#0A0F1C",
          fontFamily: "Plus Jakarta Sans, sans-serif",
          color: "#FFFFFF",
        }}
      >
        <div className="text-center max-w-md">
          <h1 className="text-4xl font-extrabold">Quiz not found</h1>
          <p className="mt-3 text-lg opacity-60">
            This quiz may have been unpublished or the link is incorrect.
          </p>
          <a
            href="https://elevateaisystem.com"
            className="inline-block mt-6 px-6 py-3 rounded-xl font-bold text-sm"
            style={{
              backgroundColor: "#00FF41",
              color: "#0A0F1C",
            }}
          >
            Visit ElevateAI
          </a>
        </div>
      </div>
    );
  }

  return (
    <QuizPlayer
      funnelId={funnel.id}
      config={funnel.config}
    />
  );
}
