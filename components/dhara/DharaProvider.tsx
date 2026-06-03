"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { executeSuggestion, type DharaSuggestion } from "@/lib/dhara/suggestions";

type Msg = { role: "user" | "assistant"; content: string; streaming?: boolean };
type Learned = { id: string; text: string; kind: string; confidence: string };

type DharaCtx = {
  open: boolean; setOpen: (v: boolean) => void;
  messages: Msg[]; sending: boolean;
  suggestions: DharaSuggestion[]; lastLearned: Learned[];
  send: (text: string) => Promise<void>;
  runSuggestion: (s: DharaSuggestion) => void;
};

const Ctx = createContext<DharaCtx | null>(null);
export function useDhara() { const c = useContext(Ctx); if (!c) throw new Error("useDhara outside provider"); return c; }

export default function DharaProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<DharaSuggestion[]>([]);
  const [lastLearned, setLastLearned] = useState<Learned[]>([]);

  useEffect(() => {
    if (!open || messages.length) return;
    fetch("/api/dhara/messages").then((r) => r.ok ? r.json() : { messages: [] })
      .then((d) => setMessages((d.messages ?? []).map((m: Msg) => ({ role: m.role, content: m.content }))))
      .catch(() => {});
  }, [open, messages.length]);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true); setSuggestions([]); setLastLearned([]);
    setMessages((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "", streaming: true }]);
    let full = "";
    try {
      const res = await fetch("/api/dhara/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) });
      if (!res.ok || !res.body) throw new Error("chat failed");
      const reader = res.body.getReader(); const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        full += dec.decode(value, { stream: true });
        setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: full, streaming: true }; return c; });
      }
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: full }; return c; });
      fetch("/api/dhara/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userMessage: msg, assistantMessage: full }) })
        .then((r) => r.ok ? r.json() : null).then((d) => { if (d) { setSuggestions(d.suggestions ?? []); setLastLearned(d.newlyLearned ?? []); } }).catch(() => {});
    } catch {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: "Something went quiet on my end. Try again?" }; return c; });
    } finally { setSending(false); }
  }, [sending]);

  const runSuggestion = useCallback((s: DharaSuggestion) => {
    const r = executeSuggestion(s);
    if (r) { setOpen(false); router.push(r.navigateTo); }
  }, [router]);

  return <Ctx.Provider value={{ open, setOpen, messages, sending, suggestions, lastLearned, send, runSuggestion }}>{children}</Ctx.Provider>;
}
