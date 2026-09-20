# Runtime contracts

## Authority

- `packages/db/src/schema.ts` defines persistence types and enums.
- `packages/engine/src` owns deterministic domain behavior.
- `apps/web/src/server` owns authentication, authorization and provider orchestration.
- Public pages never trust hidden fields for ownership, visibility, snapshots or credits.

## Environment and storage

Node scripts call `loadEnv()` from `@lookline/db/node`. Workers read configured bindings and vars.
Generated Card images, Preview images and persona photos live in R2; database rows store their exact
object keys. A successful API state is never fabricated when a provider or persistence operation
fails.

## Intent and recommendation

Intent parsing returns typed constraints, assumptions and clarification state. Local deterministic
parsing remains available, while configured text providers may enrich results within their deadline.
Recommendation explanations may cite only evidence supplied to the renderer.

Social recommendation context is canonical:

- connection: accepted friendship;
- activity: purchase with sharing enabled;
- artifact: public Card;
- excluded: private saves, inferred trust and hidden activity.

## Card art direction

The server parses all fields against exported enum constants. Notes are trimmed, limited to 160
characters and rejected when they attempt to replace identity, garments, ownership, permissions or
provenance. Choosing a custom pose or scene requires a note.

All `auto` fields are resolved before the attempt transaction. Resolution is deterministic for the
article IDs, subject count and candidate ordinal. A later control change cannot mutate an earlier
attempt.

Prompt order is fixed:

1. subject identity and garment fidelity;
2. visual focus;
3. pose or group composition;
4. scene;
5. safety and negative constraints.

The note is serialized as untrusted visual text and is limited to mood, composition, light and body
language.

## Preview from Card

`?card=<id>` is resolved on the server. Private Cards require author or current holder access; link
and public Cards are viewable. The Preview copies the Card's immutable article snapshot. It never
reconstructs the outfit from current catalog search results.

## Analytics

`runAnalytics` is idempotent for materialized demand outputs. Inputs are intent results, canonical
feedback, purchases and Card snapshots. Outputs are demand signals and manufacturing suggestions.
No hidden social graph is built.

## Maintenance

`pnpm storage:cleanup-looks` lists obsolete keys beneath the exact historical prefix. It is a dry run
unless `--apply` is provided, prints the selected environment and bucket, and reports the number of
listed and deleted objects.
