# Data model

`packages/db/src/schema.ts` is authoritative. SQLite/D1 migrations are append-only and are verified
from a fresh database.

## Catalog and identity

| Table                                                   | Purpose                                                                |
| ------------------------------------------------------- | ---------------------------------------------------------------------- |
| `brands`, `articles`, `article_vision`, `type_affinity` | Canonical purchasable catalog, visual features and compatibility data. |
| `users`, `sessions`                                     | People and signed-cookie sessions.                                     |
| `friendships`                                           | Explicit friendship requests and accepted connections.                 |
| `activity_sharing`                                      | Per-user opt-in for sharing purchase activity.                         |

## Commerce and feedback

| Table                                  | Purpose                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `purchases`                            | Purchased article, price snapshot, recipient meaning and optional `source_card_id`.                                       |
| `intent_sessions`                      | Original utterance, structured intent, assumptions, results and provider trace.                                           |
| `feedback_events`                      | Canonical `impression`, `click`, `save`, `dismiss`, `add_to_bag` and `purchase` events; may reference an article or Card. |
| `preference_snapshots`, `bandit_state` | Learned preference state and experimentation state.                                                                       |

## Preview

| Table              | Purpose                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `previews`         | Temporary owner-scoped image, immutable source snapshot, expiry and optional `source_card_id`. |
| `preview_articles` | Ordered articles used by the Preview.                                                          |

A Card-derived Preview uses the Card's immutable article snapshot. Removing an article from the live
catalog cannot change the source composition.

## Card creation

| Table                                                     | Purpose                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `personas`, `persona_transfers`                           | User-controlled visual identity and consented transfer state.                       |
| `wardrobe_entitlements`, `wardrobe_loans`                 | Articles a user may place in a Card and revocable loans.                            |
| `credit_ledger`                                           | Append-only generation credit accounting.                                           |
| `card_sessions`                                           | One personal or Collection creation session, including initial `art_direction`.     |
| `generation_attempts`                                     | One candidate-generation request with a complete `art_direction` snapshot.          |
| `card_candidates`                                         | Generated outputs and provider provenance for an attempt.                           |
| `cards`                                                   | Issued visual artifact with immutable participant/article snapshots and visibility. |
| `collections`, `collection_members`, `collection_invites` | Explicit membership and consent.                                                    |
| `collection_editions`                                     | Collection-scoped creation context.                                                 |
| `card_copies`                                             | Issued copies belonging to collection participants.                                 |

`CardArtDirection` has four fields:

```ts
type CardArtDirection = {
  focus: 'auto' | 'silhouette' | 'layering' | 'fabric-motion' | 'pattern-detail' | 'accessories'
  pose: 'auto' | 'standing' | 'walking' | 'turn' | 'seated' | 'dynamic' | 'custom'
  scene: 'auto' | 'studio' | 'street' | 'architecture' | 'interior' | 'nature' | 'stage' | 'custom'
  note: string | null
}
```

The note is at most 160 characters and may describe only visual direction. Every `auto` value is
resolved deterministically before an attempt is inserted, so the row is a complete audit record.

## Demand operations

| Table                             | Purpose                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `trend_signals`                   | Daily demand signals by fashion dimension with volume, breadth, conversion, GMV and evidence. |
| `manufacturing_recommendations`   | Ranked develop/watch recommendations derived from canonical demand.                           |
| `search_trends`, `home_trend`     | Search aggregation and home-page trend materialization.                                       |
| `evaluation_runs`, `sim_personas` | Reproducible offline evaluation only.                                                         |

## Hard-cut migration

The migration removes all obsolete social-graph tables, enum values and foreign keys. Existing
Cards, Collections, purchases and previews remain. Previous Preview provenance is cleared rather
than converted. Existing unfinished Card sessions receive all-`auto` art direction.
