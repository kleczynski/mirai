# Mirai release and operations runbook

Verified on 2026-09-11 after the discovery release. This is the current operations
reference. Earlier migration investigations describe history, not actions to replay.
Always inspect live configuration before the next release; these observations are dated.

## Current environments

| Environment | URL / Worker | D1 database | Authentication |
| --- | --- | --- | --- |
| Production | https://mirai.party → `mirai-production` | `26c4ce49-e459-4e94-be18-593b3f633c98` | Production Clerk |
| Production Worker address | https://mirai-production.kleczynski11312.workers.dev | Same production D1 | Production Clerk |
| Staging | https://mirai-staging.kleczynski11312.workers.dev → `mirai-staging` | `7fece159-c3e2-4394-953d-60679fb92b33` | Development Clerk |
| Legacy Sites | https://mirai-control-plane.wishfishdev.chatgpt.site | Separate legacy Sites D1 | Its existing authentication |
| Local | http://localhost:5173 | `.wrangler/state` only | Clerk, or loopback mock when its secret is unset |

The Cloudflare account is `61c83af95d6ce17e198b3d60268ef6df`. Both Workers bind
D1 as `DB`. Production routing is dashboard-managed. The Cloudflare domains API
confirmed `mirai.party` → `mirai-production`; Sites returned no custom domains.
No DNS change or domain cutover occurred during this release.

The legacy Sites dataset was not copied, remapped, reimported or merged. An old
Sites invitation is not portable to production: it must resolve in the database
of the hostname being used. Never suggest changing the hostname of a private link
unless its matching session actually exists there. Do not print or commit bearers.

`.openai/hosting.json` still identifies the legacy Site
`appgprj_6aa18e60d0088191b9e9311ce7a8ecc5`. Its presence does not make it the
current production deployment target. Honor explicit Cloudflare release intent;
use `deploy/production.json` or `deploy/staging.json` for the chosen Worker.

## Released artifact and data

Application source: `704cb9722ffbf151b760d58876cc20e780b0a82d`, based on
`6fb7e8cf5d0de5fa247b9876fa407339ca618055`. The release includes the tested working
copy's discovery and presentation changes. This runbook is a documentation-only
follow-up; it does not change that deployed application artifact.

The exact release snapshot also preserved presentation edits already present in
`app/layout.tsx`, `app/modern-ui.css` and `app/demo/demo.css`. Those files are
outside this session's source-publication scope and remain the other work's
responsibility. This session publishes its discovery, tests and runbook changes
only. Do not discard those outstanding presentation edits or assume a checkout
of the published commit reproduces their appearance. A private local Git bundle
in `outputs/discovery-deployed-source.bundle` preserves the exact deployed snapshot;
do not upload ignored outputs wholesale.

| Target | Application upload | Final active version after runtime settings |
| --- | --- | --- |
| Staging | `6ac7fec8-0153-450f-a704-1c3a4804ac30` | `6973ee8e-e47e-4c2c-a806-bfe08409d109` |
| Production | `4a244ab6-227a-4a0e-88d5-c6bdb13fad59` | `6e1209a0-c17f-4c29-bbe1-b4651f31fa1f` |

Production's preceding version was `f11fdba9-2088-4f41-9410-85ac5c1a1248`.
Before release, production contained five sessions, no demos and no approved
sessions. No production fixture or product-data mutation ran in this release.
Production already had migrations `0000`, `0001` and `0002`; none was replayed.

Staging initially contained one session with one unapproved demo. Only its missing
`0002_polite_bucky.sql` was applied after inspecting the schema. Two fictional
release-check sessions were then added to staging, using its existing operator
ownership. Their invitations were revoked after verification. Final staging count is three sessions and one unapproved demo; production remains
five sessions with no demos or approvals. Their evidence and
request ledgers remain for accounting. Do not delete the ledger to reset spending.

## Discovery and spending configuration

Both current Workers use these server-side runtime settings:

| Setting | Value / handling |
| --- | --- |
| `MIRAI_DISCOVERY_ENABLED` | `true` |
| `MIRAI_DISCOVERY_MODEL` | `gpt-5.6-terra` only; low reasoning; no automatic fallback |
| `MIRAI_DISCOVERY_SESSION_CAP_USD` | `0.25` |
| `MIRAI_DISCOVERY_WORKSPACE_CAP_USD` | `1` |
| `MIRAI_OPENAI_API_KEY` | Secret; staging configured explicitly, existing production secret preserved |
| `CLERK_SECRET_KEY` | Separate development/production secrets; preserved |
| `MIRAI_OWNER_EMAIL` | Existing operator allowlist; preserved |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Matching Clerk instance, inlined at build time |

The workspace cap is lifetime accounting across all sessions in one D1 database.
Production's pre-release accounted usage was $0.130917, already included in its
$1 limit. Staging's two hosted checks accounted for $0.027045. Unknown provider
usage retains the full pre-call reservation. Application maxima are $1/session
and $2/database; runtime settings can lower them but cannot raise them.

These are conservative application counters, not invoice totals or an OpenAI
account-wide balance control. They do not cover other apps or databases using a
key. Ten authorized checks in this task accounted for $0.230736, including full
reservations for three earlier unknown-usage timeouts. No more paid tests are
needed for this release. Future paid testing needs user scope and a stated budget.
Local `scripts/discovery-paid-smoke.mjs` additionally caps all its saved reports
at $1 combined and two attempts per named run. Do not remove reports to bypass it.

At a cap or provider failure, use the topic form. Never silently switch models,
raise budgets, erase reservations or retry paid work automatically.

## Save-first behavior

A client answer and its request reservation commit atomically before inference.
The client receives saved evidence promptly; Cloudflare `waitUntil` owns the
bounded summary task. The provider has 25 seconds, the acknowledgement route 9.5
seconds, and client requests 10 seconds. These are deadlines, not guarantees
about network response delivery or a database write already submitted.

`discovery.processing` is optional version-1 session JSON; no new migration is
needed for it. Pending status blocks another chat answer but permits Finish now
and direct edits. A result can save only if revision, invitation hash/expiry,
demo lock and import lock still match. Edits invalidate the pending result.
An authenticated client read can recover a 35-second expired lease into failed
review without another provider call. Polling stops after 45 seconds or a bounded
read failure and offers refresh/form recovery. Original answers remain saved;
reusing the request ID does not pay again.

Interview questions stop after eight saved answers, on explicit finish or on
sufficient sourced coverage. Gaps remain visible. The operator still confirms
readiness; this is never demo approval. Browser voice requires explicit action,
keeps a transcript editable before sending, and stores no raw audio in Mirai.
Browser recognition may use the browser vendor's service.

## Repeat a release safely

1. Read `AGENTS.md`, `README.md`, `docs/MVP.md`, `docs/DEVELOPMENT.md` and this
   runbook. Check live custom-domain mapping, current Worker versions and D1
   schema. Preserve other agents' changes. Check demo/approval implications
   before changing shared demo behavior.
2. Establish the exact source revision. Keep `.dev.vars*`, `.env.local`, `.wrangler`,
   `.sites-runtime`, `outputs` and credentials out of commits and build archives.
   Use an isolated source checkout without local environment files for production.
3. Run the development guide's typecheck, lint, discovery tests, relevant local API
   lifecycle tests and browser checks. Run a production build from the same source.
   Never point fixture-writing scripts at production. Browser/microphone coverage
   cannot be inferred from a successful build.
4. Build staging with its `pk_test_` Clerk publishable key. Run
   `npm run deploy:staging:prepare`. Inspect the generated
   `dist/server/wrangler.staging.json`: correct Worker/D1, no loopback identity or
   secrets in vars, observability disabled. Never deploy raw generated
   `dist/server/wrangler.json`, which contains a placeholder local database.
5. Apply only a reviewed missing migration to the explicitly selected staging
   database. Existing tables are not permission to replay their creation SQL.
   Deploy with Wrangler using the staging overlay. Configure runtime secrets
   securely, without logging their values. Keep existing secret values unless
   a change is specifically needed and authorized.
6. Check staging pages, authentication boundaries and the relevant product flow.
   If paid calls are authorized, use fictional evidence, a call budget and recorded
   accounting. Revoke test invites; retain their ledger. Do not notify clients.
7. Production deployment needs explicit operator approval; staging success alone
   does not grant it. For this release that approval was given. Build an isolated
   copy of the validated source with the production `pk_live_` key, then run
   `node scripts/prepare-production-deploy.mjs /absolute/path/to/isolated-build`.
   It verifies the production key and pins the correct account/D1. Existing
   production Clerk and OpenAI secrets must not be replaced by development keys.
8. Deploy using `dist/server/wrangler.production.json`. Do not change the apex,
   detach a domain, touch legacy Sites or copy its rows as part of an ordinary
   release. Configure approved caps explicitly; they are server-side settings.
9. Verify the actual custom domain: anonymous and forged-header owner access 401,
   absent/invalid invitation 404, foreign-origin mutation 403, `/s` and `/sign-in`
   load, and emitted application assets match the validated build. Recheck schema,
   data counts and active Worker version. Update this runbook with observed results.

Wrangler invocation in an isolated build:

```sh
node --import ./scripts/sites-env.mjs node_modules/wrangler/bin/wrangler.js deploy --config dist/server/wrangler.production.json
```

Substitute the staging overlay only when deliberately targeting staging. Never
copy a production command into a fixture script. Use secret input mechanisms;
never put a key into a command argument, tracked JSON, browser bundle or log.

## Verification evidence and limits

- Local: typecheck, lint (four existing warnings), calculation, attach blockers,
  discovery/schema/budget tests, API lifecycle/import/discovery/deadline checks and
  desktop/mobile browser simulations pass.
- Final local real-provider pair: English and Polish passed. Saved acknowledgements
  took 29ms and 3ms; summaries 8.061s and 8.310s. The camera case retained measurement
  and safety blockers; the workshop reached review with operator confirmation needed.
- Hosted staging pair: acknowledgements 87ms and 167ms; final summaries 8.485s and
  11.736s. Exactly one paid call per case despite same-ID retries. Both invites
  returned 404 after revocation. This exercises the real Worker/background/D1 path.
- Production: root redirects to sign-in; owner access and forged identity denied;
  missing invitation denied; foreign-origin mutation denied; client/sign-in pages
  return 200. The emitted discovery and Clerk assets match the isolated build hashes.
  Clerk's frontend responds 200 and its browser sign-in form renders.
- No production test records or paid test calls were created. No full authenticated
  production owner/client workflow or real-device microphone test was performed in
  this release. Do not describe form rendering as completed sign-in.

Local safe reports are under ignored `outputs/`: `discovery-paid-smoke*.json`,
`staging-discovery-smoke.json`, `discovery-production-smoke.json`, release logs and
`discovery-ui/` screenshots. They must not be uploaded wholesale: unrelated older
outputs can contain private invitations. Only publish reviewed source and this runbook.

## Rollback and recovery

For a new failure, first inspect the active Worker version and the affected flow.
Disable `MIRAI_DISCOVERY_ENABLED` to stop new paid chat while keeping form access.
Keep evidence and budget ledgers. If a Worker rollback is needed, deliberately
select the previous validated version for that same Worker, preserve its D1 and
recheck runtime flags/secrets. The previous discovery implementation has older
latency behavior and no shared cap; leave paid chat disabled until reviewed if
rolling back to it. Additive migration 0002 must not be dropped during rollback.

Do not restore old apex A records or reattach Sites as a routine rollback. Sites
contains a different dataset; doing so would make new-production sessions
unavailable. D1 backup/Time Travel restoration is a separate data operation that
needs a concrete recovery point and review, not a release-script default.

## Historical context

Earlier on 2026-09-11 the new-client preview was blocked by Clerk DNS error 1000.
That note was stale by this release: Clerk responded successfully and production
was already on the operator Worker. The initial Sites migration's copy/remap
proposal was superseded by separate legacy/new-client databases. See
[historical investigation](sites-migration-investigation.md), not as an executable
cutover checklist. This task did not perform or independently reconstruct that
intervening migration.
