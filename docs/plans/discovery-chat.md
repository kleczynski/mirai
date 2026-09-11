> Released to production and staging on 2026-09-11. Follow the [current operations runbook](production-new-clients.md) for active versions, hosts, caps and release evidence. Earlier paid-test notes below are historical.

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
- `{ action: "finish", revision, requestId }`

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
JSON output, `store: false`, no tools, 2,000 output tokens, a 25-second background provider deadline and a 9.5-second acknowledgement route deadline.
`DISCOVERY_PROMPT_VERSION = "4"` lives in `lib/discovery.ts`.

The model receives server instructions plus a separate untrusted JSON payload:
client name, playbook, selected path, bounded topic summaries and six recent
messages with correction provenance. It returns only sourced topic updates and
an optional inferred initial path. The server chooses questions and derives the
advisory coverage indicator; no unused question, reflection or score is generated.
Quotes must exactly match referenced client messages and each update must cite the
latest message. Superseded original answers cannot be quoted as current evidence.

Questions come from a bilingual reviewed library. The server applies sourced
updates, then chooses an unanswered topic with missing evidence. A supplied
answer may cover several topics. The model does not generate a conversational question;
the server cannot publish a repeated question or a ninth question. A targeted evaluation
or camera-safeguards follow-up can address a specific unresolved gap.

The interview ends after at most eight saved conversational answers, earlier
when required evidence is sufficient, or on explicit finish intent. Topic edits,
path changes and corrections do not spend another question. An optional
`discovery.interview` review marker and optional transcript `kind` extend the
existing version-1 JSON; no database migration is needed. Older transcripts
are counted compatibly. Review permits direct topic editing and identifies
missing evidence; completion is never operator confirmation or demo approval.

Percentage success targets require an evaluation sample, reviewed reference and
calculation of correct/failed outcomes. Camera workflows also expose unresolved
privacy, safety, oversight and failure handling. These deterministic checks are
conservative screening, not proof that a proposed operating policy is adequate.
The operator must review the actual evidence and proposed safeguards.

Exact quote matching establishes provenance, not semantic truth. Model quality
and naturalness in PL/EN still require approved live evaluation. The original answer and request reservation are saved atomically before inference.
Cloudflare `waitUntil` owns the bounded background task; the client receives the
saved answer promptly and polls for the summary. Invalid/incomplete results leave
the answer in history and move to review with a usable topic form. No automatic
paid retry occurs. The strict provider schema shares the parser’s string/array
limits, and failed validation records only a whitelisted reason, never output.

## Client interaction and voice

The client sees question progress, a dominant current prompt, expandable earlier
turns, a reachable mobile composer, Finish now and Use topic form. Processing
states describe request handling without revealing or pretending to reveal model
reasoning. A restrained grey/orange animation respects reduced motion. A
client-side ten-second deadline retains the draft and offers recovery even when
network or storage response delivery fails. A timeout can have an ambiguous save
outcome: load the latest session before deliberately retrying.

Speech input is capability-detected browser SpeechRecognition. Only an explicit
microphone action starts recognition. Permission, listening, processing,
completion and errors have visible states; stop/cancel are available. The
transcript stays editable and must be sent explicitly. Unsupported browsers and
permission/network/timeouts retain typed input. Mirai does not record or store
raw audio. Browser recognition may send audio to the browser vendor; the nearby
privacy notice explains this. No server transcription provider or spoken-response
service is enabled. A paid service or different retention policy requires an
operator decision. Automated recognition events simulate browser states; they
do not demonstrate real microphone quality.

## Cost, privacy and operational bounds

`MIRAI_DISCOVERY_ENABLED=true` enables starting chat and paid messages.
`MIRAI_OPENAI_API_KEY` is a server-only secret, configured locally for authorized tests.
`MIRAI_DISCOVERY_MODEL` defaults to, and currently only accepts, `gpt-5.6-terra`.
`MIRAI_DISCOVERY_SESSION_CAP_USD` defaults to 1 and may reduce the cap; increasing
above the authorized $1 has no effect. `MIRAI_DISCOVERY_WORKSPACE_CAP_USD`
defaults to $2 and can only lower that maximum. It caps lifetime accounting across
all sessions in this database, including reservations where usage is unknown.
It does not control other databases, applications or OpenAI account usage.
Production and staging each use $0.25/session and $1 across their separate databases. No fallback variable is used.

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
Caps cover both each session and this database; there is no account-wide spending dashboard in this release.
Provider errors and raw payloads are not logged. No key, bearer or raw transcript
is placed in the request ledger. Server observability contains model, prompt
version, latency, completion/validation outcome and available usage counts.
`store: false` is an API request option, not a claim of zero provider retention.

## Documents and downstream workflow

Build briefs separate trusted operator instructions from encoded, untrusted
source JSON. They carry session/revision/language/evidence version, provenance,
confidence and assumptions, explicit UNCONFIRMED gaps, functional scope and
non-goals, current/desired workflows, data lifecycle, acceptance evaluation,
accessibility, architecture, API/data boundaries, authorization, failure states,
tests and release operations. Integration wishes remain desired and unverified;
only actual implementation and verification can establish a working integration.
Source formatting prevents transcript text from closing the evidence container;
invitation-like bearers/private invitation URLs are redacted from exports.

The established React 19 / TypeScript / Vinext / Workers / D1 / Drizzle / Clerk
stack is guidance where appropriate, not a claim that a client product is built.
The downstream agent must report exact artifacts and checks and obtain approval
before delivery or production deployment. Build export still requires confirmed
readiness; deployment export still requires approval of the current demo version.

## Validation

See [development commands](../DEVELOPMENT.md). The offline suite uses actual
SQLite SQL with a D1 adapter and mocked provider results, including three
checked-in fictional JSON conversations. The local HTTP suite exercises actual
route handlers and local D1 with no model calls. It covers owner-only
observability, bearer isolation, topic/original-answer edits, stale saves,
creative readiness, brief gates and post-demo lock. `tests/lifecycle-smoke.mjs`
covers the pre-client invitation/attach/approval API steps against localhost
only. Existing session/import/demo lifecycle tests pass.

Two operator-authorized paid calls using prompt version 2 missed the eight-second
inference deadline. No answer was saved and actual billed usage was unavailable.
A read-only model access check succeeded. Prompt version 3 removes unused output;
a separately authorized two-call retest saved the Polish case in 7.775 seconds
but the English case still timed out. Reliable live latency is not established,
so the staging release remains on hold. Nothing has been deployed. See [paid test findings](discovery-bounded-review.md#paid-test-follow-up).
Do not apply `0002` with `--remote` or enable chat on Sites or
`mirai-production` without an explicit later operator decision.

## Saved-answer processing (2026-09-11)

`discovery.processing` optionally holds a request ID, pending/failed status and
start time within the existing version-1 JSON. A paid message first atomically
reserves both session and shared budget and saves its original answer. The
acknowledgement increments the revision; successful synthesis increments it again.
Same-ID retries return the saved answer without a second provider call.

Pending state disables another chat answer but permits Finish now and topic
edits. Those edits clear processing and invalidate the pending revision. Results
recheck invitation hash, expiry, revision, demo and source locks. The provider
has 25 seconds; after a lost task, an authenticated client read can recover an
expired 35-second processing lease into failed review without paying again.
A submitted database write is not cancellable merely because time elapsed;
conditional revisions determine which competing save wins.

The browser polls every second, bounds each read to ten seconds and stops after
45 seconds or a read failure, with explicit refresh/form recovery. Polling never
rebases or discards unsaved drafts. Cloudflare background execution follows the
[documented waitUntil lifecycle](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil).
This is bounded best-effort synthesis, not a durable queue with automatic retries.
