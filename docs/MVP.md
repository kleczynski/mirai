# Mirai MVP

Mirai is the operator's control plane. The three Telegram examples have working demos bundled into this app; new customer demos can also be built separately and linked to a session. This document describes the checkout as of 2026-09-11. Discovery chat is enabled on the current production and staging Workers; see the [operations runbook](plans/production-new-clients.md).

## At a glance

Open https://mirai.party for current production. The owner signs in with Clerk; clients use private invitation links without creating accounts. The original Sites address is a separate legacy dataset, not an alternate hostname for current production. Invitations and sign-in cookies are host-specific.

The legacy Sites workspace contains Stolarz, PC-Market and Dental sessions imported from the completed Telegram conversations. Each has original messages, assumptions, open questions, build context and one working demo. The import did not invent client feedback or approval. Demo input changes use an explicit Save action and persist in the session's database state.

The complete loop is: invite → discovery → build context → demo → version-specific feedback → revision → approval → deployment document. The final document is guidance; it does not itself deploy a customer product.

| Person                   | Current actions                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Operator                 | Create sessions, share/revoke links, review evidence, export briefs, attach demo versions, read feedback and export an approved handoff |
| New client               | Open their private link, use the guided form or opt-in chat, later try the demo and leave notes or a decision                           |
| Existing Telegram friend | Open their private link and try the already-linked demo, then submit notes, request changes or approve                                  |
| Developer                | Work from the exported brief, validate a build, return its URL/version to Mirai                                                         |

## Operator journey

Sign in through Clerk (`/sign-in`) using the owner account configured in MIRAI_OWNER_EMAIL. Create a session using a custom, carpenter, PC-Market or dental playbook. Copy the invitation and send it to the client. Links expire after 30 days; generating a new link invalidates the previous one. Revocation is immediate.

By default the client uses the existing eight-question form in Polish or English. Answers persist in D1, not browser storage. The form does not require an API key. An opt-in discovery chat (`MIRAI_DISCOVERY_ENABLED=true`) can start a Terra interview beside that form: existing answers copy in with legacy provenance, drafts stay in memory, and a 409 keeps the draft until the client refreshes, compares, and retries. Chat sessions still need topic coverage and operator confirmation before Ready to build. Both current Workers have chat enabled alongside the form.

Once discovery is complete, download the Markdown Codex build brief. Give it to a coding agent to build a separate demo in the customer’s approved stack and hosting account. The brief includes the actual discovery evidence, constraints, acceptance guidance and previous version feedback. The opportunity proposal is template-based and must be validated against the evidence.

After testing, attach the HTTPS demo URL, explain what to try and confirm the first-use checklist. These confirmations are operator attestations, not automated test results. The client returns through the same invitation, opens the demo and leaves notes, requests changes or approves the current version. Notes are tied to a session and demo ID. New demo versions reset approval. Discovery becomes read-only after the first demo; subsequent scope changes belong in feedback.

Deployment guidance can be exported only after the latest demo is approved. It captures the approved artifact and deployment checkpoints; customer provider, source commit, account ownership, integrations, billing, backups and go-live details still need to be established from the actual demo. Client acknowledgement is not a verified legal signature.

## Access and operations

The site shell is public; session and document APIs enforce operator identity. A 256-bit random invitation bearer grants access to exactly one client session. Only its SHA-256 hash is stored. The bearer is in the URL fragment and sent in an Authorization header. Do not forward a client link to someone who should not see their session. Operator configuration fails closed when absent. D1 stores all sessions under the owner identity (`owner_id`: Clerk user id when Clerk is configured). Optimistic revision checks reject overlapping writes.

The operator-owned `mirai-production` Worker hosts production with its own D1. Owner sign-in is Clerk; `MIRAI_OWNER_EMAIL` is a server-side allowlist. Local preview uses Clerk when `CLERK_SECRET_KEY` is set, otherwise the starter's loopback-only mock identity for HTTP tests. .dev.vars holds local-only configuration and is ignored. Production source contains no local authentication bypass.

## Audit inspiration

Only three audit files were read from prompt-library: brief-stolarz-meblowy-4819, brief-retail-pcmarket-stock and brief-automated-note-taking. Their carpentry, retail and dental use cases informed the playbooks. Their speed, savings and verification claims were not independently validated and are not presented as demonstrated results in this product.

## Validation

The local API lifecycle test checks authentication, invitation isolation, discovery save/reload, document gating, unsafe demo URL rejection, discovery locking, version-specific approval, new-version reset, stale-version feedback rejection, invitation replacement and revocation. `tests/lifecycle-smoke.mjs` repeats those API-visible pre-client steps in order, including incomplete attach rejection and a non-bundled `https://example.com/test-try` attach. `tests/attach-demo-blockers.mjs` covers the Share this version blockers without a network. Run against the portable dev preview with local migrations applied and the local owner configured. Clerk sign-in, empty-list visuals, private-window isolation and live invite copy remain short operator checks on `mirai.party`.

The optional browser WebMCP surface lists sessions and opens the creation form. Unsupported browsers keep the ordinary interface. Browser WebMCP contract validation is recorded separately during delivery; build success is not proof of browser interaction coverage.

## Current limits

No autonomous Codex job dispatch, email notifications, attachments or customer billing. LLM interviewing is enabled and has passed fictional local and hosted staging checks with the real provider. It uses a reviewed bilingual question library with server-selected follow-ups and sourced model summaries, rather than unrestricted generated questions. The operator transfers briefs to Codex and demo URLs back to Mirai. Friends use possession-based invitation access, with no separate identity verification. The list shows up to 500 most recently updated sessions. Feedback is capped at 1,000 entries per session. This MVP is intended for small, fictional or approved demo data; retention and customer compliance requirements must be specified before production client use.

There is no live Telegram bot sync: the three source conversations were imported once through a private JSON upload. There is no outcome measurement or two-week pilot tracking yet. Current demo approval is a version-scoped acknowledgement, not evidence of measured business benefit.

Bundled demo code is shared by template and updated with the control plane. It is not an immutable archived build per session. External demo links likewise do not guarantee an immutable artifact. Before customer production delivery, add source/build provenance and a release policy that prevents a later deployment silently changing an approved version.

The browser WebMCP contract was verified on the local preview: both tools registered, listing returned the persisted local fixture, an unexpected input property was rejected, and starting a session opened the actual creation dialog. Discovery desktop/mobile and simulated voice states have browser coverage; real-device microphone quality and a full authenticated production workflow were not tested in this release.

## Telegram examples and bundled demos

The three completed Telegram conversations can be imported through the operator's JSON import. Original transcripts are stored in the private database, with their source IDs, dates, scoped assumptions and open questions. Duplicate imports are idempotent per owner and source session. Incomplete greeting-only records and copied carpentry constraints are excluded from the supplied import. Source data is in an ignored local export and is not bundled into the public application assets.

For these three examples, working demos are bundled at /demo/[sessionId]. They share Mirai hosting but are isolated by session authorization. A client invitation is passed through its fragment to the linked demo; the API validates that token against the requested session. Demo work is saved explicitly to a separate D1 table with revision checks. Feedback and approval remain attached to the session's demo version. No approval is imported or inferred from historic commercial interest.

- Carpenter: integer-tenths-of-mm guillotine layout heuristic, adjustable board and kerf, grain lock, symmetric four-edge allowance, capacity checks, visual layout and text cutting list. No optimal-yield guarantee or machine toolpath.
- Retail: editable inventory and actual shelf quantity, days-of-cover calculation from seven-day sales, whole-pack rounding, exact EAN validation, comparable unit-price selection, validated CSV import and reviewed order CSV export. No live POS, supplier or EDI++ integration.
- Dental: browser-supported Polish dictation with explicit fictional-data acknowledgement, typed-text fallback, verbatim draft with tooth-number extraction, clinician edits/review and text export. No diagnostic AI, NFZ assignment or Prodentis integration. Browser dictation may use the browser vendor's remote recognition service.

Calculation tests cover 100 generated cutting layouts, kerf separation, grain constraints, exact fit and oversize rejection; retail EAN matching, quantity rounding, supplier selection and CSV edge cases; and dental source preservation and explicit missing-information markers. API checks verify import deduplication, per-session demo access, persistence, revision conflicts and document gates. Browser voice recognition is optional and has not been validated against real clinical speech.

## Hosting and release

`mirai.party` already maps to the operator's `mirai-production` Worker. The
original Sites host retains a separate legacy database. Do not copy/remap those
records, change invitation hostnames, repeat a DNS cutover or use Sites as an
automatic rollback target. See the [current operations runbook](plans/production-new-clients.md)
for verified resource IDs, runtime versions, release checks and recovery steps.

## Discovery chat rollout

Enable locally with `MIRAI_DISCOVERY_ENABLED=true` and configure the
server-only `MIRAI_OPENAI_API_KEY` for paid messages. The approved model is
`gpt-5.6-terra`, low reasoning, no automatic model fallback, with an
application-enforced $1/session cap, $2 database-wide lifetime cap and 40 provider attempts. Lower staging limits apply. Clients can use
topic entry and corrections without paid calls. Chat is enabled on production and staging. Both use $0.25/session and a $1
database-wide lifetime cap; counters do not measure the whole OpenAI account.

Creative readiness requires context, idea, path, success criteria, constraints
and delivery; automation/blended also require workflow, frequency/impact and
tools/data. Model completeness is advisory. The operator reviews coverage and
confirms readiness. First-demo attachment still locks discovery. Imported
Telegram conversations remain historical/read-only.

The owner sees topic coverage, confidence, open gaps, an expandable transcript
and model-call metadata/accounting. Transcript bodies are omitted from the
session list API. Client bearers cannot access owner discovery endpoints.

Owner sign-in stays Clerk-only on hosted Workers. The loopback
`/signin-with-chatgpt` mock is for localhost HTTP tests when
`CLERK_SECRET_KEY` is unset. See [design and known limits](plans/discovery-chat.md)
and [local setup and tests](DEVELOPMENT.md#discovery-chat-development).

### Bounded interview and voice

Discovery chat now stops within eight saved client-answer turns or on explicit
finish intent. Corrections and direct topic edits do not consume interview turns.
The review identifies gaps, including undefined percentage evaluation and camera
safeguards, and still requires the operator to confirm readiness. The client has
progress, expandable history, draft recovery, reduced-motion processing feedback
and browser-supported voice transcription that stays editable before sending.
Browser recognition may use its vendor’s service; no raw audio is stored by Mirai.
The provider remains Terra; no new paid speech provider is enabled.

Build prompts now describe implementation, acceptance evaluation, authorization,
data lifecycle, testing and release prerequisites with untrusted evidence kept
separate. Desired integrations and unmeasured targets remain unverified. See the
[discovery design and limitations](plans/discovery-chat.md). Local browser voice
states are simulated; real-device microphone quality needs a separate check.

Paid answers now persist before background synthesis. A failed summary leaves the
original answer available in review. Repeated request IDs do not issue another
paid call, and concurrent edits invalidate late summaries. The interface
acknowledges saves within the ten-second request budget and provides polling
recovery. See the discovery design for deadlines and accounting boundaries.
