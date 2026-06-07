// Recover the REAL error from a supabase.functions.invoke() failure.
//
// supabase-js surfaces any non-2xx Edge Function response as a
// FunctionsHttpError whose `.message` is the useless generic string
// "Edge Function returned a non-2xx status code". The actual error the
// function returned (e.g. our explicit `{ error: "ANTHROPIC_API_KEY missing" }`)
// lives in the raw Response on `.context`. This reads that body so the UI can
// show what really happened instead of "non-2xx".

/** Read the underlying error message from an invoke() error. Falls back to a
 *  human message when nothing useful can be recovered. Never throws. */
export async function readInvokeError(
  invokeErr: unknown,
  fallback = "Something went wrong. Try again.",
): Promise<string> {
  const ctx = (invokeErr as { context?: unknown } | null)?.context as
    | { clone?: () => { text: () => Promise<string> }; text?: () => Promise<string> }
    | undefined;

  // `.context` is the raw Response when supabase-js caught a non-2xx.
  if (ctx && (typeof ctx.clone === "function" || typeof ctx.text === "function")) {
    try {
      const body = ctx.clone ? await ctx.clone().text() : await ctx.text!();
      const msg = pickMessage(body);
      if (msg) return msg;
    } catch {
      // body unreadable — fall through to the raw message / fallback
    }
  }

  const raw = (invokeErr as { message?: string } | null)?.message;
  // Suppress the generic supabase string; it tells the coach nothing.
  return raw && !/non-2xx/i.test(raw) ? raw : fallback;
}

/** Pull a message out of an Edge Function response body (JSON or plain text). */
function pickMessage(body: string): string | null {
  const trimmed = body?.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error.trim();
    if (typeof parsed.message === "string" && parsed.message.trim()) return parsed.message.trim();
  } catch {
    // not JSON — use the raw text, capped so a stack trace can't flood the UI
  }
  return trimmed.slice(0, 300);
}
