# Mirai MVP

Mirai is the operator's control plane. The three Telegram examples have working demos bundled into this app; new customer demos can also be built separately and linked to a session. This document describes the implemented MVP as of 2026-09-10, not the future roadmap.

## At a glance

Open https://mirai.party. The original https://mirai-control-plane.wishfishdev.chatgpt.site address also serves the app. The owner signs in; friends use private invitation links without creating accounts. Sign-in cookies are origin-specific, so the new domain may require signing in again.

The workspace now contains Stolarz, PC-Market and Dental sessions imported from the completed Telegram conversations. Each has original messages, assumptions, open questions, build context and one working demo. The import did not invent client feedback or approval. Demo input changes use an explicit Save action and persist in the session's database state.

The complete loop is: invite → discovery → build context → demo → version-specific feedback → revision → approval → deployment document. The final document is guidance; it does not itself deploy a customer product.

| Person | Current actions |
| --- | --- |
| Operator | Create sessions, share/revoke links, review evidence, export briefs, attach demo versions, read feedback and export an approved handoff |
| New client | Open their private link, answer guided questions, later try the demo and leave notes or a decision |
| Existing Telegram friend | Open their private link and try the already-linked demo, then submit notes, request changes or approve |
| Developer | Work from the exported brief, validate a build, return its URL/version to Mirai |

## Operator journey

Sign in through Clerk (`/sign-in`) using the owner account configured in MIRAI_OWNER_EMAIL. Create a session using a custom, carpenter, PC-Market or dental playbook. Copy the invitation and send it to the client. Links expire after 30 days; generating a new link invalidates the previous one. Revocation is immediate.

The client answers eight guided discovery questions in Polish or English. Answers are persisted in Sites D1, not browser storage. This is a structured questionnaire, not an LLM chat. It does not require an API key.

Once all questions have answers, download the Markdown Codex build brief. Give it to Codex with Sites enabled to build a separate demo. The brief includes the actual discovery evidence, constraints, acceptance guidance and previous version feedback. The opportunity proposal is template-based and must be validated against the evidence.

After testing, attach the HTTPS demo URL, explain what to try and confirm the first-use checklist. These confirmations are operator attestations, not automated test results. The client returns through the same invitation, opens the demo and leaves notes, requests changes or approves the current version. Notes are tied to a session and demo ID. New demo versions reset approval. Discovery becomes read-only after the first demo; subsequent scope changes belong in feedback.

Deployment guidance can be exported only after the latest demo is approved. It captures the approved artifact and deployment checkpoints; customer provider, source commit, account ownership, integrations, billing, backups and go-live details still need to be established from the actual demo. Client acknowledgement is not a verified legal signature.

## Access and operations

The site shell is public; session and document APIs enforce operator identity. A 256-bit random invitation bearer grants access to exactly one client session. Only its SHA-256 hash is stored. The bearer is in the URL fragment and sent in an Authorization header. Do not forward a client link to someone who should not see their session. Operator configuration fails closed when absent. D1 stores all sessions under the owner identity (`owner_id`: Clerk user id when Clerk is configured). Optimistic revision checks reject overlapping writes.

Sites still hosts production. Owner sign-in is Clerk; `MIRAI_OWNER_EMAIL` must be set as a hosted runtime variable, then deployed. Local preview uses Clerk when `CLERK_SECRET_KEY` is set, otherwise the starter's loopback-only mock identity for HTTP tests. .dev.vars holds local-only configuration and is ignored. Production source contains no local authentication bypass.

## Audit inspiration

Only three audit files were read from prompt-library: brief-stolarz-meblowy-4819, brief-retail-pcmarket-stock and brief-automated-note-taking. Their carpentry, retail and dental use cases informed the playbooks. Their speed, savings and verification claims were not independently validated and are not presented as demonstrated results in this product.

## Validation

The local API lifecycle test checks authentication, invitation isolation, discovery save/reload, document gating, unsafe demo URL rejection, discovery locking, version-specific approval, new-version reset, stale-version feedback rejection, invitation replacement and revocation. It uses fictional data in the local database. Run against the portable dev preview with local migrations applied and the local owner configured.

The optional browser WebMCP surface lists sessions and opens the creation form. Unsupported browsers keep the ordinary interface. Browser WebMCP contract validation is recorded separately during delivery; build success is not proof of browser interaction coverage.

## Current limits

No autonomous Codex job dispatch, LLM interviewing, email notifications, attachments or billing. The operator transfers briefs to Codex and demo URLs back to Mirai. Friends use possession-based invitation access, with no separate identity verification. The list shows up to 500 most recently updated sessions. Feedback is capped at 1,000 entries per session. This MVP is intended for small, fictional or approved demo data; retention and customer compliance requirements must be specified before production client use.

There is no live Telegram bot sync: the three source conversations were imported once through a private JSON upload. There is no outcome measurement or two-week pilot tracking yet. Current demo approval is a version-scoped acknowledgement, not evidence of measured business benefit.

Bundled demo code is shared by template and updated with the control plane. It is not an immutable archived build per session. External demo links likewise do not guarantee an immutable artifact. Before customer production delivery, add source/build provenance and a release policy that prevents a later deployment silently changing an approved version.

The browser WebMCP contract was verified on the local preview: both tools registered, listing returned the persisted local fixture, an unexpected input property was rejected, and starting a session opened the actual creation dialog. The broader visual and browser interaction flow was not tested.

## Telegram examples and bundled demos

The three completed Telegram conversations can be imported through the operator's JSON import. Original transcripts are stored in the private database, with their source IDs, dates, scoped assumptions and open questions. Duplicate imports are idempotent per owner and source session. Incomplete greeting-only records and copied carpentry constraints are excluded from the supplied import. Source data is in an ignored local export and is not bundled into the public application assets.

For these three examples, working demos are bundled at /demo/[sessionId]. They share Mirai hosting but are isolated by session authorization. A client invitation is passed through its fragment to the linked demo; the API validates that token against the requested session. Demo work is saved explicitly to a separate D1 table with revision checks. Feedback and approval remain attached to the session's demo version. No approval is imported or inferred from historic commercial interest.

- Carpenter: integer-tenths-of-mm guillotine layout heuristic, adjustable board and kerf, grain lock, symmetric four-edge allowance, capacity checks, visual layout and text cutting list. No optimal-yield guarantee or machine toolpath.
- Retail: editable inventory and actual shelf quantity, days-of-cover calculation from seven-day sales, whole-pack rounding, exact EAN validation, comparable unit-price selection, validated CSV import and reviewed order CSV export. No live POS, supplier or EDI++ integration.
- Dental: browser-supported Polish dictation with explicit fictional-data acknowledgement, typed-text fallback, verbatim draft with tooth-number extraction, clinician edits/review and text export. No diagnostic AI, NFZ assignment or Prodentis integration. Browser dictation may use the browser vendor's remote recognition service.

Calculation tests cover 100 generated cutting layouts, kerf separation, grain constraints, exact fit and oversize rejection; retail EAN matching, quantity rounding, supplier selection and CSV edge cases; and dental source preservation and explicit missing-information markers. API checks verify import deduplication, per-session demo access, persistence, revision conflicts and document gates. Browser voice recognition is optional and has not been validated against real clinical speech.

## Custom domain

On 2026-09-10, with explicit owner approval, the root A record pointing to 92.5.122.200 was replaced by the Sites-provided addresses 162.159.143.30 and 172.66.3.26, DNS-only. Existing app, studio and wildcard preview subdomains were preserved. Sites reports domain and SSL active. The root page, private Stolarz session/demo reads, anonymous owner-API denial and sign-in redirect were checked through mirai.party. A full fresh owner OAuth round trip on the custom domain was not exercised by the agent.

Existing private links on the Sites address continue to work. The same /s#token path can be shared on mirai.party; keep the token private. New invitation links use the origin from which the operator is using the workspace. No www alias was added.

Rollback, if required: restore the previous root A record 92.5.122.200 with proxy enabled and remove the two new root A records, after confirming the old service is still available. This is an operations note, not authorization to roll back automatically.
