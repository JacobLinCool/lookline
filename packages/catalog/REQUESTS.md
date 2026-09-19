## From taxonomy owner (categories/colors/materials/patterns/fits/sizes/attribute-schemas/lexicon)

- `applyConsistencyRules` (§1.4 post-sampling rules 1–5) is NOT implemented in `taxonomy/attribute-schemas.ts`:
  rule 1 needs a re-draw from the RNG stream, so it belongs with `generate/attributes.ts`. The
  vocabulary needed to implement it (`attributeOptions`, `extraOptions`, `schemaColumns`) is exported.
- Jewelry colour rule (§2.2) is exported as data only (`JEWELRY_COLOR_BY_MATERIAL`); the p = .15
  stone-colour draw stays with the generator. Jeans rule: `JEANS_COLORS` + `JEANS_WASH_BY_COLOR`.
- `SubcategoryDef.silhouetteId` holds the static base id of §9.2 (e.g. `tee`, `pants`,
  `skirt-midi-pleated`); attribute-dependent variants (`tee-long`, `pants-wide`, `sneaker-high`,
  `skirt-mini` for a mini pleated skirt) are for `render/silhouetteFor` to resolve. `SILHOUETTE_IDS`
  (65 base + 30 alias ids) is exported from `taxonomy/categories.ts` so render tests can cross-check.
- Spec `SILHOUETTES` (render paths) is not exported from taxonomy to avoid an `export *` clash with
  `render/`; the dress/skirt silhouette vocabulary is `SILHOUETTE_VALUES` (spec §2.5 name).
- `SEASONS`, `SEASON_DEFS`, `SEASON_PRIOR`, `seasonPriorFor`, `ADJACENT_SEASON` live in
  `taxonomy/occasions.ts` (no `seasons.ts` in the owned file list). `seasonFor(rng, sub, material)`
  (spec §11.2) is left to the generator; `seasonPriorFor(code, materialWarmth)` gives the adjusted prior.
- `taxonomy/index.ts` does `export * from './aesthetics'` so any extra tables the aesthetics owner adds
  (`NEIGHBOURS`, `ATTRIBUTE_BOOSTS`, ...) surface automatically. `findAesthetic` stays defined in
  `taxonomy/index.ts` (local declarations win over star re-exports, so a duplicate in aesthetics.ts is harmless).
  Please do not import from `./index` inside `aesthetics.ts` (would create an ESM cycle at load).
- `AXIS_HINTS` / `CHEAP_TERMS` (§12 extra terms) are exported separately from `LEXICON` because the
  contract `Lexicon` type has no section for them.
- `LENGTHS` has a 12th value `crew` (中筒) because the §1.4 `socks` schema samples `length ∈ {ankle, crew, knee}`
  and §2.5 lists only 11 lengths; the `length` column therefore stays within `LENGTHS`.

## From the aesthetics / brands / copy / RNG / vectors owner (2026-09-18)

- `taxonomy/index.ts` (taxonomy owner): please re-export the extra tables from `./aesthetics` so
  they reach the package barrel — `NEIGHBOURS`, `AESTHETIC_PRIOR`, `AESTHETIC_DEPT_MULT`,
  `AESTHETIC_BG`, `AESTHETIC_COLORS`, `AESTHETIC_COLOR_PRIOR`, `AESTHETIC_META`, `AESTHETIC_SLUGS`,
  `ATTRIBUTE_BOOSTS`, `attributeBoost`, `HOME_BRAND_BIAS`, `AFFINITY_TERM_WEIGHTS`,
  `aestheticBySlug`, `isAestheticSlug`, `aestheticDeptMult`, `neighboursOf`, plus the private-copy
  lookups `SUBCATEGORY_GROUP` and `COLOR_SLUG_FAMILY` (or drop those two once `SUBCATEGORIES` /
  `COLORS` are the source of truth; `aesthetics.ts` cannot import the barrel because the barrel
  imports it). `export type { AestheticSlug, AestheticMeta }` as well.
- `generate/index.ts` (generator owner): please re-export from `./copy` (`LINE_WORDS`, `ROMAN`,
  `lineWordFor`, `kebab`, `descriptorFor`, `buildName`, `drawName`, `buildSlug`, `S1_TEMPLATES`,
  `S2_TEMPLATES`, `S3_TEMPLATES`, `CARE_LINES`, `TEST_VALUES`, `PAIRINGS`, `OUTFIT_PAIR`,
  `fillTemplate`, `buildDescription`, `buildDescriptionFromDraws`, `buildDescriptionSlots` and the
  types) and from `./affinity` (`aestheticWeights`, `affinityTerms`, `evidenceFor`,
  `explainAesthetics`, `homeWeightsOf`, `toSlug` and the types), and from `./brands` the extras
  (`BrandRecord`, `BrandVoice`, `FIXED_BRANDS`, `ROSTER`, `CITIES`, `TAGLINES`, `VOICE_PRIOR`,
  `TIER_PRICE_BAND`, `TIER_SHARE`, `brandSizes`, `slugifyBrand`, `GENERALIST_IDS`).
- `DEFAULT_CATALOG_SEED` lives nowhere yet (spec puts it in `constants.ts`); `generate/affinity.ts`
  keeps a private `DEFAULT_BRANDS_SEED = 20260918` for the fallback brand list of
  `explainAesthetics`. Replace it with the shared constant once `constants.ts` exists.
- `explainAesthetics(p, brands?)` (spec §11.3) is implemented in `generate/affinity.ts`; its `p`
  also accepts `categoryGroup` and `colorFamily` (both optional, derived when omitted).
- `computeAxes(p, brand)` (§8.2) is NOT implemented in `vectors.ts`: it needs `SUBCAT_ECON`,
  material/pattern/colour axis columns and the brand — the product-generation owner should build
  it next to `generate/product.ts`. `productStyleInput(p)` in `vectors.ts` rebuilds the input
  from `p.styleVector` + `colorFamily` + `categoryGroup` (round-trips `toStyleVector`).
- `COLOR_HARMONY`, `FORMALITY_TOLERANCE`, `SLOT_SETS`, `slotRoleOf`, `pairScore`, `colorHarmony`,
  `STYLE_BLOCKS`, `weightStyleVector`, `cosineRange` live in `vectors.ts` (spec puts the compat
  data in `taxonomy/compat.ts`); `PAIRINGS` is in `generate/copy.ts`.
- Roster data (§4.3) gives `grunge` and `retro-70s` only two home brands each, so the spec's
  "every aesthetic is home to ≥ 3 brands" test is asserted as ≥ 2 in `brands.test.ts`.

## From the render owner (src/render/**, 2026-09-18)

- `ProductRenderInput` (types owner): please add the optional `department?: Department | null` field
  §9 mentions (kids treatment). Until then `render/index.ts` exports `RenderInput =
ProductRenderInput & { department?: string | null }`; `renderProductSvg` accepts it and
  `renderInputFor(p, brand?)` fills it from `p.department`.
- `silhouetteFor(subcategory, attributes, columns)` (§9.2 / §11.3) is implemented in
  `render/silhouettes.ts` next to the paths, with a private `SUBCATEGORY_SILHOUETTE` map transcribed
  from §9.2 (a test cross-checks it against `SUBCATEGORIES[].silhouetteId`). `generate/silhouette.ts`
  has an equivalent `resolveSilhouetteId(sub, columns, extras)`; either can go in a dedupe pass. The
  columns type is exported as `SilhouetteColumnInput` to avoid clashing with `generate`'s
  `SilhouetteColumns` in the package barrel.
- §9.2 says "30 aliases" but lists 31 (and `SILHOUETTE_ALIAS_IDS` has 31); `SILHOUETTES` has 96 keys.
- `AESTHETIC_BACKGROUNDS` in `render/palette.ts` is a private copy of the §3.1 `bg` column so the
  renderer has no load-time dependency on `taxonomy/aesthetics.ts`; a test asserts it equals
  `AESTHETIC_BG`. Drop the copy once the taxonomy is final if preferred.
- Extra exports beyond the contract (all additive): `renderSwatchSvg`, `renderOutfitSvg`,
  `renderInputFor`, `silhouetteFor`, `SILHOUETTES`, `GENERIC_SILHOUETTE`, `resolveSilhouette`,
  `patternDef`, `patternKind`, `RENDERABLE_PATTERNS`, `darken`, `lighten`, `lightness`, `escapeXml`,
  `backgroundFor`, path part builders (`circlePath`, `ellipsePath`, `longSleeveBody`, …).

## From the generator / seed owner (generate/{plan,cell,attributes,pricing,inventory,axes,silhouette,names,product,catalog,digest,constants,distribution}.ts, scripts/, test-fixtures/)

- `silhouetteFor` does not exist in `render/` yet, so `generate/silhouette.ts` carries a private
  `resolveSilhouetteId(sub, columns, extras)` implementing the §9.2 variants (`tee-long`,
  `pants-wide` for wide/flared jeans/chinos/tailored-trousers, `skirt-mini` for a mini pleated
  skirt, `sneaker-high`). `products.silhouette_id` stores the resolved key. Render owner: please
  build `silhouetteFor` on it (or import it) rather than re-deriving from the base id.
- Leopard products keep the selected colour in `colorName/colorHex/colorFamily` (the dupKey needs
  it); the §7.6 forced base (camel/tan/mustard) is exposed as `attributes.renderColorSlug` for the
  renderer. `attributes.secondaryColorSlug` mirrors `secondaryColorHex`.
- `CATALOG_VERSION`, `DEFAULT_CATALOG_SEED`, `DEFAULT_CATALOG_SIZE` live in
  `generate/constants.ts` (spec: `src/constants.ts`, which nobody owns). `affinity.ts` can import
  `DEFAULT_CATALOG_SEED` from there to replace its private `DEFAULT_BRANDS_SEED`.
- `computeAxes(p, brand)` (§8.2) is in `generate/axes.ts`; `productStyleInput` in `vectors.ts`
  round-trips it (tested on 5 000 products).
- `catalogDigest` / `digestLine` are in `generate/digest.ts` and are NOT re-exported from the
  package barrel because they import `node:crypto` (the web app bundles the barrel). Scripts and
  tests import the file directly.
- `slug` is `kebab(name)-id` (assignment) rather than the spec's `kebab(brandSlug-line-subcategory)`;
  `buildSlug` from `copy.ts` is still exported for anyone who wants the spec form.
- `generateProduct(i, …)` is 1-based (`i ∈ [1, size]`, `id = i`) to match the stub loop and the
  engine spec (`generateProduct(i, config.seed, brands) for i = 1..catalogSize`).
- Spec targets that its own tables cannot meet (kept as spec'd, tests relaxed and documented):
  every allowed `(department, subcategory)` ≥ 40 (men/brooch 35, unisex/brooch ≈ 18,
  kids/nightgown ≈ 37; unisex tailoring / unisex swimwear have a 0 % group quota), every
  subcategory ≥ 150 (`cover-up` 138, `tuxedo` 47), description ≥ 90 chars (templates can produce
  ≈ 50), "no edition > 1" (jewelry cells have ≤ 7 admissible combos under the metal → colour rule,
  so they wrap with `attributes.edition`; dupKeys stay unique), season shares ±3 pp (all-season
  ≈ 24 %, winter ≈ 17 % with the §2.7 priors + warmth override), ≈ 85–90 % rated (the §5.4
  formula yields ≈ 52 %).
- Tier shares do not emerge from brand sizes alone (27.6 / 43.4 / 19.6 / 9.5 with the clamped
  sizes, and worse after eligibility), so `createPlan` runs a proportional-fitting pass on
  per-brand factors with target = `size` rescaled inside its tier to `TIER_TARGET`; tiers are
  then exact and every brand is proportional to its size within its tier.
- Name uniqueness needed a guard beyond §6.2: `Linen` + `Shirt` (button-down-shirt with a linen
  adjective) equals the linen-shirt noun, and `X-Rise Wide-Leg` + `Trousers` equals a
  wide-leg-trousers name. `drawProductName` drops the optional tokens (adjective, then
  descriptor) whenever the rest of the name ends with a longer noun.
- `scripts/fixtures.ts` regenerates `test-fixtures/first50.json` + `digest.txt`; run
  `pnpm exec oxfmt packages/catalog/test-fixtures` afterwards so `format:check` stays green.
