# Develop Mirai outside Codex

Verified against the checkout on 2026-09-10. Any editor and terminal can edit and run this project; Codex is not a runtime dependency. The hosted deployment currently depends on Sites for database provisioning and owner authentication.

## Stack and map

React 19, TypeScript, Vinext/Vite, Tailwind and shared UI components run on a Cloudflare Worker. Drizzle defines the SQLite schema; server routes use D1 prepared statements. The current lockfile is the dependency source of truth.

| Area | Files |
| --- | --- |
| Operator workspace | app/workspace.tsx, app/source-history.tsx |
| Private client journey | app/s/session.tsx |
| Sessions, discovery and version transitions | app/api/sessions/, app/api/client/, lib/model.ts |
| Authentication and persistence | lib/server.ts, app/chatgpt-auth.ts, db/schema.ts |
| Evidence documents | lib/documents.ts, app/api/documents/ |
| Telegram import | app/api/import/route.ts |
| Three demo interfaces | app/demo/components/, app/demo/workbench.tsx |
| Demo calculations and validation | lib/demo-engine.ts |
| Saved demo state | app/api/demo/route.ts, demo_states table |
| Browser agent tools | lib/webmcp.ts, lib/demo-webmcp.ts |
| Local runtime and hosting declaration | vite.config.ts, scripts/, .openai/hosting.json |

## Run locally from a clean checkout

Use Node 24 to match the tested environment and run the TypeScript-importing calculation tests without an extra runner. package.json accepts Node >=22.13.0. Use npm with the committed package-lock.json.

1. Open the project in your editor. Run commands below from its root. A clean checkout defaults to the portable profile and does not require a Codex installation. If moving an existing checkout, exclude .sites-runtime/, .wrangler/, node_modules/ and outputs/ from the copy.
2. Install locked dependencies:

```sh
npm run install:ci
```

3. Create an ignored `.dev.vars` with this local-only identity configuration (do not replace existing settings blindly):

```dotenv
MIRAI_OWNER_EMAIL=seedy@sites.test
```

4. Build to generate the local Worker/D1 configuration:

```sh
npm run build
```

5. For a **new, empty local database only**, apply these two migrations in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lucky_silver_sable.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_tiny_pepper_potts.sql
```

These are direct SQL executions, not an automatically tracked local migration runner. On an existing local database, inspect its schema and apply only missing migrations. Keep `.wrangler/state` between restarts to retain local records. Never add `--remote` to these development commands.

6. Start the app:

```sh
npm run dev
```

Open http://localhost:5173, then visit http://localhost:5173/signin-with-chatgpt?return_to=/ to use the loopback-only mock owner. New local sessions are independent of production. Production owner data is not included in the repository. The local mock is excluded from production builds.

For a built-Worker preview use `npm start`; it shares local D1 but does not provide the development sign-in mock. It is not the preferred owner-flow development mode.

## Validate a change

```sh
npx tsc --noEmit
node tests/demo-engine.mjs
```

With the portable development server running at localhost:5173, migrations applied, and local owner configured:

```sh
node -e "require('node:fs').mkdirSync('outputs', { recursive: true })"
node tests/session-flow.mjs
node tests/import-demo-flow.mjs
```

The API scripts create fictional local sessions; the import test writes ignored local invitation links into outputs/. They do not clean up those records. Their base URL is hard-coded to localhost. Do not change it to production.

Before releasing application changes, run `npm run build`. `npm run lint` is available, but no claim is made that the entire inherited starter is lint-clean. There is no `npm test` script currently. Browser visual QA and microphone testing are separate from the checks above.

For schema changes: edit db/schema.ts, run `npm run db:generate`, review the generated SQL and validate against disposable local data. Sites packages production migrations with the build; local migration application is separate.

## Publishing versus editing

**Keep Sites hosting:** develop in any editor, validate locally, then use an authenticated Sites publishing workflow for this existing project. The established connector sequence is source credential → exact source push → saved build artifact → deployment. Do not assume a plain push publishes: that requires a separately authorized publish-on-push setting. This repository has no standalone CI release workflow or durable publishing credential. Do not put short-lived Sites credentials into a remote URL or checked-in configuration.

**Move hosting to your own Cloudflare account:** treat this as a migration project, not `wrangler deploy` on the generated local configuration. That configuration has a placeholder D1 ID. Provision the real database, configure production bindings and secrets, transfer data through an authorized export/import path, and implement a verified authentication provider. Replace the Sites header-based identity adapter and reserved sign-in routes. Never expose the current trusted-header helper directly to the public Internet. Preserve owner IDs through an explicit mapping so existing records remain accessible.

Then test invitation isolation, cookie/origin behavior, approvals, saved demos, backups/restoration and rollback in staging before switching DNS. A custom domain alone does not move hosting or database ownership. A Sites backup/export and a standalone CI pipeline have not been configured here.

**Move to Supabase/Vercel or a conventional server:** additionally replace Cloudflare's env/DB adapter and SQLite-specific queries/migrations with the chosen database and runtime. Supabase was allowed in the original brief but is not used today. Do not describe that move as a configuration-only change.

## Recommended next developer work

First add repeatable local database setup and a fictional seed command, then CI for the existing meaningful checks. Add a release manifest linking demo versions to immutable source/build revisions before introducing autonomous builds. Keep customer products in customer-owned repositories and accounts; retain evidence and delivery history in Mirai.
