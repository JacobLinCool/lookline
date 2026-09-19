# Requests from @lookline/sim

## 2026-09-18 — simulation owner

- **`AESTHETIC_AXIS_PRIOR` is not reachable through the engine barrel** (`src/constants` is not
  re-exported from `packages/engine/src/index.ts`), so `packages/sim/src/taste.ts` derives its own
  axis prior from the catalog `AestheticDef.axes` (trendiness / formality / boldness, 0.5 elsewhere).
  Re-export `src/constants` from the engine barrel and the sim copy can be deleted.
- **Engine-internal rows keep nanoid ids.** `createLook` / `recordPurchase` / `createAsk` /
  `answerAsk` take a deterministic `id` for the top-level row, but the interactions and feedback
  events they insert internally (`LOOK_CREATE`, `REMIX`, `INSPIRE`, `PURCHASE`, `BUY_FOR`, `ASK`,
  `ADVISE`, `STYLE`, `TOGETHER`, `look_create` / `purchase` / `ask_choice` feedback) get nanoid
  ids. The simulation's own direct writes use `ix_<seq>_<k>` / `fb_<seq>_<k>` / `is_<seq>` ids and
  every row has an explicit `createdAt`, so content is reproducible; only those internal ids are not.
  If the engine ever derives internal ids from the parent id (e.g. `${id}_lc`), the whole seed
  becomes byte-identical across runs.
- **`recordFeedback` cost.** Every non-impression event reloads all prior non-impression events of
  the user (`prior` query) — O(n) per event, O(n²) per user. Fine for ~200 events per persona, but
  it dominates the seed's wall time. A cached `(n, mass, lastAt)` per target on `users` would make
  the seed several times faster.
- **`remix` feedback** (§4.1, one row per source product with `kept`) is emitted by the sim after
  `createLook(kind: 'remix')` because `createLook` does not write it; the sim keeps one wearable
  source piece in ~60 % of remixes so `kept` is not always false.
- **`intent_sessions`** rows for persona searches are inserted directly by `src/sink/db.ts`
  (`parseIntentOffline` + `intentToVector`, provider `offline`) — there is no engine write path for
  a search session. If one appears, `recordSearch` in the db sink can call it instead.
- **Social clusters**: personas carry `users.socialCluster` (0–23, `CLUSTER_ARCHETYPES`) so
  `runAnalytics` keeps them; `lineage_stats.clustersReached` counts _taste_ clusters, which the
  trend seeds cross because the remixers come from clusters with distinct archetypes.
