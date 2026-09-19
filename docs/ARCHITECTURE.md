# Architecture

Lookline is a fashion network prototype built for the 2026 Meichu Hackathon × Makalot challenge
("一句話，讀懂消費者要什麼"). It is a commerce platform whose social layer grows out of purchases:
every purchase can become a **Look** (a personal digital edition), Looks travel between people
(Make It Mine / Together / Share), and the resulting interaction graph is first-party trend
data that feeds back into recommendation and into manufacturing decisions.

This document is the contract every package follows. Change it before changing a boundary.

## Product thesis (from `ref/`)

| Term         | Meaning                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| Trend Maker  | The platform creates and propagates trends instead of only observing external ones.                          |
| Look         | The social object. An image + products + owner + lineage. Created after a purchase, remixed by others.       |
| Make It Mine | Remix: keep aesthetic/mood/palette, swap in products that fit the remixer. Produces `REMIX`/`INSPIRE` edges. |
| Together     | Two or more people's Looks become a shared edition for an occasion. Produces `TOGETHER` edges.               |
| Engine 01    | Intent understanding: one sentence → structured intent, with explicit assumptions and clarifications.        |
| Engine 02    | Explainable recommendation: constrained ranking + outfit assembly, every score decomposed into factors.      |
| Engine 03    | Preference feedback loop: online per-user preference learning whose improvement is measurable.               |

Principles: Trend Maker not Trend Observer · Fashion is social · Interaction not Following ·
Creation not Advertisement · Propagation not Popularity · **Intelligence Without Waiting**.
Privacy remains private by default.

## Perceived latency

AI should increase capability without making the interface feel slower. Every interaction follows
the [Perceived Latency Contract](specs/LATENCY_SPEC.md): Instant acknowledges within 100 ms and
feels complete within 400 ms; Generative reveals meaningful progress within 800 ms and a usable
result within 5 s; Creative reveals a meaningful visual within 5 s and final output within 30 s.
Active generative work must not leave more than 800 ms between meaningful progress updates.
The primary metric is **time-to-next-action**, measured in the browser from user input to a usable,
painted state. A provider timeout or an animated spinner does not satisfy this contract.

Local state and deterministic results lead the interaction. AI enrichment runs independently;
late results cannot overwrite a newer request or the user's choices. Persist Look metadata and a
labelled composition preview before image generation. Authentication, persistence failures and
provider deadlines reconcile explicitly; an optimistic action never claims confirmed delivery.

## Toolchain

- Node ≥ 24, pnpm ≥ 11 (workspace), Turbo for task orchestration.
- TypeScript strict (`tsconfig.base.json`), ESM only (`"type": "module"`).
- Lint/format: `oxlint` and `oxfmt`.
- Tests: `vitest`.
- Database: Cloudflare D1 (SQLite). ORM: Drizzle (`drizzle-orm/d1` in the Worker, `drizzle-orm/libsql`
  on a local SQLite file for seeds, scripts and tests). Cosine ranking runs in SQL over the
  `product_vectors` table (64 REAL columns); text search is SQLite FTS5 (`products_fts`).
- Object storage: Cloudflare R2 (`STORAGE` binding) for generated Look images and owner photos.
- Web: Next.js 16 App Router API on vinext (Vite), deployed as a Cloudflare Worker; React 19,
  Tailwind CSS 4, `lucide-react`, `recharts`.
- LLM: `openai` and `@google/genai` adapters, with one deadline across provider attempts.
  The tested deterministic parser/ranker and product composition renderer provide initial results
  without API keys. AI enriches those results independently; provider failure remains explicit.

AI defaults (model names can be overridden in `.env`):

| Workload                    | Service                             | Model                    | Generation setting                     |
| --------------------------- | ----------------------------------- | ------------------------ | -------------------------------------- |
| Intent understanding        | OpenAI Responses API                | `gpt-5.6-luna`           | `reasoning.effort: medium`             |
| Look generation and editing | OpenAI Images API                   | `gpt-image-2.5-flare`    | `quality: high`                        |
| Intent understanding        | Google Gemini API `generateContent` | `gemini-3.5-flash-lite`  | `thinkingConfig.thinkingLevel: MEDIUM` |
| Look generation and editing | Google Gemini API `generateContent` | `gemini-3.1-flash-image` | Provider default                       |

OpenAI is tried first unless provider selection is overridden. Both text adapters explicitly set
medium effort and leave sampling parameters at provider defaults. Image effort is expressed as
`quality` in the OpenAI Images API; `LLM_IMAGE_QUALITY` overrides its high default. The shared
3.5-second text and 25-second image deadlines still apply across provider attempts.

API contracts: [OpenAI Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna),
[OpenAI image generation](https://developers.openai.com/api/docs/guides/image-generation),
[Gemini thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking),
[Gemini image model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image).

Shop implements specialist capabilities described in the
[Structured Decisions and Live Voice Filters spec](specs/REALTIME_FILTER_SPEC.md): TypeSafe Jev
maps language to known filter options, while Gemini `gemini-3.5-transcribe-live` supplies streaming
transcripts. TypeSafe defaults to `jev-1.13.0` with a 1.2-second deadline; the browser uses
a constrained, single-use Gemini token for 16 kHz PCM streaming. Code owns exact values,
OR-within-facet selections, exclusions and revision-checked filter application. General-purpose text generation stays outside the live filter update path;
unknown decisions and open-ended requests remain explicit rather than forcing a taxonomy match.

Workspace packages export TypeScript source directly (`"exports": { ".": "./src/index.ts" }`).
Next.js consumes them via `transpilePackages`; scripts run with `tsx`.

## Workspace layout

```
apps/web            Next.js app: UI, server actions, route handlers
packages/db         Drizzle schema, migrations, client factory, reset/migrate scripts
packages/catalog    Taxonomy, deterministic 100k product generator, SVG product renderer
packages/engine     Intent parsing, retrieval + ranking, outfit solver, explanations,
                    preference learning (bandit), graph/lineage/trend analytics
packages/sim        Synthetic personas, social interaction simulation, evaluation harness
docs/               This contract, specs, evaluation notes
data/               Local artifacts (git-ignored): the seeded SQLite file, D1 dump, exports
```

Dependency direction: `web → engine → catalog`, `web → db`, `engine → db`, `sim → engine, catalog, db`.
`catalog` depends on nothing internal. `db` depends on nothing internal.

## Style space (fixed contract)

Products, intents, and users live in one 64-dimensional **style vector** (a JSON array column;
`product_vectors` additionally stores a unit-normalised copy per product for cosine in SQL).
Layout, in order:

| Range | Dims | Meaning                                                                                                                                       |
| ----- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–31  | 32   | Aesthetic affinities, one per aesthetic tag, each in [0, 1]                                                                                   |
| 32–43 | 12   | Colour family weights (black, white, grey, neutral, brown, red, pink, yellow-orange, green, blue, purple, multi-metallic)                     |
| 44–51 | 8    | Axes in [0, 1]: formality, warmth, boldness, structure, price-tier, coverage, texture, trendiness                                             |
| 52–63 | 12   | Category group one-hot (tops, bottoms, dresses, outerwear, footwear, bags, accessories, jewelry, activewear, swimwear, loungewear, tailoring) |

`packages/catalog` owns the canonical ordered lists (`AESTHETICS`, `COLOR_FAMILIES`, `AXES`,
`CATEGORY_GROUPS`) and the `toStyleVector()` function. Everything else imports them. Similarity is
cosine.

## Languages

English and Traditional Chinese (Taiwan), chosen by the `ll_locale` cookie and otherwise by
`Accept-Language`; URLs carry no locale prefix so a filtered `/shop` link is shareable between
readers of either language. Interface copy lives in `apps/web/src/i18n/messages/<locale>/`, typed
against the English catalog; catalog nouns are read from `@lookline/catalog`'s own `labelZh`
through `apps/web/src/i18n/taxonomy.ts` and are never re-typed as translations. See
[two languages](specs/I18N_SPEC.md).

## Money, departments, sizes

- Prices are integer TWD (`price` column). The intent parser converts other currencies.
- Departments: `women`, `men`, `unisex`, `kids`.
- Size systems: `alpha` (XS–XXL), `numeric-waist` (26–40), `eu-shoe` (35–46), `one-size`.

## Identifiers

- Catalog entities (`brands`, `products`): integer primary keys, plus stable `slug`.
- App entities (`users`, `looks`, `interactions`, `purchases`, ...): text primary keys.
  Generated data (simulation) uses deterministic ids like `u_000123`; runtime uses nanoid.

## Data model (owned by `packages/db`)

Core tables: `brands`, `products`, `users`, `sessions`, `purchases`, `looks`, `look_products`,
`look_participants`, `interactions`, `relationships`,
`intent_sessions`, `feedback_events`, `preference_snapshots`, `lineage_stats`, `trend_signals`.
`packages/db/src/schema.ts` is the single source of truth; `docs/DATA_MODEL.md` explains semantics.

`interactions.type` enum: `VIEW, SEARCH, SAVE, DISMISS, SHARE, REACT, STYLE, REMIX, TOGETHER,
INSPIRE, LOOK_CREATE, PURCHASE, BUY_FOR`.

## Engines (owned by `packages/engine`)

- `intent`: `parseIntent(utterance, ctx)` → `Intent` (zod). LLM structured output when a key exists,
  otherwise a lexicon-based parser. Always returns `assumptions[]` with confidence and
  `clarifications[]` for genuinely ambiguous slots.
- `retrieve` / `rank`: SQL prefilter (department, category groups, budget, stock) + cosine on the
  intent vector over `product_vectors`, then in-process scoring with named factors. Every ranked item carries
  `explanation.factors[]` (`{ factor, weight, contribution, evidence }`).
- `outfit`: beam search over category slots under a total budget, maximising item score plus
  pairwise compatibility (colour harmony, aesthetic overlap, formality match). Explains each pairing.
- `preference`: per-user 64-d preference vector updated online from `feedback_events`, plus a
  contextual bandit (LinUCB or Thompson sampling) over blend weights. `evaluate()` replays synthetic
  users and reports hit-rate@k / NDCG / cumulative reward against a static baseline.
- `graph`: derives `relationships` from `interactions`; computes taste clusters.
- `trend`: lineage stats per root Look (depth, breadth, reach, velocity, cross-cluster spread,
  remix rate, conversion, downstream GMV) and per-day `trend_signals` on aesthetics, categories,
  colours, silhouettes, and aesthetic×category pairs, including manufacturing recommendations.

## Web app (owned by `apps/web`)

Routes:

| Route               | Purpose                                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/`                 | "Say it in one sentence" — Engine 01 + 02 demo: intent card, outfit(s), explanations, budget bar                      |
| `/shop`, `/p/[id]`  | Browse/search the 100k catalog; product page with "why for you", similar, complete-the-look                           |
| `/bag`, `/checkout` | Purchase; "Who is this for?" (Me / Someone else / Prefer not to say)                                                  |
| `/looks/new`        | Create My Edition: photo or avatar + style preset + products → generated Look                                         |
| `/looks/[id]`       | Look page: image, creator, shoppable products, lineage; Make It Mine / Together / Share                               |
| `/l/[token]`        | Shared Look card; works without an account (guest user)                                                               |
| `/me`               | Wardrobe / editions, learned preference profile with evidence, purchase history                                       |
| `/trends`           | Trend Maker dashboard: propagation trees, momentum, cross-cluster spread, manufacturing signals, Engine 03 evaluation |
| `/api/...`          | JSON endpoints used by client components and by the README reproduction steps                                         |

Auth is a signed cookie session over `sessions`. Demo personas are selectable from `/login`.
Generated Look images and owner photos live in R2 (`looks/<lookId>-<generationId>.png`,
`photos/<userId>.<ext>`, stored in `looks.image_path` / `users.photo_path`) and are served by a
route handler; Looks without a generated image get their composition poster rendered on demand.

## Verification gates

`pnpm check` runs `format:check`, `lint`, `typecheck`, `test`, and `build`. Reproduction from a
clean clone: `pnpm install`, the Kaggle csv files in `data/hm/` and
`pnpm --filter @lookline/hm aggregate` (see docs/ONBOARDING.md), `pnpm db:migrate`, `pnpm seed`
(105k H&M articles + simulated people into `data/lookline.sqlite`),
`pnpm d1:migrate:local && pnpm d1:local` (copy into the dev D1),
`pnpm dev`. Production: `wrangler d1 create lookline`, `wrangler r2 bucket create lookline-media`,
`pnpm d1:migrate:remote && pnpm d1:remote`, `pnpm deploy`. On the shared account both
resources already exist and a collaborator needs a scoped API token instead —
see [onboarding](ONBOARDING.md).
