#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const REPORT_DIR = path.join(ROOT, "qa", "reports");
const TICKET_DIR = path.join(ROOT, "qa", "tickets");
const DEFAULT_PORT = Number(process.env.QA_PORT ?? 3210);
const BASE_URL = process.env.QA_BASE_URL ?? `http://127.0.0.1:${DEFAULT_PORT}`;
const AUTH_COOKIE = process.env.QA_COOKIE_HEADER ?? "";
const QA_LEAD_ID = process.env.QA_LEAD_ID ?? "";
const START_SERVER = !process.env.QA_BASE_URL;

const KNOWN_TSC_NOISE = [
  /^supabase\/functions\//,
  /Cannot find name 'Deno'/,
  /Cannot find module 'jsr:/,
  /Cannot find module 'npm:/,
  /lib\/supabase-server\.ts.*implicitly/,
  /middleware\.ts.*implicitly/,
  /leads\/new\/page\.tsx.*'any'/,
  /EditLeadForm\.tsx.*'any'/,
];

const PUBLIC_PAGES = new Set(["/login", "/api/docs"]);
const API_EXPECTATIONS = [
  { method: "GET", route: "/api/docs", expected: [200] },
  { method: "GET", route: "/api/voice/training-sources", expected: [405] },
  { method: "POST", route: "/api/voice/training-sources", expected: [401, 400] },
];

const failures = [];
const warnings = [];
const checks = [];

await mkdir(REPORT_DIR, { recursive: true });
await mkdir(TICKET_DIR, { recursive: true });

const startedAt = new Date();
let server;

try {
  await step("build", async () => {
    await run("npm", ["run", "build"], { timeoutMs: 120_000 });
  });

  await step("typecheck", async () => {
    const result = await run("npx", ["tsc", "--noEmit"], {
      timeoutMs: 120_000,
      allowFailure: true,
    });
    const meaningful = result.output
      .split("\n")
      .filter((line) => line.trim())
      .filter((line) => !KNOWN_TSC_NOISE.some((pattern) => pattern.test(line)));
    if (meaningful.length > 0) {
      throw new Error(meaningful.slice(0, 40).join("\n"));
    }
  });

  await step("server", async () => {
    if (START_SERVER) {
      server = spawn(
        "npm",
        ["run", "start", "--", "-H", "127.0.0.1", "-p", String(DEFAULT_PORT)],
        {
          cwd: ROOT,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            HOST: "127.0.0.1",
            PORT: String(DEFAULT_PORT),
          },
        }
      );
      server.stdout.on("data", (chunk) => process.stdout.write(chunk));
      server.stderr.on("data", (chunk) => process.stderr.write(chunk));
    }
    await waitForServer(BASE_URL, 30_000);
  });

  const pageRoutes = await discoverPageRoutes();
  await step("page smoke", async () => {
    for (const route of pageRoutes) {
      await checkPage(route);
    }
  });

  await step("api smoke", async () => {
    for (const api of API_EXPECTATIONS) {
      await checkApi(api);
    }
  });

  await step("migration guard", async () => {
    const migration = path.join(
      ROOT,
      "supabase",
      "migrations",
      "20260429_voice_training_sources.sql"
    );
    if (!existsSync(migration)) {
      throw new Error("Missing voice training sources migration.");
    }
  });
} finally {
  if (server) server.kill("SIGTERM");
}

const finishedAt = new Date();
const report = {
  status: failures.length === 0 ? "pass" : "fail",
  started_at: startedAt.toISOString(),
  finished_at: finishedAt.toISOString(),
  base_url: BASE_URL,
  auth_mode: AUTH_COOKIE ? "cookie" : "anonymous",
  checks,
  warnings,
  failures,
};

const stamp = finishedAt.toISOString().replace(/[:.]/g, "-");
await writeFile(
  path.join(REPORT_DIR, `${stamp}.json`),
  JSON.stringify(report, null, 2)
);
await writeFile(
  path.join(REPORT_DIR, "latest.json"),
  JSON.stringify(report, null, 2)
);
await writeFile(path.join(REPORT_DIR, `${stamp}.md`), renderMarkdownReport(report));

if (failures.length > 0) {
  for (const failure of failures) {
    await writeTicketDraft(failure, stamp);
  }
  console.error(`QA failed: ${failures.length} issue(s). Ticket drafts written to qa/tickets.`);
  process.exit(1);
}

console.log("QA passed. No tickets created.");

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    checks.push({ name, status: "pass", ms: Date.now() - started });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name, status: "fail", ms: Date.now() - started, message });
    failures.push({
      title: `QA failed: ${name}`,
      area: name,
      severity: name === "build" ? "critical" : "high",
      evidence: message.slice(0, 4000),
      reproduction: `Run npm run qa:daily from ${ROOT}.`,
      next_action: "Fix the failing check and rerun npm run qa:daily.",
    });
  }
}

async function checkPage(route) {
  const headers = AUTH_COOKIE ? { cookie: AUTH_COOKIE } : {};
  const response = await fetch(`${BASE_URL}${route}`, {
    headers,
    redirect: "manual",
  });
  const text = await response.text();
  const hasErrorBody = hasBrokenBody(text);
  const expected = expectedPageStatuses(route);
  const ok = expected.includes(response.status) && !hasErrorBody;
  checks.push({
    name: `page ${route}`,
    status: ok ? "pass" : "fail",
    http_status: response.status,
    expected,
  });
  if (!ok) {
    failures.push({
      title: `Broken page: ${route}`,
      area: "page",
      severity: response.status >= 500 || hasErrorBody ? "critical" : "high",
      evidence: [
        `HTTP ${response.status}, expected ${expected.join(" or ")}.`,
        response.headers.get("location") ? `Location: ${response.headers.get("location")}` : "",
        hasErrorBody ? "Body contains a Next.js or runtime error signature." : "",
        excerpt(text),
      ].filter(Boolean).join("\n"),
      reproduction: `Open ${BASE_URL}${route}.`,
      next_action: "Inspect the route server component and browser console, then rerun npm run qa:daily.",
    });
  }
}

async function checkApi({ method, route, expected }) {
  const headers = AUTH_COOKIE ? { cookie: AUTH_COOKIE } : {};
  const response = await fetch(`${BASE_URL}${route}`, {
    method,
    headers,
    redirect: "manual",
  });
  const text = await response.text();
  const ok = expected.includes(response.status) && !hasBrokenBody(text);
  checks.push({
    name: `api ${method} ${route}`,
    status: ok ? "pass" : "fail",
    http_status: response.status,
    expected,
  });
  if (!ok) {
    failures.push({
      title: `Broken API: ${method} ${route}`,
      area: "api",
      severity: response.status >= 500 ? "critical" : "high",
      evidence: `HTTP ${response.status}, expected ${expected.join(" or ")}.\n${excerpt(text)}`,
      reproduction: `${method} ${BASE_URL}${route}`,
      next_action: "Inspect the API route and server logs, then rerun npm run qa:daily.",
    });
  }
}

async function discoverPageRoutes() {
  const files = await walk(path.join(ROOT, "app"));
  return files
    .filter((file) => file.endsWith(`${path.sep}page.tsx`))
    .map((file) => pageFileToRoute(file))
    .filter(Boolean)
    .sort();
}

function pageFileToRoute(file) {
  let relative = path.relative(path.join(ROOT, "app"), file);
  relative = relative.replace(/\/page\.tsx$/, "").replace(/\\/g, "/");
  if (relative === "page.tsx" || relative === "") return "/";
  relative = relative.replace(/\/?page\.tsx$/, "");
  if (relative.startsWith("api/")) return `/${relative}`;
  if (relative.includes("[id]")) {
    if (!QA_LEAD_ID) {
      warnings.push(`Skipped dynamic route /${relative.replace("[id]", ":id")} because QA_LEAD_ID is not set.`);
      return null;
    }
    relative = relative.replace("[id]", QA_LEAD_ID);
  }
  return `/${relative}`;
}

function expectedPageStatuses(route) {
  if (PUBLIC_PAGES.has(route)) return [200];
  if (AUTH_COOKIE) return [200, 307, 308];
  return [307, 308];
}

function hasBrokenBody(text) {
  return [
    "Application error",
    "Server Error",
    "missing required error components",
    "Cannot find module",
    "Unhandled Runtime Error",
  ].some((signature) => text.includes(signature));
}

function excerpt(text) {
  return text.replace(/\s+/g, " ").slice(0, 900);
}

async function waitForServer(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/login`, { redirect: "manual" });
      if (response.status > 0) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not become ready at ${baseUrl}. ${lastError}`);
}

function run(command, args, { timeoutMs, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, shell: false });
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${command} ${args.join(" ")} timed out.`));
    }, timeoutMs ?? 60_000);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || allowFailure) {
        resolve({ code, output });
      } else {
        reject(new Error(output || `${command} exited ${code}.`));
      }
    });
  });
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith("_")) continue;
      files.push(...await walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function renderMarkdownReport(report) {
  const lines = [
    `# Coach Platform QA: ${report.status.toUpperCase()}`,
    "",
    `- Started: ${report.started_at}`,
    `- Finished: ${report.finished_at}`,
    `- Base URL: ${report.base_url}`,
    `- Auth mode: ${report.auth_mode}`,
    `- Checks: ${report.checks.length}`,
    `- Failures: ${report.failures.length}`,
    `- Warnings: ${report.warnings.length}`,
    "",
  ];
  if (report.warnings.length > 0) {
    lines.push("## Warnings", "", ...report.warnings.map((warning) => `- ${warning}`), "");
  }
  if (report.failures.length > 0) {
    lines.push("## Failures", "");
    for (const failure of report.failures) {
      lines.push(`### ${failure.title}`, "", `Severity: ${failure.severity}`, "", failure.evidence, "");
    }
  }
  return lines.join("\n");
}

async function writeTicketDraft(failure, stamp) {
  const id = createHash("sha1")
    .update(`${failure.title}:${failure.evidence}`)
    .digest("hex")
    .slice(0, 10);
  const slug = failure.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const file = path.join(TICKET_DIR, `${stamp}-${slug}-${id}.md`);
  const body = [
    `# ${failure.title}`,
    "",
    `Severity: ${failure.severity}`,
    `Area: ${failure.area}`,
    "",
    "## Evidence",
    failure.evidence,
    "",
    "## Reproduction",
    failure.reproduction,
    "",
    "## Next Action",
    failure.next_action,
    "",
    "## Ticket Status",
    "Draft only. Review before copying into Linear or another tracker.",
    "",
  ].join("\n");
  await writeFile(file, body);
}
