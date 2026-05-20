import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAuthOrTrial } from "@/lib/brand-os/auth-or-trial";
import { rateLimitByUser } from "@/lib/rate-limit";
import {
  transcribeAudio,
  generateTTS,
  buildSystemPrompt,
  buildExtractionPrompt,
} from "@/lib/brand-os/voice-discovery";

export const runtime = "edge";

type Message = { role: "user" | "assistant"; content: string };

export async function POST(request: NextRequest) {
  const auth = await resolveAuthOrTrial(request);
  if (!auth.ok) return auth.response;
  const { coachId, dbClient } = auth;

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return handleExtract(request, coachId, dbClient);
  }

  return handleChatTurn(request, coachId);
}

async function handleChatTurn(request: NextRequest, coachId: string) {
  const rl = rateLimitByUser(coachId, "voice-discovery/chat", 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const form = await request.formData();
  const audioFile = form.get("audio") as File | null;
  const historyRaw = form.get("history") as string | null;
  const audience = (form.get("audience") as string | null) ?? "";

  if (!audioFile) {
    return NextResponse.json({ error: "audio field required" }, { status: 400 });
  }

  const audioBuffer = await audioFile.arrayBuffer();
  const transcript = await transcribeAudio(audioBuffer, audioFile.type || "audio/webm");

  if (!transcript.trim()) {
    return NextResponse.json({ error: "no_speech", transcript: "" });
  }

  let history: Message[] = [];
  try {
    history = historyRaw ? JSON.parse(historyRaw) : [];
  } catch {
    history = [];
  }

  const messages: Message[] = [
    ...history,
    { role: "user", content: transcript },
  ];

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
      system: buildSystemPrompt(audience),
      messages,
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    return NextResponse.json(
      { error: "anthropic_error", detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  const aiData = (await aiRes.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const aiText = aiData.content?.find((c) => c.type === "text")?.text ?? "";

  let audioBase64 = "";
  try {
    const ttsBuffer = await generateTTS(aiText);
    const bytes = new Uint8Array(ttsBuffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    audioBase64 = btoa(binary);
  } catch {
    // TTS failure is non-fatal — client can still show text
  }

  return NextResponse.json({ transcript, aiText, audioBase64 });
}

async function handleExtract(
  request: NextRequest,
  coachId: string,
  dbClient: SupabaseClient,
) {
  const rl = rateLimitByUser(coachId, "voice-discovery/extract", 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = (await request.json()) as {
    op: string;
    conversation: Message[];
    audience?: string;
  };

  if (body.op !== "extract" || !body.conversation?.length) {
    return NextResponse.json({ error: "Invalid extract request" }, { status: 400 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const extractionPrompt = buildExtractionPrompt(
    body.conversation,
    body.audience ?? "",
  );

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: extractionPrompt }],
    }),
  });

  if (!aiRes.ok) {
    const detail = await aiRes.text();
    return NextResponse.json(
      { error: "anthropic_error", detail: detail.slice(0, 300) },
      { status: 502 },
    );
  }

  const aiData = (await aiRes.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const rawJson = aiData.content?.find((c) => c.type === "text")?.text ?? "{}";

  let extracted: Record<string, unknown>;
  try {
    extracted = JSON.parse(rawJson);
  } catch {
    return NextResponse.json({ error: "Failed to parse extraction", raw: rawJson }, { status: 500 });
  }

  const { data: run } = await dbClient
    .from("cp_brand_os_runs")
    .insert({
      coach_id: coachId,
      status: "completed",
      source: "voice_discovery",
      current_module: "broadcast",
      answers_json: extracted,
    })
    .select("id")
    .single();

  if (!run) {
    return NextResponse.json({ error: "Failed to create run" }, { status: 500 });
  }

  const answerRows = flattenToAnswers(extracted, run.id, coachId);
  if (answerRows.length > 0) {
    await dbClient.from("cp_brand_os_answers").insert(answerRows);
  }

  return NextResponse.json({ runId: run.id, extracted });
}

function flattenToAnswers(
  extracted: Record<string, unknown>,
  runId: string,
  coachId: string,
): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  const modules: Record<string, string> = {
    buyer_mirror: "mirror",
    voice_dna: "signal",
    positioning_line: "stance",
    signature_line: "stance",
    pillars: "funnel",
    content_topics: "distribution",
  };

  for (const [key, value] of Object.entries(extracted)) {
    if (value == null) continue;
    rows.push({
      run_id: runId,
      coach_id: coachId,
      module: modules[key] ?? "preflight",
      question_key: key,
      answer: typeof value === "string" ? value : JSON.stringify(value),
    });
  }

  return rows;
}
