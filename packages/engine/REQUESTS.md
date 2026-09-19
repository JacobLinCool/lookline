## Social + Looks (social/**, looks/**)

- **`recordFeedback` fallback.** `social/feedback.ts` calls `recordFeedback` from `../preference`;
  while that is still the contract stub ("not implemented yet") it falls back to a plain
  `feedback_events` insert with the §4.1 base reward and `context.fallback = 'social'`. Once
  `recordFeedback` lands nothing changes on my side; the fallback branch can then be deleted.
  Preference owner: `purchase` events arrive with `context.forKind` and `forOthers`; `ask_choice`
  with `context.{chosen, role: 'asker'|'adviser', askId}`; `look_create` one row per product with
  `context.lookId`.
- **`suggestRemix` retrieval.** `recommend/PgRetriever` was a stub, so `social/remix.ts` runs its
  own per-slot cosine query over `product_vectors` (stock > 0, department ladder, category group, slot price cap with
  a ×1.5 → no-cap relaxation, excludes the source pieces, `ORDER BY style_vector <=> $vec`
  LIMIT 120). When `PgRetriever` exists, `retrieveSlot` in `social/remix.ts` can be replaced by
  it (same filters) — ranking/explanations in `social/remix-rank.ts` are independent of retrieval.
- **Timestamps.** Write paths without an explicit `createdAt` read `select now()` once
  (`social/time.ts`) so every row of one action shares an instant; no `new Date()` in engine code.
- **`rootLookId` of a root Look is its own id** (depth 0). Analytics: BFS by `parentLookId IS NULL`
  still works; `where rootLookId = X` includes the root itself.
- **TOGETHER edges** are written once per unordered participant pair (actor = earlier participant).
- **Poster silhouettes.** The catalog's `renderProductSvg` is a stub and exports no silhouette
  data, so `looks/shapes.ts` embeds 16 simplified shapes keyed by `silhouetteId` prefix / group.
  If the catalog later exports its `SILHOUETTES` table, the poster can reuse the real bodies.
- **Test fixtures.** `looks/fixtures.ts` hand-builds `Product` rows because `generateProduct` was a
  stub; swap to `generateCatalog` once it lands.

## analytics (graph / lineage / trend / manufacturing)

- `src/analytics/constants.ts` holds a private `resolveAestheticTables()` (axis/colour priors derived from the catalog `AestheticDef`) plus `aestheticName/categoryGroupName/colorFamilyName/humanizeSlug`. When `src/constants/aesthetics.ts` lands, the analytics copy can be deleted and the imports pointed there.
- `runAnalytics` does **not** rebuild `bandit_state` (ENGINE_SPEC §5 last step): the preference owner should expose `rebuildBanditFromEvents(db)` and the analytics owner will call it after manufacturing, or it can be wired into `scripts/analytics.ts`.
- Relationship derivation reads `purchases.source_look_id / source_ask_id / source_interaction_id / for_user_id` and `looks.kind = 'remix' + parent_look_id` as the authoritative sources for `inspired_by`, `buys_for`, `remixed` (REMIX/INSPIRE/BUY_FOR interactions are only used for trend volume). Social write paths must keep filling those columns.
- Social clusters: users whose `users.social_cluster` is null get a label-propagated cluster; the simulation should set `social_cluster` on personas so its ground truth is kept.
- `products.trend_score` is set by `runAnalytics` to `min(1, log1p(w)/log1p(p95))` over the last 14 days of weighted events (0 for products with no events). The recommend owner may read it for `trend_momentum`.

## Engine 03 (preference) — notes for the dedupe pass

- `src/preference/vector.ts` duplicates `BLOCK`, `blockScale`, `blockCosine`, `cosineRange`, `toPgVector` and the
  block-weight constants of `src/vector.ts` (typed-array flavoured for the evaluation's hot loop). Once the
  signatures are settled the preference module can import from `../vector` instead.
- `src/preference/aesthetic-tables.ts` carries its own `resolveAestheticTables` / `AESTHETIC_AXIS_PRIOR` /
  `AESTHETIC_COLOR_PRIOR` derived from the catalog `AestheticDef`. `src/constants/aesthetics.ts` (and
  `src/analytics/constants.ts`) export the same name through the barrel, so the preference copy is not
  re-exported from `src/preference/index.ts`. Consolidate into one module.
- `src/preference/occasions.ts` (`EVAL_OCCASION_PRIORS`) transcribes ENGINE_SPEC §0.5 onto the catalog's 12
  occasion slugs for the evaluation's intent templates; `src/constants/occasions.ts` is the canonical table.
- `src/preference/ranker.ts` is a lightweight in-memory ranker (factor semantics of §2.3 with weight
  redistribution) used by `evaluatePreferenceLoop`; `rank` / `MemoryRetriever` of `src/recommend` did not exist when
  it was written. Swap it for the real ranker when its API is stable (mind the < 10 s budget: 30k slates).
- `ARMS` / `DEFAULT_WEIGHTS` are imported from `src/recommend/weights.ts` (array adapter in `src/preference/arms.ts`).
- `packages/engine/package.json`: consider adding `"evaluate:smoke": "tsx scripts/evaluate-smoke.ts"` (package.json
  is not owned by the preference module).
- `src/types.ts`: `EvalConfig` could gain the optional fields read by the evaluation (`conditions`, `catalogSource`,
  `poolSize`, `relevantShare`, see `PreferenceEvalOptions` in `src/preference/evaluate.ts`); `EvalResult.summary`
  carries extra numeric keys (`prefOnly*`, `placebo*`, `oracle*`, `criterion*`, `finalArmShare_*`, `mean*PerRound`).
- Slate closing for the bandit: `recordFeedback` revises a slate's reward whenever an attributed event arrives
  (`LinUCB.recordSlate` has replace-or-add semantics). Impression-only slates are counted only by
  `rebuildBanditFromEvents` / `rebuildAndSaveBanditState` (call it from `runAnalytics`); `recommend` may also call
  `loadBanditState(db, { now })` + `choose(contextVector(...), { eventCount })` and should log impressions with
  `context: { armId, contextVector, position }` so replay can attribute them.
- `recordFeedback` reads the clock (`input.createdAt ?? new Date()`) and generates `fb_<nanoid>` ids when the
  simulation does not pass them — the I/O layer's runtime exception of CONTRACTS rule 4.

## From recommend (Engine 02) — 2026-09-18

- `src/vector.ts` (spec §0.8: `BLOCK`, `blockScale`, `blockCosine`, `hexToHsl`, `toPgVector`) did not exist; private copies live in `src/recommend/vector.ts` (`blockScale` delegates to catalog `weightStyleVector`). Dedupe by moving them to `src/vector.ts` and re-pointing the imports.
- `intentToVector` (`src/intent`) was a stub while Engine 02 was built. `src/recommend/intent-vector.ts` calls it first and falls back to a private transcription of §1.9 (`fallbackIntentVector`) when it throws or returns an empty vector. Once the intent module lands, the fallback can be deleted (tests use `fallbackIntentVector` explicitly, so they do not depend on the sibling).
- `assertGrounded` (spec: `src/llm/guard.ts`) is implemented privately in `src/recommend/explain.ts` and is **not** re-exported from the barrel to avoid a name clash with the llm module. `polishWithLlm` imports `getLlm` lazily and treats a throwing stub / `provider: 'offline'` as "no prose".
- `deriveLookStyle` (looks module) was a stub; `outfit/index.ts` uses a private `outfitStyleVector` (mean A/C/X blocks, G = union of groups) for `Outfit.styleVector`. Swap to `deriveLookStyle(items).styleVector` when available.
- Bandit hook: `recommend` uses `resolveWeights(req.weights)` (default arm `balanced`). The preference module can choose the arm and pass `weights` on the request; `recommend` writes no `feedback_events` (web layer logs impressions with `weights`/arm id).
- `resolveAestheticTables` lives in `src/recommend/aesthetics.ts` (keyed by catalog slugs, axes/colour priors derived from `AestheticDef`), re-exported from the recommend barrel. If `src/constants/aesthetics.ts` is created, please re-export from there instead and delete the copy.
- Catalog: `generateProduct` was still a stub when the recommend tests were written; `src/recommend/testing/fixtures.ts` builds a deterministic synthetic catalog from the taxonomy (createRng/hashSeed). Consider replacing with `generateProduct(i, seed, brands)` once it exists (the tests are property-based, not golden).
- `searchProducts` maps free text to filters with a private lexicon scan (`scanQuery`) instead of `parseIntentOffline` (stub at the time). It can be swapped once the parser lands, but the current one is fast (< 0.1 ms) and handles 中文 tokens.
- Occasion vocab: intents may carry ENGINE_SPEC §0.5 slugs (`office`, `gym`, …) while `products.occasions` uses catalog §2.6 slugs (`work`, `workout`, …); `templateForOccasion` accepts both. A shared `constants/occasions.ts` should own this mapping.
- Drizzle gotcha (hit while wiring `&&` / `= any(...)`): a JS array interpolated into a `sql` template is spread into separate params (`($1)` with one element), so `${arr}::text[]` fails with "malformed array literal". `src/recommend/vector.ts` exports `textArray(values)` which renders `array[$1, $2]::text[]`; reuse it in analytics/preference queries instead of passing arrays into `sql`.

## From the LLM client + Engine 01 intent owner (llm/, intent/, constants/, vector.ts) — 2026-09-18

- `types.ts` (contract owner): please add the optional `IntentContext` fields of ENGINE_SPEC §1.1
  (`now?: Date`, `contacts?: IntentContact[]`, `brands?: IntentBrand[]`, `trendingAesthetics?: string[]`,
  plus `eventCount?: number` used by the preference blend). Until then they live on
  `IntentContextExt` (exported from `intent/schema.ts`); `parseIntent`/`parseIntentOffline` accept it
  (a superset of `IntentContext`, so existing callers compile unchanged).
- `types.ts`: the engine-extended intent shape is `IntentExt` (`z.infer<typeof IntentSchema>`), a
  strict superset of `Intent` (adds `quantity`, `aestheticWeights`, `colorWeights`, `axisTargets`,
  `giftCategoryPrior`, `referenceRole`, `parser`, `previousUtterance`, `signals`, budget
  `strictness/scope/originalAmount/originalCurrency`, assumption `source`, clarification `blocking`).
  `parseIntent` returns `IntentResultExt` (= `IntentResult` with `intent: IntentExt`).
- `intentToVector(intent, base?, opts?)` gained an optional third argument
  `{ trendingAesthetics, eventCount, referenceVector }` (§1.9 needs ctx data the contract signature
  has no room for). `referenceLookVector(look)` is exported for the recommend/looks owners.
- Recommend owner: `mustAvoid`/`mustHave` tokens follow §1.2 with catalog slugs, so negated
  「花的」 yields `pattern:ditsy-floral` + `pattern:bold-floral` + `color:multi-metallic`, and
  `material:recycled-polyester` is the polyester slug. `aesthetic:<slug>` avoids also appear.
  `intent.giftCategoryPrior` is only set for `mode !== 'outfit'`.
- `llm/index.ts` also exports `setLlm(client | null)` (test/scripts hook), `createLlmClient(opts)`,
  `resolveProviderChain`, `prepareSchema` (zod → strict JSON schema), `withTimeout`, and
  `groundingViolations` next to `assertGrounded`. Gemini image quota is 0 on the demo key: the
  image chain (Gemini → OpenAI) handles the 429 and returns the OpenAI image.
- Spec deviations (documented in code): engine tables are keyed by the catalog's 32 slugs — axis
  priors are derived from `AestheticDef` (axes + favoured materials/fits/subcategories) and colour
  priors reuse the catalog `AESTHETIC_COLOR_PRIOR`; §0.5 occasion aesthetics were re-keyed by hand
  (`classic`/`old-money` → `quiet-luxury` or `corporate-chic`, `korean-minimal` → `k-street`,
  `bohemian` → `boho`, `harajuku` → `retro-70s`/`k-street`); Taipei month→season uses 9–11 autumn
  (fixtures treat 2026-09-18 as autumn); converted budgets round to the nearest 50 in [1 000, 10 000)
  so that €50 → 1 750 as in the test plan; locale `mixed` = CJK + a Latin run of ≥ 2 letters (the
  spec's 30 % ratio would make F4 `zh-TW`).
