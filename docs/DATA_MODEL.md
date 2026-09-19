# Data model

Schema source of truth: `packages/db/src/schema.ts`. This page explains what each table means and
which engine owns it. All vectors are 64-d style vectors (see ARCHITECTURE.md).

## Catalog (owned by `@lookline/catalog`)

| Table      | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `brands`   | Fictional labels with a price tier (`budget`, `mid`, `premium`, `luxury`), home aesthetics and departments, and a price multiplier.                                                                                                                                                                                                                                                                                                                    |
| `products` | One purchasable item. Attributes are denormalised (colour, material, pattern, fit, silhouette, length, neckline, sleeve, closure, occasions, seasons, aesthetics) plus `attributes` JSON for subcategory-specific extras. `style_vector` is derived from those attributes. `image_seed` and `silhouette_id` drive the SVG renderer; `hero_image_url` is an optional real image. `popularity` is a static prior; `trend_score` is updated by analytics. |

Indexes support the retrieval paths: department/group/price prefilter, aesthetics GIN, full-text
(`to_tsvector('simple', name || description)`), trigram on `name`, and HNSW cosine on `style_vector`.

## People (owned by `@lookline/web` for auth, `@lookline/engine` for vectors)

| Table          | Meaning                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`        | People. `is_persona` marks demo personas created by the simulation; `is_guest` marks accounts created from a share link. `preference_vector` is self-taste; `gift_preference_vector` is taste-of-people-around-me (learned from actions flagged `for_others`). `taste_cluster` is computed by k-means on preference vectors; `social_cluster` is assigned by the simulation and later by community detection. |
| `sessions`     | Cookie sessions.                                                                                                                                                                                                                                                                                                                                                                                              |
| `sim_personas` | Hidden ground-truth taste for simulated users, used only by the evaluation harness.                                                                                                                                                                                                                                                                                                                           |

## Commerce

| Table       | Meaning                                                                                                                                                                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `purchases` | A bought item at a snapshot price. `for_kind` answers "Who is this for?" (`self`, `other`, `undisclosed`); `for_user_id`/`for_label` name the recipient when known. `source_look_id`, `source_ask_id`, `source_interaction_id` attribute the purchase to the social object that caused it, which is how lineage conversion and downstream GMV are computed. |

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

| Table           | Meaning                                                                                                                                                                                                                                                                                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `asks`          | "Which fits me better?" (`choose`, with `option_product_ids`) or "Style me" (`style_me`, with a budget/occasion). `share_token` powers `/a/[token]`; `target_user_id` is set when sent to a specific person.                                                                                                                                                          |
| `ask_responses` | A reply: a chosen product, a styled Look, and/or a comment. Responders may be guests (`responder_name`).                                                                                                                                                                                                                                                              |
| `interactions`  | The event log every graph is derived from. `type` is one of `VIEW, SEARCH, SAVE, DISMISS, SHARE, REACT, ASK, ADVISE, STYLE, REMIX, TOGETHER, INSPIRE, LOOK_CREATE, PURCHASE, BUY_FOR`. `actor` → `target` gives the direction; `look_id`/`product_id`/`ask_id` give the object; `source_interaction_id` links a downstream action to the upstream one that caused it. |
| `relationships` | Derived, directed edges `a → b` of kind `asks, trusts, inspired_by, styles, buys_for, shops_with, remixed` with time-decayed weights. Rebuilt by `runAnalytics`. Never shown as a public score.                                                                                                                                                                       |

## Engines

| Table                  | Meaning                                                                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `intent_sessions`      | One "say it in one sentence" turn: utterance, parsed intent JSON, intent vector, result ids and explanations, provider and latency. Feedback events reference it so the bandit can attribute rewards.              |
| `feedback_events`      | Engine 03 training log: `kind` (`impression, click, save, dismiss, add_to_bag, purchase, ask_choice, remix, look_create`), numeric `reward`, `position`, `for_others`, and `context` (blend weights used, arm id). |
| `preference_snapshots` | Versioned copies of a user's preference vector with the top aesthetics, their confidence and evidence, so "the system learned X because of Y" is auditable and the improvement is plottable.                       |
| `evaluation_runs`      | Results of `evaluatePreferenceLoop`: per-round series and summary metrics vs the static baseline.                                                                                                                  |

## Trend analytics (owned by `@lookline/engine` trend module)

| Table                           | Meaning                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lineage_stats`                 | Per root Look: depth, nodes, unique people, clusters reached, shares, asks, remixes, purchases, GMV, velocity (nodes per day), share→remix and remix→purchase rates.                               |
| `trend_signals`                 | Per day × dimension (`aesthetic`, `category`, `color`, `silhouette`, `aesthetic_category`) × key: volume, velocity, cross-cluster spread, conversion, GMV, momentum, `emerging` flag and evidence. |
| `manufacturing_recommendations` | Ranked "開款 / 備料" suggestions (aesthetic × category group × colour family) with momentum, confidence, projected demand, rationale and evidence, for the manufacturing view on `/trends`.        |
