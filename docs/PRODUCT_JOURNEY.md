# Product journey

## Product contract

Lookline turns a real fashion catalog into explainable discovery, temporary Previews and durable
Cards. `outfit` is a description of selected clothing, not a stored social object.

1. Physical catalog truth comes first. Images may not invent a purchasable article or variant.
2. A Preview is temporary and non-ownable.
3. A Card is the sole shareable visual artifact and contains immutable article provenance.
4. A Collection Edition uses explicit membership and the same Card creation controls.
5. Private activity stays private. Social evidence requires an accepted friendship and explicit
   sharing, or a public Card.

## Journey A — Discover and preview

1. A person describes what they need in natural language.
2. The product shows relevant articles with a concise, grounded explanation.
3. The person can refine constraints, inspect an article and preview it.
4. The Preview remains visibly non-ownable and linked to exact article data.
5. Save, dismiss, bag and purchase actions create canonical feedback only.

## Journey B — Create a personal Card

1. The person opens Studio and chooses a persona and entitled articles.
2. They select what to emphasize, a pose and a scene. Each defaults to `auto`.
3. They may add up to 160 characters of visual direction; there is no free-form provider prompt.
4. The first candidate uses the session direction.
5. “Next shot” is prefilled with the preceding attempt and affects only the next attempt.
6. Every candidate shows its actual resolved focus, pose and scene.
7. The person selects one candidate and chooses private, link or public visibility.

For `auto`, the system uses article features, participant count and candidate ordinal to choose a
reproducible direction. Consecutive candidates vary naturally without changing identity or garments.

## Journey C — Create a Collection Edition

1. A Collection member starts an Edition with accepted members and consented personas.
2. Members' wardrobe entitlements determine which articles are available.
3. The same art-direction controls and validation used by personal Cards apply.
4. Walking, seated, turn and dynamic directions become group compositions with varied poses and
   readable silhouettes.
5. A selected candidate issues the Edition and participant copies according to membership rules.

## Journey D — Preview from a Card

1. A person opens a Card they own, hold, or may view through link/public visibility.
2. “Use this outfit in a Preview” opens `/previews/new?card=<id>`.
3. The server rechecks access and loads the immutable article snapshot.
4. A revoked loan or newly private Card immediately blocks unauthorized use.

## Journey E — Purchase and explicit sharing

1. A Card-attributed product visit carries `card=<id>` through bag and checkout.
2. The resulting purchase stores `source_card_id` when attribution is valid.
3. Purchases remain private unless the owner enables activity sharing.
4. Recommendations to friends may use only shared purchases and public Cards.

## Journey F — Operational demand

1. `/trends` aggregates searches, intent results, feedback, purchases and Card creation.
2. The dashboard shows demand momentum, conversion, breadth and GMV by fashion dimension.
3. Manufacturing suggestions cite the canonical evidence that produced them.
4. No inferred trust, private save or social-propagation metric participates.

## State contract

| Object             | States                                 |
| ------------------ | -------------------------------------- |
| Preview            | pending → ready/failed → expired       |
| Card session       | open → settled/cancelled/expired       |
| Generation attempt | pending → succeeded/failed             |
| Card               | issued; visibility private/link/public |
| Loan               | active → revoked                       |
| Collection invite  | pending → accepted/declined            |

## Routes

- `/shop`, `/p/[id]`: discovery and article detail.
- `/previews/new`, `/previews/[id]`: temporary Preview flow.
- `/studio`, `/studio/[id]`: personal Card creation.
- `/cards/[id]`: Card detail and Card-derived Preview entry.
- `/collections/[id]`: membership and Collection Edition creation.
- `/me`: Wardrobe, Cards, Collections, Friends and sharing settings.
- `/trends`: canonical demand dashboard.
- `/admin`: internal ontology and provider diagnostics.
