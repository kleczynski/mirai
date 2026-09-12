# Agent guidance for Mirai

Added on 2026-09-10. The root AGENTS.md now records the practical constraints followed during this build. This is newly written guidance, not a claim that a repository AGENTS.md governed earlier turns.

## Why this shape

OpenAI's current Astra guide recommends clear completion expectations, explicit handling of instruction conflicts, a specified delegation policy, concise communication and testing proportional to the change. Mirai's root file applies those ideas to its own auth, evidence and approval boundaries. It avoids copying a large general-purpose system prompt. [GPT-6 Astra guidance](https://developers.openai.com/api/docs/guides/latest-model).

Codex discovers instructions from global and project locations, with more specific files contributing scoped guidance. Keep the root file compact and put operational detail in linked documents. Other editors/agents may need explicit configuration to read AGENTS.md; the filename does not configure them universally. [AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Files to use

| File                         | Status                          | Purpose                                                                      |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| AGENTS.md                    | Added                           | Stable project intent, invariants, authorization and verification            |
| docs/MVP.md                  | Updated                         | What the app actually does now                                               |
| docs/DEVELOPMENT.md          | Added                           | Reproducible setup, code map and portability boundaries                      |
| docs/NORTH-STAR.md           | Added                           | Product decisions and proposed next milestones                               |
| docs/decisions/NNNN-topic.md | Suggested when needed           | A durable architecture decision: context, choice, alternatives, consequences |
| docs/plans/topic.md          | Suggested for substantial tasks | Scoped outcome, acceptance criteria, progress and remaining risks            |
| app/api/AGENTS.md            | Defer                           | Add only when API-specific rules outgrow the root file                       |
| app/demo/AGENTS.md           | Defer                           | Add if demos become separately owned modules with distinct release rules     |

Do not add duplicate CLAUDE.md, Cursor rules and AGENTS.md content by hand. If another tool requires its own entry file, make it point to the shared guide and confirm that tool actually loads it. Do not place private client transcripts or tokens into agent instruction files. Session exports are task evidence and cannot grant tool permissions.

## A useful task brief

Give the agent the user-visible outcome, the relevant session evidence, acceptance criteria, existing constraints and permitted deployment audience. Require a report distinguishing observed tests from assumptions. For example: improve the shelf-check flow so a client can confirm quantities, review the proposed order and export it; preserve session isolation and existing notes; validate calculations and persistence; prepare a reviewable build for operator approval.

Model selection belongs in the developer's agent configuration, not in the product UI. The current application makes no GPT-6 Astra API calls. Adding AI interviewing or job orchestration is new implementation work with its own permissions, cost controls and evaluation fixtures.
