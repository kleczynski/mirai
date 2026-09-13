# Service usage and billing monitoring

Stages: [x] Scope → [x] Implement → [x] Verify → [x] Release (authorized)

Current stage: released and verified as the authenticated production owner.
Base source/environment: `b588c4a`; production `mirai.party`, Worker `234c2da2-e7f4-4833-a0e1-ab573d024833` at task start.
Last verified checkpoint: inspected runtime bindings and route; Cloudflare subscription API returned 403 with existing CLI credentials. No billing-specific runtime credentials exist. Supabase is not wired into this runtime.
Changed files: monitoring endpoint/model/UI, regression tests and this record. Offline real-SQL regressions pass for owner isolation, database-wide lifetime accounting, absent metadata, Clerk failures and budget thresholds.
Open decisions or blockers: provider invoices, credit balances and monthly allowances cannot be verified with current access; display unavailable with provider dashboard links. No new credential grants or purchases are required for this release.
Next action: operator uses Monitoring and its provider billing links; live provider billing integration requires separately configured read-only billing access.
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

## Release checkpoint

- Source `a5d3b37` pushed to `main`; isolated `git archive`, locked npm install, production Clerk publishable key supplied only to the build process. Typecheck, lint, monitoring regressions, production build and checked Wrangler dry run passed.
- Deployed `mirai-production` version `092a4cc0-34d9-4872-b656-bfd8f669b4bd` using the prepared production overlay and `--keep-vars`. No schema migration, data mutation, paid AI request, credential replacement or cap change.
- Live owner Monitoring rendered all five services. Tail recorded HTTP 200 on the new version with no logs/errors/exceptions. Anonymous and forged-header requests remain 401. Clerk's user count was successfully retrieved. Relevant schema and binding metadata matched before/after; emitted Clerk/workspace assets matched the isolated build hashes.
- GitHub Verify run `34767453069`: production-config dry run passed; the main job stopped at existing repository formatting issues. Local affected tests/typecheck/lint/build passed; no claim of a fully green CI run.
- Production billing balances, invoices, MRU, monthly Cloudflare usage/allowances, payment failures and reset dates are not connected. The dashboard links to the provider and labels these values unavailable. Supabase is not part of this runtime.
- Recovery: prior Worker `234c2da2-e7f4-4833-a0e1-ab573d024833`, same bindings/database. No SQL rollback required.
