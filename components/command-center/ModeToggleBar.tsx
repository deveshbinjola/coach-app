// components/command-center/ModeToggleBar.tsx
"use client";

import { useRouter } from "next/navigation";
import ModeToggle, { type Mode } from "@/components/command-center/ModeToggle";

export default function ModeToggleBar({ mode }: { mode: Mode }) {
  const router = useRouter();
  function onModeChange(next: Mode) {
    if (next === mode) return;
    document.cookie = `cc-mode=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }
  return <ModeToggle mode={mode} onModeChange={onModeChange} />;
}
