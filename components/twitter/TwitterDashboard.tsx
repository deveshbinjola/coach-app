"use client";

import { useState } from "react";
import type { Content } from "@/lib/types";
import type { TweetCategory } from "@/lib/twitter-agent";

const CATEGORY_LABELS: Record<string, string> = {
  breath_prompt: "Breath",
  somatic_tip: "Somatic",
  coaching_wisdom: "Wisdom",
  one_liner: "One-liner",
  thread: "Thread",
  hot_take: "Hot take",
  soma_positioning: "Soma",
};

const CATEGORY_COLORS: Record<string, string> = {
  breath_prompt: "bg-blue-100 text-blue-700",
  somatic_tip: "bg-purple-100 text-purple-700",
  coaching_wisdom: "bg-amber-100 text-amber-700",
  one_liner: "bg-green-100 text-green-700",
  thread: "bg-indigo-100 text-indigo-700",
  hot_take: "bg-red-100 text-red-700",
  soma_positioning: "bg-emerald-100 text-emerald-700",
};

type Tab = "queue" | "published";

export function TwitterDashboard({
  initialDrafts,
  initialPublished,
  hasApiKeys,
}: {
  initialDrafts: Content[];
  initialPublished: Content[];
  hasApiKeys: boolean;
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [published, setPublished] = useState(initialPublished);
  const [tab, setTab] = useState<Tab>("queue");
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(5);
  const [angle, setAngle] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<TweetCategory[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [postingId, setPostingId] = useState<string | null>(null);

  const reviewDrafts = drafts.filter((d) => d.status === "draft");
  const scheduledDrafts = drafts.filter((d) => d.status === "scheduled");

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/twitter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          categories: selectedCategories.length ? selectedCategories : undefined,
          angle: angle || undefined,
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();
      setDrafts((prev) => [...(data.content as Content[]), ...prev]);
      setAngle("");
    } catch {
      // silently handle
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove(id: string) {
    const res = await fetch(`/api/content/hooks`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "scheduled" }),
    });
    if (res.ok) {
      setDrafts((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "scheduled" as const } : d))
      );
    }
  }

  async function handleReject(id: string) {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }

  async function handlePost(id: string) {
    setPostingId(id);
    try {
      const res = await fetch("/api/twitter/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.ok) {
        // Move from drafts to published
        const posted = drafts.find((d) => d.id === id);
        if (posted) {
          setDrafts((prev) => prev.filter((d) => d.id !== id));
          setPublished((prev) => [{ ...posted, status: "published" as const }, ...prev]);
        }
      } else {
        alert(`Failed to post: ${data.error || "Unknown error"}`);
      }
    } catch {
      alert("Network error posting tweet");
    } finally {
      setPostingId(null);
    }
  }

  function startEdit(draft: Content) {
    setEditingId(draft.id);
    setEditBody(draft.body ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditBody("");
  }

  async function saveEdit(id: string) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, body: editBody } : d))
    );
    setEditingId(null);
    setEditBody("");
  }

  function toggleCategory(cat: TweetCategory) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  const tweetCategory = (d: Content) =>
    (d.performance as Record<string, unknown>)?.tweet_category as string | undefined;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0A0F1C]">Twitter Agent</h1>
        <p className="mt-1 text-[#5A5A6E]">
          Generate, review, and queue tweets in your voice.
        </p>
      </div>

      {/* Generator */}
      <div className="mb-8 rounded-xl border border-[#E5E5E5] bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-[#0A0F1C]">Generate tweets</h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-[#5A5A6E]">
            Angle (optional)
          </label>
          <input
            type="text"
            value={angle}
            onChange={(e) => setAngle(e.target.value)}
            placeholder="e.g. nervous system regulation for coaches who are burned out"
            className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm focus:border-[#00FF41] focus:outline-none"
          />
        </div>

        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-[#5A5A6E]">
            Categories (leave empty for mix)
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <button
                key={key}
                onClick={() => toggleCategory(key as TweetCategory)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  selectedCategories.includes(key as TweetCategory)
                    ? "bg-[#0A0F1C] text-white"
                    : "bg-[#F5F5F5] text-[#5A5A6E] hover:bg-[#E5E5E5]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-[#5A5A6E]">Count:</label>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-lg border border-[#E5E5E5] px-2 py-1 text-sm"
            >
              {[3, 5, 7, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-lg bg-[#0A0F1C] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#1a1f2e] disabled:opacity-50"
          >
            {generating ? "Generating..." : `Generate ${count} tweets`}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-lg bg-[#F5F5F5] p-1">
        <button
          onClick={() => setTab("queue")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "queue"
              ? "bg-white text-[#0A0F1C] shadow-sm"
              : "text-[#5A5A6E] hover:text-[#0A0F1C]"
          }`}
        >
          Queue ({reviewDrafts.length} review, {scheduledDrafts.length} ready)
        </button>
        <button
          onClick={() => setTab("published")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "published"
              ? "bg-white text-[#0A0F1C] shadow-sm"
              : "text-[#5A5A6E] hover:text-[#0A0F1C]"
          }`}
        >
          Published ({published.length})
        </button>
      </div>

      {/* Queue tab */}
      {tab === "queue" && (
        <div className="space-y-4">
          {reviewDrafts.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#5A5A6E]">
                Needs review
              </h3>
              <div className="space-y-3">
                {reviewDrafts.map((draft) => (
                  <TweetCard
                    key={draft.id}
                    draft={draft}
                    category={tweetCategory(draft)}
                    editing={editingId === draft.id}
                    editBody={editBody}
                    onEditBody={setEditBody}
                    onStartEdit={() => startEdit(draft)}
                    onCancelEdit={cancelEdit}
                    onSaveEdit={() => saveEdit(draft.id)}
                    onApprove={() => handleApprove(draft.id)}
                    onReject={() => handleReject(draft.id)}
                    onPost={() => handlePost(draft.id)}
                    posting={postingId === draft.id}
                    canPost={false}
                    showActions
                  />
                ))}
              </div>
            </div>
          )}

          {scheduledDrafts.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#5A5A6E]">
                Ready to post
              </h3>
              <div className="space-y-3">
                {scheduledDrafts.map((draft) => (
                  <TweetCard
                    key={draft.id}
                    draft={draft}
                    category={tweetCategory(draft)}
                    editing={false}
                    editBody=""
                    onEditBody={() => {}}
                    onStartEdit={() => {}}
                    onCancelEdit={() => {}}
                    onSaveEdit={() => {}}
                    onApprove={() => {}}
                    onReject={() => {}}
                    onPost={() => handlePost(draft.id)}
                    posting={postingId === draft.id}
                    canPost={hasApiKeys}
                    showActions={false}
                  />
                ))}
              </div>
            </div>
          )}

          {drafts.length === 0 && (
            <div className="rounded-xl border border-dashed border-[#E5E5E5] py-16 text-center">
              <p className="text-lg font-medium text-[#0A0F1C]">No tweets in queue</p>
              <p className="mt-1 text-sm text-[#5A5A6E]">
                Generate your first batch above.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Published tab */}
      {tab === "published" && (
        <div className="space-y-3">
          {published.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E5E5E5] py-16 text-center">
              <p className="text-lg font-medium text-[#0A0F1C]">Nothing published yet</p>
              <p className="mt-1 text-sm text-[#5A5A6E]">
                Approve tweets and post them to go live on X.
              </p>
            </div>
          ) : (
            published.map((p) => (
              <TweetCard
                key={p.id}
                draft={p}
                category={tweetCategory(p)}
                editing={false}
                editBody=""
                onEditBody={() => {}}
                onStartEdit={() => {}}
                onCancelEdit={() => {}}
                onSaveEdit={() => {}}
                onApprove={() => {}}
                onReject={() => {}}
                onPost={() => {}}
                posting={false}
                canPost={false}
                showActions={false}
              />
            ))
          )}
        </div>
      )}

      {/* API Key notice */}
      {!hasApiKeys && (
        <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            <strong>Posting disabled</strong> — Twitter/X API keys not configured yet.
            Tweets are generated and queued. Add your API keys to .env.local to enable posting.
          </p>
        </div>
      )}

      {hasApiKeys && (
        <div className="mt-8 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">
            <strong>X API connected</strong> — Posting to @sunnybinjola is live.
            Approve drafts and click "Post now" to publish. X free tier allows 17 tweets per 24 hours.
          </p>
        </div>
      )}
    </div>
  );
}

function TweetCard({
  draft,
  category,
  editing,
  editBody,
  onEditBody,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onApprove,
  onReject,
  onPost,
  posting,
  canPost,
  showActions,
}: {
  draft: Content;
  category: string | undefined;
  editing: boolean;
  editBody: string;
  onEditBody: (body: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onApprove: () => void;
  onReject: () => void;
  onPost: () => void;
  posting: boolean;
  canPost: boolean;
  showActions: boolean;
}) {
  const catLabel = category ? CATEGORY_LABELS[category] ?? category : null;
  const catColor = category ? CATEGORY_COLORS[category] ?? "bg-gray-100 text-gray-700" : "";
  const isThread = draft.content_type === "thread";
  const charCount = (draft.body ?? "").length;
  const tweetId = (draft.performance as Record<string, unknown>)?.tweet_id as string | undefined;

  return (
    <div className="rounded-xl border border-[#E5E5E5] bg-white p-4">
      <div className="mb-2 flex items-center gap-2">
        {catLabel && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${catColor}`}>
            {catLabel}
          </span>
        )}
        {isThread && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            Thread
          </span>
        )}
        <span className="text-xs text-[#5A5A6E]">
          {draft.status === "draft"
            ? "Needs review"
            : draft.status === "scheduled"
            ? "Ready"
            : draft.status === "published"
            ? "Posted"
            : draft.status === "failed"
            ? "Failed"
            : draft.status}
        </span>
        {tweetId && (
          <a
            href={`https://x.com/sunnybinjola/status/${tweetId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-blue-500 hover:underline"
          >
            View on X
          </a>
        )}
        {!isThread && !tweetId && (
          <span className={`ml-auto text-xs ${charCount > 280 ? "text-red-500 font-medium" : "text-[#5A5A6E]"}`}>
            {charCount}/280
          </span>
        )}
      </div>

      {editing ? (
        <div>
          <textarea
            value={editBody}
            onChange={(e) => onEditBody(e.target.value)}
            rows={isThread ? 10 : 3}
            className="w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-sm focus:border-[#00FF41] focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={onSaveEdit}
              className="rounded-lg bg-[#0A0F1C] px-3 py-1 text-xs font-medium text-white"
            >
              Save
            </button>
            <button
              onClick={onCancelEdit}
              className="rounded-lg bg-[#F5F5F5] px-3 py-1 text-xs font-medium text-[#5A5A6E]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#1A1A2E]">
          {draft.body}
        </p>
      )}

      {/* Review actions (draft status) */}
      {showActions && !editing && (
        <div className="mt-3 flex gap-2 border-t border-[#F5F5F5] pt-3">
          <button
            onClick={onApprove}
            className="rounded-lg bg-green-50 px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
          >
            Approve
          </button>
          <button
            onClick={onStartEdit}
            className="rounded-lg bg-[#F5F5F5] px-3 py-1 text-xs font-medium text-[#5A5A6E] hover:bg-[#E5E5E5]"
          >
            Edit
          </button>
          <button
            onClick={onReject}
            className="rounded-lg bg-red-50 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            Discard
          </button>
        </div>
      )}

      {/* Post button (scheduled status) */}
      {canPost && draft.status === "scheduled" && !editing && (
        <div className="mt-3 flex gap-2 border-t border-[#F5F5F5] pt-3">
          <button
            onClick={onPost}
            disabled={posting}
            className="rounded-lg bg-[#0A0F1C] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#1a1f2e] disabled:opacity-50"
          >
            {posting ? "Posting..." : "Post now"}
          </button>
        </div>
      )}
    </div>
  );
}
