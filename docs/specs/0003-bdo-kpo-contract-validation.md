# BDO KPO: source validation and build prerequisites

Status: discovery/build-context draft, 2026-09-12. No BDO product repository,
runtime, credential store, Worker spike, submission, demo approval or pilot exists
as a result of this document. Mirai collaboration is the separate control-plane
workstream described in the [scope](../scope/project-collaboration.md).

## Source observations

The official [integrator announcement](https://bdo.mos.gov.pl/news/informacja-dla-integratorow-api-bdo-zmiany-w-ewidencji-odpadow-od-2027-r/)
states that the API changes take effect on 1 January 2027 and links both the change
workbook and test Swagger. Page metadata reports publication on 21 August 2026 and
modification on 27 August 2026. The web reader initially returned 403; a subsequent
direct HTTPS retrieval succeeded. No BDO credentials were used.

The [official workbook](https://bdo.mos.gov.pl/wp-content/uploads/2026/08/Zmiany-API-ewidencja-v2.xlsx)
contains 18 KPO operation rows and a separate KPOK sheet. Its KPO changes cover
transport-mode flags, status enums, removal of the search year and structured
withdrawal/rejection reasons. These are source observations, not live mutation tests.

The [test Swagger page](https://test-bdo.mos.gov.pl/api/swagger/index.html) points to
the [published JSON contract](https://test-bdo.mos.gov.pl/api/swagger/v1/swagger.json).
That snapshot identifies itself as v1 and has 199 paths. Its KPO create request
already includes the workbook's six transport-mode fields; withdrawal includes the
three structured reasons; sender search has status names and no year field.
This correspondence supports using it for the next validation spike, but does not
prove that every 2027 behavior is available or that an authenticated call works.

The workbook omits the `/v1` path segment present in Swagger. Some additional list
operations also differ in HTTP method. Do not mechanically copy workbook paths or
remove the version segment. Resolve the exact base URL, current contract and
credential context through an authorized test-environment spike before fixing the
gateway. No arbitrary guessed endpoint calls were made.

The [historical instruction](https://bdo.mos.gov.pl/wp-content/uploads/2020/01/instrukcja-karta-przekazania-odpad%C3%B3w.pdf)
is 32 pages, version 1.0, with an effective date of 16 December 2019. It remains
historical workflow evidence. The [industry article](https://kartaewidencji.pl/karta-przekazania-odpadu/)
is secondary context. Neither defines the current API contract or establishes
legal authorization for the agency to act for a client.

## Reproducible source identities

| Retrieved source | SHA-256 |
| --- | --- |
| Test Swagger JSON | `bd7ee8a4b137403b469f97a158fcfe1715824c672b81a74d1183b61a395908a2` |
| Official change workbook | `ea25bf1dca115f77f77b12f4bc3437f8faa9ae951f1a826f466416faf318ec20` |
| Announcement HTML | `a06146e1319fd23a946e06656d300a44c8f53d1bbfb028ec4cd93858be0de517` |

Local retrieval copies are under ignored `outputs/project-collaboration/`. They
are public source snapshots, not the friend's uploaded originals. Do not upload
the outputs directory wholesale; other files there have separate access scopes.

## Settled owner requirements to carry into the separate build

Agency preparers create local drafts and send them to authorized client approvers.
The client confirms every consequential BDO mutation. Implement the sender lifecycle:
planned creation/editing, permitted approved editing, approval, official confirmation
generation/retrieval, withdrawal, revision of rejected cards and observation of
receiver/transporter status. Receiver/transporter actions stay in BDO.

Use `BdoKpoGateway2027` for domain operations and keep BDO DTOs/URLs out of UI.
Validate per-client company/place IDs, one waste code, transport modes and conditional
ex, hazardous reclassification, waste generation, process, certificate/container,
mass, vehicle and transport-time fields against the pinned contract. Retrieve the
official confirmation from BDO; label any pre-submission preview as unofficial.

Each client's NIP, credentials, commands, documents and audit events are isolated.
Credentials are encrypted in the separate application and never stored in Mirai.
The agency owns pilot hosting. Workers/Vinext, D1, queues/DLQs and Clerk with MFA
remain preferred, conditional on real Worker connectivity/authentication validation.
Use separate staging/pilot databases, queues and secrets. Test backup restoration
and record exact source and deployment identities.

Persist immutable command and payload hash, authenticated client confirmation,
atomic claim, attempts and reconciliation state. Persist results before queue ack.
Duplicate delivery must not create duplicate local execution. Ambiguous create
results remain blocked for reconciliation/manual review unless the provider can
prove a safe retry. Known card IDs permit state retrieval; multiple candidates
require human review. Bounded retries apply only to known retryable failures;
validation/authentication failures stop, and exhausted attempts produce a visible
alert and DLQ entry. Do not assert exactly-once external execution.

Production submissions, annual reporting, KEO, billing, field-worker accounts and
a true offline PWA remain outside the first demo. No pilot result is measured yet.
The target is at least 50% lower median preparation time with zero duplicate KPO
creation and zero cross-client exposure over a two-week shadow pilot. Establish
comparable samples, include review/correction time and capture actual confirmation.

## Next validation tasks

1. Confirm the separate repository owner/name and visibility before creating it.
2. Obtain the actual friend's name, invited email and original messages/PDF/image.
   Preserve original author attribution separately from the authenticated importer.
3. Identify the existing secure BDO test-credential reference and agency account;
   do not paste credentials into Mirai, Git, public files or ordinary logs.
4. Pin the official contract and validate authentication, company/place context,
   transport fields and official confirmation access from an authorized Worker.
5. Exercise timeout/reconciliation behavior with fictional authorized test data;
   prove tenant isolation and command-claim behavior before permitting mutations.
6. Generate the provenance-aware final brief through Mirai after owner readiness,
   build in the confirmed repository, then seek exact BDO staging authorization.

The supplied task is owner context. It is not authenticated collaborator testimony,
an approved downstream artifact, legal consent or evidence of pilot performance.

## Owner update: expert demonstration first

The owner has no test company and wants a demo to show a domain expert before
considering deployment and tailoring. The immediate milestone therefore uses
fictional companies and clearly simulated BDO responses. It must not claim official
KPO creation, official confirmation retrieval or verified integration. Preserve the
2027 gateway boundary for the later real test-environment validation. A real Worker
spike and agency hosting/credential decisions remain prerequisites for integration,
not blockers for an explicitly simulated expert walkthrough.

The authenticated owner created the production Mirai collaborator project
[BDO KPO automation MVP](https://mirai.party/projects?id=f3bb6569-6c84-4e75-8210-aa0523f72bc8),
introduced by David. Eleven cards were saved through the UI: revised demo scope,
problem/users, sender workflow, five official/historical/industry references,
command/isolation constraints, open questions and future pilot targets. They remain
pending owner review; no final brief, readiness or demo approval was fabricated.
David's scoped invitation was created and sent through the owner's signed-in Gmail
with explicit authorization. Gmail confirmed Message sent; acceptance has not been
observed. Bearers are omitted from records and were cleared from the task clipboard.
Original collaborator messages/files remain missing and were requested in the invitation.

Recommended repository: a separate private repository under the existing GitHub
owner, linked from Mirai; exact owner/name confirmation remains pending. Cloudflare
can host its deployed artifact later. No new repository, application runtime, BDO
credentials, external API calls or deployment was created in this checkpoint.

## BDO expert demo release, 2026-09-12

The owner subsequently authorized the private repository and remaining expert-demo
steps. [kleczynski/mirai-bdo-kpo](https://github.com/kleczynski/mirai-bdo-kpo) was
created private. The separate fictional review app is live at
https://mirai-bdo-kpo-demo.kleczynski11312.workers.dev/ from source
`40dc3262b64501385f77c255d0b5a820726c9b2d`, Worker version
`9c68a383-f8e2-4996-be6e-6c9628599cc6`. This is a static review release, not real
BDO integration or the agency pilot. No Mirai runtime release or schema change was
performed for this step; existing discovery caps and accounting were untouched.

The owner-accepted bounded demo scope is recorded as scope 2 in project
`f3bb6569-6c84-4e75-8210-aa0523f72bc8`. Readiness is confirmed and demo version 1 is
attached with source, deployment and test-manifest metadata. The production UI
confirmed Demo review, Approval pending and zero pilot records. Twelve evidence
cards now exist, including the accepted authorization; original collaborator files
and actual expert feedback remain pending. Historical intake notes below describe
the earlier checkpoint and do not override this update.

The 15 domain/storage tests, typecheck, lint, build and exact-source GitHub CI passed.
Live HTML/JS/CSS/manifest matched the isolated build; hosted save/reload worked.
The app uses browser-local fictional data, has no Cloudflare resource bindings and
sets CSP connect-src to none. Role selection is a simulation, not authentication.
Detailed provenance, asset hashes, browser coverage and limitations are in the
[BDO release record](https://github.com/kleczynski/mirai-bdo-kpo/blob/master/docs/RELEASE.md).
The public review URL does not expose the private source repository. Real BDO
credentials, authenticated test-company checks, deployment tailoring and measured
pilot results remain future work after actual expert review. Mirai brief export was
requested, but successful saving of its downloaded file could not be verified;
the accepted scope is preserved in the separate repository's docs/BRIEF.md.

