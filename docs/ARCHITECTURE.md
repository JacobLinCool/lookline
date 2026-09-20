# Architecture

Lookline is a fashion discovery and Card-creation product. Physical catalog articles are the source
of truth. A Preview helps someone evaluate an article before buying; a Card is a durable visual
composition with an immutable article snapshot; a Collection Edition combines multiple accepted
members in one composition.

## System boundaries

- `apps/web`: Next.js 16 App Router UI and route handlers, deployed through vinext to Cloudflare.
- `packages/catalog`: taxonomy, deterministic catalog generation and article assets.
- `packages/db`: Drizzle schema, migrations and SQLite/D1 adapters.
- `packages/engine`: intent parsing, retrieval, ranking, preference learning, imagery, Card creation
  and demand analytics.
- `packages/sim`: deterministic canonical-data simulation and evaluation.

The web application owns authentication, authorization, request validation and provider lifecycle.
The engine owns deterministic domain rules. The database package is the only schema authority.

## Core flows

### Discovery and purchase

1. Natural language is compiled into typed constraints and soft preferences.
2. Retrieval applies hard constraints, vector similarity and canonical social evidence.
3. A user can save, dismiss, add an article to the bag, preview it or purchase it.
4. Purchase attribution may reference a Card through `purchases.source_card_id`.

### Preview

A Preview is temporary and non-ownable. It records an immutable article snapshot and may reference
an accessible Card through `previews.source_card_id`. The server accepts a source Card only when it
is public, link-visible, owned by the viewer, or currently held by the viewer. The Card snapshot—not
live catalog state—is used to create the Preview.

### Card creation

1. The user chooses a persona and wardrobe entitlements.
2. The client submits structured `CardArtDirection`; arbitrary provider prompts are never exposed.
3. A `card_session` stores initial direction. Every `generation_attempt` stores the complete resolved
   direction used for that candidate.
4. The image provider receives identity and garment constraints first, followed by focus, pose,
   scene, then safety and negative constraints.
5. Selecting a successful candidate issues a Card with immutable participant and article snapshots.

Collection Editions use the same lifecycle. Group poses are composed as distinct complementary body
language, not duplicated solo poses.

## Trust and privacy

- Social retrieval starts from accepted friendships only.
- Only explicitly shared purchases and public Cards are social recommendation evidence.
- Private saves, impressions and inferred connections never create social edges.
- Reference photos and private Cards are owner- or holder-only.
- Authorization is enforced on the server for sessions, Cards, loans, previews and candidates.

## Demand analytics

`/trends` is an operational demand dashboard. `runAnalytics` reads only intent results, feedback,
purchases and Card article snapshots. It produces daily `trend_signals`, article trend scores and
manufacturing recommendations. It does not model social propagation.

## Storage and providers

Cloudflare R2 stores generated Card images, Preview images and persona photos. The database stores
object keys and generation state. OpenAI or Gemini may provide text and image generation; offline
rendering is used only where the product explicitly supports deterministic previews, never to claim
a successful provider result.

Obsolete objects under the exact `looks/` storage prefix are removed with
`pnpm storage:cleanup-looks`. The command is dry-run by default and requires `--apply` to delete.

## Verification

Changes must pass formatting, lint, TypeScript and test gates. Schema changes also need migration
tests. User-facing changes require accessible controls, desktop/mobile inspection and the design-rule
detector.
