# Develop Mirai outside Codex

Verified against the checkout on 2026-09-10. Any editor and terminal can edit and run this project; Codex is not a runtime dependency. The hosted deployment currently depends on Sites for database provisioning and owner authentication.

## Stack and map

React 19, TypeScript, Vinext/Vite, Tailwind and shared UI components run on a Cloudflare Worker. Drizzle defines the SQLite schema; server routes use D1 prepared statements. The current lockfile is the dependency source of truth.

| Area | Files |
| --- | --- |
| Operator workspace | app/workspace.tsx, app/source-history.tsx, app/discovery-observer.tsx |
| Private client journey | app/s/session.tsx, app/s/discovery-client.tsx |
| Sessions, discovery and version transitions | app/api/sessions/, app/api/client/, lib/model.ts, lib/discovery.ts, lib/discovery-service.ts |
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
node --import ./tests/typescript-loader.mjs tests/attach-demo-blockers.mjs
node --import ./tests/typescript-loader.mjs tests/discovery-chat.mjs
```

With the portable development server running at localhost:5173, `npm run db:local` applied, and local owner configured (`MIRAI_OWNER_EMAIL=seedy@sites.test`; Clerk secret unset so the loopback mock is used):

```sh
node -e "require('node:fs').mkdirSync('outputs', { recursive: true })"
node tests/session-flow.mjs
node tests/lifecycle-smoke.mjs
node tests/import-demo-flow.mjs
```

With `MIRAI_DISCOVERY_ENABLED=true` in ignored `.dev.vars` (no API key required for this suite):

```sh
node tests/discovery-flow.mjs
```

Optional localhost browser smokes, skipped unless Playwright is installed.
They are not in `verify.yml`.

```sh
node tests/client-journey-browser.mjs
node tests/discovery-client-browser.mjs
```

The API scripts create fictional local sessions; the import test writes ignored local invitation links into outputs/. They do not clean up those records. `tests/session-flow.mjs` and `tests/lifecycle-smoke.mjs` are hard-coded to `http://localhost:5173`. Do not add an origin override that can target production.

Before releasing application changes, run `npm run build`. `npm run lint` runs Oxlint, and `npm run lint:fix` applies its safe fixes. There is no `npm test` script currently. Browser visual QA and microphone testing are separate from the checks above.

For schema changes: edit db/schema.ts, run `npm run db:generate`, review the generated SQL and validate against disposable local data. Then `npm run db:local` on the preview database. Sites packages production migrations with the build; local migration application is separate. Never replay SQL blindly on a database that already has the objects.

## Publishing versus editing

### Development environment

Development has left Sites. Do not deploy or test hosted changes on
`https://mirai-development.wishfishdev.chatgpt.site` or any `*.chatgpt.site` URL.

| Env | Host | Notes |
| --- | --- | --- |
| Local | `http://localhost:5173` | Clerk if `CLERK_SECRET_KEY` is set; else loopback mock for HTTP tests only |
| Development / staging | `https://mirai-staging.kleczynski11312.workers.dev` | Operator-owned Worker + D1. Clerk development. Empty of product rows. `0000`+`0001` applied. **No `0002` unless the operator later approves it.** |
| Live production | `https://mirai.party` (Sites) | Still Sites. Eight old sessions stay there. Do not cut over |

Local preview is the normal agent feedback loop for product work. A successful
local check does not deploy, merge, or promote anything to `mirai.party`.

### Operator-owned staging (Phase 2, not production)

An empty D1 `mirai-staging` (`7fece159-c3e2-4394-953d-60679fb92b33`) exists in
the operator Cloudflare account Wrangler uses. Migrations `0000` and `0001` are applied;
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

For the operator-authorized new-client separation run, see
[production preview status and operator runbook](plans/production-new-clients.md).
The new `mirai-production` Worker and empty D1 exist, but Clerk browser sign-in
failed. Sites still serves `mirai.party`; do not cut over or copy the eight old
sessions. `deploy/production.json` and `scripts/prepare-production-deploy.mjs`
prepare that separate preview target without changing the Sites manifest.

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

Local D1 setup (`npm run db:local`) applies `0002` when `discovery_requests` is
absent and skips it when the table exists. Staging Worker
`https://mirai-staging.kleczynski11312.workers.dev` is deployed against D1
`7fece159-c3e2-4394-953d-60679fb92b33` with development Clerk secrets.
Discovery chat is implemented locally and covered in CI offline; it is not
enabled on staging or `mirai.party`. Remaining operator-owned work: whether to
enable chat after local gates; whether to apply `0002` on staging or the empty
new-client D1 in a later approved release; Clerk allowed origin for the
workers.dev URL; production `owner_id` inventory; and Sites D1 export access
before any production copy. Add a release manifest linking demo versions to
immutable source/build revisions before introducing autonomous builds. Keep
customer products in customer-owned repositories and accounts; retain evidence
and delivery history in Mirai.

## Discovery chat development

Chat is an opt-in rollout alongside the form. In ignored `.dev.vars`, add
`MIRAI_DISCOVERY_ENABLED=true`. The topic form and local tests work without an
API key. For live interviewing, configure `MIRAI_OPENAI_API_KEY` as a
server-only secret. Do not paste keys into source, client code, tracked files
or tool output. Do not put `MIRAI_DISCOVERY_*` or `MIRAI_OPENAI_API_KEY` on
staging or production unless the operator explicitly asks after local gates.

Optional values: `MIRAI_DISCOVERY_MODEL=gpt-5.6-terra` (the only approved
model), `MIRAI_DISCOVERY_SESSION_CAP_USD=1` (can lower, not raise, the $1 cap).
There is no automatic fallback model. See
[design and limits](plans/discovery-chat.md).

`npm run db:local` applies `drizzle/0002_polite_bucky.sql` on a new empty local
database and skips it when `discovery_requests` already exists. It refuses
`--remote`.

Owner authentication stays Clerk-only when `CLERK_SECRET_KEY` is set. The
`/signin-with-chatgpt` loopback mock is for localhost HTTP tests when that
secret is unset. Hosted Workers must not treat `oai-authenticated-user-*` as
identity. Chat remains undeployed on `mirai.party`.

## Pre-client lifecycle: automated vs still human

The operator’s live gate before a real client on `https://mirai.party` is now
partly automated. None of these default scripts target production or staging.

| Operator check | Automated? | Where |
| --- | --- | --- |
| Anonymous `/api/sessions` is 401 | Yes | `tests/session-flow.mjs`, `tests/lifecycle-smoke.mjs` |
| Create session returns one invite token | Yes | same; tokens are not printed by the lifecycle smoke beyond the existing session-flow return value used in-process |
| Client bearer sees the session, not an owner list | Yes | `tests/lifecycle-smoke.mjs` |
| Invite rotation: old 404, new 200 | Yes | both HTTP suites |
| Revoke → 404 | Yes | both HTTP suites |
| Eight fictional answers → Ready to build | Yes | both HTTP suites |
| Incomplete attach stays 400 / same stage | Yes | `tests/lifecycle-smoke.mjs`; unit cases in `tests/attach-demo-blockers.mjs` |
| Attach `https://example.com/test-try` → Demo review, not bundled | Yes | `tests/lifecycle-smoke.mjs` |
| Note + approval on current demo; second attach clears approval; stale demoId is 409 | Yes | both HTTP suites |
| `/test-try` on the local origin is 404 | Yes | `tests/client-journey-browser.mjs` (Playwright) |
| Signed-out `/s#token` is the client page, not the workspace | Yes | Playwright smoke |
| Share this version disabled + blocker list until URL/summary/checks pass | Yes | Playwright smoke + `attachDemoBlockers` unit test |
| Clerk sign-in on `mirai.party` | Still human | production Clerk cookie |
| Empty-list visual on a fresh production workspace | Still human | visual only |
| Private-window cookie isolation | Still human | browser cookie jars |
| Copying a live invite without leaking the token | Still human | operator clipboard |

An optional operator-only script, `node scripts/live-smoke.mjs`, refuses to run
unless `MIRAI_LIVE_SMOKE=I_UNDERSTAND` **and** an explicit
`MIRAI_LIVE_SMOKE_ORIGIN`. It defaults to refusing a missing origin even though
localhost is the documented default. If the origin is `https://mirai.party`,
it also requires `MIRAI_LIVE_SMOKE_PRODUCTION=I_REALLY_MEAN_MIRAI_PARTY`. It
never prints invitation tokens (logs only “token received”). It is not in
`verify.yml`. Do not point it at staging unless the operator asks.
