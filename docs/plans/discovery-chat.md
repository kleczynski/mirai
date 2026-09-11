# Discovery chat

Implemented locally on 2026-09-11 and ported onto current `main`. Not deployed.
Chat stays off on `mirai.party` (Sites), `mirai-staging`, and
`mirai-production`. The operator approved Terra, no automatic model fallback, a
$1/session cap, parallel chat/form rollout, coverage plus operator
confirmation, strict session language, compact owner observability, historical
Telegram imports and the existing post-demo lock.

Owner authentication on this checkout is Clerk-only when `CLERK_SECRET_KEY` is
set. The `/signin-with-chatgpt` loopback mock is for localhost HTTP tests when
that secret is unset. Hosted Workers must not treat `oai-authenticated-user-*`
as identity. The hosted development target is the operator-owned staging
Worker, not a `*.chatgpt.site` URL.

## Schema and compatibility

`SessionData.discovery` is optional version-1 JSON in the existing D1 session row.
It holds creative/automation/blended direction, topic evidence with confidence,
quotes, source message IDs, origin and update time, an append-only transcript,
advisory model completeness and operator confirmation time.

Topics: context, pain_or_idea, path, workflow, frequency_impact, tools_data,
success_criteria, constraints, delivery. Creative readiness requires context,
idea, path, success criteria, constraints and delivery. Automation/blended also
require workflow, frequency/impact and tools/data. All required topics need
nonempty evidence at medium/high confidence. The operator must confirm readiness;
model completeness never changes the stage by itself.

Any discovery edit clears readiness confirmation. Original-answer corrections
append a replacement referencing the old message and invalidate dependent topic
summaries; unrelated later topics remain intact. Topic edits append explicit
client evidence and protect that topic from automatic model replacement. The
operator can review original and corrected evidence together. Drafts stay in
memory during edits, mode changes and error recovery; leaving the page triggers
a browser warning. They are not stored in browser persistent storage.

Existing sessions keep `answers` and imported `source`. Starting chat explicitly
copies legacy answers with legacy provenance; it does not pretend the model
asked historic questions. Imports cannot start or edit discovery. Legacy sessions
keep their existing eight-answer completeness rule until chat is started. Chat
sessions can use the topic form without paid calls; they still need operator
confirmation. Discovery remains read-only after the first demo.

Drizzle migration `drizzle/0002_polite_bucky.sql` only adds `discovery_requests`
and its session/time index. The ledger stores hashed request fingerprints,
status, reserved/accounted microUSD, time and whitelisted metadata. It contains
neither message text nor invitation tokens. Existing tables are not rewritten.

## API and optimistic concurrency

`POST /api/client/discovery-chat`, invitation bearer authentication:

- `{ action: "start", revision, requestId }`
- `{ action: "message", text, revision, requestId }`
- `{ action: "edit", topic, text, revision, requestId }`
- `{ action: "edit-message", messageId, text, revision, requestId }`
- `{ action: "path", path, revision, requestId }`

The endpoint returns the saved session and new revision. It rejects unknown
properties, target session IDs and stale browser revisions. The legacy answer
endpoint now also requires `revision`. Model writes recheck revision, bearer hash,
expiry and absence of a demo at commit time. A D1 batch atomically records the
session result and request status. Saved request retries do not call the provider
again. Failed/ambiguous attempts require a deliberate retry; their reservations
remain charged when actual usage is unknown. Client errors keep the draft and
offer a refresh/compare action before accepting the new revision.

The existing owner-authorized session detail endpoint exposes evidence/transcript;
list responses omit chat transcript bodies. `GET /api/sessions/discovery?id=...`
returns request accounting and metadata to the owner only.
`PATCH /api/sessions` with `{ action: "confirm-discovery", id, revision }` confirms
coverage. No new owner authentication mechanism is introduced by this change.
Owner routes keep the current Clerk-only `owner()` on hosted Workers and the
loopback mock for localhost HTTP tests.

## Model and pacing

Server-only OpenAI Responses API, model `gpt-5.6-terra`, reasoning `low`, structured
JSON output, `store: false`, no tools, 2,000 output tokens, 25-second timeout.
`DISCOVERY_PROMPT_VERSION = "1"` lives in `lib/discovery.ts`.

The model receives server instructions plus a separate untrusted JSON payload:
client name, playbook, selected path, bounded topic summaries and six recent
messages with correction provenance. It returns one assistant message, a question
ID, sourced topic updates, optional inferred initial path and advisory completeness.
Quotes must exactly match referenced client messages and each update must cite the
latest message. Superseded original answers cannot be quoted as current evidence.

Questions come from a bilingual, single-intent library. The model selects the
follow-up and may prepend a short declarative reflection. The parser rejects
extra questions, request-like reflection text, unapproved question wording,
invalid citations, protected-topic replacement and disallowed early questions.
The first three question turns remain broad. Technical prompts become available
only after a concrete problem/idea and a direction exist. Creative sessions
cannot select workflow/frequency questions. Example requests include fictional-data
guidance. Playbooks add work-context prompts without claiming integrations.

This deliberately constrains question wording in v1; it is not unrestricted
model-authored interviewing. Naturalness, semantic accuracy of summaries and
reflection language still need live PL/EN evaluation. Matching quotes proves
provenance, not truth or semantic entailment. Rejected/incomplete responses are
not persisted as evidence; the client retains their draft and can retry or use
the form. No automatic model substitution or paid retry occurs.

## Cost, privacy and operational bounds

`MIRAI_DISCOVERY_ENABLED=true` enables starting chat and paid messages.
`MIRAI_OPENAI_API_KEY` is a server-only secret; none has been supplied in this task.
`MIRAI_DISCOVERY_MODEL` defaults to, and currently only accepts, `gpt-5.6-terra`.
`MIRAI_DISCOVERY_SESSION_CAP_USD` defaults to 1 and may reduce the cap; increasing
above the authorized $1 has no effect. No fallback variable is used.

Limits: one active admission/session (60-second lease), six-second spacing,
40 total provider attempts/session, 240 transcript entries, 400 KB saved discovery
threshold and 32 KB serialized provider context. A failed attempt counts toward
limits. Edits/form fallback do not consume model budget but obey history limits.
A new admission conservatively reserves context UTF-8 bytes plus framing headroom
at 3 microUSD/token, and max output at 12 microUSD/token. Actual usage reduces the
reservation using the same conservative input rate. This covers the documented
$2/M input rate and cache-write uplift; it does not claim invoice precision.
Unknown usage retains the full reservation even after the active lease expires.

Pricing assumptions must be reviewed before changing models/rates. Current sources:
[Terra model and pricing](https://developers.openai.com/api/docs/models/gpt-5.6-terra),
[structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
The cap is per session; there is no account-wide spending dashboard in this release.
Provider errors and raw payloads are not logged. No key, bearer or raw transcript
is placed in the request ledger. Server observability contains model, prompt
version, latency, completion/validation outcome and available usage counts.
`store: false` is an API request option, not a claim of zero provider retention.

## Documents and downstream workflow

Build/handoff source JSON includes discovery evidence and transcript separately
from legacy answers and source. Missing topics remain UNCONFIRMED, with creative
optional topics marked explicitly. Creative/blended briefs avoid unconditional
automation proposals. Existing demo/version/feedback and deployment approval gates
remain in place. Readiness confirmation is not demo approval or measured benefit.

## Validation

See [development commands](../DEVELOPMENT.md). The offline suite uses actual
SQLite SQL with a D1 adapter and mocked provider results, including three
checked-in fictional JSON conversations. The local HTTP suite exercises actual
route handlers and local D1 with no model calls. It covers owner-only
observability, bearer isolation, topic/original-answer edits, stale saves,
creative readiness, brief gates and post-demo lock. `tests/lifecycle-smoke.mjs`
covers the pre-client invitation/attach/approval API steps against localhost
only. Existing session/import/demo lifecycle tests pass.

No paid model calls or production deployment have been made. Live model quality,
actual latency/cost and production secret configuration remain unverified.
Do not apply `0002` with `--remote` or enable chat on Sites or
`mirai-production` without an explicit later operator decision.
