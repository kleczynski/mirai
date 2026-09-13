# ADRs: additive projects and governed collaboration

Date: 2026-09-12. Status: implementation decisions based on settled user
requirements; the owner accepted recommended policies D1–D4 in the [scope](../scope/project-collaboration.md).
These ADRs do not assert that new behavior is implemented or deployed.

## ADR 1: project identity preserves the session substrate

Keep `sessions.id` and `owner_id` as the existing resource identity/ownership source.
Introduce a one-to-one `project_metadata` extension for origin, introducing party,
governance version, semantic revision, lifecycle and new owner gates. Legacy rows
without metadata project as origin `client` and legacy governance; no eager backfill.
Create metadata atomically with new sessions. Ownership is never supplied by the
browser and cannot be changed through project metadata.

Keep collaboration content out of session JSON: anonymous client GET currently
returns it wholesale. Project/member/client projections must use explicit fields.
Legacy demos/feedback stay readable; new approval/artifact metadata can reference
their demo IDs without inventing immutable provenance for historical versions.

Add memberships, invitations, evidence/revisions, comments, decisions, canvas
items/layout revisions, audit events, demo provenance/owner approvals and pilot
measurements as scoped records. Composite project/resource references must reject
cross-project card, parent, correction and demo IDs. Keep project-level semantic
revision separate from layout and evidence revisions.

Consequence: two governance versions need compatibility tests. This avoids broad
rewrites and leaves old invitation URLs and paid accounting unchanged. New routes
must not accidentally expose new projects through old mutation/export permissions.

## ADR 2: authenticated membership is independent of client bearers

Retain the current workspace owner check and introduce a server-side verified Clerk
principal for contributors. Match invitation target against a verified account email,
then persist immutable Clerk user ID membership. Email identifies invitation eligibility;
the accepted membership is not authorized through a browser-supplied email thereafter.

`project_invitations` records project, target email, unique token hash, expiry,
creator, accepted user/time, revocation and timestamps. `project_memberships` records
project/user, contributor role, grant and revocation. Single-use consumption and
membership creation occur in one transaction; a stale or revoked invitation cannot
reactivate membership. Owner revocation also cancels pending invitations for that
grant. Reinvitation after revocation is an explicit new owner action.

All reads check current membership. All writes include the live membership and
resource-author checks atomically, with audit rows in the same commit. Invitation
and member administration remains owner-only. Clients retain bearer-only legacy
access and cannot exchange their invitation for contributor membership.

Consequence: sign-in alone exposes no projects, and revocation is effective on the
next request. Real Clerk tests are required; a local principal stub is only service
test evidence. No public identity header or loopback contributor bypass is added.

## ADR 3: source revisions and owner decisions are distinct records

Use immutable evidence revisions and a revision-checked current head. Store
authenticated submitter separately from original attributed author/source. A
correction refers to the exact superseded evidence/revision. Owner acceptance is
a new decision referencing the immutable proposal revision, not an overwrite of
the contributor's text. Rejection/supersession creates review history.

An accepted claim is not automatically a verified fact. Agent inferences retain
agent attribution and source references. Build exports contain pinned provenance
and separate trusted owner instructions from untrusted source JSON.

Consequence: additional joins and explicit review actions preserve provenance under
concurrent edits. Historical source/import records remain historical; assigning
Clerk author identity later would fabricate authentication evidence.

## ADR 4: layout is presentation; lifecycle gates are explicit

Use a bounded section canvas, with independent position/size records and optimistic
revision. Semantic type, review state, readiness and approval never derive from
coordinates. Mobile renders the same semantic order as sections. D2 determines
whether contributor layout edits are personal or shared.

Readiness pins a semantic snapshot; owner demo approval pins the current demo ID
and artifact identity. New versions invalidate active approval, retaining historical
decisions. Preserve existing client acknowledgements for legacy sessions. New
collaborator/owner project feedback can request changes or comment but cannot approve.
D1 determines handoff eligibility after newly accepted scope changes.

Consequence: extra revision domains avoid treating a card move as a scope change.
Draft recovery must compare persisted and unsaved values rather than discard them.
Prototype fictional UI before committing persistent canvas behavior.

## ADR 5: original files and deletion require explicit data policy

Do not embed binary uploads in session JSON, Git, public assets or local demo
fixtures. D3 chooses private Mirai objects versus referenced private originals.
If Mirai stores them, use opaque object IDs, bounded MIME/size validation, content
hashes and server-authorized downloads; no public bucket or permanent bearer URL.
Keep extracted text separate from original files. No arbitrary server URL fetcher.

D4 chooses archive/purge versus immediate deletion. Revoke access immediately,
guard deletion atomically against concurrent changes and make object cleanup
recoverable. Preserve lifetime charged/reserved discovery totals independently of
purged content. Never erase a reservation to gain additional paid capacity.

Consequence: schema, storage bindings and rollback depend on D3/D4; do not implement
either branch as an unapproved assumption. Backup/retention behavior must be stated
in the resulting operations plan before hosted use.

## ADR 6: BDO is a separate versioned product

Mirai stores evidence, decisions, scope, artifact/test references, feedback, approval
and pilot/handoff records only. BDO runtime, customer data, credentials, commands,
queues and confirmations belong to a separate repository and deployment.

The repository target is confirmed at phase 14, before creation. Gateway contracts
are validated against official 2027 material, with a real Worker/test-environment
spike before fixing hosting. Cloudflare is preferred, not a verified compatibility
claim. No historical instruction or secondary article substitutes for that contract.

Duplicate delivery is expected. Persist commands and confirmation, claim atomically,
persist outcomes before ack, and block ambiguous creates for reconciliation/manual
review rather than automatically retrying. No exactly-once guarantee is assumed.

Consequence: separate release identity and agency-owned accounts are required.
Mirai approval cannot submit a KPO; authenticated client confirmation is enforced
in the separate product. Mirai staging and conditional production release are authorized by the owner. BDO
Worker deployment and real BDO mutations need their own exact authorization.
