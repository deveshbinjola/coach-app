"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { executeSuggestion, type DharaSuggestion } from "@/lib/dhara/suggestions";
import type { StarterPrompt } from "@/lib/dhara/prompts";

type Msg = { role: "user" | "assistant"; content: string; streaming?: boolean; source?: "data" | "ai" };
type Learned = { id: string; text: string; kind: string; confidence: string };

type DharaCtx = {
  open: boolean; setOpen: (v: boolean) => void;
  messages: Msg[]; sending: boolean;
  suggestions: DharaSuggestion[]; lastLearned: Learned[];
  starterPrompts: StarterPrompt[]; greeting: string;
  send: (text: string) => Promise<void>;
  runSuggestion: (s: DharaSuggestion) => void;
  /** Open the panel AND have the assistant ask its first question. The only
   *  path where Dhara speaks first. See app/api/dhara/interview/start. */
  startInterview: () => Promise<void>;
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
  const [starterPrompts, setStarterPrompts] = useState<StarterPrompt[]>([]);
  const [greeting, setGreeting] = useState("Take a breath. What's on your mind?");

  useEffect(() => {
    if (!open || messages.length) return;
    fetch("/api/dhara/messages").then((r) => r.ok ? r.json() : { messages: [] })
      // Functional guard: startInterview may have populated the thread while
      // this was in flight. Never clobber a populated thread.
      .then((d) => setMessages((cur) => cur.length ? cur : (d.messages ?? []).map((m: Msg) => ({ role: m.role, content: m.content }))))
      .catch(() => {});
  }, [open, messages.length]);

  // Reverse-engineer tailored starter prompts from the coach's data on open.
  useEffect(() => {
    if (!open || starterPrompts.length) return;
    fetch("/api/dhara/prompts").then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setStarterPrompts(d.prompts ?? []); if (d.greeting) setGreeting(d.greeting); } })
      .catch(() => {});
  }, [open, starterPrompts.length]);

  const send = useCallback(async (text: string) => {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true); setSuggestions([]); setLastLearned([]);
    setMessages((m) => [...m, { role: "user", content: msg }, { role: "assistant", content: "", streaming: true }]);
    try {
      const res = await fetch("/api/dhara/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) });
      const data = await res.json().catch(() => ({}));
      const reply = res.ok && typeof data.reply === "string" && data.reply.trim()
        ? data.reply
        : (data.error ?? "Something went quiet on my end. Try again?");
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: reply, source: data.source }; return c; });
      // Deterministic navigation command — take the coach there.
      if (res.ok && data.navigateTo) { setOpen(false); router.push(data.navigateTo); }
      // Only learn from open-ended (AI) replies, not data answers.
      if (res.ok && data.reply && data.source === "ai") {
        fetch("/api/dhara/learn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userMessage: msg, assistantMessage: data.reply }) })
          .then((r) => r.ok ? r.json() : null).then((d) => { if (d) { setSuggestions(d.suggestions ?? []); setLastLearned(d.newlyLearned ?? []); } }).catch(() => {});
      }
    } catch {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { role: "assistant", content: "Something went quiet on my end. Try again?" }; return c; });
    } finally { setSending(false); }
  }, [sending]);

  // Opens the panel and puts the assistant's first question in the thread.
  // Loads history in the same pass so the question lands at the bottom of
  // an existing conversation rather than racing the history fetch.
  const startInterview = useCallback(async () => {
    setOpen(true);
    try {
      const [hist, started] = await Promise.all([
        fetch("/api/dhara/messages").then((r) => (r.ok ? r.json() : { messages: [] })).catch(() => ({ messages: [] })),
        fetch("/api/dhara/interview/start", { method: "POST" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const prior: Msg[] = ((hist.messages ?? []) as Msg[]).map((m) => ({ role: m.role, content: m.content }));
      setMessages(started?.message ? [...prior, { role: "assistant", content: started.message }] : prior);
    } catch {
      /* panel is open either way; the coach can still type */
    }
  }, []);

  const runSuggestion = useCallback((s: DharaSuggestion) => {
    const r = executeSuggestion(s);
    if (r) { setOpen(false); router.push(r.navigateTo); }
  }, [router]);

  return <Ctx.Provider value={{ open, setOpen, messages, sending, suggestions, lastLearned, starterPrompts, greeting, send, runSuggestion, startInterview }}>{children}</Ctx.Provider>;
}
