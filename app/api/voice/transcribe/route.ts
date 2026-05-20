import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthOrTrial } from "@/lib/brand-os/auth-or-trial";
import { rateLimitByUser } from "@/lib/rate-limit";
import { transcribeAudio } from "@/lib/brand-os/voice-discovery";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  const auth = await resolveAuthOrTrial(request);
  if (!auth.ok) return auth.response;

  const rl = rateLimitByUser(auth.coachId, "voice/transcribe", 30, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const form = await request.formData();
  const audioFile = form.get("audio") as File | null;
  if (!audioFile) {
    return NextResponse.json({ error: "audio field required" }, { status: 400 });
  }

  const audioBuffer = await audioFile.arrayBuffer();
  const transcript = await transcribeAudio(audioBuffer, audioFile.type || "audio/webm");

  if (!transcript.trim()) {
    return NextResponse.json({ transcript: "", empty: true });
  }

  return NextResponse.json({ transcript });
}
