import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createAdminClient } from "@/lib/supabase-admin";
import { rateLimitByUser } from "@/lib/rate-limit";
import { getDharaContext } from "@/lib/dhara/context";
import { buildDharaSystemPrompt } from "@/lib/dhara/persona";
import { userFirstName } from "@/lib/user-display";

export const runtime = "edge";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const rl = rateLimitByUser(user.id, "dhara/chat", 20, 60_000);
  if (!rl.allowed) return new Response(JSON.stringify({ error: "Slow down a moment." }), { status: 429 });

  let body: { message?: string };
  try { body = await request.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 }); }
  const message = (body.message ?? "").trim().slice(0, 4000);
  if (!message) return new Response(JSON.stringify({ error: "Empty message" }), { status: 400 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 503 });

  const admin = createAdminClient();
  const now = Date.now();

  await admin.from("cp_dhara_messages").insert({ coach_id: user.id, role: "user", content: message });
  const [{ data: recent }, grounding] = await Promise.all([
    supabase.from("cp_dhara_messages").select("role, content").eq("coach_id", user.id)
      .order("created_at", { ascending: false }).limit(12),
    getDharaContext(user.id, now),
  ]);

  const system = buildDharaSystemPrompt({
    coachFirstName: userFirstName(user.email, user.user_metadata),
    identityText: grounding.identityText,
    snapshotText: grounding.snapshotText,
    memories: grounding.memories.map((m) => ({ text: m.text, confidence: m.confidence })),
  });

  const history = (recent ?? []).reverse().map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));

  const upstream = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, stream: true, system, messages: history }),
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(JSON.stringify({ error: "AI error" }), { status: 502 });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let full = "";
  let buffer = "";

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (full.trim()) {
          await admin.from("cp_dhara_messages").insert({ coach_id: user.id, role: "assistant", content: full });
        }
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload);
          if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
            const text = evt.delta.text as string;
            full += text;
            controller.enqueue(encoder.encode(text));
          }
        } catch { /* ignore keep-alives / partials */ }
      }
    },
    cancel() { reader.cancel(); },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" } });
}
