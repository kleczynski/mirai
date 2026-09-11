# Develop Mirai outside Codex

Updated after the 2026-09-11 release. Any editor and terminal can edit and run this project; Codex is not a runtime dependency. Production and staging use operator-owned Cloudflare Workers, separate D1 databases and Clerk. The [operations runbook](plans/production-new-clients.md) is the current release reference.

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
node tests/discovery-boundary.mjs
```

The boundary suite holds a fictional local request body open and checks the real
9.5-second route deadline. It makes no provider call.

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

Production `https://mirai.party` already routes to `mirai-production`. Staging is
`https://mirai-staging.kleczynski11312.workers.dev`. The original Sites hostname
is a separate legacy dataset. Do not repeat cutover, copy legacy rows or point
fixture scripts at either production host.

Use the [operations runbook](plans/production-new-clients.md) for account/database
IDs, deployed versions, caps, verification evidence and rollback. Inspect actual
schema before applying migrations: `0000`–`0002` exist on both current Workers.
No new schema migration is needed for saved-answer background processing.

Build the exact source with the correct Clerk publishable key. For staging,
`npm run build` then `npm run deploy:staging:prepare` writes the checked overlay
`dist/server/wrangler.staging.json`. Production uses an isolated source checkout
without local environment files; build with the production publishable key, then
run `node scripts/prepare-production-deploy.mjs /absolute/path/to/isolated-build`.
The raw generated `dist/server/wrangler.json` has local placeholder bindings and
must never be deployed directly.

Production approval is separate from staging verification. Preserve existing
production runtime secrets and custom-domain mapping; never substitute development
Clerk or OpenAI credentials. Source publication to a public repository also requires
appropriate user authorization. Do not publish ignored outputs or private evidence.

Before future autonomous builds, add immutable demo source/build provenance.
Customer demos remain customer-owned; shared bundled implementations require
review of existing version/approval implications before changes.

## Discovery chat development

Chat is an opt-in rollout alongside the form. In ignored `.dev.vars`, add
`MIRAI_DISCOVERY_ENABLED=true`. The topic form and local tests work without an
API key. For live interviewing, configure `MIRAI_OPENAI_API_KEY` as a
server-only secret. Do not paste keys into source, client code, tracked files
or tool output. The operator approved this rollout on staging and production. Future environment
or budget changes still need matching user scope; see the current runbook.

Optional values: `MIRAI_DISCOVERY_MODEL=gpt-5.6-terra` (the only approved
model), `MIRAI_DISCOVERY_SESSION_CAP_USD=1` (can lower, not raise, the $1 cap),
`MIRAI_DISCOVERY_WORKSPACE_CAP_USD=2` (database-wide lifetime cap, can only lower).
Both current Workers set these to $0.25 and $1 respectively.
There is no automatic fallback model. See
[design and limits](plans/discovery-chat.md).

`npm run db:local` applies `drizzle/0002_polite_bucky.sql` on a new empty local
database and skips it when `discovery_requests` already exists. It refuses
`--remote`.

An explicitly authorized two-call paid smoke is available. Its dry run makes
no provider calls:

```sh
node --import ./tests/typescript-loader.mjs scripts/discovery-paid-smoke.mjs --dry-run
```

After operator authorization, with `MIRAI_OPENAI_API_KEY` in ignored `.dev.vars`
or the process environment:

```sh
MIRAI_PAID_TEST_CALLS=2 node --import ./tests/typescript-loader.mjs scripts/discovery-paid-smoke.mjs
```

This uses the real approved provider and application service with isolated
in-memory SQLite and two fictional English/Polish cases. It verifies the saved
acknowledgement within ten seconds and awaits bounded background synthesis. It does not touch a
hosted database. It records safe metadata in ignored
`outputs/discovery-paid-smoke.json`, reserves each attempt before sending, and
refuses to repeat an existing run. Timeouts count as attempts. Do not remove
the report to rerun without new authorization. After separate authorization,
`MIRAI_PAID_TEST_RUN` can name a new run (lowercase letters, digits and hyphens);
each run keeps a separate report and retains the two-attempt limit. All saved
paid-smoke reports share a hard $1 cumulative accounting budget, including
reservations for unknown usage. The shared
lock prevents overlapping runs. A failed check exits nonzero;
inspect results before deploying. These two cases do not establish full live
interview or real-microphone coverage.

Owner authentication stays Clerk-only when `CLERK_SECRET_KEY` is set. The
`/signin-with-chatgpt` loopback mock is for localhost HTTP tests when that
secret is unset. Hosted Workers must not treat `oai-authenticated-user-*` as
identity. Chat is enabled on both current Workers; client evidence still requires operator readiness confirmation.

## Pre-client lifecycle: automated vs still human

The operator’s lifecycle gate is partly automated locally. No fixture-writing script
should be pointed at `https://mirai.party`. None of these default scripts target production or staging.

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
