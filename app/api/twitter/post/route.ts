import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { rateLimitByUser } from "@/lib/rate-limit";
import {
  postTweet,
  postThread,
  parseThreadBody,
  hasTwitterCredentials,
} from "@/lib/twitter-poster";

export const runtime = "edge";

/**
 * POST /api/twitter/post
 *
 * Publishes a single tweet or thread from the cp_content table.
 * Body: { id: string }  — the content row ID to publish.
 *
 * Flow:
 *   1. Verify auth + ownership
 *   2. Check content is scheduled (approved)
 *   3. Post via X API v2
 *   4. Update row status to "published" (or "failed")
 *   5. Return result
 */
export async function POST(request: NextRequest) {
  if (!hasTwitterCredentials()) {
    return NextResponse.json(
      { error: "Twitter API keys not configured" },
      { status: 503 }
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = rateLimitByUser(user.id, "twitter/post", 17, 86_400_000); // X limit: 17/24h
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit: 17 tweets per 24 hours (X API limit)" },
      { status: 429 }
    );
  }

  let body: { id?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "Missing content id" }, { status: 400 });
  }

  // Fetch the content row
  const { data: content, error: fetchErr } = await supabase
    .from("cp_content")
    .select("*")
    .eq("id", body.id)
    .eq("coach_id", user.id)
    .eq("platform", "twitter")
    .single();

  if (fetchErr || !content) {
    return NextResponse.json({ error: "Content not found" }, { status: 404 });
  }

  if (content.status !== "scheduled") {
    return NextResponse.json(
      { error: `Cannot post content with status "${content.status}". Must be "scheduled".` },
      { status: 400 }
    );
  }

  const tweetBody = content.body ?? "";
  if (!tweetBody.trim()) {
    return NextResponse.json({ error: "Empty tweet body" }, { status: 400 });
  }

  // Post: thread or single tweet
  const isThread = content.content_type === "thread";
  let tweetId = "";
  let postError = "";

  if (isThread) {
    const tweets = parseThreadBody(tweetBody);
    if (tweets.length === 0) {
      return NextResponse.json({ error: "Thread has no parseable tweets" }, { status: 400 });
    }

    const results = await postThread(tweets);
    const firstSuccess = results.find((r) => r.ok);
    const failure = results.find((r) => !r.ok);

    if (firstSuccess && firstSuccess.ok) {
      tweetId = firstSuccess.tweetId;
    }
    if (failure && !failure.ok) {
      postError = failure.error;
    }

    // Partial success: some tweets posted, some failed
    if (tweetId && postError) {
      await supabase
        .from("cp_content")
        .update({
          status: "published",
          performance: {
            ...((content.performance as Record<string, unknown>) ?? {}),
            tweet_id: tweetId,
            thread_results: results.map((r) =>
              r.ok ? { ok: true, id: r.tweetId } : { ok: false, error: r.error }
            ),
            partial: true,
            published_at: new Date().toISOString(),
          },
        })
        .eq("id", body.id);

      return NextResponse.json({
        ok: true,
        partial: true,
        tweetId,
        posted: results.filter((r) => r.ok).length,
        total: tweets.length,
        error: postError,
      });
    }
  } else {
    // Single tweet
    const result = await postTweet(tweetBody);
    if (result.ok) {
      tweetId = result.tweetId;
    } else {
      postError = result.error;
    }
  }

  if (!tweetId) {
    // Update status to failed
    await supabase
      .from("cp_content")
      .update({
        status: "failed",
        performance: {
          ...((content.performance as Record<string, unknown>) ?? {}),
          post_error: postError,
          failed_at: new Date().toISOString(),
        },
      })
      .eq("id", body.id);

    return NextResponse.json(
      { ok: false, error: postError || "Failed to post tweet" },
      { status: 502 }
    );
  }

  // Success — update to published
  await supabase
    .from("cp_content")
    .update({
      status: "published",
      performance: {
        ...((content.performance as Record<string, unknown>) ?? {}),
        tweet_id: tweetId,
        published_at: new Date().toISOString(),
      },
    })
    .eq("id", body.id);

  return NextResponse.json({ ok: true, tweetId });
}
