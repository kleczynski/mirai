# Feature specification: <feature name>

Related scope: `docs/scope/<feature-name>.md`

## Decision

State the load-bearing technical decision this feature depends on.

## API contract

- Method and route: `<METHOD> <route>`
- Authentication: <required identity and authorization rule>
- Request: <validated fields and constraints>
- Success response: <status and response shape>
- Failure responses: <status, meaning, and recovery>

## Data model and invariants

- Tables or records affected: <names>
- Ownership rule: <exact owner/session relationship>
- Revision or concurrency rule: <optimistic check, if applicable>
- Referential cleanup: <ordered dependent-record behavior>
- Migration: <required / not required>

## UI behavior

- Entry point: <screen/component>
- Confirmation or warning: <required behavior>
- Loading state: <behavior>
- Error state: <behavior>
- Recovery path: <how unsaved work or conflicts are preserved>

## Security and privacy

- Trusted identity source: <server-verified source>
- Cross-owner access behavior: <expected result>
- Secrets or tokens: <where they are supplied; never store values here>
- Logging restrictions: <values that must not be logged>

## Verification contract

- Unit/domain checks: <commands>
- API lifecycle checks: <commands>
- Browser/E2E checks: <commands or manual steps>
- Staging smoke check: <command and expected result>
- Production check: <safe read-only checks after deployment>

## Status

- Decision: Draft
- Implementation: Not started
- Verification: Not started
- Review: Not started
