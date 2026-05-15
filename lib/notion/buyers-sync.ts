// Sync the Brand OS buyers list into the "Brand OS Buyers" Notion database.
//
// Each person is upserted by Email — the database is queried for a row with
// the matching email; if one exists, its properties are patched, otherwise
// a new page is created. We never delete rows.
//
// Required env vars:
//   NOTION_TOKEN         — Notion internal integration token (secret).
//   NOTION_BUYERS_DB_ID  — UUID of the Brand OS Buyers database. The DB
//                          must be shared with the integration (Notion →
//                          ... → Add connections).
//
// Edge-runtime safe — uses fetch directly, no SDK.

export type BuyerPerson = {
  name: string;
  email: string;
  status: "finished" | "in_progress" | "bought_not_started";
  variant: "mvp" | "full" | null;
  started_at: string | null;
  completed_at: string | null;
  last_module: string | null;
};

export type NotionSyncResult = {
  ok: boolean;
  reason?: string;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
};

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

const STATUS_LABEL: Record<BuyerPerson["status"], string> = {
  finished: "Finished",
  in_progress: "In progress",
  bought_not_started: "Bought - not started",
};

const VARIANT_LABEL: Record<"mvp" | "full", string> = {
  mvp: "Quick Start MVP",
  full: "Full run",
};

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

/** Build the Notion properties object for one person. */
function propsFor(p: BuyerPerson): Record<string, unknown> {
  const props: Record<string, unknown> = {
    Name: { title: [{ text: { content: p.name || "(no name)" } }] },
    Email: { email: p.email || null },
    Status: { select: { name: STATUS_LABEL[p.status] } },
  };
  if (p.variant) props.Variant = { select: { name: VARIANT_LABEL[p.variant] } };
  if (p.started_at) {
    props.Started = { date: { start: p.started_at.slice(0, 10) } };
  }
  if (p.completed_at) {
    props.Completed = { date: { start: p.completed_at.slice(0, 10) } };
  }
  if (p.last_module) {
    props["Last module"] = { rich_text: [{ text: { content: p.last_module } }] };
  }
  return props;
}

/** Find an existing row by email. Returns the page id, or null. */
async function findByEmail(token: string, dbId: string, email: string): Promise<string | null> {
  const res = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      filter: { property: "Email", email: { equals: email } },
      page_size: 1,
    }),
  });
  if (!res.ok) {
    throw new Error(`Notion query ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  const data = (await res.json()) as { results?: Array<{ id: string }> };
  return data.results?.[0]?.id ?? null;
}

async function createPage(token: string, dbId: string, p: BuyerPerson): Promise<void> {
  const res = await fetch(`${NOTION_API}/pages`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({
      parent: { database_id: dbId },
      properties: propsFor(p),
    }),
  });
  if (!res.ok) {
    throw new Error(`Notion create ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
}

async function updatePage(token: string, pageId: string, p: BuyerPerson): Promise<void> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: "PATCH",
    headers: headers(token),
    body: JSON.stringify({ properties: propsFor(p) }),
  });
  if (!res.ok) {
    throw new Error(`Notion update ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
}

export async function syncBuyersToNotion(people: BuyerPerson[]): Promise<NotionSyncResult> {
  const token = process.env.NOTION_TOKEN;
  const dbId = process.env.NOTION_BUYERS_DB_ID;
  if (!token || !dbId) {
    return {
      ok: false,
      reason: "NOTION_TOKEN or NOTION_BUYERS_DB_ID not configured",
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  // Sequential to stay polite under Notion's 3 req/s rate limit. Buyer list
  // is small (tens, not thousands) so this is fine for years.
  for (const p of people) {
    if (!p.email) {
      failed++;
      errors.push(`skipped: no email for ${p.name}`);
      continue;
    }
    try {
      const existing = await findByEmail(token, dbId, p.email);
      if (existing) {
        await updatePage(token, existing, p);
        updated++;
      } else {
        await createPage(token, dbId, p);
        created++;
      }
    } catch (err) {
      failed++;
      errors.push(`${p.email}: ${err instanceof Error ? err.message : "unknown"}`);
    }
  }

  return { ok: failed === 0, created, updated, failed, errors };
}
