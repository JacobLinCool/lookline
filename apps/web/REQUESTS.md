## W2 shop (catalog browse + product page)

- `/p/[id]` links "Which one fits me better? Ask a friend" to `/asks/new?products=<productId>`
  (as specified in the assignment). Whoever owns Asks: please serve that route and read the
  repeatable/comma-separated `products` param as the A/B option product ids.
- `addOutfitToBagAction` (src/server/actions/shop.ts) adds outfit items with `size: null`. The bag
  page should let the visitor pick a size for lines without one before checkout.
- UI kit suggestion: `ProductCard` could accept a `chipHref` (slug → href) so aesthetic chips on
  cards link to `/shop?aesthetics=<slug>` like they do on the product page. Not required.
- `/shop` reads `AESTHETICS` from `@lookline/catalog`; while it is empty the aesthetic rail falls
  back to `facets.aesthetics` from `searchProducts`. Once the taxonomy lands, no change is needed.

## W1 say-it (Engine 01+02 demo page `/`)

- **Impression double-logging (engine owner).** `docs/specs/ENGINE_SPEC.md` §2.4 says `recommend()`
  logs one `impression` feedback event per shown item itself. My assignment also records
  impressions for the top 12 items from `src/server/intent.ts` (`recommendFor`) via
  `recordFeedbackFor`. Once `recommend` lands, one of the two should be dropped — I suggest the
  page keeps its call (it knows the signed-in user and `forOthers`) and `recommend` logs only when
  `req.userId` is set and the caller passes an opt-in, or the reverse; tell me which and I will
  remove mine.
- **`getLlm().textModel` for the "understood by <model>" line.** The intent card wants the model
  name, but `IntentResult` only carries `provider`. I call `getLlm().textModel` in a try/catch as a
  hint; an optional `model?: string` on `IntentResult` would be cleaner.
- **Bag helper for multiple lines (shell owner, optional).** `addOutfitToBagAction` calls
  `addToBag` once per product sequentially and relies on `cookies().set()` being visible to the
  next `cookies().get()` within the same server action. An `addManyToBag(lines)` helper in
  `src/server/bag.ts` that reads and writes the cookie once would remove that dependency.
- **`/p/[id]` click logging (product owner).** Product links from `/` carry
  `?from=<intentSessionId>&pos=<n>`; please record a `click` feedback event with
  `intentSessionId = from`, `position = pos` when a signed-in user lands there.
- **`/asks/new` (Ask owner).** Outfit cards link to `/asks/new?products=<comma ids>&from=<intentSessionId>`.

## W3a commerce + look creation (bag, checkout, /looks/new, /looks/[id])

- **Purchase attribution cookies.** `/checkout` reads `?look=`, `?ask=`, `?from=` (intent session id)
  and falls back to the cookies `ll_source_look`, `ll_source_ask`, `ll_intent_session` (constants
  exported from `src/server/looks.ts`). The Look page sets `ll_source_look` when a product is added
  from the strip (`addFromLookAction`). Ask (W3b) and Home (W1) agents: set `ll_source_ask` /
  `ll_intent_session` from your own actions, or link to `/checkout?ask=<id>` / `/checkout?from=<id>`.
- **`addToBagAction` cannot carry a source Look** (fields: productId, size, qty, redirect). I did
  not change it; the Look page uses its own `addFromLookAction` (`src/server/actions/looks.ts`)
  which also records an `add_to_bag` feedback event with `lookId`. Product page (W2) could accept a
  `?from=look:<id>` and call the same action if attribution from `/p/[id]` is wanted.
- **`@lookline/engine` `STYLE_PRESETS` is empty.** `/looks/new` and the Look page handle it (Notice,
  default slug `editorial` via `DEFAULT_STYLE_PRESET`/`resolveStylePreset` in `src/server/looks.ts`).
  `presetName(slug)` there is the helper other pages can pass as `LookCard.presetLabel`.
- **Reusable pieces for `/l/[token]` (W3b/W4):** `LookProductStrip` (`src/components/looks/look-product-strip.tsx`),
  `ShareButton` (`src/components/looks/share-button.tsx`, calls `shareLookAction`),
  `Flash` (`?notice=`/`?error=` → Notice), `OrderLines`. Import freely; do not edit.
- **Owner photos** are stored in R2 at `photos/<userId>.<ext>` with `users.photoPath =
'photos/<userId>.<ext>'`; `loadStoredPhoto(photoPath)` returns a `ReferencePhoto` for remix /
  together pages calling `createLookWithImage`.
- Suggestion for the UI kit owner: `Button` with `variant="link"` ignores `size`; a `size="sm"`
  link variant would help dense action rows.
- FYI (not mine): `pnpm lint` currently fails on `src/components/social/share-link.tsx:20`
  (`react/set-state-in-effect`); every other file passes.

## W4 me + trends (wardrobe, preference profile, Trend Maker dashboard, lineage)

- `/me` links each sent/received Ask to `/asks/<id>` (open) and `/a/<shareToken>` (share card).
  Whoever owns the Ask pages: please keep `/asks/[id]` as the canonical Ask route, or tell me
  the real path.
- `/me` "Create edition" links to `/looks/new?purchases=<purchaseId>`; the Look-creation page
  should pre-select that purchase's product.
- The Look page (`/looks/[id]`) should link to `/looks/[id]/lineage` ("See the tree"); the lineage
  page applies the same visibility rule (private and not owner → 404) and expects the Look page
  to do the same.
- `LookCard` gets `presetLabel` from `STYLE_PRESETS` once the engine fills it; `/me` and `/trends`
  currently rely on the humanised slug fallback.
- Engine (optional contract additions, not required): `PreferenceProfile.bandit` could carry the
  current arm and the spec's reason string ("social-led — friends' picks converted for you 3 of
  4 times") so the profile card can show it; `preference_snapshots.metrics.confidence` /
  `cosToPrevious` are what the snapshot timeline plots (falls back to `mass`).
- `/trends/manufacturing.csv` (route handler under my `src/app/trends/**`) is the CSV export the
  spec calls `/api/trends/manufacturing.csv`; if an `/api/trends/*` namespace is created later,
  a redirect from there is enough.

## W3b social primitives (share view, Ask, Make It Mine, Together)

- **Engine (`createAsk` / `answerAsk` / `createLook`)** — the web layer ensures the person-to-person
  edges itself, deduplicated by (actor, type, look/ask, target, product) through
  `ensureInteraction` in `src/components/social/data.ts`: `ASK` (asker → target, askId) after
  `createAsk`; `ADVISE` (responder → asker, askId, productId) after `answerAsk` for kind
  `choose`; `STYLE` (responder → asker, askId, lookId) after `answerAsk` for kind `style_me`;
  `STYLE` (creator → recipient, lookId) after a `?for=<userId>` remix; `REACT`, `VIEW`, `INSPIRE`
  (viewer → owner) on `/l/[token]`. If the engine also writes ASK/ADVISE/STYLE inside
  `createAsk`/`answerAsk`, the web write is a no-op as long as the engine sets the same
  `askId`/`targetUserId`; please keep those fields populated. `INSPIRE` is only written once per
  viewer per Look when the visitor arrived via `?via=<userId>`, `?from=<lookId>`, or a Look page
  referrer — if `createLook` writes INSPIRE for remixes too, that is a different (remix) edge and
  fine.
- **Engine (`suggestRemix`)** — the remix page passes `budget` from `?budget=` and renders
  `items[].role` as the tile badge and `items[].explanation` through `FactorBreakdown` ("why this
  instead"). `keptAesthetics`/`palette` render as chips + swatches; `palette` entries may be hex
  (`#…`) or colour-family slugs (both handled).
- **Engine (`STYLE_PRESETS`)** — while empty, the remix/together/style-me forms keep the source
  Look's preset (read-only input) and `answerStyleMeAction` falls back to `'editorial'`. No change
  needed; presets appear automatically once the list is filled.
- **Look studio (`createLookWithImage`)** — Together passes `participantIds` but
  `CreateLookInput` has no per-participant `sourceLookId`, so `look_participants.source_look_id`
  cannot be filled from the web. Suggest an optional `participants?: Array<{ userId; sourceLookId? }>`
  field on `CreateLookInput` (additive); the together action already knows each contribution's
  Look id (`src/server/actions/together.ts`, `contributions[]`).
- **Bag / product page owners** — "Add the chosen one to bag" on `/asks/[id]` submits
  `addToBagAction` with `redirect=/asks/<id>?bag=1` and links the product as `/p/<id>?ask=<askId>`;
  `/l/[token]` links products as `/p/<id>?look=<lookId>&via=<ownerId>`. Please carry `ask` /
  `look` through to checkout so `recordPurchase` gets `sourceAskId` / `sourceLookId` (lineage
  conversion and downstream GMV depend on it). The bag cookie has no attribution field; a
  `ll_attrib` cookie or hidden fields on `/bag` → `/checkout` would do.
- **Look page owner (`/looks/[id]`)** — the four actions link to: Ask `/asks/new?look=<id>`,
  Make It Mine `/looks/<id>/remix`, Together `/looks/<id>/together`, Share `/l/<shareToken>`.
  "Style <owner>" from a shared card is `/looks/<id>/remix?for=<ownerId>`.
- **Shared actions file** — the shared-Look `reactToLookAction` lives in
  `src/server/actions/remix.ts` (the only owned action file that fits the `/l/[token]` → remix
  flow). If a `src/server/actions/share.ts` is preferred, it is a one-function move.
