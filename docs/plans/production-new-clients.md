# Mirai release and operations runbook

Updated on 2026-09-13 after the monitoring endpoint repair. This is the current operations
reference. Earlier migration investigations describe history, not actions to replay.
Always inspect live configuration before the next release; these observations are dated.

## Monitoring endpoint repair, 2026-09-13

Owner-authorized production repair deployed from `main` source `8eb05d6`
(monitoring fix `e42afe2`). Current production Worker:
`234c2da2-e7f4-4833-a0e1-ab573d024833`; replaced
`96993435-0b26-4746-b9b7-84966149cd44` (source `0ad619e`).

The existing signed-in owner browser reproduced `GET /api/admin/monitoring`
with HTTP 500 and exact body:
`{"error":"Could not save or load this session. Your input has been kept. Please try again."}`.
Live `wrangler tail mirai-production` captured
`D1_ERROR: ambiguous column name: created_at at offset 40: SQLITE_ERROR`.
The old generic handler emitted only that message, not a runtime stack.

All four SQL statements were extracted from the route and run read-only against
production D1 using Wrangler. Because `d1 execute` has no binding option, the
owner ID retrieved from D1 and current ISO time were safely SQL-quoted into the
same placeholders; no identity, invitation or evidence was saved to source.
The latest-discovery join alone failed: both joined tables have `created_at`.
The session aggregate, discovery aggregate and retired-usage query passed.
All nine session rows contained valid JSON with array demos/feedback fields.
The fix qualifies the discovery timestamp in SELECT and ORDER BY. It also
passes explicitly typed discovery settings and adds endpoint/stage/stack-frame
context for server failures, excluding identity, bindings and evidence. The
existing generic error message stays server-side; the client response is unchanged.

Validation: offline endpoint regression runs real SQL against disposable SQLite
and covers owner isolation, latest request order, charged/reserved/retired usage,
401 before database access and contextual 500 logging. Typecheck, lint (four
existing warnings), offline discovery regressions and production build passed.
CI now runs the monitoring regression. A clean npm install initially exposed two
missing optional WASM lock entries; `8eb05d6` adds only those entries without
changing existing dependency versions. The subsequent locked install passed.

Build provenance: isolated `git archive` of `8eb05d6`, Node 24.10.0, npm 11.6.1,
locked install, production Clerk publishable key read from the prior Worker
version into build process environment. No local environment files or secrets
were copied. Preparation used `scripts/prepare-production-deploy.mjs` against
that isolated directory; Wrangler 4.92.0 dry run and deployment used only
`dist/server/wrangler.production.json --keep-vars`.

Observed after deployment: the signed-in owner request returned HTTP 200 at
2026-09-13T14:03:20Z. Tail identified the new Worker on `mirai.party`, with no
errors or exceptions. The snapshot reported 9 sessions, 8 active invitations,
18 successful discovery requests, no pending/failed requests and $0.151011 of
the $1 database budget (15.1%). Anonymous and forged identity headers both
returned 401. All four direct D1 queries passed again with unchanged totals;
retired accounting remained zero. Version API binding metadata before/after
matched, including D1, R2, publishable key and secret names. Runtime secrets
were preserved with `--keep-vars`; their values were not read or replaced.

No schema migration, production data writes, paid provider calls, demo changes
or approval changes. Dashboard routing and the checked observability-disabled
overlay remain unchanged; live tail was used for this investigation. The
existing Terra provider and $0.25/session, $1/database caps were preserved;
the returned workspace cap was independently observed, while the session cap
remains a preserved secret setting. No broader client flow or microphone
coverage is claimed. Future failures can be located by the logged query stage;
this release did not deliberately inject an error into production.

## BDO expert demo release, 2026-09-12

The owner subsequently authorized the private repository and remaining expert-demo
steps. [kleczynski/mirai-bdo-kpo](https://github.com/kleczynski/mirai-bdo-kpo) was
created private. The separate fictional review app is live at
https://mirai-bdo-kpo-demo.kleczynski11312.workers.dev/ from source
`40dc3262b64501385f77c255d0b5a820726c9b2d`, Worker version
`9c68a383-f8e2-4996-be6e-6c9628599cc6`. This is a static review release, not real
BDO integration or the agency pilot. No Mirai runtime release or schema change was
performed for this step; existing discovery caps and accounting were untouched.

The owner-accepted bounded demo scope is recorded as scope 2 in project
`f3bb6569-6c84-4e75-8210-aa0523f72bc8`. Readiness is confirmed and demo version 1 is
attached with source, deployment and test-manifest metadata. The production UI
confirmed Demo review, Approval pending and zero pilot records. Twelve evidence
cards now exist, including the accepted authorization; original collaborator files
and actual expert feedback remain pending. Historical intake notes below describe
the earlier checkpoint and do not override this update.

The 15 domain/storage tests, typecheck, lint, build and exact-source GitHub CI passed.
Live HTML/JS/CSS/manifest matched the isolated build; hosted save/reload worked.
The app uses browser-local fictional data, has no Cloudflare resource bindings and
sets CSP connect-src to none. Role selection is a simulation, not authentication.
Detailed provenance, asset hashes, browser coverage and limitations are in the
[BDO release record](https://github.com/kleczynski/mirai-bdo-kpo/blob/master/docs/RELEASE.md).
The public review URL does not expose the private source repository. Real BDO
credentials, authenticated test-company checks, deployment tailoring and measured
pilot results remain future work after actual expert review. Mirai brief export was
requested, but successful saving of its downloaded file could not be verified;
the accepted scope is preserved in the separate repository's docs/BRIEF.md.

## BDO project intake after release

The owner subsequently signed in and authorized inviting the named collaborator.
Project `f3bb6569-6c84-4e75-8210-aa0523f72bc8` was created through the production
Mirai UI with collaborator origin and David as introducer; eleven provenance-tagged
cards were saved. The scoped invitation was sent through the owner's Gmail and the
UI confirmed Message sent. No acceptance, readiness or demo approval was asserted.
This is authorized product data, not a production test fixture. Earlier release
counts below are observations at release time; this checkpoint adds one project.
No Worker deployment, migration, paid discovery call or change to existing sessions
was performed in this intake task. See the [BDO milestone update](../specs/0003-bdo-kpo-contract-validation.md)
for the fictional expert-demo scope and remaining repository decision.

## Released project collaboration, 2026-09-12

The operator authorized staging, then production if checks passed. Both are now
running the project/collaborator implementation from local source commit
`71d71db47bf862d610cb91754ff1d65f2420cabe`, branch
`codex/project-collaboration-release`. This includes the already-deployed adaptive
discovery baseline below; its implementation was compared with the prior source
archive before release. Unrelated working-tree changes were preserved. No remote
Git push, real collaborator invitation or BDO deployment occurred.

| Target | Current Worker version | Previous Worker version |
| --- | --- | --- |
| Staging | `49379cbe-54b1-410b-b823-d2aeb9621894` | `869bb641-24cc-4845-9ae0-94e62bc55659` |
| Production | `34cfc940-aef7-453f-b041-6e5e68a0fd54` | `56266bde-b313-4994-ab0e-91486202fd58` |

### Observable behavior and source

`/projects` now supports client/collaborator/owner origins, server-authorized Clerk
contributors, verified-email invitations, immutable evidence revisions and owner
review, personal/shared layout, private original files, readiness/build export,
versioned external demos, feedback/current-version approval, pilot records and
handoff. Accepted scope changes reopen readiness and block handoff until a new
approved demo. Pending contributions leave accepted snapshots unchanged. Archive
revokes access; explicit content/file purge preserves accounting and a tombstone.

Implementation: `app/projects/`, `app/api/projects/`, `lib/project-*`, additive
`db/schema.ts` tables, legacy mutation/accounting guards in `app/api/sessions/route.ts`
and `lib/discovery-service.ts`, Clerk principal extraction in `lib/server.ts`, and
R2 deploy/local bindings. [Scope](../scope/project-collaboration.md),
[inspection](../specs/0002-project-collaboration-inspection.md) and
[ADRs](../adr/0001-project-collaboration.md) describe the permission and data contracts.

### Schema, build and storage

Generated/reviewed migration `drizzle/0003_salty_giant_girl.sql` applied once to each
inspected database: 15 additive table/index statements, with no rewrite of existing
sessions, invitation hashes, demos, feedback or approvals. New tables cover project
metadata, memberships, invitations, evidence/immutable revisions, comments, canvas,
audit, files and retired discovery usage. Local migration tests verify fresh
initialization and byte-for-byte preservation of fictional legacy data.

D1 post-migration bookmarks: staging
`0000000d-00000006-000050e4-7ac0da923a051b38e198453e8bcd221c`, production
`00000033-00000006-000050e4-29244f3f03bb297f3838799b353612cc`.
Private R2 buckets `mirai-staging-files` and `mirai-production-files` bind as
`BUCKET`. Both r2.dev public URLs are disabled. Download routes reauthorize project
membership; original files are not public assets.

Staging and production builds used isolated checkouts without local environment
files, matching Clerk test/live publishable keys, reviewed deployment overlays and
`--keep-vars`. Runtime secrets were preserved. Production served bytes match the
isolated build for the Clerk provider, legacy session and both workspace chunks.
Project/legacy workspace SHA256 values respectively appear in the safe report
`outputs/project-collaboration/production-check.json`; Clerk provider remains
`5fd959161be70bafb45a131b3ab14a42c0fd274eac78e8c75f0e9521bffaac19`.
Build checkouts/logs are ignored under `outputs/project-collaboration/`; do not
publish that directory wholesale. Later release-record/intake edits are docs-only.

### Verification performed

Typecheck, isolated staging/production builds and application lint pass; lint has
four preexisting warnings. Project service, HTTP and migration suites pass, as do
existing session/lifecycle/import/discovery/deadline/domain/attach-blocker checks.
Project coverage includes cross-project reads/writes, forged identity, wrong or
unverified invited email, invitation replay/expiry/revocation, own-evidence-only
edits, atomic revocation races, immutable accepted revisions, layout conflicts,
readiness/approval invalidation, private file access and archive/purge accounting.

Hosted staging passed 66 authenticated HTTP checks with real development Clerk
sessions and fictional identities. They include invitation acceptance, exact
identity/project isolation, owner-only operation denial, evidence attribution,
private R2 upload/download, revision conflicts, approval/export gates and immediate
revocation. The browser used Clerk's no-email development test identity: sign-in,
scoped project list, contributor controls, evidence save/provenance, then access
revocation while editing; the rejected save preserved its draft. Invitation
acceptance itself was checked over HTTP, not the browser fragment flow.

Local browser checks covered project creation, source/evidence entry, layout save
and reload, explicit comparison/recovery of a conflicting unsaved draft, and ten
mobile sections at 390px with no horizontal overflow. These checks do not establish
real microphone, screen-reader, live model, or every keyboard/drag interaction.

Production checks passed public page/sign-in rendering, anonymous and forged
identity rejection, unauthenticated foreign-origin write rejection, exact asset
comparison, deployment/schema inspection, routing and secret-binding preservation.
The unauthenticated project write returns 401 before origin evaluation; authenticated
foreign-origin rejection was verified locally. Production browser reached Clerk
sign-in. No authenticated production project mutation was tested or performed.

### Data impact and remaining work

Staging changed from four sessions to seven because three fictional projects were
created, archived and purged; their empty accounting tombstones remain. Its existing
one demo and zero approvals remain. Synthetic Clerk identities/sessions and R2
originals were cleaned up. Production remains eight sessions, zero demos and zero
approvals; no production fixture or content mutation occurred. Routing still maps
`mirai.party` to `mirai-production`, with the same D1 and secret binding names.

This project collaboration task made no paid discovery calls, ledger resets, cap
changes, DNS changes or legacy Sites migration. A later read-only accounting check
at 11:59 UTC observed staging 2 attempts/$0.027045 and production 18 attempts/
$0.151011. Production activity increased since the earlier adaptive release; it
was not generated by this task. Reservations remain retained in the ledger. Last configured discovery caps remain $0.25/session and
$1/database lifetime. Secret values cannot be read through settings inspection;
deployment preserved them with `--keep-vars`. Safe live reports are
`live-before.json`, `live-after.json`, `staging-check.json`, `production-check.json`
and `accounting-check.json` under ignored `outputs/project-collaboration/`.

Rollback must preserve new project authorization and accounting guards once project
records exist. Do not blindly restore an older Worker without those guards, replay
migration SQL or delete the new tables/buckets. Prefer a compatible forward fix;
restoring a database also needs reconciliation with R2 and retained spending.

The BDO product is still a separate pending workstream. Its
[source review](../specs/0003-bdo-kpo-contract-validation.md) and
[prepared intake](../scope/bdo-project-intake.json) are local discovery drafts.
Production owner sign-in, actual friend identity/original messages/PDF/image,
repository confirmation, secure BDO test credential reference and agency hosting
context remain needed. There is no BDO project import, final readiness-approved
brief, application repository, Worker spike, integration, demo, approval or pilot
from this release. Sending real invitations and BDO staging/production releases
retain their separate authorization requirements.

## Historical adaptive discovery release, 2026-09-12

Deployed after explicit operator authorization to validate and publish if green.
[Design and acceptance criteria](../specs/0001-adaptive-discovery.md)
record the constrained agent loop: source extraction, gap assessment, next question
planning and client review, within ten saved answers. Closing checklists address
previously asked but unresolved topics. Explicit resume supports old eight-answer
reviews without resetting counts or issuing a provider call. Operator confirmation
now explains blocking gaps, and still gates build export.

Source base: `2327b343721f3979c33d869db96f932c12d285b3` plus the current discovery
working changes. SHA256 over the sorted five implementation paths, each followed
by NUL, file bytes and NUL:
`72d7e7ae698bb0473a1a4704c80e734ba9838c3657d1e3245e65f7c04c873d46`.
Paths: `app/discovery-observer.tsx`, `app/s/discovery-client.tsx`,
`lib/discovery-provider.ts`, `lib/discovery-service.ts`, `lib/discovery.ts`.
The sanitized source archive is `outputs/adaptive-release-20260912-source.tar.gz`,
SHA256 `ca5ce628e04f42250127f92a0d34ce52ae39d5cb4adab608f250757f152eec77`.
It preserves the exact application source including existing `app/modern-ui.css`;
final release-record edits are documentation-only. No Git commit or remote push
was performed. Do not publish ignored outputs wholesale.

| Target | Active Worker version | Pre-release rollback version |
| --- | --- | --- |
| Staging | `869bb641-24cc-4845-9ae0-94e62bc55659` | `d96db145-a4c0-4759-adba-f8d3c83eb757` |
| Production | `56266bde-b313-4994-ab0e-91486202fd58` | `4ba688c9-576e-466a-a0e3-00bb8ae47689` |

Both isolated builds excluded local environment files and used their current
matching public Clerk keys (staging test, production live). Checked staging and
production overlays were deployed with `--keep-vars`. Live Clerk/session asset
bytes match their build artifacts. Production assets: `clerk-provider-RxPyUlvn.js`
and `session-DyuU6PJN.js`; Clerk asset SHA256
`5fd959161be70bafb45a131b3ab14a42c0fd274eac78e8c75f0e9521bffaac19`.

Local verification: typecheck and build pass; lint has four existing unrelated
warnings. Discovery service tests pass, including English/Polish closing prompts,
the old review resume path, ten-answer closure with original plus clarification
quotes, idempotency, budgets, isolation, processing recovery and concurrency.
Discovery HTTP, route deadline, lifecycle smoke and attach blocker checks pass.
HTTP fixtures use a separate temporary checkout and local D1 with fictional data,
no provider key and no production records. The paid smoke dry run also passes.

Browser checks on the isolated localhost preview: Polish start, explicit finish,
resume, topic save, summary review, and a 390px viewport with no horizontal overflow.
The optional Playwright simulation suite was updated but not run because Playwright
is not installed. This does not establish real microphone or live model quality.

Authorized live Terra validation made exactly two attempts in isolated in-memory
databases, with a $0.25 run cap and no retries: English acknowledgement 17ms,
synthesis 7,876ms, $0.013143; Polish acknowledgement 3ms, synthesis 12,009ms,
$0.017469. Total $0.030612. Both evidence/readiness checks passed; missing evidence
remained blocked and sufficient coverage did not auto-confirm readiness. Safe
report: `outputs/discovery-paid-smoke-adaptive-release-20260912.json`.

Hosted staging lifecycle passed: one fictional old-eight-answer review resumed
through authenticated client HTTP without a paid call, preserved answer count,
returned the closing checklist, handled duplicate/stale revisions, finished
without readiness confirmation, and persisted a topic edit. Its invitation was
revoked and then returned 404. Staging sessions changed 3 → 4; demos stayed 1,
approvals 0. Production stayed at 8 sessions, 0 demos and 0 approvals. No
production fixture or product-data mutation was performed.

Both hosts passed anonymous/forged owner rejection (401), absent/invalid client
bearer rejection (404), and public page checks (200). Production additionally
passed foreign-origin write rejection (403); production sign-in rendered the
Clerk form in the browser. No authenticated production journey or real microphone
test was performed. The two live model cases are not a ten-turn live evaluation.

After deployment, routing still maps `mirai.party` to `mirai-production`; both D1
bindings and schemas are unchanged. No migration, DNS change, new runtime secret,
cap increase or ledger reset. Hosted usage remained staging 2 attempts/$0.027045,
production 8 attempts/$0.048519. Existing secret bindings were preserved; secret
values are not readable through the settings API. Last configured caps remain
$0.25/session and $1/database lifetime accounting. Longer interviews consume
those caps; unknowns and provider failures can still leave gaps. Existing client
reviews do not reopen automatically: the client explicitly resumes through their
existing invitation while turns remain. Operator confirmation still requires
sufficient evidence. The unrelated `.cursor/` and presentation work remain intact.

## Current environments

| Environment               | URL / Worker                                                        | D1 database                            | Authentication                                   |
| ------------------------- | ------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| Production                | https://mirai.party → `mirai-production`                            | `26c4ce49-e459-4e94-be18-593b3f633c98` | Production Clerk                                 |
| Production Worker address | https://mirai-production.kleczynski11312.workers.dev                | Same production D1                     | Production Clerk                                 |
| Staging                   | https://mirai-staging.kleczynski11312.workers.dev → `mirai-staging` | `7fece159-c3e2-4394-953d-60679fb92b33` | Development Clerk                                |
| Legacy Sites              | https://mirai-control-plane.wishfishdev.chatgpt.site                | Separate legacy Sites D1               | Its existing authentication                      |
| Local                     | http://localhost:5173                                               | `.wrangler/state` only                 | Clerk, or loopback mock when its secret is unset |

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

## Historical released artifact and data — 2026-09-11

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

| Target     | Application upload                     | Final active version after runtime settings |
| ---------- | -------------------------------------- | ------------------------------------------- |
| Staging    | `6ac7fec8-0153-450f-a704-1c3a4804ac30` | `6973ee8e-e47e-4c2c-a806-bfe08409d109`      |
| Production | `4a244ab6-227a-4a0e-88d5-c6bdb13fad59` | `6e1209a0-c17f-4c29-bbe1-b4651f31fa1f`      |

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

| Setting                             | Value / handling                                                            |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `MIRAI_DISCOVERY_ENABLED`           | `true`                                                                      |
| `MIRAI_DISCOVERY_MODEL`             | `gpt-5.6-terra` only; low reasoning; no automatic fallback                  |
| `MIRAI_DISCOVERY_SESSION_CAP_USD`   | `0.25`                                                                      |
| `MIRAI_DISCOVERY_WORKSPACE_CAP_USD` | `1`                                                                         |
| `MIRAI_OPENAI_API_KEY`              | Secret; staging configured explicitly, existing production secret preserved |
| `CLERK_SECRET_KEY`                  | Separate development/production secrets; preserved                          |
| `MIRAI_OWNER_EMAIL`                 | Existing operator allowlist; preserved                                      |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Matching Clerk instance, inlined at build time                              |

The workspace cap is lifetime accounting across all sessions in one D1 database.
The historical 2026-09-11 pre-release accounted usage was $0.130917, already included in its
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

Interview questions stop after ten saved answers, on explicit finish or on
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

## Repository handoff

This session's implementation, tests and operating guidance were pushed to
`main` at `d80cfbfd999800155f94e7aa866ba731d7c1d827`. The [Verify run](https://github.com/kleczynski/mirai/actions/runs/34638017892)
passed typecheck, lint, tests, build and production-configuration dry run.
The JavaScript/TypeScript CodeQL check also passed. Later documentation-only
commits record these results without changing the deployed application code.
The unrelated presentation files listed above remain outstanding local work;
private local outputs and `.cursor/` were not published.

The initial source push was rejected by automatic approval review because public
repository publication was not explicit. The operator subsequently explicitly
authorized publishing this session's changes to the existing public
`kleczynski/mirai` repository. The push then succeeded. This is a record of scope,
not blanket permission to publish future secrets, client evidence or other tasks.

## Dependency follow-up

GitHub reported pre-existing critical Next.js alerts #48 (Windows-hosted server RCE)
and #49 (AVIF image-optimizer RCE). The lockfile still pins Next 16.2.6; GitHub lists
16.3.3 as the first patched version. This release did not change dependencies or
close those alerts.

Reachability triage found this Worker starts `vinext/server/fetch-handler`, not
Next's server. Vinext uses its own image handler; the checked config has no
registered image optimizer or Images binding and falls back to validated
same-origin image redirects. The inspected bundle did not contain Next's native
image optimizer or `sharp`. Those findings do not demonstrate these prerequisites
on the current deployment, but are not an exploit test or a full dependency audit.
Review and patch the dependency set in a focused follow-up; reassess before adding
Next-native hosting or image optimization. A passing build/CodeQL run does not
close dependency advisories.
