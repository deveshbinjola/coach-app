"use client";

import { useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import type { ClientTask } from "@/lib/types";

type Props = {
  coachId: string;
  roomId: string;
  activeTasks: ClientTask[];
  doneTasks: ClientTask[];
  onTaskAdded: (task: ClientTask) => void;
  onTaskToggled: (task: ClientTask) => void;
  onError: (message: string) => void;
};

function isOverdue(task: ClientTask): boolean {
  return Boolean(task.due_at && task.status === "open" && new Date(task.due_at).getTime() < Date.now());
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default function HomeworkCard({
  coachId,
  roomId,
  activeTasks,
  doneTasks,
  onTaskAdded,
  onTaskToggled,
  onError,
}: Props) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [saving, setSaving] = useState(false);

  async function addTask() {
    if (!title.trim()) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("cp_client_tasks")
      .insert({
        coach_id: coachId,
        client_room_id: roomId,
        title: title.trim(),
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
      })
      .select()
      .single();
    setSaving(false);
    if (error) {
      onError(error.message);
      return;
    }
    onTaskAdded(data as ClientTask);
    setTitle("");
    setDueAt("");
  }

  async function toggleTask(task: ClientTask) {
    const done = task.status !== "done";
    const { data, error } = await supabase
      .from("cp_client_tasks")
      .update({
        status: done ? "done" : "open",
        completed_at: done ? new Date().toISOString() : null,
      })
      .eq("id", task.id)
      .select()
      .single();
    if (error) {
      onError(error.message);
      return;
    }
    onTaskToggled(data as ClientTask);
  }

  const sorted = [...activeTasks].sort((a, b) => {
    if (a.due_at && !b.due_at) return -1;
    if (!a.due_at && b.due_at) return 1;
    if (a.due_at && b.due_at) return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    return 0;
  });

  return (
    <Card className="space-y-3">
      <h3 className="text-[length:var(--t-h2)] font-extrabold text-[color:var(--text)]">Homework</h3>
      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="min-h-11 w-full rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] font-bold outline-none focus:border-[var(--brand-strong)]"
          placeholder="Add action item"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="min-h-9 min-w-0 flex-1 rounded-[var(--r-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)] outline-none focus:border-[var(--brand-strong)]"
          />
          <Button onClick={addTask} disabled={!title.trim() || saving} className="shrink-0">
            Add
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-3 text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
            No open homework.
          </p>
        ) : (
          sorted.map((task) => {
            const overdue = isOverdue(task);
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => toggleTask(task)}
                className={`flex w-full items-start gap-2 rounded-[var(--r-md)] border px-3 py-3 text-left transition hover:border-[var(--border-strong)] ${
                  overdue
                    ? "border-[var(--danger)] bg-[var(--danger-soft)]"
                    : "border-[var(--border-faint)] bg-[var(--surface)]"
                }`}
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--r-sm)] border border-[var(--brand)] text-[color:var(--brand-strong)]" />
                <div className="min-w-0 flex-1">
                  <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text)]">
                    {task.title}
                  </span>
                  {task.due_at && (
                    <div className={`mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${
                      overdue ? "text-[color:var(--danger)]" : "text-[color:var(--text-faint)]"
                    }`}>
                      {overdue && <AlertCircle size={10} aria-hidden />}
                      {formatDue(task.due_at)}
                    </div>
                  )}
                </div>
              </button>
            );
          })
        )}
        {doneTasks.slice(0, 3).map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => toggleTask(task)}
            className="flex w-full items-start gap-2 rounded-[var(--r-md)] bg-[var(--surface-deep)] px-3 py-2 text-left opacity-70"
          >
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[var(--brand)] text-[color:var(--text-inverse)]">
              <Check size={13} aria-hidden />
            </span>
            <span className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] line-through">
              {task.title}
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}
