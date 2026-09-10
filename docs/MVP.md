# Mirai MVP

Mirai is the operator's control plane. Client demos are separate Sites apps.

## Operator journey

Sign in with ChatGPT using the owner account configured in MIRAI_OWNER_EMAIL. Create a session using a custom, carpenter, PC-Market or dental playbook. Copy the invitation and send it to the client. Links expire after 30 days; generating a new link invalidates the previous one. Revocation is immediate.

The client answers eight guided discovery questions in Polish or English. Answers are persisted in Sites D1, not browser storage. This is a structured questionnaire, not an LLM chat. It does not require an API key.

Once all questions have answers, download the Markdown Codex build brief. Give it to Codex with Sites enabled to build a separate demo. The brief includes the actual discovery evidence, constraints, acceptance guidance and previous version feedback. The opportunity proposal is template-based and must be validated against the evidence.

After testing, attach the HTTPS demo URL, explain what to try and confirm the first-use checklist. These confirmations are operator attestations, not automated test results. The client returns through the same invitation, opens the demo and leaves notes, requests changes or approves the current version. Notes are tied to a session and demo ID. New demo versions reset approval. Discovery becomes read-only after the first demo; subsequent scope changes belong in feedback.

Deployment guidance can be exported only after the latest demo is approved. It captures the approved artifact and deployment checkpoints; customer provider, source commit, account ownership, integrations, billing, backups and go-live details still need to be established from the actual demo. Client acknowledgement is not a verified legal signature.

## Access and operations

The site shell is public; session and document APIs enforce operator identity. A 256-bit random invitation bearer grants access to exactly one client session. Only its SHA-256 hash is stored. The bearer is in the URL fragment and sent in an Authorization header. Do not forward a client link to someone who should not see their session. Operator configuration fails closed when absent. D1 stores all sessions under the stable Sites user ID. Optimistic revision checks reject overlapping writes.

Sites provides hosting, the database and ChatGPT sign-in. MIRAI_OWNER_EMAIL must be set as a hosted runtime variable, then deployed. Local preview uses the starter's loopback-only mock identity; .dev.vars holds local-only configuration and is ignored. Production source contains no local authentication bypass.

## Audit inspiration

Only three audit files were read from prompt-library: brief-stolarz-meblowy-4819, brief-retail-pcmarket-stock and brief-automated-note-taking. Their carpentry, retail and dental use cases informed the playbooks. Their speed, savings and verification claims were not independently validated and are not presented as demonstrated results in this product.

## Validation

The local API lifecycle test checks authentication, invitation isolation, discovery save/reload, document gating, unsafe demo URL rejection, discovery locking, version-specific approval, new-version reset, stale-version feedback rejection, invitation replacement and revocation. It uses fictional data in the local database. Run against the portable dev preview with local migrations applied and the local owner configured.

The optional browser WebMCP surface lists sessions and opens the creation form. Unsupported browsers keep the ordinary interface. Browser WebMCP contract validation is recorded separately during delivery; build success is not proof of browser interaction coverage.

## Current limits

No autonomous Codex job dispatch, LLM interviewing, email notifications, attachments or billing. The operator transfers briefs to Codex and demo URLs back to Mirai. Friends use possession-based invitation access, with no separate identity verification. The list shows up to 500 most recently updated sessions. Feedback is capped at 1,000 entries per session. This MVP is intended for small, fictional or approved demo data; retention and customer compliance requirements must be specified before production client use.

The browser WebMCP contract was verified on the local preview: both tools registered, listing returned the persisted local fixture, an unexpected input property was rejected, and starting a session opened the actual creation dialog. The broader visual and browser interaction flow was not tested.

## Telegram examples and bundled demos

The three completed Telegram conversations can be imported through the operator's JSON import. Original transcripts are stored in the private database, with their source IDs, dates, scoped assumptions and open questions. Duplicate imports are idempotent per owner and source session. Incomplete greeting-only records and copied carpentry constraints are excluded from the supplied import. Source data is in an ignored local export and is not bundled into the public application assets.

For these three examples, working demos are bundled at /demo/[sessionId]. They share Mirai hosting but are isolated by session authorization. A client invitation is passed through its fragment to the linked demo; the API validates that token against the requested session. Demo work is saved explicitly to a separate D1 table with revision checks. Feedback and approval remain attached to the session's demo version. No approval is imported or inferred from historic commercial interest.

- Carpenter: integer-tenths-of-mm guillotine layout heuristic, adjustable board and kerf, grain lock, symmetric four-edge allowance, capacity checks, visual layout and text cutting list. No optimal-yield guarantee or machine toolpath.
- Retail: editable inventory and actual shelf quantity, days-of-cover calculation from seven-day sales, whole-pack rounding, exact EAN validation, comparable unit-price selection, validated CSV import and reviewed order CSV export. No live POS, supplier or EDI++ integration.
- Dental: browser-supported Polish dictation with explicit fictional-data acknowledgement, typed-text fallback, verbatim draft with tooth-number extraction, clinician edits/review and text export. No diagnostic AI, NFZ assignment or Prodentis integration. Browser dictation may use the browser vendor's remote recognition service.

Calculation tests cover 100 generated cutting layouts, kerf separation, grain constraints, exact fit and oversize rejection; retail EAN matching, quantity rounding, supplier selection and CSV edge cases; and dental source preservation and explicit missing-information markers. API checks verify import deduplication, per-session demo access, persistence, revision conflicts and document gates. Browser voice recognition is optional and has not been validated against real clinical speech.
