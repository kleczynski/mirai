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

When Clerk is configured, also add the development values from the Clerk
Dashboard to ignored `.env.local`: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY`. `MIRAI_OWNER_EMAIL` remains the single-user allowlist; the
server compares it with the verified Clerk primary email. Never commit Clerk
keys. Configure equivalent values in the hosted runtime, using the production
Clerk instance for the live site.

4. Build to generate the local Worker/D1 configuration:

```sh
npm run build
```

5. Apply pending local D1 migrations (skips SQL whose tables already exist):

```sh
npm run db:local
```

Optional fictional seed (owner `local_seedy`, expired invitation, no live bearer):

```sh
npm run db:local -- --seed
```

The script uses `wrangler d1 execute DB --local` only. It refuses `--remote`. It never reads production data. Keep `.wrangler/state` between restarts to retain local records. Do not run the seed against a hosted database.

6. Start the app:

```sh
npm run dev
```

Open http://localhost:5173. Owner UI signs in at `/sign-in` and signs out through Clerk. `MIRAI_OWNER_EMAIL` remains the allowlist (Clerk primary email). When `CLERK_SECRET_KEY` is set, that is the only owner identity. When it is unset, portable preview still accepts the loopback Sites mock so localhost HTTP tests can sign in at `/signin-with-chatgpt`. Do not set `MIRAI_LOOPBACK_OWNER_AUTH` in a hosted runtime.

For a built-Worker preview use `npm start`; it shares local D1 but does not provide the development sign-in mock. It is not the preferred owner-flow development mode.

## Validate a change

```sh
npx tsc --noEmit
npm run lint
node tests/demo-engine.mjs
```

With the portable development server running at localhost:5173, `npm run db:local` applied, and local owner configured (`MIRAI_OWNER_EMAIL=seedy@sites.test`; Clerk secret unset so the loopback mock is used):

```sh
node -e "require('node:fs').mkdirSync('outputs', { recursive: true })"
node tests/session-flow.mjs
node tests/import-demo-flow.mjs
```

The API scripts create fictional local sessions; the import test writes ignored local invitation links into outputs/. They do not clean up those records. Their base URL is hard-coded to localhost. Do not change it to production.

Before releasing application changes, run `npm run build`. `npm run lint` runs Oxlint, and `npm run lint:fix` applies its safe fixes. There is no `npm test` script currently. Browser visual QA and microphone testing are separate from the checks above.

For schema changes: edit db/schema.ts, run `npm run db:generate`, review the generated SQL and validate against disposable local data. Then `npm run db:local` on the preview database. Sites packages production migrations with the build; local migration application is separate. Never replay SQL blindly on a database that already has the objects.

## Publishing versus editing

### Development environment

The normal agent deployment target is the private development Site:

- URL: https://mirai-development.wishfishdev.chatgpt.site
- Project: `Mirai — Development`
- Sites project ID: `appgprj_6aa3b79a2f5c8191a7c1df2fd5dbe084`
- Clerk: development instance
- D1: separate development database

When an agent completes a change, “accepting” or deploying it to development
means that the validated commit becomes available at that URL. It does not
merge to `main`, change `mirai.party`, copy data to production, or promote the
version automatically. Agents should use development to test UI, Clerk login,
API behavior and fictional fixtures.

### Operator-owned staging (Phase 2, not production)

An empty D1 `mirai-staging` (`360d76c0-0fec-42aa-9b6f-b0f240baaaae`) exists in
the operator Cloudflare account. Migrations `0000` and `0001` are applied;
`0002` and production/Sites rows are not. Bindings are in `deploy/staging.json`.
`npm run build` then `npm run deploy:staging:prepare` writes
`dist/server/wrangler.staging.json` from the Vinext output, replacing the
placeholder D1 and stripping `MIRAI_LOOPBACK_OWNER_AUTH`. That file is not a
`mirai.party` deploy config. Staging secrets (development Clerk +
`MIRAI_OWNER_EMAIL`) are set with `wrangler secret put` at deploy time; they
are not in the repo. Do not seed `local_seedy` onto this database.

Keep production and development runtime variables separate. In particular,
never put production Clerk keys or production data into the development Site.
The development deployment currently needs its own `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY` and `MIRAI_OWNER_EMAIL` runtime values.

### Production release

Production remains `https://mirai.party`. A production release requires an
explicit operator decision after development testing. The agent must deploy
the exact reviewed commit and saved version to the production project, then
verify the production deployment. A green development deployment is evidence
for review, not production authorization.

**Keep Sites hosting:** develop in any editor, validate locally, then use an authenticated Sites publishing workflow for this existing project. The established connector sequence is source credential → exact source push → saved build artifact → deployment. Do not assume a plain push publishes: that requires a separately authorized publish-on-push setting. This repository has no standalone CI release workflow or durable publishing credential. Do not put short-lived Sites credentials into a remote URL or checked-in configuration.

**Move hosting to your own Cloudflare account:** treat this as a migration project, not `wrangler deploy` on the generated local configuration. That configuration has a placeholder D1 ID. Provision the real database, configure production bindings and secrets, transfer data through an authorized export/import path, and implement a verified authentication provider. Replace the Sites header-based identity adapter and reserved sign-in routes. Never expose the current trusted-header helper directly to the public Internet. Preserve owner IDs through an explicit mapping so existing records remain accessible.

Then test invitation isolation, cookie/origin behavior, approvals, saved demos, backups/restoration and rollback in staging before switching DNS. A custom domain alone does not move hosting or database ownership. A Sites backup/export and a standalone CI pipeline have not been configured here.

**Move to Supabase/Vercel or a conventional server:** additionally replace Cloudflare's env/DB adapter and SQLite-specific queries/migrations with the chosen database and runtime. Supabase was allowed in the original brief but is not used today. Do not describe that move as a configuration-only change.

## Recommended next developer work

Local D1 setup (`npm run db:local`) is in place. Staging D1 and a prepare-only
Wrangler overlay exist; the Worker is not deployed until development Clerk
secrets are set. Offline discovery-chat CI lands with the separate
conversation-update branch. Remaining operator-owned work: production
`owner_id` inventory, development D1 remap if that database still uses Sites
ids, first `wrangler` deploy of `mirai-staging` to `workers.dev`, and Sites D1
export access before any production copy. Add a release manifest linking demo
versions to immutable source/build revisions before introducing autonomous
builds. Keep customer products in customer-owned repositories and accounts;
retain evidence and delivery history in Mirai.
