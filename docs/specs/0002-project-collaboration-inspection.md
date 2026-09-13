# Project collaboration: current implementation inspection

Inspected 2026-09-12. This describes source code, not a live security test.
Related [scope](../scope/project-collaboration.md) and [ADRs](../adr/0001-project-collaboration.md).

## Source and worktree

Base commit: `2327b343721f3979c33d869db96f932c12d285b3` on `main`.
The working tree is not this commit alone. Existing edits cover README, MVP,
development guidance, discovery UI/service/provider/domain/tests and the discovery
plan. `.cursor/`, `app/modern-ui.css` and the adaptive discovery specification were
also already untracked. The operations runbook changed during inspection; treat
that as concurrent work. None of these files is owned by this feature's planning
phase. Do not reset, stage or publish them as part of this task.

Read `AGENTS.md`, README, MVP, NORTH-STAR, DEVELOPMENT and the current production
runbook. No nested AGENTS.md was found in the project. NORTH-STAR is proposed
future behavior. The runbook's previously authorized release is not authorization
for this release. No live database, routing or deployed-version inspection occurred.

## Current boundaries

| Area | Inspected source | Observed behavior and consequence |
| --- | --- | --- |
| Owner identity | `lib/server.ts`, `app/chatgpt-auth.ts` | `owner()` verifies Clerk's `__session`, retrieves the account and compares its primary email to `MIRAI_OWNER_EMAIL`. No project-member identity abstraction exists. The primary-email lookup does not explicitly inspect email verification status; contributor invitation acceptance must do so. |
| Local identity | `app/chatgpt-auth.ts` | Header identity is restricted by loopback host and dev/runtime flag. Preserve hosted fail-closed behavior. Never extend this mock into contributor authentication. |
| Owner resource access | `ownedSession()` | Queries both session ID and authenticated owner ID. The home page calls `owner()`; authenticated nonowners currently cannot enter a project workspace. |
| Schema | `db/schema.ts`, migrations `0000`–`0002` | `sessions` holds owner ID, bearer hash/expiry, JSON data, revision and timestamps. `demo_states` and `discovery_requests` reference sessions. No memberships, evidence revisions, canvas, pilot or project invitation tables exist. |
| Sessions | `app/api/sessions/route.ts` | Owner creates a session and receives a random client token. List is owner-scoped, capped at 500, and only removes chat transcripts from list responses. Other session content remains present. |
| Client invitation | `clientSession()`, sessions PATCH | 32 random bytes encoded as hex, SHA-256 hash only in D1, 30-day expiry, rotation and immediate expiry on revoke. Client access is anonymous possession, not authenticated membership. |
| Client reads | `app/api/client/route.ts` | Returns unpacked session data. Adding private project evidence or invitation/member metadata to session JSON would expose it to the client bearer. New collaboration storage and response allowlists are necessary. |
| Discovery | `lib/discovery.ts`, `lib/discovery-service.ts`, client routes | Legacy eight-answer form; current local chat has adaptive changes. Chat readiness needs operator confirmation. Imported source is considered complete. First demo/import locks client discovery. Paid writes have revision, invitation, expiry and lock predicates plus durable reservations. |
| Import | `app/api/import/route.ts` | Owner-only, exactly three historical playbooks; deterministic owner/source IDs, original transcript plus assumptions/questions, bundled demos, expired invitations, no fabricated approval. This is not a general BDO ingestion path. |
| Demo versions | sessions PATCH, `lib/model.ts` | Attaching a demo appends an ID/version and clears `approvedDemoId`. Checks are operator attestations. No source commit/build identity fields. Bundled demo implementations are shared. |
| Demo access | `app/api/demo/route.ts` | Chooses client bearer or owner and checks exact requested session ID. Saved demo state has optimistic revision. Contributor membership does not currently grant access. |
| Feedback/approval | client POST | Feedback is linked to the latest demo ID; a client bearer can approve or request changes. Name is self-reported. Approval currently gates handoff. No authenticated collaborator feedback or separate owner release approval exists. |
| Documents | `lib/documents.ts`, documents GET | Owner-only build export after discovery; handoff after approval of latest demo. Evidence JSON is escaped and common bearers redacted. Text is oriented toward clients; new provenance categories need their own renderer. |
| UI | `app/workspace.tsx`, `app/clerk-provider.tsx`, `app/page.tsx` | Session list, discovery/demo/history panels and Clerk sign-in. No canvas or contributor route. Current owner UI includes invitation, import, delete and exports; do not render this payload/component wholesale for contributors. |
| Migration runner | `scripts/local-d1.mjs` | Reads Drizzle journal and skips a migration when every created table exists. Partial migrations and column-only migrations need explicit handling; table existence is insufficient to establish the new schema's correctness. |

## Issues relevant to this extension

These are source findings requiring focused tests, not demonstrated exploits:

- Client answer/discovery writes recheck bearer hash and expiry at write time,
  while feedback uses the generic revision-guarded `save()`. Rotation currently
  increments revision; retain and test that interaction for in-flight writes.
- Session deletion compares revision before a batch, but its DELETE statements do
  not include the revision predicate. New child tables require atomic, guarded
  cleanup so concurrent writes are not discarded after this precheck.
- Deletion currently removes `discovery_requests`. The feature must preserve
  lifetime charged/reserved totals; deleting content must not reset paid capacity.
  Do not reset existing ledgers or enable additional paid calls while addressing it.
- Existing client approval is a compatibility constraint. New owner/contributor
  projects need an owner gate without reinterpreting historical client approval.
- A generic hash redactor also matches 64-character content hashes. New exports
  need structured separation of safe artifact digests from bearer redaction.
- Neither a URL nor an operator checkbox proves immutable artifact identity,
  successful integration, browser testing, legal approval or measured pilot gain.

## Verification status for this phase

Performed: source/worktree inspection and planning-document consistency/link checks
(see the scope's phase report). No application code or schema changes. No application
tests, browser checks, authenticated Clerk journeys, migrations, builds, BDO
mutations, paid provider calls or deployments have been run for this feature.

The local test harness in `tests/discovery-chat.mjs` uses actual SQLite transactions
behind a D1-shaped adapter. It is a useful pattern for invitation races and atomic
authorization tests, supplemented by actual HTTP and Clerk browser verification.
