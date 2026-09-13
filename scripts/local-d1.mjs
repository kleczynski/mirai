import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./sites-env.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wranglerConfig = path.join(projectRoot, "dist/server/wrangler.json");
const wranglerBin = path.join(projectRoot, "node_modules/wrangler/bin/wrangler.js");
const journalPath = path.join(projectRoot, "drizzle/meta/_journal.json");
const persistTo = ".wrangler/state";
const seed = process.argv.includes("--seed");

if (process.argv.includes("--remote")) {
  console.error(
    "local-d1 refuses --remote. This command only updates the local Miniflare D1.",
  );
  process.exit(1);
}

if (!existsSync(wranglerConfig)) {
  console.error(
    "Missing dist/server/wrangler.json. Run `npm run build` once, then retry `npm run db:local`.",
  );
  process.exit(1);
}

function wrangler(args) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(output || `wrangler ${args.join(" ")} failed`);
  }
  return result.stdout ?? "";
}

function execute(extra) {
  return wrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    wranglerConfig,
    "--persist-to",
    persistTo,
    ...extra,
  ]);
}

function parseResults(stdout) {
  const start = stdout.indexOf("[");
  const jsonText = start >= 0 ? stdout.slice(start) : stdout.trim();
  if (!jsonText) return [];
  const parsed = JSON.parse(jsonText);
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  return batches.flatMap((batch) => batch.results ?? []);
}

function existingTables() {
  const stdout = execute([
    "--json",
    "--command",
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  ]);
  return new Set(parseResults(stdout).map((row) => String(row.name ?? "")));
}

function createdTables(sql) {
  return [...sql.matchAll(/CREATE TABLE\s+[`"]?(\w+)/gi)].map((match) => match[1]);
}

const journal = JSON.parse(readFileSync(journalPath, "utf8"));
let tables = existingTables();

for (const entry of journal.entries ?? []) {
  const file = path.join(projectRoot, "drizzle", `${entry.tag}.sql`);
  if (!existsSync(file)) throw new Error(`Missing migration file ${file}`);
  const sql = readFileSync(file, "utf8");
  const needed = createdTables(sql);
  if (
    needed.some((name) => tables.has(name)) &&
    !needed.every((name) => tables.has(name))
  ) {
    throw new Error(
      `Partial migration ${entry.tag}; inspect schema before applying any SQL.`,
    );
  }
  if (needed.length && needed.every((name) => tables.has(name))) {
    const indexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX\s+[`"]?(\w+)/gi)].map(
      (match) => match[1],
    );
    const present = new Set(
      parseResults(
        execute([
          "--json",
          "--command",
          "SELECT name FROM sqlite_master WHERE type='index'",
        ]),
      ).map((row) => row.name),
    );
    if (indexes.some((name) => !present.has(name)))
      throw new Error(
        `Incomplete indexes for ${entry.tag}; inspect schema before proceeding.`,
      );
    console.log(`skip ${entry.tag} (already applied)`);
    continue;
  }
  console.log(`apply ${entry.tag}`);
  execute(["--file", file]);
  tables = existingTables();
}

if (seed) {
  if (!tables.has("sessions")) {
    throw new Error("Cannot seed: sessions table is missing after migrations.");
  }
  const seedFile = path.join(projectRoot, "db/local-seed.sql");
  console.log(
    "seed fictional local session (owner_id local_seedy; invitation expired)",
  );
  execute(["--file", seedFile]);
}

console.log(
  seed
    ? "Local D1 migrations and fictional seed are up to date."
    : "Local D1 migrations are up to date. Pass --seed for the fictional local session.",
);
