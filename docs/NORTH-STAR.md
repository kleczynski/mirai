# Mirai north star

Product direction discussed on 2026-09-10 using the grill-me/grilling interview. The six decisions below were explicitly selected by the owner. The consolidated statement below synthesizes those choices; the owner asked to continue after reviewing the proposed summary. No roadmap features are implemented by this document.

## Vision

Mirai helps an independent FDE turn an evidenced client problem into a tested demo, a measured pilot and a customer-owned product, while preserving the reasons, feedback and decisions behind every release.

The product earns trust when a client can point to one recurring task that improved in real use and can continue operating their tailored product with clear ownership and support.

## Settled decisions

| Decision                             | Owner's choice                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------ |
| Primary user for the next six months | The owner's own FDE business                                                   |
| Success                              | Measured improvement after real use                                            |
| Customer product ownership           | Customer-owned accounts, optional maintenance                                  |
| Initial focus                        | Test the three friend workflows, then focus on one                             |
| Agent authority                      | AI prepares; operator approves delivery                                        |
| Pilot evidence                       | Two-week before/after measurement, pre-agreed target and acceptable error rate |

Pricing, exact per-client thresholds and maintenance terms remain commercial decisions for each pilot. They do not need to be embedded in the platform vision now.

## North-star metric

Proposed primary metric: **number of customer workflows that meet their agreed improvement target during a completed two-week pilot**.

Count a workflow only when its baseline, target, measurement method, quality/error boundary, pilot period and client confirmation are recorded. Missing evidence means unverified. Record task frequency and sample count; compare similar tasks and include correction/review time. Do not extrapolate a short demonstration into annual savings.

Track time from discovery to first useful demo, first-attempt task completion, rework, operator hours per delivery and ongoing support burden as supporting measures. Client approval remains a gate; verified pilot benefit is a separate outcome.

## The repeatable service

1. Qualify: capture a recurring task, frequency, pain, current tools and an example.
2. Agree: select one narrow outcome, success threshold, acceptable errors and data boundaries.
3. Build: create a scoped brief and isolated demo with traceable source and test evidence.
4. Review: the operator approves delivery; the client tries the core task and records feedback.
5. Pilot: observe two weeks of use, including failures and correction time.
6. Decide: improve, stop, or deliver based on evidence and the client's decision.
7. Handoff: deploy into customer-owned accounts, transfer source and operations guidance, agree support.

## First three experiments

| Workflow  | Baseline and comparison                                                                             | Quality boundary                                                                                       | Decision signal                                              |
| --------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Stolarz   | Time to prepare comparable board-cutting plans, material utilization, manual corrections            | Carpenter checks kerf, grain, dimensions and machine suitability before use                            | Usable plans with less preparation work and acceptable waste |
| PC-Market | Time from shelf check to reviewed order, stock discrepancies, rejected order lines                  | Correct item/EAN, pack sizes and quantities; human approves order                                      | Fewer manual steps without incorrect purchasing              |
| Dental    | Time to finish a reviewed note from a fictional/approved test summary, required edits and omissions | Clinician verifies fidelity; no invented facts; real patient use requires a separately prepared system | Less documentation effort without loss of accuracy           |

Choose the first repeatable offer from observed benefit, willingness to pay, integration feasibility and maintenance cost. The three anecdotes are discovery evidence; they do not yet establish demand or measured savings.

## Suggested next releases

**First: make the pilot measurable.** Add an outcome agreement, baseline entries, pilot start/end, measurement records, client confirmation and a result summary. Keep Demo approved and Pilot successful separate. Define what counts before implementing dashboards.

**Second: make delivery reproducible.** Attach source revision, immutable demo artifact, test results and release notes to every version. Add customer account ownership, backup/restore evidence and rollback steps to handoff. A mutable URL must not silently inherit approval.

**Third: automate preparation.** Add queued build jobs with status, logs, cancellation, bounded credentials and retry/idempotency rules. AI can prepare briefs, patches and isolated checks; client delivery and production deployment require the operator's approval. Keep project evidence separate from executable agent instructions.

**Then: specialize from results.** Turn the strongest pilot into a reusable workflow and offer. Extend to another customer only after proving the workflow transfers. A multi-agency platform and self-service builder are outside the next six months' focus.

## Definition of a demo ready to share

A new client can open their link, understand the task, complete its main path, see actionable input errors, save/reopen work where promised and leave feedback on the correct version. Calculations and exports have meaningful checks. Limitations and simulated integrations are visible. The operator has reviewed the concrete version and approved sharing it. This is a target release standard; it is not a claim that every browser/device path has already been tested in the current MVP.
