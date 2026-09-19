# Latency verification — 2026-09-18

The prototype now separates ordinary interaction, usable deterministic results and optional AI
completion. The acceptance contract is [LATENCY_SPEC.md](specs/LATENCY_SPEC.md). The results below
are local checks, not production SLA evidence.

## Implemented behavior

- Bag additions, whole-outfit additions, Save / Dismiss, Look reactions and Ask forms provide local
  feedback before persistence finishes. Rejected writes expose a retry; outfit additions commit all
  bag lines together. Ask confirmations do not claim delivery before the server accepts the action.
- Recommendations stream parsed constraints and deterministic ranked products first. Optional AI
  refinement requires an explicit apply action. New queries cancel older requests; direct query
  URLs work under React Strict Mode. Impression and preference writes run after the response.
- The remix editor exposes the source pieces while independent suggestions load. Late suggestions
  are unselected and cannot replace the user's choices.
- Look creation saves a real product composition before image generation. Rendering has one 25 s
  provider budget; text enrichment has one 3.5 s budget across providers. The canvas retains its
  visual during rendering and decodes a replacement before displaying it.
- Generation IDs guard persisted completion. Repeated starts reuse the active job; cancelled or
  expired work cannot replace the saved image. An interrupted worker becomes retryable on the next
  status read. Migration `0002_look_generation.sql` has been applied to the local database.

## Browser evidence

Local Chrome, 1440×1000 viewport, reduced motion enabled, localhost without network throttling,
Next.js development mode, seeded catalog of 100,000 products. Browser milestones use monotonic time
and two animation frames after the state update. The artifact is
`output/playwright/latency-measurements.json` (generated and ignored).

| Milestone                                | Samples |  Median | p95 / max | Within target |
| ---------------------------------------- | ------: | ------: | --------: | ------------: |
| First meaningful recommendation progress |       2 | 51.6 ms |   62.4 ms |           2/2 |
| First usable recommendation              |       2 | 86.1 ms |   95.7 ms |           2/2 |
| Optimistic bag state painted             |       2 | 28.3 ms |   31.4 ms |           2/2 |

These are tiny warm local samples. One query came from a submit and one from a direct URL (the
latter starts its trace after hydration). Navigation, cold mobile devices and adverse networks
are not covered by those numbers. Mocked stale-query samples are excluded from the table.

The bag write was delayed 1.5 s and rejected: the UI restored retry without losing the form.
The next real write persisted exactly one product. An older delayed query could not replace the
newest query. There were no browser runtime errors.

The image browser check used a real saved Look and stubbed generation responses; it verified
retained visuals, independent controls, cancellation, retry and replacement after image decode.
It did not call a paid image provider or establish a real-provider 30 s success rate. Its assertions
are saved in `output/playwright/edition-checks.json`.

## Remaining acceptance gaps

Both measured text enrichment calls had a roughly 3.5 s gap after usable results appeared. The
telemetry correctly marked a progress violation. Structured text and image adapters currently
provide complete outputs, so continuous meaningful updates every 800 ms are not yet satisfied
during provider work. The usable initial result remains interactive throughout that gap.

The 30 s image target is bounded failure handling, not a guarantee that a remote provider will
produce a successful image in time. Cross-navigation creation timing, throttled mobile runs and
broad per-route latency distributions remain unmeasured. Native filter / selection controls retain
immediate selection feedback, but catalog refresh timing is not certified here.

## Reproduce

- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm --filter @lookline/web build`.
- `LOOKLINE_DB_TEST=1 pnpm --filter @lookline/web exec vitest run src/server/look-generation.db.test.ts`:
  temporary fixture rows test composition-before-provider, duplicate job suppression, stale-result
  rejection, successful retry and expired leases. Fixtures and their files are removed afterward.
- With the seeded app running: `pnpm exec tsx scripts/qa/latency-browser.ts` and
  `pnpm exec tsx scripts/qa/edition-browser.ts`. `QA_BASE_URL` selects another local server. The image
  check creates and removes its own session; provider transport is stubbed.

Unit tests also cover total provider budgets, propagated cancellation, late completion, synchronous
adapter failure, split UTF-8 stream chunks and truncated streams. Existing catalog, engine and
simulation tests remain part of the regression gate.
