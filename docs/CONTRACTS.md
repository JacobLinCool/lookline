# Cross-package contracts

`docs/ARCHITECTURE.md` fixes the boundaries; this document fixes the exported API across them.
The type-level truth lives in code:

| Package             | Contract files                                                                 |
| ------------------- | ------------------------------------------------------------------------------ |
| `@lookline/db`      | `packages/db/src/schema.ts` (tables, enums, row types), `client.ts`, `node.ts` |
| `@lookline/catalog` | `packages/catalog/src/types.ts`, exports listed in `src/index.ts`              |
| `@lookline/engine`  | `packages/engine/src/types.ts`, exports listed in `src/index.ts`               |

Rules:

1. Exported names and signatures in the contract stubs are stable. Implementations replace the
   bodies and may split code across files, but `src/index.ts` keeps re-exporting the same names.
   Adding exports and optional fields is fine; renaming or removing is not.
2. When `docs/specs/*.md` and the contract disagree on an exported name, the contract wins; follow
   the spec for internals.
3. Every package must pass `pnpm --filter <pkg> typecheck` and `pnpm --filter <pkg> test` on its own.
4. No `Math.random()` or `Date.now()` in `catalog`, `engine` (except the LLM client and id
   generation at runtime) or `sim`. Use `createRng(seed)` and explicit `createdAt` inputs so
   generation and simulation are reproducible.
5. Relative imports are extensionless (`./foo`), ESM only, TypeScript strict with
   `noUncheckedIndexedAccess`. Prefer `import type`.
6. UI copy is English. Taxonomy carries `labelZh` and bilingual `synonyms` so the intent parser
   understands 中文 and English input.
7. Every interaction declares an Instant, Generative or Creative class and follows
   [LATENCY_SPEC.md](specs/LATENCY_SPEC.md). Browser time-to-next-action is the primary acceptance
   measure; model completion is measured separately. Progress represents actual new information.

## Conventions

- **Style vector**: `number[]` of length 64, layout in ARCHITECTURE.md. `@lookline/catalog` owns the
  index helpers (`aestheticIndex`, `colorFamilyIndex`, `axisIndex`, `categoryGroupIndex`) and
  `toStyleVector`. Similarity is `cosineSimilarity`.
- **Ids**: catalog entities use integer ids (products 1..N, brands 1..M). App entities use text ids:
  nanoid at runtime, deterministic `u_000001` / `lk_000001` / `ix_000001` / `pu_000001` /
  `ask_000001` / `fb_000001` in the simulation via the `DeterministicOptions` inputs.
- **Money**: integer TWD.
- **Database access**: functions take `db: Database` (from `@lookline/db`) as the first argument —
  an async drizzle SQLite database (D1 in the Worker via `createD1Db(env.DB)`, libsql on a local
  file via `createLocalDb()` from `@lookline/db/node`). The web app obtains it from `getDb().db`;
  scripts create their own and close it. Never use `db.transaction()` (D1 rejects `BEGIN`) and
  never bind more than 100 parameters per statement: `inArray`/`notInArray` from `@lookline/db`
  expand long lists through `json_each`, `insertAll` chunks bulk inserts.
- **Environment**: scripts call `loadEnv()` from `@lookline/db/node` first (root `.env`). The
  Worker reads `process.env` from wrangler `vars`, `apps/web/.dev.vars` (dev) and `wrangler secret`.
- **Files**: generated Look images and owner photos are R2 objects; the DB stores the object key
  (`looks/<lookId>-<generationId>.<ext>`, `photos/<userId>.<ext>`). Looks without a key render
  their composition poster on demand.

## `@lookline/catalog`

Exports (see `src/index.ts`): taxonomy constants (`AESTHETICS`, `COLOR_FAMILIES`, `AXES`,
`CATEGORY_GROUPS`, `CATEGORIES`, `SUBCATEGORIES`, `COLORS`, `MATERIALS`, `PATTERNS`, `OCCASIONS`,
`FITS`, `SEASONS`, `DEPARTMENTS`, `LEXICON`), lookups (`findSubcategory`, `findAesthetic`,
`findColor`, index helpers), randomness (`createRng`, `hashSeed`), vectors (`zeroVector`,
`toStyleVector`, `normalizeVector`, `cosineSimilarity`, `blendVectors`, `describeVector`),
generation (`generateBrands`, `generateProduct`, `generateCatalog`), rendering (`renderProductSvg`).

Guarantees:

- `generateProduct(i, seed, brands)` is a pure function of its arguments; generation is
  order-independent so it can be parallelised or resumed.
- Two products with the same duplicate key (defined in CATALOG_SPEC.md) never appear in one catalog.
- `slug` and `name` are unique across the catalog for a given seed.
- `renderProductSvg` returns a complete `<svg>` string (600×800) in well under 1 ms.
- `scripts/seed.ts` fills `brands`, `products` and `product_vectors` in the local SQLite file
  (clearing dependent tables) using `CATALOG_SEED` and `CATALOG_SIZE`, logs progress every 10k
  rows, rebuilds `products_fts`, runs `ANALYZE`, and finishes 100k rows in a few minutes on a
  laptop.

## `@lookline/engine`

Exports (see `src/index.ts`): `getLlm`, `parseIntent`, `parseIntentOffline`, `intentToVector`,
`recommend`, `similarProducts`, `completeTheLook`, `searchProducts`, `recordFeedback`,
`getPreferenceProfile`, `evaluatePreferenceLoop`, `recordInteraction`, `recordPurchase`,
`createLook`, `suggestRemix`, `deriveLookStyle`, `STYLE_PRESETS`,
`renderLookPosterSvg`, `buildLookImagePrompt`, `runAnalytics`, `getTrendDashboard`, `getLineage`,
`getUserNetwork`, `countFacet`, `resolveFilters`, `extractSearchKeywords`, `extractFacetCandidates`.

Guarantees:

- Every LLM-backed function works with no API keys (`provider: 'offline'`) and never throws
  because of a provider error.
- `parseIntent` answers from the closed-option decision (`provider: 'jev'`) unless `routeIntent`
  escalates, and its `route` says why it did; `ctx.deferRefinement` returns that answer with a
  `refine()` the caller runs out of band. Without `TYPESAFE_API_KEY` it degrades to the previous
  lexicon-plus-LLM path.
- `recommend` returns items whose `explanation.factors` sum (Σ contribution) equals `score` within
  floating error, so the UI can render the breakdown honestly.
- `recordPurchase` writes the `purchases` row, the `PURCHASE` (and `BUY_FOR`) interactions, and a
  `purchase` feedback event, and attributes `sourceLookId` so lineage conversion can be computed.
- `createLook` writes `looks`, `look_products`, `look_participants`, `LOOK_CREATE`
  (and `REMIX`/`INSPIRE`/`TOGETHER`) interactions, fills `rootLookId`/`depth` from the parent, and
  computes `aesthetics`, `palette`, `styleVector` with `deriveLookStyle`.
- `runAnalytics` is idempotent: it rebuilds `relationships`, taste clusters, `lineage_stats`,
  `trend_signals`, and `manufacturing_recommendations` from raw tables.
- `evaluatePreferenceLoop` is pure and deterministic for a given `EvalConfig`.
- `scripts/analytics.ts` runs `runAnalytics` against the local SQLite file (`LOOKLINE_SQLITE`).

## `@lookline/sim`

- `scripts/seed.ts` creates personas (`users` with `isPersona = true`, `sim_personas`), a social
  history of purchases, Looks (posters are rendered on demand by the web image route), remixes,
  Together editions, shares, reactions and feedback events by calling the engine write paths with
  deterministic ids and timestamps spread over the last 60 days. It must produce visible
  propagation chains (depth ≥ 4) that cross social clusters, and at least 8 demo-ready personas
  with photos or avatars, wardrobes, and learned preferences.
- `scripts/evaluate.ts` runs `evaluatePreferenceLoop` and stores the result in `evaluation_runs`.

## `@lookline/web`

- Reads through `getDb().db`; mutations go through engine write paths from server actions in
  `src/server/actions/*.ts`; JSON endpoints under `src/app/api/**` for client components.
- Auth: `src/server/auth.ts` exposes `getSessionUser()`, `requireUser()`, `loginAs(userId)`,
  `createGuest(displayName)`, `logout()`. Cookie `ll_session` holds an HMAC-signed session id
  (`SESSION_SECRET`).
- Image routes: `GET /api/products/[id]/image` (SVG via `renderProductSvg`, immutable cache),
  `GET /api/looks/[id]/image` (R2 object `looks.image_path`, or poster SVG fallback),
  owner-only `GET /api/previews/[id]/image` (temporary preview image or poster),
  `GET /api/avatars/[seed]` (SVG).
- Routes and their purpose are listed in ARCHITECTURE.md.
- `POST /api/admin/image` (engine lab) renders either a typed prompt (`application/json` with
  `{ prompt, aspectRatio }`) or a composite (`multipart/form-data` with repeated `garment` and
  `person` image parts, plus `stylePreset`, `aspectRatio`, `occasion?` and `notes?`). References
  are labelled `Garment n` / `Person reference n` and the engine's `buildCompositePrompt` names
  them, so the model is told which image is which. The response carries the composed `prompt`,
  the provider and the model; nothing is persisted.
- `POST /api/intent/stream` accepts `{ q, clarify?, previous? }` and streams newline-delimited JSON:
  `understood` → `result` → optional `refinement` → `done` (or `error` before `done`). The initial
  result uses the tested deterministic parser/ranker; refinement is explicitly applied by the user.
  Disconnects abort model enrichment. Impression logging runs after the response and is not a
  condition for rendering results.
- Interface copy is owned by `apps/web/src/i18n/messages/<locale>/<surface>.ts`, one module per
  surface, typed against the English catalog. Catalog nouns are not copied there: they come from
  `@lookline/catalog` through `apps/web/src/i18n/taxonomy.ts`. See [two languages](specs/I18N_SPEC.md).
- `POST /api/filters/resolve` accepts `{ utterance, base, revision }` and returns validated
  `{ filters, unresolved, hints, freeText, revision, model, contractVersion, latencyMs }` from
  TypeSafe Jev (`filters-v3`); `hints` lists what the sentence leaves unsaid (`occasion`,
  `budget`, …) for Shop to ask about, and `freeText` says the sentence names something the
  attributes cannot carry. `POST /api/filters/keywords` `{ utterance, revision }` then returns
  `{ keywords, revision, provider, model, contractVersion, latencyMs }` — English full-text
  concepts from the fast generative model, or 503 when no provider answered.
  `POST /api/voice/token` returns a short-lived, single-use, model-constrained Gemini token.
  All three require authenticated same-origin requests. See [live filters](specs/REALTIME_FILTER_SPEC.md).
  Shop's URL carries every `SEARCH_FACETS` pair of `@lookline/catalog` as repeated fields
  (`categoryGroups`/`excludedCategoryGroups` … `details`/`excludedDetails`) plus repeated
  `keywords`; SQL applies OR within a facet, AND across facets and explicit exclusions.
  `GET /api/articles/facets?facet=<id>&…` counts one construction facet over the same search.
- `createLookDraft` persists a product composition before scheduling image rendering with `after`.
  `GET /api/looks/[id]/generate` reports image state; owner-only `POST` with `{ stylePreset }`
  claims a generation and returns 202; owner-only `DELETE` with `{ generationId }` cancels that
  revision. Completion uses a compare-and-set on the persisted generation ID. Cancellation revokes
  write ownership; provider work is bounded by the shared 25 s budget. Expired leases become
  retryable failures without deleting the previous visual. Missing credentials leave an explicitly
  labelled composition; a failed provider never masquerades as a completed image.
- `createLook` accepts an optional `deferFeedback` scheduler as its third argument.
  Web callers supply `after`; simulation callers await feedback by default so replay is complete
  before analytics. Core Look records and social edges remain on the persistence path.

## Verification

Root: `pnpm check` = `format:check`, `lint`, `typecheck`, `test`, `build`.
End-to-end (after the Kaggle csv files and `pnpm --filter @lookline/hm aggregate` — docs/ONBOARDING.md):
`pnpm db:migrate && pnpm seed && pnpm evaluate && pnpm d1:migrate:local && pnpm d1:local && pnpm dev`.

## Cards, personas and credits (`@lookline/engine` cards module)

Shared contract for the purchase (#34), persona (#35), studio (#36), collection (#37) and sharing
(#38) work. See docs/DATA_MODEL.md for why holding is derived and credits are a ledger.

- `creditsForPurchaseLine(unitPrice, quantity)` decides entitlement from the line's own snapshot.
  The threshold is `creditThresholdTwd()` — US$10 at the project's fixed demo rate, NT$320 — and
  deliberately not `toTwd`, whose rounding to the nearest 50 or 100 would move the boundary.
  `CREDIT_RULE_VERSION` is recorded on every ledger row it decides.
- `grantPurchaseCredits`, `reserveCredit`, `settleCredit`, `releaseCredit` all take an
  `operationKey` that is stable across retries of the same logical act. Granting or settling twice
  under one key is a no-op; `reserveCredit` returns `false` only when there was nothing left to
  reserve. `creditBalance` is the sum of the ledger and the only definition of how many an account
  has.
- `createPersona`, `personasOf`, `offerTransfer`, `transferPreview`, `acceptTransfer`,
  `cancelTransfer`. `transferPreview` reports what an offer will move before it is accepted;
  `acceptTransfer` returns `{ ok: false, reason }` for a wrong recipient, an expired or already
  settled offer, or a stale version.
- `cardHolder` and `holdingsOf` derive holding through the persona. Nothing else should read or
  write an owner on a card.
- `grantEntitlement`, `lendArticle`, `revokeLoan`, `availableArticles`, `ownedRatio`.
  `availableArticles` returns owned and borrowed articles with the source of each, which is what a
  card snapshots and what `ownedRatio` measures.
- `openSession`, `startAttempt`, `failAttempt`, `addCandidate`, `candidatesOf`, `settleCard`,
  `addCollectionMember`, `membersOf`, `issueEdition`. `addCandidate` refuses past
  `MAX_CANDIDATES_PER_SESSION` and on a closed session, so cancelling and reopening cannot wash out
  unlimited candidates. `issueEdition` mints one numbered copy per participating persona.

Authorisation, stated once so every caller enforces the same thing: the signed-in account may act
only on personas whose `ownerUserId` is itself; it may dress them only in what `availableArticles`
returns for it; a card's author is fixed at issue whoever later holds it; and a transfer may be
accepted only by its named recipient, once, before it expires.
