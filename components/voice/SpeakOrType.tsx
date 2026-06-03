"use client";

import VoiceMicInput from "@/components/VoiceMicInput";

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  maxLength?: number;
  /** When set, pressing Enter (without Shift) fires this instead of a newline. */
  onSubmit?: () => void;
};

export default function SpeakOrType({
  value, onChange, placeholder, disabled = false, minRows = 4, maxLength = 500, onSubmit,
}: Props) {
  const appendTranscript = (text: string) => {
    const joined = value.trim() ? `${value.trim()} ${text}` : text;
    onChange(joined.slice(0, maxLength));
  };

  const remaining = maxLength - value.length;

  return (
    <div className={`rounded-[var(--r-lg)] border-[1.5px] bg-[var(--surface)] transition focus-within:border-[var(--brand-strong)] focus-within:shadow-[0_0_0_4px_var(--brand-soft)] ${disabled ? "opacity-60" : "border-[var(--border)]"}`}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onKeyDown={(e) => {
          if (onSubmit && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); }
        }}
        placeholder={placeholder}
        disabled={disabled}
        rows={minRows}
        className="w-full bg-transparent resize-none outline-none px-4 pt-4 pb-1 text-[15px] leading-relaxed text-[color:var(--text)] placeholder:text-[color:var(--text-faint)]"
      />
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        <span className="inline-flex items-center gap-2 text-[length:var(--t-caption)] text-[color:var(--text-muted)] font-semibold">
          <VoiceMicInput onTranscript={appendTranscript} disabled={disabled} />
          Tap to talk
        </span>
        {remaining <= 80 && (
          <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] tabular-nums">{remaining}</span>
        )}
      </div>
    </div>
  );
}
