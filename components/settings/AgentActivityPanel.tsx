"use client";

// AgentActivityPanel — last 20 API calls from external agents.
//
// Currently not rendered in /settings (commented out at the call site
// per the comment in ApiKeysPanel: "moves to /developers route alongside
// API keys + webhooks"). Component preserved so the future /developers
// page can drop it in without rebuilding.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import type { AgentActivity } from "@/lib/types";
import { ago, methodColor } from "./utils";

export default function AgentActivityPanel() {
  const [activity, setActivity] = useState<AgentActivity[] | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    (async () => {
      // RLS scopes us to this coach's rows automatically.
      const { data } = await supabase
        .from("cp_agent_activity")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      setActivity((data as AgentActivity[]) ?? []);
      setLoading(false);
    })();
    // We don't refetch on every render; the page reload picks up new
    // activity. Could add a "Refresh" button if coaches ever want it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-6 pt-5 border-t border-gray-200">
      <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="text-sm font-extrabold text-navy">
            Recent agent activity
          </h3>
          <p className="text-[11px] text-gray-500">
            Last 20 calls from your agents. Trust feature — verify what
            they're doing.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : !activity || activity.length === 0 ? (
        <p className="text-xs text-gray-500 italic">
          No agent activity yet. When an agent calls the API, every request
          shows up here.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden text-xs">
          {activity.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 p-2.5 hover:bg-surface"
            >
              <span
                className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${methodColor(a.method)}`}
              >
                {a.method}
              </span>
              <code className="font-mono text-[11px] truncate min-w-0 flex-1 text-navy">
                {a.path}
              </code>
              <span className="text-[10px] text-gray-500 shrink-0 tabular-nums">
                {ago(a.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
