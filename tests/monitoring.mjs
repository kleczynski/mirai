// Offline endpoint regression: real SQL + disposable SQLite; no hosted writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import ts from "typescript";

const db = new DatabaseSync(":memory:");
for (const file of ["0000_lucky_silver_sable.sql", "0002_polite_bucky.sql"]) {
  // Only the tables this endpoint reads are needed; use the committed schema.
  const sql = readFileSync(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (/CREATE TABLE `(?:sessions|discovery_requests)`/.test(statement))
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

const source = readFileSync(
  new URL("../app/api/admin/monitoring/route.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(
  source.replace(/^import .*;\n/gm, "").replace(/export /g, ""),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  },
).outputText;
let authorized = true;
let broken = false;
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
  `${javascript}; return GET;`,
)(
  {},
  () => ({
    prepare(sql) {
      reads++;
      if (broken && sql.includes("latestStatus"))
        throw new Error("simulated database failure");
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          return { first: async () => statement.get(...values) };
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
  () => ({ enabled: true, model: "gpt-5.6-terra", workspaceCapMicrousd: 1000000 }),
  { error: (...args) => logs.push(args) },
);
const response = await get();
assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.summary.totalSessions, 1);
assert.equal(body.summary.totalDemos, 1);
assert.equal(body.summary.totalFeedback, 2);
assert.equal(body.summary.discoveryRequests, 2);
assert.equal(body.summary.discoveryCostUsd, 0.15);
assert.equal(body.services[0].lastActivityAt, 2000);
assert.equal(body.services[0].pendingCount, 1);
assert.equal(body.services[0].failedCount, 0);
assert.equal(logs.length, 0);
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
console.log(
  "Monitoring endpoint: SQL join, owner isolation, accounting, timestamp, failure context and auth boundary passed.",
);
