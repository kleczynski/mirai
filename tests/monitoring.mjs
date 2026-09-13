// Offline endpoint regression: real SQL + disposable SQLite; no hosted writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

await import("./typescript-loader.mjs");
const { buildMonitoringServices, observeClerk } = await import("../lib/monitoring.ts");

const db = new DatabaseSync(":memory:");
for (const file of [
  "0000_lucky_silver_sable.sql",
  "0002_polite_bucky.sql",
  "0003_salty_giant_girl.sql",
]) {
  // Only the tables this endpoint reads are needed; use the committed schema.
  const sql = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (/CREATE TABLE `(?:sessions|discovery_requests|project_files)`/.test(statement))
      db.exec(statement);
  }
}
db.exec("CREATE TABLE discovery_retired_usage (accounted_microusd INTEGER NOT NULL)");
const session = db.prepare(
  "INSERT INTO sessions (id,owner_id,token_hash,expires_at,data,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
);
session.run(
  "own",
  "owner",
  "fictional",
  "2099-01-01",
  JSON.stringify({ demos: [{}], feedback: [{}, {}] }),
  "2090-01-01",
  "2090-01-01",
);
session.run(
  "other",
  "other-owner",
  "fictional-other",
  "2099-01-01",
  "{}",
  "2099-01-01",
  "2099-01-01",
);
const request = db.prepare(
  "INSERT INTO discovery_requests (id,session_id,fingerprint,status,reserved_microusd,charged_microusd,created_at) VALUES (?,?,?,?,?,?,?)",
);
request.run("saved", "own", "fictional", "saved", 100000, 20000, 1000);
request.run("pending", "own", "fictional", "pending", 100000, null, 2000);
request.run("foreign", "other", "fictional", "failed", 900000, null, 3000);
db.exec("INSERT INTO discovery_retired_usage VALUES (30000)");

db.prepare(
  "INSERT INTO project_files (id,project_id,author_id,object_key,name,mime,size,content_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
).run(
  "file",
  "own",
  "owner",
  "fictional-key",
  "fictional.txt",
  "text/plain",
  42,
  "fictional",
  "2090-01-01",
);
db.prepare(
  "INSERT INTO project_files (id,project_id,author_id,object_key,name,mime,size,content_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
).run(
  "foreign-file",
  "other",
  "other-owner",
  "fictional-other-key",
  "fictional.txt",
  "text/plain",
  9999,
  "fictional",
  "2090-01-01",
);

const source = readFileSync(
  new URL("../app/api/admin/monitoring/route.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(
  source.replace(/^import [\s\S]*?;\n/gm, "").replace(/export /g, ""),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  },
).outputText;
let authorized = true;
let broken = false;
let brokenFiles = false;
let noMetadata = false;
let reads = 0;
const logs = [];
const get = new Function(
  "env",
  "database",
  "failure",
  "json",
  "owner",
  "discoveryConfig",
  "console",
  "buildMonitoringServices",
  "observeClerk",
  `${javascript}; return GET;`,
)(
  { BUCKET: {} },
  () => ({
    prepare(sql) {
      reads++;
      if (broken && sql.includes("latestStatus"))
        throw new Error("simulated database failure");
      if (brokenFiles && sql.includes("project_files"))
        throw new Error("file metadata unavailable");
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          return {
            first: async () => statement.get(...values),
            all: async () => ({
              results: statement.all(...values),
              meta: noMetadata ? undefined : { size_after: 8192 },
            }),
          };
        },
        first: async () => statement.get(),
      };
    },
  }),
  (error) => Response.json({ error: "safe failure" }, { status: error.status ?? 500 }),
  (value) => Response.json(value),
  async () => {
    if (!authorized) throw Object.assign(new Error("unauthorized"), { status: 401 });
    return { userId: "owner" };
  },
  () => ({
    enabled: true,
    model: "gpt-5.6-terra",
    workspaceCapMicrousd: 1000000,
    capMicrousd: 250000,
  }),
  { error: (...args) => logs.push(args) },
  buildMonitoringServices,
  () => observeClerk(undefined),
);
const response = await get();
assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.summary.totalSessions, 1);
assert.equal(body.summary.totalDemos, 1);
assert.equal(body.summary.totalFeedback, 2);
assert.equal(body.summary.discoveryRequests, 2);
assert.equal(body.summary.discoveryCostUsd, 1.05); // Database lifetime includes the other owner and retired usage.
const service = (id, snapshot = body) => snapshot.services.find((x) => x.id === id);
const metric = (id, label, snapshot = body) =>
  service(id, snapshot).metrics.find((x) => x.label === label);
assert.equal(body.services.length, 5);
assert.equal(
  metric("discovery-chat", "Last discovery request").value,
  new Date(2000).toISOString(),
);
assert.equal(
  metric("discovery-chat", "Discovery requests").value,
  "2 · 1 pending · 0 failed/conflict",
);
assert.equal(metric("r2", "Recorded file size").value, "42 bytes");
assert.equal(metric("session-store", "Database size").value, "8,192 bytes");
assert.equal(metric("clerk", "Registered users").value, null);
assert.equal(metric("discovery-chat", "Provider credit balance").checkedAt, null);
assert.ok(
  service("discovery-chat").alerts.some((x) => x.message.includes("exhausted")),
);
assert.equal(logs.length, 0);
brokenFiles = true;
noMetadata = true;
const partial = await (await get()).json();
assert.equal(partial.summary.discoveryCostUsd, 1.05);
assert.equal(service("r2", partial).statusLabel, "File records unavailable");
assert.equal(metric("session-store", "Database size", partial).value, null);
assert.equal(logs.length, 0);
brokenFiles = false;
broken = true;
assert.equal((await get()).status, 500);
assert.equal(logs[0][1].stage, "discoveryLatest");
assert.equal(logs[0][1].endpoint, "/api/admin/monitoring");
assert.ok(logs[0][1].stack.includes("at "));
assert.ok(!JSON.stringify(logs).includes("simulated database failure"));
authorized = false;
const before = reads;
assert.equal((await get()).status, 401);
assert.equal(reads, before);
assert.equal(logs.length, 1);
db.close();

// Optional Clerk metadata must never turn an account failure into a snapshot 500.
let countCalls = 0;
const goodClerk = await observeClerk("fictional-test-key", async (url, options) => {
  countCalls++;
  assert.equal(url, "https://api.clerk.com/v1/users/count");
  assert.equal(options.headers.Authorization, "Bearer fictional-test-key");
  assert.ok(options.signal instanceof AbortSignal);
  return Response.json({ total_count: 4 });
});
assert.equal(goodClerk.count, 4);
assert.ok(goodClerk.checkedAt);
assert.equal(countCalls, 1);
for (const result of [
  Response.json({}, { status: 429 }),
  Response.json({ total_count: "4" }),
  Response.json({ total_count: -1 }),
]) {
  const observation = await observeClerk("fictional", async () => result);
  assert.equal(observation.state, "unavailable");
  assert.equal(observation.checkedAt, null);
}
assert.equal(
  (
    await observeClerk("fictional", async () => {
      throw new DOMException("Timed out", "TimeoutError");
    })
  ).state,
  "unavailable",
);
let unexpectedFetch = false;
assert.equal(
  (
    await observeClerk(undefined, async () => {
      unexpectedFetch = true;
    })
  ).state,
  "not-configured",
);
assert.equal(unexpectedFetch, false);

for (const [used, alertCount, severity] of [
  [0.79, 0],
  [0.8, 1, "warning"],
  [0.95, 1, "critical"],
  [1, 1, "critical"],
]) {
  const cards = buildMonitoringServices({
    now: "2026-09-13T00:00:00Z",
    summary: {
      ...body.summary,
      discoveryCostUsd: used,
      discoveryBudgetUsedPercent: used * 100,
    },
    discovery: {
      enabled: true,
      model: "gpt-5.6-terra",
      sessionCapUsd: 0.25,
      failed: 0,
      pending: 0,
      lastActivityAt: null,
    },
    databaseBytes: null,
    files: null,
    bucketConfigured: false,
    clerk: goodClerk,
  });
  assert.equal(cards[0].alerts.length, alertCount);
  if (severity) assert.equal(cards[0].alerts[0].severity, severity);
  for (const card of cards) {
    assert.ok(card.billing.url.startsWith("https://"));
    assert.equal(card.metrics.find((x) => x.label === "Provider charges").value, null);
  }
}
console.log(
  "Monitoring endpoint: SQL join, owner isolation, accounting, timestamp, failure context and auth boundary passed.",
);
