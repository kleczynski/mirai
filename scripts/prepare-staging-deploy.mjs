import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const generatedConfig = path.join(projectRoot, "dist/server/wrangler.json");
const stagingBindings = path.join(projectRoot, "deploy/staging.json");
const outputConfig = path.join(projectRoot, "dist/server/wrangler.staging.json");

const forbiddenVars = [
  "MIRAI_LOOPBACK_OWNER_AUTH",
  "MIRAI_DISCOVERY_ENABLED",
  "MIRAI_OPENAI_API_KEY",
  "MIRAI_DISCOVERY_MODEL",
  "MIRAI_DISCOVERY_SESSION_CAP_USD",
  "MIRAI_DISCOVERY_WORKSPACE_CAP_USD",
  "CLERK_SECRET_KEY",
];

if (process.argv.includes("--remote") || process.argv.includes("--deploy")) {
  console.error("prepare-staging-deploy only writes a config. It does not deploy or touch a remote database.");
  process.exit(1);
}

if (!existsSync(generatedConfig)) {
  console.error("Missing dist/server/wrangler.json. Run `npm run build` once, then retry.");
  process.exit(1);
}

const generated = JSON.parse(readFileSync(generatedConfig, "utf8"));
const staging = JSON.parse(readFileSync(stagingBindings, "utf8"));

if (staging.name !== "mirai-staging") {
  console.error("deploy/staging.json must name the Worker mirai-staging.");
  process.exit(1);
}

const database = staging.d1_databases?.[0];
if (!database?.database_id || database.binding !== "DB" || database.database_name !== "mirai-staging") {
  console.error("deploy/staging.json must bind DB to database_name mirai-staging with a real database_id.");
  process.exit(1);
}

if (database.database_id === "00000000-0000-4000-8000-000000000000") {
  console.error("Refusing the local placeholder D1 id.");
  process.exit(1);
}

const vars = { ...(generated.vars ?? {}) };
for (const key of forbiddenVars) delete vars[key];

const config = {
  ...generated,
  name: staging.name,
  topLevelName: staging.name,
  observability: { enabled: false },
  vars,
  d1_databases: [database],
};

writeFileSync(outputConfig, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Wrote ${path.relative(projectRoot, outputConfig)} for Worker ${staging.name}.`);
console.log("Deploy separately with wrangler and development Clerk secrets. Do not use this config for mirai.party.");
