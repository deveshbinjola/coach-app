"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2 } from "lucide-react";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
};

type State = "idle" | "recording" | "processing";

export default function VoiceMicInput({ onTranscript, disabled = false, className = "" }: Props) {
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
      setError("Mic access denied");
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
    form.append("audio", blob, "dictation.webm");

    try {
      const res = await fetch("/api/voice/transcribe", {
        method: "POST",
        body: form,
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Transcription failed");
        setState("idle");
        return;
      }

      if (data.empty) {
        setError("Didn't catch that");
        setState("idle");
        return;
      }

      onTranscript(data.transcript);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setState("idle");
    }
  };

  const handleClick = () => {
    if (state === "recording") stopRecording();
    else if (state === "idle") void startRecording();
  };

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || state === "processing"}
        title={state === "recording" ? "Stop recording" : "Dictate with voice"}
        className={`
          inline-flex items-center justify-center w-8 h-8 rounded-full transition
          ${state === "recording"
            ? "bg-red-500 text-white animate-pulse"
            : state === "processing"
              ? "bg-[var(--surface-deep)] text-[color:var(--text-muted)] cursor-wait"
              : "bg-[var(--surface-deep)] text-[color:var(--text-muted)] hover:bg-[var(--border)] hover:text-[color:var(--text)]"
          }
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {state === "recording" ? (
          <Square className="w-3 h-3" />
        ) : state === "processing" ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Mic className="w-3.5 h-3.5" />
        )}
      </button>
      {error && (
        <span className="text-[length:var(--t-caption)] text-red-600">{error}</span>
      )}
    </span>
  );
}
