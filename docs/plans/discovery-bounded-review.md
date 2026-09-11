> **Final release status:** implemented and deployed to staging and production on 2026-09-11 with explicit operator approval. Both final local and hosted staging paid pairs passed. See the [operations runbook](production-new-clients.md) for current versions, limits and remaining manual checks. Earlier “not deployed” and failed-gate notes below describe previous checkpoints.

# Bounded discovery implementation review

Local implementation and checks on 2026-09-11. Nothing was deployed.

## Implemented

- A server-controlled interview with at most eight saved conversational answers,
  early completion, explicit finish, persistent review and direct topic editing.
  Corrections and form/path edits do not consume interview answers. The planner
  skips covered or previously asked topics and replans a prompt satisfied by a
  direct edit.
- Evidence keeps original answers, scoped corrections, citations, confidence and
  operator confirmation. Percentage targets require an evaluation definition;
  camera requirements expose missing privacy, consent, retention, safety,
  oversight and failure policy. Missing information stays UNCONFIRMED.
- Compact progress, accessible history and correction controls, mobile composer,
  visible grey/orange processing feedback and reduced-motion behavior.
- Explicit browser dictation with permission/listening/processing/completion and
  error states, stop/cancel, editable transcript and typed fallback. Mirai does
  not capture or store raw audio; browser recognition may use its vendor service.
- Eight-second provider deadline, 9.5-second route deadline and ten-second
  client opening/save/reload recovery. Drafts and ambiguous-request identity are
  retained. Existing accounting, isolation and optimistic commits remain intact.
- A production-oriented coding prompt with mapped product evidence, provenance,
  confidence, unverified integration expectations, architecture, acceptance
  evaluation, authorization, data lifecycle, testing and release prerequisites.
  Escaped source JSON stays separate from trusted instructions; bearer-like
  secrets and invitation fragments are redacted on export.

## Verification

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed; four unrelated existing warnings |
| Discovery unit/SQLite suite | Passed: golden conversations, repetition prevention, eight answers, early/explicit finish, multi-topic evidence, corrections, measurement/safety gaps, document injection/redaction, authorization, idempotency, concurrency, in-flight revoke/rotation/demo and hung provider |
| Discovery local HTTP suite | Passed: finish/retry/topic review, bearer isolation, stale revisions, operator readiness, document gates and post-demo lock |
| Local route boundary suite | Passed: stalled request body returned usable recovery in 9,516 ms; no provider call |
| Existing session and lifecycle suites | Passed: invitation isolation/rotation/revocation and exact-version feedback/approval reset |
| Import/demo lifecycle suite | Passed: fictional import idempotency, persistence, conflicts, evidence export and no fabricated approval |
| Attach-demo blockers | Passed |
| Discovery browser suite in installed Chrome | Passed: simulated session/provider/voice states, unsupported/denied/network/timeout recovery, editable transcript, cancellation, draft retention, idempotent retry, conflict, eight-answer review, locked/imported states and reduced motion |
| Production build | Passed locally |
| Documentation links and diff whitespace | Passed |

The browser suite uses entirely fictional intercepted session/provider data,
without an invitation bearer. It checks 1280×960 desktop and 390×844 mobile
layouts. The integration owner visually inspected desktop, mobile, processing,
review and editable-transcript captures under ignored `outputs/discovery-ui/`.
The local HTTP suites exercise real route handlers and local D1 separately.

Lint warnings are in `components/ui/combobox.tsx`, `lib/demo-engine.ts`,
`app/demo/components/dental.tsx` and `scripts/prepare-staging-deploy.mjs`.

## Changed files

- Client: `app/s/discovery-client.tsx`, new `app/s/discovery-voice.tsx`,
  `app/s/session.tsx`, `app/globals.css`.
- Server/evidence: `lib/discovery.ts`, `lib/discovery-service.ts`,
  `lib/discovery-provider.ts`, `lib/documents.ts`,
  `app/api/client/discovery-chat/route.ts`, `app/discovery-observer.tsx`.
- Tests: `tests/discovery-chat.mjs`, `tests/discovery-flow.mjs`,
  `tests/discovery-client-browser.mjs`, new `tests/discovery-boundary.mjs`,
  and the three fictional JSON conversations in `tests/fixtures/discovery/`.
- Documentation: `docs/MVP.md`, `docs/DEVELOPMENT.md`,
  `docs/plans/discovery-chat.md` and this review.

## Limits and operator decisions

- No real-device microphone test was made. The initial implementation used
  simulations; the subsequent two paid calls are reported below. Browser event
  simulations do not establish transcription accuracy, PL/EN conversational
  quality, live provider latency or actual provider cost. Terra remains the
  approved model; no model/vendor change or paid speech service was introduced.
- Measurement/safety checks are conservative lexical screening. They do not
  prove semantic accuracy, adequate operating policy or production readiness.
  The operator still confirms evidence before building. Desired integrations
  require independently verified implementation before being called working.
- A database write already issued just before the deadline cannot be cancelled
  transactionally. A timed-out save can therefore have an ambiguous outcome;
  load the current revision and compare before deliberate retry. Late provider
  results cannot initiate a new save after the service timeout.
- Drafts live in memory and have a navigation warning; they are not persisted
  in browser storage. Closing the page can discard unsaved drafts.
- Escaping source delimiters mitigates prompt injection; the downstream coding
  agent must still respect the evidence/instruction boundary.
- Rotate the invitation exposed in the supplied PDF footer through the operator
  invitation control. Its bearer and private URL are not reproduced here.
- No schema migration, hosting manifest change, staging/production deployment,
  client delivery or new integration was performed. Existing unrelated
  `.cursor/` and production-preview plan files were preserved.

## Paid test follow-up

The operator authorized exactly two live calls and staging only after those
tests pass. Both prompt-version-2 attempts failed without persisting an answer:

| Fictional case | Service duration | Result | Reserved USD | Actual charge |
| --- | --- | --- | --- | --- |
| English camera workflow | 8,013 ms | 503 at inference deadline | 0.046605 | Unknown |
| Polish workshop workflow | 8,010 ms | 503 at inference deadline | 0.047295 | Unknown |

The existing adapter deadline could fire before the service timer, so both
ledger entries used the generic `provider_failure` label. The new offline-tested
classification recognizes the adapter's TimeoutError as `provider_timeout`.
The source ledger is preserved without rewriting these historical outcomes.

A separate read-only model-access request returned HTTP 200 in 773 ms. It did
not generate tokens. This confirms key/model access; it does not establish why
inference exceeded the deadline.

Prompt version 3 removes the unused assistant message, proposed question and
completeness score, and requests concise summaries and minimal supporting quotes.
The approved model, low reasoning setting, provenance checks and deadlines remain
unchanged. Typecheck, discovery regressions, lint and build passed before
retesting. The additional live results are recorded below.

Safe per-attempt results are in ignored `outputs/discovery-paid-smoke.json`. The
original two-call allowance was exhausted. Staging deployment remained on hold;
its request-ledger migration was not applied.

### Separately authorized prompt-version-3 retest

The operator approved two additional calls. The original report was preserved;
this run is in ignored `outputs/discovery-paid-smoke-compact-v3.json`.

| Fictional case | Service duration | Result | Accounted/reserved USD |
| --- | --- | --- | --- |
| English camera workflow | 8,017 ms | 503; provider_timeout; no answer saved | 0.043035 reserved; actual charge unknown |
| Polish workshop workflow | 7,775 ms | Saved; all smoke checks passed | 0.013491 conservatively accounted from token usage |

The successful Polish result used 957 input tokens and 885 output tokens. It
produced sourced evidence for all nine topics, ended at review after one answer,
and retained the operator confirmation gate. The report contains metadata and
confidence only, not raw provider output or credentials. The accounting amount
uses Mirai's conservative rates and is not a verified invoice charge.

The two-case deployment gate failed because the English case timed out. The
smaller contract has one live success but does not establish reliable latency.
Four paid attempts have been made in total, exhausting both explicit allowances.
No further calls, remote migration, staging deployment or production deployment
were performed. Staging remains unchanged.

## Save-first release candidate (2026-09-11)

The operator authorized continued implementation and paid checks under the
remaining $10 balance, then explicitly authorized production deployment.
Paid smoke tooling enforces $1 cumulative conservative accounting across
its reports. Mirai admission now also enforces a database-wide lifetime
maximum of $2 (can only lower), alongside the $1/session maximum. The staging
rollout uses $1/database and $0.25/session. These caps do not control other
applications or databases using the same OpenAI account.

Raw answers and reservations now commit atomically before inference. A bounded
Cloudflare background task produces the summary; completion rechecks revision,
invitation hash/expiry and demo/import locks. Failures and expired processing
leases preserve the answer, stop questioning and offer direct review. There
are no automatic paid retries. UI polling preserves draft revisions and has
ten-second read and45-second total recovery limits.

The first save-first pair preserved both answers; English passed, Polish failed
strict validation. No rejected output was accepted. Provider prompt/schema v4
now explicitly shares the parser’s quote and array bounds and exact-copy rule.
The following real-provider pair passed both cases:

| Fictional case | Saved acknowledgement | Final summary | Result | Conservative usage |
| --- | --- | --- | --- | --- |
| English camera |29ms |8.061s |Measurement and safety gaps kept; operator gate intact |$0.012516 |
| Polish workshop |3ms |8.310s |Nine sourced topics, early review; operator gate intact |$0.014664 |

Eight live attempts have now run in total. Combined conservative accounting
is $0.203691, including full reservations for three earlier unknown-usage
timeouts. It is not an OpenAI invoice or live account-balance reading. No raw
provider output, bearer or audio is recorded in the reports.

Local checks pass for discovery state, source provenance, asynchronous saves,
provider failures, stale recovery, invitation isolation/rotation/revocation,
concurrent edits, owner confirmation and version-specific approvals. Browser
checks cover simulated voice and background progress; real microphone quality
has not been tested.

## Hosted verification

Both staging requests passed through the deployed Worker/D1/background path.
Saved acknowledgements: 87ms and 167ms; complete summaries: 8.485s and 11.736s.
Same-ID retries kept one provider call per case; both test invitations were
revoked. Staging accounting for the pair: $0.027045. Total task test accounting
is $0.230736 for ten attempts, including three earlier unknown-usage reservations.
Production pages, access boundaries and exact emitted assets passed read-only
checks. Existing production rows and secrets were preserved. No production
fixtures or paid test calls were made.
