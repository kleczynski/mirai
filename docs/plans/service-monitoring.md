# Service usage and billing monitoring

Stages: [x] Scope → [x] Implement → [x] Verify → [ ] Release (authorized)

Current stage: preparing the authorized isolated production release.
Base source/environment: `b588c4a`; production `mirai.party`, Worker `234c2da2-e7f4-4833-a0e1-ab573d024833` at task start.
Last verified checkpoint: inspected runtime bindings and route; Cloudflare subscription API returned 403 with existing CLI credentials. No billing-specific runtime credentials exist. Supabase is not wired into this runtime.
Changed files: monitoring endpoint/model/UI, regression tests and this record. Offline real-SQL regressions pass for owner isolation, database-wide lifetime accounting, absent metadata, Clerk failures and budget thresholds.
Open decisions or blockers: provider invoices, credit balances and monthly allowances cannot be verified with current access; display unavailable with provider dashboard links. No new credential grants or purchases are required for this release.
Next action: verify the local browser journey and exact source, then deploy the approved isolated production build.
Recovery reference: production operations runbook; no migration or ledger reset planned.

## Completion conditions

- Owner sees all five active services, their measured signals, sources, timestamps, billing/upgrade links and unavailable account data.
- Internal lifetime AI budget is separate from provider credits; account-wide billing is not inferred from Mirai-only activity.
- Clerk total registered users is never labelled monthly retained/billable users. D1 database size and R2 recorded file bytes are not monthly billable usage.
- Failed optional observations leave the rest of the snapshot usable. No provider probes make paid AI requests or enumerate file content/user profiles.
- Threshold alerts derive only from known internal budgets. No invented plans, reset dates, costs, balances or provider-health claims.
- Browser owner success, denied access, fictional SQL/accounting/partial-failure tests, typecheck, lint and exact isolated production build are verified. Preserve unrelated work.

## Verified before release

- Real SQLite regression: owner isolation, database-wide charged/reserved/retired accounting, timestamp ordering, optional file/metadata failure and 80%/95%/exhausted warnings. Clerk responses are bounded to three seconds and tested for valid counts, missing configuration, 429, malformed counts and timeout; no paid calls.
- Local Worker HTTP: signed-in loopback owner 200, anonymous 401, five services, no-store response, unavailable billing remains null.
- Browser: local owner opens Monitoring; all five cards and official billing links render. Desktop and 390px mobile inspected; document width equals viewport width (no horizontal overflow). Keyboard Refresh triggers loading and reload.
- Typecheck and lint pass (four existing warnings). Production exact-source build remains the release prerequisite.
- Live preflight: production still runs `234c2da2-e7f4-4833-a0e1-ab573d024833`; all four relevant tables exist. No migration required.
