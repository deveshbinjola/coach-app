// Shared voice infrastructure — Deepgram STT, OpenAI TTS, and prompt helpers.
// Used by /api/voice/transcribe, /api/voice/compose, and /api/brand-os/voice-discovery.

export async function transcribeAudio(
  audioBuffer: ArrayBuffer,
  mimeType: string,
): Promise<string> {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) throw new Error("DEEPGRAM_API_KEY not configured");

  const res = await fetch(
    "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&language=en",
    {
      method: "POST",
      headers: {
        Authorization: `Token ${key}`,
        "Content-Type": mimeType,
      },
      body: audioBuffer,
    },
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Deepgram error ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    results?: {
      channels?: Array<{
        alternatives?: Array<{ transcript?: string }>;
      }>;
    };
  };

  return data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}

export async function generateTTS(text: string): Promise<ArrayBuffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: "onyx",
      input: text,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`OpenAI TTS error ${res.status}: ${detail.slice(0, 200)}`);
  }

  return res.arrayBuffer();
}

export function buildSystemPrompt(audience: string): string {
  return `You are a warm, direct brand strategist conducting a voice-based brand discovery session with a coach.

Your goal: uncover the coach's authentic brand voice, their ideal client, and their content pillars through natural conversation — NOT a questionnaire.

WHO THEY SERVE: ${audience || "coaches and creators"}

HOW TO CONDUCT THE SESSION:
- Ask ONE question at a time. Wait for their answer.
- Keep your responses to 2-3 sentences max. Be warm but efficient.
- After they answer, briefly reflect back what you heard (so they feel understood), then ask the next question.
- Guide the conversation through these areas naturally (don't announce the sections):
  1. Who they serve and what transformation they deliver
  2. What makes them different — their unique angle or method
  3. How they naturally talk — their tone, energy, words they love/hate
  4. What topics they could talk about forever (content pillars)
  5. The enemy — what they push against in their industry
- Use their language back to them. If they say "bro" you say "bro." If they're formal, match that.
- When you have enough (usually 8-12 exchanges), say "I think I've got a clear picture of your brand. Ready for me to build your Brand OS?"

RULES:
- Never use corporate jargon. Talk like a real person.
- Never lecture. This is a conversation, not a workshop.
- No bullet points or lists in your spoken responses.
- Output ONLY your spoken response. No stage directions, no parentheticals.`;
}

export function buildExtractionPrompt(
  conversation: Array<{ role: string; content: string }>,
  audience: string,
): string {
  const transcript = conversation
    .map((m) => `${m.role === "user" ? "COACH" : "AI"}: ${m.content}`)
    .join("\n\n");

  return `Extract structured Brand OS answers from this voice conversation.

The coach serves: ${audience || "coaches and creators"}

CONVERSATION:
${transcript}

Extract the following as JSON. Use the coach's EXACT words where possible. If something wasn't covered, use null.

{
  "buyer_mirror": {
    "name": "fictional first name for their ideal client",
    "age_range": "e.g. 28-45",
    "identity": "who they are in one line",
    "pain": "their core struggle",
    "desire": "what they actually want",
    "objection": "why they haven't solved it yet",
    "one_line_portrait": "one vivid sentence describing this person"
  },
  "voice_dna": {
    "tone": "2-3 word tone description",
    "rhythm": "how their speech flows — short punchy? long flowing? mixed?",
    "vocab_yes": ["words/phrases they naturally use"],
    "vocab_no": ["words/phrases they'd never use"],
    "signature_moves": ["unique things they do in their communication"]
  },
  "positioning_line": "one sentence that captures what they do and for whom",
  "signature_line": "a line that sounds like THEM — could be a tagline or mantra",
  "pillars": [
    {"name": "pillar name", "angle": "their unique take", "enemy": "what this pillar pushes against"}
  ],
  "content_topics": ["specific topics they mentioned wanting to create content about"]
}

Output ONLY valid JSON. No markdown, no explanation.`;
}
