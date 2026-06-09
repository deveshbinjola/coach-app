import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import { generateTweetBatch, CATEGORY_META, type TweetCategory } from "@/lib/twitter-agent";
import { loadBrandVoiceOverlay } from "@/lib/brand-os/voice-overlay";
import type { VoiceProfile, Content } from "@/lib/types";

export const runtime = "edge";

type GenerateBody = {
  count?: unknown;
  categories?: unknown;
  angle?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimitByUser(user.id, "twitter/generate", 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: GenerateBody = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const count = Math.min(Math.max(Number(body.count) || 5, 1), 10);
  const categories = normalizeCategories(body.categories);
  const angle = typeof body.angle === "string" ? body.angle.trim().slice(0, 300) : "";

  const [profileRes, recentRes, brandOverlay] = await Promise.all([
    supabase
      .from("cp_voice_profiles")
      .select("*")
      .eq("coach_id", user.id)
      .eq("active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("cp_content")
      .select("body")
      .eq("coach_id", user.id)
      .eq("platform", "twitter")
      .order("created_at", { ascending: false })
      .limit(5),
    loadBrandVoiceOverlay(supabase, user.id),
  ]);

  const profile = (profileRes.data as VoiceProfile | null) ?? null;
  const recentTweets = ((recentRes.data as Pick<Content, "body">[] | null) ?? [])
    .map((r) => r.body ?? "")
    .filter(Boolean);

  const tweets = await generateTweetBatch({
    count,
    categories: categories.length ? categories : undefined,
    angle: angle || undefined,
    profile,
    brandOverlay,
    recentTweets,
  });

  const inserts = tweets.map((t) => ({
    coach_id: user.id,
    title: t.title,
    body: t.body,
    platform: "twitter" as const,
    content_type: t.content_type,
    status: t.mode === "auto" ? "scheduled" : "draft",
    pillar: t.pillar,
    performance: { tweet_category: t.category },
    brand_os_generated: true,
    ai_original_body: t.body,
  }));

  const { data: inserted, error } = await supabase
    .from("cp_content")
    .insert(inserts)
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const autoCount = tweets.filter((t) => t.mode === "auto").length;
  const reviewCount = tweets.filter((t) => t.mode === "review").length;

  return NextResponse.json({
    content: inserted as Content[],
    summary: {
      total: tweets.length,
      auto: autoCount,
      review: reviewCount,
      voiceActive: Boolean(profile),
    },
  });
}

function normalizeCategories(value: unknown): TweetCategory[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is TweetCategory => typeof v === "string" && v in CATEGORY_META
  );
}
