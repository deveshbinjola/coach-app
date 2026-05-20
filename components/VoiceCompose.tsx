"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";

type Props = {
  onDraft: (draft: string, transcript: string) => void;
  purpose?: string;
  leadName?: string;
  context?: string;
  label?: string;
  disabled?: boolean;
};

type State = "idle" | "recording" | "processing";

export default function VoiceCompose({
  onDraft,
  purpose = "content",
  leadName = "",
  context = "",
  label,
  disabled = false,
}: Props) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

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
        void sendToAPI(blob);
      };

      recorder.start();
      mediaRecorder.current = recorder;
      setState("recording");
    } catch {
      setError("Microphone access denied.");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.stop();
      setState("processing");
    }
  }, []);

  const sendToAPI = async (blob: Blob) => {
    const form = new FormData();
    form.append("audio", blob, "voice-compose.webm");
    form.append("purpose", purpose);
    if (leadName) form.append("leadName", leadName);
    if (context) form.append("context", context);

    try {
      const res = await fetch("/api/voice/compose", {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        setState("idle");
        return;
      }

      if (data.error === "no_speech") {
        setError("Didn't catch that. Try again.");
        setState("idle");
        return;
      }

      onDraft(data.draft, data.transcript);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setState("idle");
    }
  };

  const handleClick = () => {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle") {
      void startRecording();
    }
  };

  const buttonLabel =
    state === "recording"
      ? "Stop"
      : state === "processing"
        ? "Writing..."
        : label ?? "Talk to draft";

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || state === "processing"}
        className={`
          inline-flex items-center gap-2 px-3 py-2 rounded-[var(--r-md)] text-[length:var(--t-sm)] font-bold transition
          ${state === "recording"
            ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
            : state === "processing"
              ? "bg-[var(--surface-deep)] text-[color:var(--text-muted)] cursor-wait"
              : "bg-[var(--surface-deep)] text-[color:var(--text)] hover:bg-[var(--border)] hover:text-[color:var(--text)]"
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {state === "recording" ? (
          <Square className="w-3.5 h-3.5" />
        ) : state === "processing" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Mic className="w-3.5 h-3.5" />
        )}
        {buttonLabel}
      </button>

      {error && (
        <span className="text-[length:var(--t-caption)] text-red-600">{error}</span>
      )}

      {state === "recording" && (
        <span className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
          Talk about what you want to say... tap Stop when done.
        </span>
      )}
    </div>
  );
}
