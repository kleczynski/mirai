# Feature scope: projects, authenticated collaboration and BDO delivery

Status: phases 1–3 complete; implementation starting. The owner selected all four
recommended policies and authorized staging, then production only if checks pass. Dated 2026-09-12.

Related [source inspection](../specs/0002-project-collaboration-inspection.md),
[ADRs](../adr/0001-project-collaboration.md), [development commands](../DEVELOPMENT.md)
and [release runbook](../plans/production-new-clients.md).

## Observable outcome

The owner can turn an owner, collaborator or client idea into a traceable project,
review authenticated contributions, export an evidenced build brief and approve a
specific external demo for handoff. The first new project is the friend's BDO KPO
idea; its product runtime and credentials live outside Mirai.

## Settled scope

- Origins: `client`, `collaborator`, `owner`; record introducing person or organization,
  title, owner, language, lifecycle, revisions and audit timestamps.
- Existing sessions appear as client-origin projects without rewriting IDs,
  bearer hashes, expiry, discovery, source transcripts, demo state, feedback or approval.
  Historical Telegram origin is not retroactively relabelled as authenticated collaboration.
- The owner is the only admin/release authority. A Clerk-authenticated contributor
  sees only their project; can add/revise their own evidence, answer questions,
  comment and propose assumptions, decisions, risks, corrections and scope changes.
- Contributors cannot administer membership/ownership, confirm readiness, accept
  proposals, export final briefs/handoffs, attach demos, approve demos, configure
  secrets, deploy or delete projects. Membership never grants workspace access.
- Client invitations remain distinct from authenticated contributor invitations.
  Existing client journeys and version-specific acknowledgements continue to work.
- Ten governed canvas sections: sources/evidence; problem/users; assumptions; open
  questions; decisions; risks/constraints; MVP scope; demos; pilot evidence; handoff.
- Position and size are presentation only. Semantic changes use explicit actions.
  Desktop supports constrained move/resize; mobile uses semantic sections/lists.
- Evidence includes project, source type, original content, authenticated submitter
  when available, author role, attributed source, timestamps, revisions, kind,
  review state and correction/supersession relationships. Agent summaries remain inferences.
- Demo records include external URL, source revision, build/deployment identity,
  test/artifact references and release notes. A new version invalidates active approval.
- Pilot records keep baseline, target, method, sample count, timing, corrections,
  errors and confirmation distinct from demo approval and unmeasured claims.

## Current decision frontier

The owner accepted all four recommendations on 2026-09-12. Alternatives below are rejected.

| ID | Decision | Recommended behavior | Alternative and consequence |
| --- | --- | --- | --- |
| D1 | Changes after readiness/approval | Contributions remain pending; owner acceptance of a scope change reopens readiness and blocks handoff until a new approved demo. Retain historical approvals. | Preserve the approved release as deliverable and put accepted changes in a separate future scope; requires multiple concurrent scope baselines. |
| D2 | Contributor layout permission | Contributor has a personal layout; only owner changes shared layout. | Contributor edits shared layout with CAS; other members see those presentation edits. |
| D3 | Original PDF/image storage | Private Mirai object storage, authorized per-project downloads and evidence hashes. | External private originals, with references/hashes in Mirai; availability and access lifecycle depend on that storage. |
| D4 | Deletion/retention | Archive by default; separate explicit purge for content/files. Retain non-content lifetime spending totals. | Immediate permanent owner deletion of content/files, also retaining spending totals; less recovery and audit history. |

D1–D4 are resolved. Do not reopen settled roles, origins, authentication or BDO direction.
Unknown answers become bounded prototypes/validation tasks. No additional generic
permission request is required to implement once the frontier is resolved.

## API and authorization contract

Introduce `/api/projects` plus project-scoped membership, invitation, evidence,
comment, canvas, readiness, demo, feedback, pilot and document operations. Final
route spelling is an implementation detail; route contracts must be documented
with tests. Keep `/api/sessions`, `/api/client` and `/api/demo` compatible.

- Server identity comes from verified Clerk session/account, not body IDs or headers.
  Use `requireWorkspaceOwner`, `requireProjectMember`, `requireProjectContributor`
  and `requireProjectOwner` across services and routes.
- Accept contributor invitations only with an exact normalized, verified Clerk
  email matching the target. Do not normalize provider aliases/dots. Bind stable
  Clerk user ID atomically; single-use/expired/revoked tokens fail. Hash only, no logs.
- Invitation creation is owner-only; show the bearer once to the owner for explicit
  sharing. Acceptance uses a dedicated fragment-bearing route and POST; consume the
  fragment before navigation and never forward it to Clerk redirects or telemetry.
  If sign-in loses the ephemeral token, reopen the original link after sign-in.
- Recheck active membership and authored-resource ownership in the mutation's
  transaction/SQL predicate, including revocation races. Do not authorize once and
  later write without the membership condition.
- Foreign project/resource reads and writes return a non-disclosing 404; unauthenticated
  requests return 401; known members attempting owner actions receive 403. Malformed
  input is 400, excessive content 413, stale revision or stale demo 409.
- Use strict schemas, bounded payloads, parameterized queries, same-origin mutation
  checks, no-store responses and explicit owner/member/client response allowlists.
  A client bearer cannot read canvas, member identity, invitation metadata or private
  evidence merely because it resolves to the same session.
- Comments, evidence, URLs, BDO responses and documents are untrusted data. Do not
  automatically execute instructions, fetch supplied URLs or import secrets from them.

## Provenance and versioning contract

Evidence source types: `owner_note`, `collaborator_note`, `client_answer`,
`telegram_import`, `uploaded_document`, `external_reference`, `agent_inference`.
Kinds: claim, assumption, reference, observation, decision, open question; section
can additionally identify a risk or scope proposal without changing provenance.
Review states: pending, accepted, rejected, superseded. Acceptance means an owner
decision, not proof that a factual claim was independently verified.

The authenticated uploader and attributed original author are separate fields.
An owner importing a friend's message must not impersonate the friend's Clerk
identity. Original payloads and revisions remain immutable. Editing adds a revision;
owner acceptance adds a decision referencing the exact proposal revision. Later
author edits cannot alter that accepted snapshot. Verification of an external fact
requires a source, inspected version/date, reviewer and validation reference.

Use a semantic revision for readiness/export snapshots and separate canvas
revisions for presentation. Each evidence head also has its own revision. Atomic
updates add history/audit entries only when the expected revision and permissions
match. Failed multi-record updates must roll back completely.

On 409 the UI retains the local draft/layout, shows the saved version alongside it
and offers copy, compare and deliberate retry. Reload never automatically replaces
unsaved edits. Revocation disables saves immediately; already viewed bytes cannot
be recalled from a user's device.

## Canvas delivery

Use Mirai's existing typography, components and spacing with section navigation,
source/author labels, distinct pending proposals and accepted decisions, and a
visible owner gate summary. Build a disposable fictional-content prototype before
persistent canvas code and obtain a focused visual reaction.

Keyboard buttons provide move/resize alternatives to drag. Preserve logical DOM
focus order independently from saved positions. Provide visible focus, accessible
names, readable contrast, reduced motion, save status and loading, empty, error,
conflict, revoked-access and read-only states. Test desktop and mobile directly.

## Documents

Build export is owner-only and requires current readiness. Pin the evidence and
decision revisions. Separate collaborator claims, verified external facts, owner
decisions, agent inferences, unresolved questions and implementation instructions.
Escape source content as data; exclude tokens, secret values and private operations.
Never turn a proposed decision into a trusted instruction through formatting alone.

Handoff pins the current approved demo's source/build identity, test references,
owner approval and pilot observations/limitations. Legacy handoffs retain their
client-acknowledgement semantics. New-project handoffs require owner approval;
contributor feedback cannot satisfy this gate. D1 determines later-scope effects.
Export is neither deployment authorization nor a performed deployment.

## Migrations and rollback

Add metadata and related project tables keyed by the existing session ID. Derive
legacy defaults in a projection; do not bulk rewrite session JSON or invitations.
New collaborator/owner projects need no live client bearer: use a random discarded
hash and expired timestamp to satisfy existing base-table constraints.

Generate migrations from `db/schema.ts` using `npm run db:generate`; review SQL,
Drizzle snapshot and journal. Use disposable SQLite with fictional legacy sessions,
live/expired token hashes, imported demos, approvals and reserved/charged requests.
Compare all legacy row values before/after; verify foreign keys and indexes. Test a
fresh database, upgrade, repeat invocation and refusal of partially applied schema.
Update the local migration runner if needed; never replay SQL on existing objects.

Data policy D4 controls archive/purge schema. Preserve aggregate discovery spending
on purge, including unknown reservations, without retaining evidence unnecessarily.
D3 controls attachment metadata/object cleanup. The conditional release authorization includes the reviewed migrations necessary for this feature.

Roll back application code on the same environment and keep additive tables/data.
An older build is not automatically safe after new project writes: it lacks the
new deletion, projection and approval rules. Prepare a compatibility build that
disables new feature writes while retaining their authorization/deletion guards;
test old client journeys against it. Do not route to Sites or drop evidence tables.

## Verification plan (not yet executed)

1. Domain/SQLite: origin defaults, provenance revisions, accepted-snapshot immutability,
   ready/demo gates, canvas-only edits, conflict rollback, migration compatibility.
2. Invitation/auth: correct and different verified identities; unverified email;
   absent/forged cookie and identity headers; wrong project; expired/revoked/consumed
   token; concurrent acceptance; revoke versus write; old membership reactivation.
3. Direct API matrix: contributor can revise own evidence but not another author's;
   cannot invite/revoke, accept proposals, confirm readiness, export, attach/approve,
   configure secrets, deploy or delete. Check every route, not only UI controls.
4. Legacy HTTP: `tests/session-flow.mjs`, `tests/lifecycle-smoke.mjs`,
   `tests/import-demo-flow.mjs`, `tests/discovery-flow.mjs`, `tests/discovery-boundary.mjs`.
5. Existing application checks: `npx tsc --noEmit`, `npm run lint`,
   `node tests/demo-engine.mjs`, TypeScript-loader attach-blockers and discovery-chat
   suites, and `npm run build`, using DEVELOPMENT's commands and Node 24.
6. Browser: actual owner/contributor sign-in and invite acceptance, wrong identity,
   scoped navigation, own evidence edits, owner decisions, draft conflict recovery,
   revocation, mobile list, keyboard/reduced motion and legacy client journey.
   Local mocks do not prove Clerk identity verification; record these separately.
7. Exact release build with matching Clerk key in an isolated checkout; authorized
   staging checks only after the operator approves that concrete release.

Fixtures are fictional/local only. Do not include invitation bearers in committed
fixtures or reports. No paid discovery test is implied by this plan.

## Delivery sequence and later prerequisites

| Phases | Deliverable / exit condition |
| --- | --- |
| 1–3 | Source inspection, scope, ADRs and resolved current decision frontier. |
| 4–6 | Origins/membership, Clerk-scoped invitations, centralized permissions and versioned provenance/proposals with negative tests. |
| 7–8 | Fictional canvas prototype, focused reaction, persistent accessible canvas with optimistic saves. |
| 9–10 | Provenance-aware documents; legacy/auth/migration/browser verification and exact local build evidence. |
| 11–13 | Use the new workflow to create BDO collaborator project in a confirmed environment; import actual supplied evidence; review its generated brief. |
| 14–15 | Confirm separate repository before creating it; validate current BDO contract and Worker feasibility; implement isolated BDO test app. |
| 16–18 | Explicit approval for exact staging artifact/environment; attach version to Mirai; actual feedback and revisions. |
| 19–20 | Two-week shadow pilot with measured results; separate production approval and authorization/legal review. |

Friend's name/email, original messages/PDF/image and attribution dates have not been
supplied in this task. The pasted product request and its public links are owner-
supplied context, not authenticated friend testimony. Do not invent missing originals
or import public documents as the friend's upload. Request these at the intake phase.
Do not write private source evidence into this public repository's documentation.

The owner authorized this Mirai feature release to staging and, if all checks pass,
production. Repository creation, invitation delivery and collaborator contact still
await exact authorization. The agency hosting account, secure BDO test
access and real two-week pilot are later prerequisites, not simulated completions.

## BDO boundary and validation backlog

The separate product implements environmental-agency preparers and authorized client
approvers. The client controls every legally meaningful mutation. Use only the
official 2027 test API for the demo. Receiver/transporter mutations, annual reporting,
KEO, billing, field-worker accounts, offline PWA and production submissions are excluded.

`BdoKpoGateway2027` owns planned create/edit, permitted approved edit, approve,
confirmation generation/retrieval, any-status retrieval, sender search, structured
withdrawal and rejected-card revision. Keep raw endpoints/DTOs out of UI. Validate
company/place identifiers, one waste code, transport modes and conditional ex,
hazardous reclassification, generation/process/certificate/container, mass, vehicle
and time fields against an inspected contract before encoding them.

Every mutation needs an immutable command/payload hash, authenticated approver's
explicit confirmation, atomic claim, external result persistence, then queue ack.
Design for duplicate delivery and worker failure between every step. Never blindly
repeat ambiguous creation: reconcile or block for manual review. Known IDs allow
status reconciliation; multiple candidates require manual review. Bounded retry
only for known safe pre-send/transient failures, no retry for validation/auth errors,
DLQ plus visible operator alert when attempts exhaust. No exactly-once claim.

Isolate each client's NIP, BDO IDs, credentials, commands, documents and audit trail.
Encrypt credentials outside Mirai. Official confirmations come from BDO; local
previews are visibly unofficial drafts. Show authoritative status and sync time.

Preferred agency-owned Worker/Vinext deployment remains conditional on a real
test-environment Worker networking/authentication spike. Separate staging/pilot D1,
queues/DLQs, Clerk with MFA and secrets. Validate latency/error/reconciliation/document
monitoring, backup/restore and pinned source/deployment identity. Propose agency-owned
containers if required networking/certificates/fixed egress cannot work on Workers.
The spike itself requires exact Worker deployment/test-call authorization first.

Pilot targets are requirements, not results: at least 50% reduction in median KPO
preparation time, zero duplicate creation and zero cross-client exposure. Establish
comparable baseline/pilot samples, include correction/review time, count attempts,
record errors and obtain actual client confirmation over the two-week pilot.

## Source retrieval preflight, 2026-09-12

This is a preliminary availability check, not a validated 2027 endpoint contract.

| Source | Tool observation and use |
| --- | --- |
| [BDO portal](https://bdo.mos.gov.pl/) | Web reader returned 403; contents not validated. |
| [Test Swagger](https://test-bdo.mos.gov.pl/api/swagger/index.html) | HTML retrieved, no readable contract in extraction; inspect Swagger configuration/specification in BDO validation phase. |
| [2027 announcement](https://bdo.mos.gov.pl/news/informacja-dla-integratorow-api-bdo-zmiany-w-ewidencji-odpadow-od-2027-r/) | Web reader returned 403; do not infer effective dates or endpoint behavior. |
| [Change workbook](https://bdo.mos.gov.pl/wp-content/uploads/2026/08/Zmiany-API-ewidencja-v2.xlsx) | Web reader could not open it; workbook/rows not validated. |
| [Historical KPO instruction](https://bdo.mos.gov.pl/wp-content/uploads/2020/01/instrukcja-karta-przekazania-odpad%C3%B3w.pdf) | Retrieved 32-page PDF; metadata says v1.0, effective 2019-12-16. Historical workflow evidence only. |
| [Industry reference](https://kartaewidencji.pl/karta-przekazania-odpadu/) | Retrieved secondary article; no current API/legal authority inferred. |

## Phase 1–2 report

- Result: implementation map, bounded feature scope, ADRs, verification/rollback
  contract and four unresolved decisions prepared for review.
- Changed files: this scope, linked inspection and ADR documents only.
- Migrations/data: none generated or applied; no local/hosted product records changed.
- Tests/checks: local Markdown links and diff whitespace checked; application,
  browser, Clerk, Worker/BDO integration and production-build tests not run.
- Artifact: working-tree documents based on the commit in the inspection; no
  feature commit, build artifact, external repository or deployment created.
- Security: proposed separation of member/client data, atomic membership guards,
  immutable evidence and preserved spending accounting; none implemented yet.
- Pending: D1–D4, then implementation and all later delivery phases.

## Implementation checkpoint after policy selection

The owner accepted D1–D4 and authorized this Mirai release to staging, then
production if verification is green. The implementation now includes project
routes, Clerk principal/member guards, hashed invitations, evidence revisions,
review decisions, personal/shared canvas layouts, private originals, documents,
version approval, pilot measurements and archive/purge. Migration
`0003_salty_giant_girl.sql` is additive. Legacy deletion transfers accounting into
`discovery_retired_usage`; project purge keeps its non-content request ledger.

Local typecheck, lint (four existing warnings), build, project service/HTTP/migration,
legacy lifecycle/import/discovery/deadline and domain checks have passed at this
checkpoint. Browser checks used fictional local data: creation, evidence entry,
conflict preservation/comparison and saved layout; mobile has ten sections and no
horizontal overflow at 390px. The initial long mobile project list was bounded.
Real Clerk/staging verification and exact release builds are still pending.

## Released checkpoint

Mirai staging and conditional production release completed from source commit
`71d71db47bf862d610cb91754ff1d65f2420cabe`. The
[current runbook](../plans/production-new-clients.md) records exact Worker versions,
additive migration, private storage, 66 authenticated staging checks, actual browser
coverage, production checks, cleanup and remaining limitations. Earlier checkpoint
sections above are historical observations, not current release status.

Subsequent direct HTTPS source retrieval resolved the announcement/workbook/Swagger
availability gaps in the preliminary table. The [BDO contract review](../specs/0003-bdo-kpo-contract-validation.md)
records observed fields, source hashes and still-unverified authenticated behavior.
The [intake draft](bdo-project-intake.json) preserves owner context and agent-recorded
references without inventing collaborator testimony or owner readiness.
