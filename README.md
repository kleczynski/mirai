# Mirai — FDE delivery workspace

Production: https://mirai.party · Staging: https://mirai-staging.kleczynski11312.workers.dev

Mirai connects discovery, a working demo, client feedback and approved deployment
guidance in one private session. React 19/Vinext runs on the operator-owned
Cloudflare Workers with separate D1 databases and Clerk authentication.

- [Current workflow and limits](docs/MVP.md)
- [Local development and checks](docs/DEVELOPMENT.md)
- [Current release and operations runbook](docs/plans/production-new-clients.md)
- [Agent agreements](AGENTS.md) and [guidance rationale](docs/AGENT-GUIDANCE.md)
- [Future direction](docs/NORTH-STAR.md)

Discovery chat is enabled on staging and production: saved answers, bounded
background summaries, an interview, direct topic editing and
browser-supported voice input. Operator readiness confirmation and version-specific
demo approval remain separate. Supabase and autonomous application builds are not
implemented.

The adaptive update released on 2026-09-12 adds up to ten answers, closing checklists
and explicit review continuation on staging and production. See the operations runbook for release evidence.

The original Sites host remains a separate legacy dataset:
https://mirai-control-plane.wishfishdev.chatgpt.site. Its imported Telegram examples
are not the new production database. Do not move invitation URLs between hosts,
copy or remap legacy rows, replay migrations or repeat a DNS cutover as ordinary
release work. The Sites manifest is retained for that legacy project.

Use Node 24 and the locked dependencies. See the development guide before running
commands: tests write fictional LOCAL records; production is never a fixture target.
Use the current runbook's checked Worker overlays for deployment, not the generated
local Wrangler config. Existing source and artifact state must be verified before
publishing; production needs operator authorization.

Hosted owner requests are Clerk-authorized on the server. Never trust public
`oai-authenticated-user-*` headers. The starter's simulated Sites sign-in is only
for loopback development when Clerk is unset; it is not hosted authentication.

The project/collaboration extension is documented in
[its scope](docs/scope/project-collaboration.md). `/projects` adds authenticated
contributions and governed evidence canvases while preserving legacy client
sessions. Check the operations runbook for the actual release state.
