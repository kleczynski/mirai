# 0001. Adaptive discovery completion

**Date**: 2026-09-12
**Status**: Accepted

## Summary

Mirai reassesses the saved evidence after each answer and plans the next useful question. It reserves the end of a ten answer interview for a concise completion check. The client sees what was understood before leaving, and the operator sees why confirmation is available or blocked.

## Context

The current planner asks each topic once and stops at eight answers despite nine required blended topics. Vague answers cannot receive a general clarification. The final screen can therefore imply completion while essential details remain missing. The user authorized implementation using engineering judgment. The existing provider, hosting, authentication and spending limits are fixed project constraints.

## Requirements

1. AC-1: At most ten saved conversational answers, including the opening. Stop early when evidence is ready or the client chooses finish.
2. AC-2: Skip covered topics. Prioritize first use and success before optional depth. When remaining turns cannot individually cover remaining gaps, ask a combined completion check. Clarifications address unresolved topics and never invent evidence.
3. AC-3: Use the existing single synthesis call per answer. Give it prior quoted evidence and explicit gaps so it can combine a clarification with earlier answers. Preserve quote validation, client corrections, reservations, timeouts and idempotency.
4. AC-4: A client can explicitly resume an incomplete review if fewer than ten answers were saved. Resuming makes no provider call, does not reset the count, preserves history and invalidates readiness. Replays are idempotent. Reject pending processing, complete evidence and locked discovery.
5. AC-5: The client review displays saved topic summaries and unresolved topics. Operator confirmation explains blocking gaps and remains server enforced. Build export still requires operator confirmation, and new demo approval remains separate.
6. AC-6: Exercise planner, resume, source preservation, bounds and existing API lifecycle locally. Run typecheck, lint and build. Record live verification separately.

## Options considered

Increasing the cap alone is cheap but leaves vague answers unresolved. An unrestricted conversational agent offers more natural wording but introduces a larger evaluation and cost surface. A constrained agent loop uses the existing evidence extractor with a server planner and reviewed bilingual questions; wording is less flexible, but decisions and limits remain inspectable.

## Decision

Use the constrained loop: save, extract sourced evidence, assess gaps, plan the next question, repeat within ten answers, then present review. Use the current interface and CSS. Implement in one coherent vertical slice. Workflow skills: architect for this decision and develop for implementation; the user delegated design decisions and requested completion, so additional design confirmation rounds are unnecessary.

## Rationale

The observed failure is planning and closure, not absence of tools or multiple agents. A server planner can guarantee that remaining topics are presented within the answer budget. No design can guarantee informative answers or provider availability. Missing information stays visible rather than being fabricated or silently approved.

## Feature design

Keep the existing discovery JSON and D1 tables. Add a `resume` transcript kind and mutation action. Add reviewed completion and clarification question IDs, with text assembled from current gaps and existing evidence blockers. Existing finished records remain in review until the client explicitly resumes. No database migration or automatic paid replay.

The next question uses unasked required topics first. During the last three slots, completion checks begin when remaining answer slots are no greater than unresolved topics, or earlier if no unasked topic remains. Three distinct closing prompts support the last turns. Each contains only current gaps, with topic labels and concrete answer guidance. The readiness function remains the authority for early completion and export.

| Surface | Inputs and authorization | Output and errors |
| --- | --- | --- |
| Existing client discovery POST | `resume`, revision, requestId; exact session invitation | Saved session; 409 for stale or ineligible resume; existing locks and expired bearer checks |
| Existing owner confirmation PATCH | Session id and revision; verified owner | Existing ready stage or explicit unmet evidence error |
| Existing client and owner reads | Existing session authorization | Summaries, gaps, count, review and resume eligibility derived from discovery |

| Value | Source |
| --- | --- |
| Answer count and remaining turns | Client answer transcript kinds and MAX_DISCOVERY_ANSWERS = 10 |
| Next topic and closing prompt | openGaps, prior assistant question IDs, reviewed bilingual library |
| Summary and quotes | Existing validated provider updates or explicit client topic edits |
| Provider planning context | Current gaps, answer count and persisted topic quote/source pairs |
| Resume eligibility | Review state, nonempty gaps, count below ten, no pending processing; server also enforces discovery locks |
| Ready and blocked labels | evidenceReady and confirmedAt |

Keep tokens private, evidence untrusted, and optimistic revision checks intact. No new provider, secrets or environment variables. Production keeps $0.25/session and $1/database lifetime limits. Ten turns can still be prevented by those caps or unavailable service.

## Build plan

1. [x] Replace the planner and extend source context, satisfies AC-1, AC-2, AC-3.
2. [x] Add explicit resume through API and client review, satisfies AC-4.
3. [x] Complete client summary and operator blocker presentation, satisfies AC-5.
4. [x] Run regressions and update current documentation and release evidence, satisfies AC-6.

Implementation, local verification and the operator-authorized staging/production release completed on 2026-09-12. See the [operations runbook](../plans/production-new-clients.md) for live checks and limitations. No matching scope row exists; these build tasks are tracked here.

## Consequences

Clients receive a completion check during the same visit. The last prompt may contain several short items when earlier answers left many gaps. Ten answers and richer evidence context can cost more, while existing caps remain binding. Explicit unknowns remain unresolved. No automatic build or deployment is introduced.

## Release

Existing finished sessions are preserved. Reverting application code preserves their JSON evidence, although older code will not offer resume. Publish only after exact release approval and the runbook's isolated production build checks. Local verification does not establish live model quality or production deployment.
