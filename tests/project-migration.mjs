import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys=ON");
for (const name of [
  "0000_lucky_silver_sable",
  "0001_tiny_pepper_potts",
  "0002_polite_bucky",
])
  db.exec(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), "utf8"));
const data = JSON.stringify({
  title: "Fictional legacy",
  client: "Fictional client",
  language: "pl",
  template: "custom",
  answers: { problem: "Original evidence" },
  source: {
    channel: "telegram",
    transcript: [{ sender: "user", text: "Original fictional quote" }],
  },
  demos: [{ id: "demo-1", version: 1, url: "https://example.com" }],
  feedback: [
    { demoId: "demo-1", kind: "approval", name: "Unverified invitation holder" },
  ],
  approvedDemoId: "demo-1",
  stage: "Approved",
});
db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?,7,?,?)").run(
  "legacy",
  "owner",
  "fictional-hash-only",
  "2099-01-01",
  data,
  "2026-01-01",
  "2026-01-02",
);
db.prepare("INSERT INTO demo_states VALUES (?,?,?,?,?)").run(
  "state",
  "legacy",
  '{"fictional":true}',
  4,
  "2026-01-02",
);
db.prepare("INSERT INTO discovery_requests VALUES (?,?,?,?,?,?,?,?)").run(
  "request",
  "legacy",
  "fingerprint",
  "unknown",
  25000,
  null,
  1,
  "{}",
);
const before = ["sessions", "demo_states", "discovery_requests"].map((t) =>
  db.prepare(`SELECT * FROM ${t}`).all(),
);
db.exec(
  readFileSync(
    new URL("../drizzle/0003_salty_giant_girl.sql", import.meta.url),
    "utf8",
  ),
);
const after = ["sessions", "demo_states", "discovery_requests"].map((t) =>
  db.prepare(`SELECT * FROM ${t}`).all(),
);
assert.deepEqual(after, before);
assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
assert.equal(db.prepare("SELECT COUNT(*) n FROM project_metadata").get().n, 0);
const fresh = new DatabaseSync(":memory:");
for (const e of JSON.parse(
  readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
).entries)
  fresh.exec(readFileSync(new URL(`../drizzle/${e.tag}.sql`, import.meta.url), "utf8"));
assert.equal(fresh.prepare("SELECT COUNT(*) n FROM sessions").get().n, 0);
console.log(
  "Passed disposable SQLite migration: fresh install, existing session/hash/expiry/evidence/demo/feedback/approval/revisions and unknown spending reservation byte-preserved, no eager project backfill, foreign keys valid.",
);
