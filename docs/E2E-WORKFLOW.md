# Feature E2E workflow

Feature requirements belong in `docs/scope/<feature-name>.md`. Load-bearing technical decisions belong in `docs/specs/<feature-name>.md`. These files are the durable handoff between the operator and coding agents.

## What to provide

Provide the observable outcome, in-scope and out-of-scope behavior, acceptance criteria, actors, environment URLs, disposable test-data setup, E2E steps, required checks, release approval, and rollback constraints. Use the templates in `docs/scope/` and `docs/specs/`.

## Credential boundary

Never put credential values, bearer tokens, invitation tokens, or private keys in scope files, specs, fixtures, chat, or commits.

- Local development values belong in ignored `.env.local` and `.dev.vars` files.
- Staging and production runtime secrets belong in the platform secret store.
- Production Clerk publishable keys must be supplied to the isolated production build through the secure deployment environment.
- Agents should receive only the environment reference and variable names in repository files; the secure tunnel supplies the values at execution time.

## Recommended handoff

1. Copy `docs/scope/FEATURE-TEMPLATE.md` to a feature-specific scope file.
2. Fill in the E2E workflow and acceptance criteria, using disposable test accounts and data.
3. Copy `docs/specs/FEATURE-TEMPLATE.md` to the matching feature-specific spec file.
4. Resolve load-bearing decisions before implementation.
5. Supply credentials through the secure tunnel only when local, staging, or production checks require them.
6. Run the checks listed in the scope and record results in the release documentation.

The workflow follows the JS Mastery skills model: scope the change, write the architecture decision, develop, verify, test, review, document, and synchronize project state.
