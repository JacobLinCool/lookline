# Data model

Schema source of truth: `packages/db/src/schema.ts`. This page explains what each table means and
which engine owns it. All vectors are 64-d style vectors (see ARCHITECTURE.md).

## Catalog (owned by `@lookline/catalog`)

| Table            | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brands`         | Fictional labels with a price tier (`budget`, `mid`, `premium`, `luxury`), home aesthetics and departments, and a price multiplier.                                                                                                                                                                                                                                                                                                                                       |
| `articles`       | One purchasable item, keyed by H&M's own `article_id`. Attributes are denormalised (colour, material, pattern, print subject, fit, silhouette, length, neckline, sleeve, closure, occasions, seasons, aesthetics) plus `attributes` JSON for the construction details. `style_vector` is derived from those attributes. `image_path` is the R2 key of the real photograph. `popularity` is a static prior; `trend_score` is updated by analytics.                         |
| `article_vision` | What a multimodal model read off an article's photograph, kept verbatim, one row per article per `version`. The `articles` columns above are materialised from it, never written by the run, so a prompt fix re-runs the cheap half and an explanation can quote the evidence behind a tag. H&M recorded no aesthetic, silhouette, closure or print subject anywhere, so this is the only thing that fills them. See `docs/plans/2026-09-19-vision-attributes-design.md`. |

Indexes support the retrieval paths: department/group/price prefilter, FTS5 over
`prod_name || detail_desc || style_caption`, and the 64 REAL columns of `article_vectors`, over
which a cosine is a plain dot product SQLite evaluates per row.

## People (owned by `@lookline/web` for auth, `@lookline/engine` for vectors)

| Table          | Meaning                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`        | People. `is_persona` marks demo personas created by the simulation; `is_guest` marks accounts created from a share link. `preference_vector` is self-taste; `gift_preference_vector` is taste-of-people-around-me (learned from actions flagged `for_others`). `taste_cluster` is computed by k-means on preference vectors; `social_cluster` is assigned by the simulation and later by community detection. |
| `sessions`     | Cookie sessions.                                                                                                                                                                                                                                                                                                                                                                                              |
| `sim_personas` | Hidden ground-truth taste for simulated users, used only by the evaluation harness.                                                                                                                                                                                                                                                                                                                           |

## Commerce

| Table       | Meaning                                                                                                                                                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `purchases` | A bought item at a snapshot price. `for_kind` answers "Who is this for?" (`self`, `other`, `undisclosed`); `for_user_id`/`for_label` name the recipient when known. `source_look_id`, `source_interaction_id` attribute the purchase to the social object that caused it, which is how lineage conversion and downstream GMV are computed. |

## Looks — the social object (owned by `@lookline/engine` social module)

| Table               | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `looks`             | A digital edition: owner, style preset, generated image (`image_path` = R2 object key, null while only the on-demand poster exists; `image_status`, `image_provider`), derived `aesthetics`, `palette`, `style_vector`, optional `occasion`. `kind` is `edition` (from a purchase), `remix` (Make It Mine) or `together` (shared edition). `parent_look_id`, `root_look_id`, `depth` form the lineage tree. `visibility` defaults to `private`; `share_token` is the capability for `/l/[token]`. |
| `look_products`     | Products in a Look, with a role such as `top`, `bottom`, `shoes`, `outer`, `bag`, `accessory`.                                                                                                                                                                                                                                                                                                                                                                                                    |
| `look_participants` | People in a Together edition and the source Look each contributed.                                                                                                                                                                                                                                                                                                                                                                                                                                |

Temporary previews are deliberately outside the social Look graph:

| Table              | Meaning                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `previews`         | Owner-only, non-ownable generated images with a reference-photo asset, optional source Look, generation lease and 24-hour expiry.          |
| `preview_products` | Exact catalog products in a temporary preview. These rows do not create ownership, lineage, Look interactions or preference-training data. |

### Image generation lifecycle

Image generation state lives on `looks`: `image_generation_id` is the current worker's write
lease, `image_started_at` bounds its lifetime, and `image_error` explains a retryable failure.
`image_path` retains the composition or previous completed image while `image_status = pending`.
A worker publishes only while its generation ID and pending state still match; expired or cancelled
work cannot overwrite a newer visual. Apply migration `0002_look_generation.sql` before running
the asynchronous web flow.

## Social primitives

| Table           | Meaning                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interactions`  | The event log every graph is derived from. `type` is one of `VIEW, SEARCH, SAVE, DISMISS, SHARE, REACT, STYLE, REMIX, TOGETHER, INSPIRE, LOOK_CREATE, PURCHASE, BUY_FOR`. `actor` → `target` gives the direction; `look_id`/`product_id` give the object; `source_interaction_id` links a downstream action to the upstream one that caused it. |
| `relationships` | Derived, directed edges `a → b` of kind `inspired_by, styles, buys_for, shops_with, remixed` with time-decayed weights. Rebuilt by `runAnalytics`. An internal trust signal for recommendation: never shown as a public score, and never treated as friendship.                                                                                 |

## Engines

| Table                  | Meaning                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `intent_sessions`      | One "say it in one sentence" turn: utterance, parsed intent JSON, intent vector, result ids and explanations, provider and latency. Feedback events reference it so the bandit can attribute rewards.  |
| `feedback_events`      | Engine 03 training log: `kind` (`impression, click, save, dismiss, add_to_bag, purchase, remix, look_create`), numeric `reward`, `position`, `for_others`, and `context` (blend weights used, arm id). |
| `preference_snapshots` | Versioned copies of a user's preference vector with the top aesthetics, their confidence and evidence, so "the system learned X because of Y" is auditable and the improvement is plottable.           |
| `evaluation_runs`      | Results of `evaluatePreferenceLoop`: per-round series and summary metrics vs the static baseline.                                                                                                      |

## Trend analytics (owned by `@lookline/engine` trend module)

| Table                           | Meaning                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lineage_stats`                 | Per root Look: depth, nodes, unique people, clusters reached, shares, remixes, purchases, GMV, velocity (nodes per day), share→remix and remix→purchase rates.                                     |
| `trend_signals`                 | Per day × dimension (`aesthetic`, `category`, `color`, `silhouette`, `aesthetic_category`) × key: volume, velocity, cross-cluster spread, conversion, GMV, momentum, `emerging` flag and evidence. |
| `manufacturing_recommendations` | Ranked "開款 / 備料" suggestions (aesthetic × category group × colour family) with momentum, confidence, projected demand, rationale and evidence, for the manufacturing view on `/trends`.        |

## Personas, wardrobe and collectible cards (owned by `@lookline/engine` cards module)

Two decisions shape this whole group, both forced by D1 having no transactions.

**Holding is never stored on a card.** A card names its persona, a collection copy names its
beneficiary persona, and a persona names the account that currently manages it. Handing a persona
to another account is therefore one `UPDATE personas` — there is no second row a partial failure
could leave behind, so a set of cards can never end up half-transferred. What a card records about
its own making (author, articles worn, owned ratio, tier, verification code, edition number) is a
snapshot taken at issue time and is never rewritten when the persona changes hands.

**Credits are a ledger, never a counter.** The balance is `sum(delta)`; nothing caches it. Every
row carries a unique `operation_key`, so a replayed checkout or a retried reservation collides on
the index instead of counting twice, and the caller reads back the first result. Reserving is a
single `INSERT … SELECT … WHERE balance >= 1`, which is why two sessions racing for the last credit
cannot both take it.

| Table                   | Meaning                                                                                                                                                                                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `personas`              | A card's subject — a real person photographed or an avatar — not a login. `owner_user_id` is who may act for it now; `version` is bumped on every ownership change so a transfer can be validated against what it read. `reference_path` is private and never exposed by sharing a card. |
| `persona_transfers`     | An offer of a persona to a registered account, with the persona version it was written against. A partial unique index allows at most one `pending` offer per persona. Acceptance checks recipient, expiry and version.                                                                  |
| `wardrobe_entitlements` | What a confirmed purchase line put in the wardrobe: article, variant, quantity and owner. Unique on `purchase_id`, so a repeated checkout grants nothing further. Every purchase enters the wardrobe whatever it cost — price only decides credits.                                      |
| `wardrobe_loans`        | A friend may dress their personas in this article. Lending copies no entitlement and creates no credits; a partial unique index allows one `active` loan per entitlement and borrower.                                                                                                   |
| `credit_ledger`         | Every credit movement: `grant` (+3 per qualifying unit), `reserve` (−1), `settle` (0, the audit line for what a reservation bought), `release` (+1). Each row records the `rule_version` that decided it and a unique `operation_key`.                                                   |
| `card_sessions`         | One reserved credit being spent. Persona and articles are snapshotted at open time so a finished card cannot claim a subject or clothes it was not made from. Holds at most `max_candidates` (4).                                                                                        |
| `generation_attempts`   | One call to the image provider, kept whether it succeeded or failed, so a retry budget can count failures.                                                                                                                                                                               |
| `card_candidates`       | A picture the session may still choose from, numbered 1..4 within the session. Any one of them can become the card.                                                                                                                                                                      |
| `cards`                 | An issued personal card: the chosen candidate, its persona, the author, the article snapshot with each article's source, the owned ratio and tier at issue, and a stable verification code.                                                                                              |
| `collections`           | A grouping of personal cards that can be issued together as one multi-person artwork.                                                                                                                                                                                                    |
| `collection_members`    | Which personas take part and which of their personal cards they bring. Keyed by `(collection_id, persona_id)` — three personas on one account are three members, not one.                                                                                                                |
| `collection_editions`   | One artwork made from one credit, with `edition_size` = the number of participating personas at issue time.                                                                                                                                                                              |
| `card_copies`           | One persona's numbered share of an edition (`edition_number` of `edition_size`), with its own verification code. Unique per `(edition, number)` and per `(edition, beneficiary)`, so a persona holds exactly one copy and transferring one persona moves exactly that copy.              |

## Home discovery and explicit sharing

`friendships` stores one ordered pair, its requester and pending/accepted state. Only the invited
participant may accept. `activity_sharing` stores explicit purchase-sharing consent (off by default).
`recent_article_views` materializes each user's latest actual VIEW per article for indexed recent
history. Finalized `cards.visibility` is private/link/public, default link; current persona ownership
controls changes. Discovery only includes public finalized cards from accepted friends.
See [Home discovery](specs/HOME_DISCOVERY_SPEC.md) for ranking, bounded query costs and migration.
