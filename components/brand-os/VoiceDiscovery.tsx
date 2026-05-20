"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

type Message = { role: "user" | "assistant"; content: string };
type State = "idle" | "recording" | "processing" | "speaking";

export default function VoiceDiscovery({ audience }: { audience: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioRef.current?.pause();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunks.current = [];

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType });
        void sendTurn(blob);
      };

      recorder.start();
      mediaRecorder.current = recorder;
      setState("recording");
    } catch {
      setError("Microphone access denied. Check your browser settings.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
      setState("processing");
    }
  }, []);

  const sendTurn = async (blob: Blob) => {
    const form = new FormData();
    form.append("audio", blob, "voice-discovery.webm");
    form.append("history", JSON.stringify(messages));
    form.append("audience", audience);

    try {
      const res = await fetch("/api/brand-os/voice-discovery", {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (!res.ok || data.error === "no_speech") {
        setError(data.error === "no_speech" ? "Didn't catch that. Try again." : data.error ?? "Something went wrong");
        setState("idle");
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "user", content: data.transcript },
        { role: "assistant", content: data.aiText },
      ]);

      if (data.audioBase64) {
        try {
          const audioBytes = atob(data.audioBase64);
          const arr = new Uint8Array(audioBytes.length);
          for (let i = 0; i < audioBytes.length; i++) {
            arr[i] = audioBytes.charCodeAt(i);
          }
          const audioBlob = new Blob([arr], { type: "audio/mpeg" });
          const url = URL.createObjectURL(audioBlob);
          const audio = new Audio(url);
          audioRef.current = audio;
          setState("speaking");
          audio.onended = () => {
            setState("idle");
            URL.revokeObjectURL(url);
          };
          audio.onerror = () => {
            setState("idle");
            URL.revokeObjectURL(url);
          };
          await audio.play();
        } catch {
          setState("idle");
        }
      } else {
        setState("idle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setState("idle");
    }
  };

  const handleMicClick = () => {
    if (state === "speaking") {
      audioRef.current?.pause();
      setState("idle");
    } else if (state === "recording") {
      stopRecording();
    } else if (state === "idle") {
      void startRecording();
    }
  };

  const handleFinish = async () => {
    if (messages.length < 6) return;
    setExtracting(true);
    try {
      const res = await fetch("/api/brand-os/voice-discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "extract",
          conversation: messages,
          audience,
        }),
      });
      const data = await res.json();
      if (data.runId) {
        router.push(`/brand-os/run/${data.runId}`);
      } else {
        setError(data.error ?? "Extraction failed");
        setExtracting(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setExtracting(false);
    }
  };

  const micLabel =
    state === "recording" ? "Stop" :
    state === "processing" ? "Thinking..." :
    state === "speaking" ? "Skip" :
    messages.length === 0 ? "Tap to start" : "Respond";

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-2xl mx-auto">
      {/* Chat area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <Mic className="w-12 h-12 mx-auto mb-4 text-[color:var(--brand)]" />
            <h2 className="text-[length:var(--t-lg)] font-bold text-[color:var(--text)] mb-2">
              Voice Brand Discovery
            </h2>
            <p className="text-[length:var(--t-body)] text-[color:var(--text-muted)] max-w-md mx-auto">
              Have a conversation about your brand. Talk naturally — the AI will ask
              questions and build your Brand OS from the conversation.
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] px-4 py-3 rounded-2xl text-[length:var(--t-body)] leading-[var(--leading-base)] ${
                m.role === "user"
                  ? "bg-[var(--brand)] text-[color:var(--surface)] rounded-br-md"
                  : "border border-[var(--border)] text-[color:var(--text)] rounded-bl-md"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.content}</p>
            </div>
          </div>
        ))}

        {state === "processing" && (
          <div className="flex justify-start">
            <div className="px-4 py-3 border border-[var(--border)] rounded-2xl rounded-bl-md">
              <Loader2 className="w-4 h-4 animate-spin text-[color:var(--text-muted)]" />
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-[var(--border)] p-4">
        {error && (
          <p className="text-red-600 text-[length:var(--t-caption)] mb-3 text-center">{error}</p>
        )}

        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={handleMicClick}
            disabled={state === "processing" || extracting}
            className={`
              inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-[length:var(--t-body)] transition
              ${state === "recording"
                ? "bg-red-500 text-white animate-pulse"
                : state === "speaking"
                  ? "bg-orange-500 text-white"
                  : "bg-[var(--brand)] text-[color:var(--surface)] hover:opacity-90"
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
          >
            {state === "recording" ? (
              <Square className="w-4 h-4" />
            ) : state === "processing" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
            {micLabel}
          </button>

          {messages.length >= 6 && (
            <button
              type="button"
              onClick={handleFinish}
              disabled={extracting || state !== "idle"}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-bold text-[length:var(--t-body)] border-2 border-[var(--brand)] text-[color:var(--brand)] hover:bg-[var(--brand)] hover:text-[color:var(--surface)] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {extracting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {extracting ? "Building..." : "Finish & build"}
            </button>
          )}
        </div>

        {state === "recording" && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] text-center mt-2">
            Listening... tap Stop when you're done talking.
          </p>
        )}
        {state === "speaking" && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] text-center mt-2">
            AI is speaking... tap Skip to interrupt.
          </p>
        )}
      </div>
    </div>
  );
}
