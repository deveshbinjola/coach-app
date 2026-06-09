/**
 * Twitter/X posting layer — OAuth 1.0a signed requests to X API v2.
 *
 * Uses HMAC-SHA1 signature per RFC 5849. No external OAuth library needed;
 * the Web Crypto API handles HMAC and we build the Authorization header
 * by hand. This keeps the edge-runtime bundle tiny.
 *
 * Endpoints used:
 *   POST https://api.x.com/2/tweets          — create a tweet
 *   DELETE https://api.x.com/2/tweets/:id     — delete a tweet
 *
 * Rate limits (pay-per-use / Free tier):
 *   - 17 tweets / 24h per user  (POST /2/tweets)
 *   - 50 requests / 15 min       (app-level)
 */

// ---------- types ----------

export type PostTweetResult = {
  ok: true;
  tweetId: string;
  text: string;
} | {
  ok: false;
  error: string;
  status?: number;
};

// ---------- config ----------

function getCredentials() {
  const apiKey = process.env.TWITTER_API_KEY ?? "";
  const apiSecret = process.env.TWITTER_API_SECRET ?? "";
  const accessToken = process.env.TWITTER_ACCESS_TOKEN ?? "";
  const accessTokenSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET ?? "";

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    return null;
  }
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

export function hasTwitterCredentials(): boolean {
  return getCredentials() !== null;
}

// ---------- OAuth 1.0a signing (RFC 5849) ----------

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

function generateNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36)).join("").slice(0, 32);
}

async function hmacSha1(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function buildAuthHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  creds: NonNullable<ReturnType<typeof getCredentials>>
): Promise<string> {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  // Merge all params for signature base string
  const allParams = { ...oauthParams, ...params };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(creds.accessTokenSecret)}`;
  const signature = await hmacSha1(signingKey, baseString);

  oauthParams["oauth_signature"] = signature;

  const header = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${header}`;
}

// ---------- public API ----------

/**
 * Post a single tweet. For threads, call this for each tweet in sequence,
 * passing the previous tweet's ID as `replyTo`.
 */
export async function postTweet(
  text: string,
  replyTo?: string
): Promise<PostTweetResult> {
  const creds = getCredentials();
  if (!creds) {
    return { ok: false, error: "Twitter API credentials not configured" };
  }

  const url = "https://api.x.com/2/tweets";
  const payload: Record<string, unknown> = { text };
  if (replyTo) {
    payload.reply = { in_reply_to_tweet_id: replyTo };
  }

  try {
    const auth = await buildAuthHeader("POST", url, {}, creds);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await res.text();
      return {
        ok: false,
        error: `X API ${res.status}: ${errBody.slice(0, 300)}`,
        status: res.status,
      };
    }

    const data = await res.json();
    return {
      ok: true,
      tweetId: data.data?.id ?? "",
      text: data.data?.text ?? text,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error posting tweet",
    };
  }
}

/**
 * Post a thread (array of tweet texts). Each tweet replies to the previous.
 * Returns array of results — stops on first failure.
 */
export async function postThread(
  tweets: string[]
): Promise<PostTweetResult[]> {
  const results: PostTweetResult[] = [];
  let lastId: string | undefined;

  for (const text of tweets) {
    const result = await postTweet(text, lastId);
    results.push(result);
    if (!result.ok) break;
    lastId = result.tweetId;
  }

  return results;
}

/**
 * Parse a thread body (numbered lines like "1/ ...\n\n2/ ...") into individual tweets.
 */
export function parseThreadBody(body: string): string[] {
  const lines = body.split(/\n\n+/);
  return lines
    .map((line) => line.replace(/^\d+\/\s*/, "").trim())
    .filter((line) => line.length > 0);
}
