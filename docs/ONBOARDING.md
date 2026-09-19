# Onboarding a collaborator

Two levels of access. Start at level 1 — most work never needs level 2.

## 1. Local only (no Cloudflare credentials)

`vinext dev` starts workerd with a _local_ D1 (`apps/web/.wrangler/state`) and a local R2
simulation, so the whole app — Look image storage included — runs from a clean clone:

```bash
pnpm install
cp .env.example .env                               # seed / analytics / evaluate scripts
cp apps/web/.dev.vars.example apps/web/.dev.vars   # the Worker's own secrets
pnpm db:migrate && pnpm seed                       # 100k products + simulation → data/lookline.sqlite
pnpm d1:migrate:local && pnpm d1:local             # copy that into the dev D1
pnpm dev
```

LLM keys are optional: without them every engine falls back to deterministic offline logic and the
app stays usable end to end. `pnpm check` (format, lint, typecheck, test, build) needs nothing else.

## 2. Remote access (deploy, production D1 and R2)

Needed only for `pnpm deploy`, `pnpm d1:migrate:remote`, `pnpm d1:remote`, `wrangler secret put`,
`wrangler r2 …` and `wrangler tail`. The shared resources, pinned in `apps/web/wrangler.jsonc`:

| Resource | Name             | Identifier                                            |
| -------- | ---------------- | ----------------------------------------------------- |
| Account  | `JacobLinCool`   | `b1c3d1b89f9131a84a0f1f6a973232f1`                    |
| D1       | `lookline`       | `28602478-a8bc-49fc-a7f2-c295e2c40939` (binding `DB`) |
| R2       | `lookline-media` | APAC (binding `STORAGE`)                              |
| Worker   | `lookline`       | —                                                     |

### The account owner issues a scoped token

[dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens) →
**Create Token** → **Create Custom Token**:

| Scope                        | Permission | Needed for                           |
| ---------------------------- | ---------- | ------------------------------------ |
| Account · Workers Scripts    | Edit       | `pnpm deploy`, `wrangler secret put` |
| Account · D1                 | Edit       | `d1:migrate:remote`, `d1:remote`     |
| Account · Workers R2 Storage | Edit       | bucket and object access             |
| Account · Workers Tail       | Read       | `wrangler tail`                      |

Account Resources: **Include → JacobLinCool**. Zone Resources: none. Set a TTL that ends with the
hackathon. The secret is shown once — send it over a private channel, never into the repo.

**Blast radius.** Cloudflare scopes D1 and Workers permissions per _account_, not per database or
script. This token can read and write every D1 database and every Worker on the account, not only
Lookline's. Issue one token per person so a single one can be revoked, and delete them when the
hackathon ends (API Tokens → ⋯ → Delete).

### The collaborator uses it

```bash
export CLOUDFLARE_API_TOKEN=<token>
export CLOUDFLARE_ACCOUNT_ID=b1c3d1b89f9131a84a0f1f6a973232f1
```

In the shell profile, not in a file inside the repo. Wrangler prefers these over `wrangler login`,
so there is no OAuth flow and no account picker. Verify from `apps/web/`:

```bash
pnpm exec wrangler d1 info lookline
pnpm exec wrangler r2 bucket info lookline-media
```

`wrangler d1 execute` and `wrangler r2 object put|get|delete` default to the **local** simulated
resources and only touch production with `--remote` — a silent no-op against the real data
otherwise. `r2 bucket info` reports usage on a delay, so `object_count` lags a fresh upload.

### Images only

For someone who just reads or writes Look images, skip the account token: R2 → **Manage R2 API
Tokens** issues one scoped to a single bucket (`lookline-media`, Object Read & Write) with S3
credentials. It cannot reach D1, the Worker, or any other bucket.

## Secrets

`SESSION_SECRET`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `TYPESAFE_API_KEY` live in
`apps/web/.dev.vars` locally (git-ignored; template in `apps/web/.dev.vars.example`) and in
`wrangler secret put <NAME>` for the deployed Worker. Non-secret model defaults are `vars` in
`wrangler.jsonc`. The repo-root `.env` feeds only the Node scripts (seed, analytics, tests) through
`loadEnv()`; the Worker never reads it.

## First deploy of a fresh account

Only when reproducing the stack somewhere else — the shared account already has both resources:

```bash
wrangler d1 create lookline           # put the printed database_id into wrangler.jsonc
wrangler r2 bucket create lookline-media
pnpm d1:migrate:remote && pnpm d1:remote
pnpm deploy
```
