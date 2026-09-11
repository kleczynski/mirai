import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Supply an isolated build directory containing no local environment files.
const root = path.resolve(process.argv[2] ?? ".");
const forbiddenArguments = new Set(["--deploy", "--remote"]);
if (process.argv.some((argument) => forbiddenArguments.has(argument))) {
  throw new Error("This command only prepares a local config; it never deploys or accesses remote resources.");
}

const localEnvironmentFiles = readdirSync(root).filter(
  (name) =>
    name.startsWith(".dev.vars") ||
    name === ".env" ||
    (name.startsWith(".env.") && name !== ".env.example"),
);
if (localEnvironmentFiles.length > 0) {
  throw new Error("Production preparation requires an isolated source archive without local environment files.");
}

const bindings = JSON.parse(
  readFileSync(new URL("../deploy/production.json", import.meta.url), "utf8"),
);
const db = bindings.d1_databases?.[0];
if (
  bindings.name !== "mirai-production" ||
  bindings.account_id !== "61c83af95d6ce17e198b3d60268ef6df" ||
  bindings.workers_dev !== true ||
  bindings.preview_urls !== false ||
  bindings.observability?.enabled !== false ||
  bindings.d1_databases?.length !== 1 ||
  db.binding !== "DB" ||
  db.database_name !== "mirai-production" ||
  db.database_id !== "26c4ce49-e459-4e94-be18-593b3f633c98"
) {
  throw new Error("Unexpected production target.");
}

if ("route" in bindings || "routes" in bindings) {
  throw new Error("Production routes stay dashboard-managed; deploy bindings must not override them.");
}

const assets = path.join(root, "dist/client/_next/static/chunks");
const providers = readdirSync(assets).filter((name) => /^clerk-provider-.*\.js$/.test(name));
if (providers.length !== 1) throw new Error("Expected exactly one Clerk provider chunk.");
const chunk = readFileSync(path.join(assets, providers[0]), "utf8");
const keys = chunk.match(/pk_(?:live|test)_[A-Za-z0-9]+/g) ?? [];
if (keys.length !== 1 || !keys[0].startsWith("pk_live_")) {
  throw new Error("Expected exactly one inlined production Clerk key.");
}

const generated = JSON.parse(
  readFileSync(path.join(root, "dist/server/wrangler.json"), "utf8"),
);
const config = {
  ...generated,
  ...bindings,
  topLevelName: bindings.name,
  vars: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: keys[0] },
};
delete config.route;
delete config.routes;

const forbiddenRuntimeVariables = [
  "CLERK_SECRET_KEY",
  "MIRAI_LOOPBACK_OWNER_AUTH",
  "MIRAI_DISCOVERY_ENABLED",
  "MIRAI_DISCOVERY_MODEL",
  "MIRAI_DISCOVERY_SESSION_CAP_USD",
  "MIRAI_OPENAI_API_KEY",
];
if (forbiddenRuntimeVariables.some((name) => name in config.vars)) {
  throw new Error("Prepared production variables contain a secret or feature flag.");
}

writeFileSync(
  path.join(root, "dist/server/wrangler.production.json"),
  `${JSON.stringify(config, null, 2)}\n`,
);
console.log(
  "Prepared mirai-production config; production key verified; dashboard routes and runtime secrets remain unchanged.",
);
