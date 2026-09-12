# Feature scope: <feature name>

## Outcome

Describe the observable user or business outcome in one sentence.

## Context

Explain the current behavior, the problem, and why this slice is needed.

## In scope

- <behavior, screen, endpoint, or data change>

## Out of scope

- <explicitly excluded behavior>

## Acceptance criteria

- <observable success condition>
- <authorization or isolation condition>
- <failure and recovery condition>
- <data or audit condition>

## E2E workflow

### Actors and accounts

- Owner/admin account: <securely supplied test account reference>
- Client account: <securely supplied test account reference, if needed>
- Anonymous behavior: <expected result>

### Environments

- Local URL: <URL>
- Staging URL: <URL>
- Production URL: <URL, only when release is approved>

### Test data

- Setup: <how to create or seed disposable data>
- Required records: <session, invitation, document, version, etc.>
- Cleanup: <how data is removed or isolated>

### E2E steps

1. <setup and sign-in step>
2. <feature action>
3. <expected UI/API result>
4. <negative or authorization check>
5. <cleanup or release check>

## Required checks

- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`
- `<feature-specific test command>`
- `<staging smoke check>`

## Release constraints

- Production approval: <required / already granted / not applicable>
- Schema migration: <yes/no; describe migration plan if yes>
- Data impact: <none / disposable staging data / production impact>
- Rollback: <application version rollback and data considerations>

## Open decisions

- <decision that must be resolved by architecture before implementation>

## Status

- Scope: Draft
- Spec: Not started
- Implementation: Not started
- Verification: Not started
- Release: Not started
