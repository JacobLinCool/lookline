# Vision attributes — design

Date: 2026-09-19. Status: agreed, ready to implement.

A multimodal pass over the 105 100 catalogue photographs fills the product-side attributes that
H&M never recorded and that `detail_desc` regexes cannot recover. Everything the pass writes comes
from a closed vocabulary `@lookline/catalog` already owns, so a value it produces is a value the
intent parser can already ask for.

## 1. Why this, and not more text parsing

The engine has slots waiting that the catalogue cannot fill:

| Column                                   |     Filled today | Source today                                                    |
| ---------------------------------------- | ---------------: | --------------------------------------------------------------- |
| aesthetics (32 slugs)                    |               0% | nothing — the vector block was removed                          |
| `fit` / `length` / `neckline` / `sleeve` | 9 / 8 / 27 / 35% | `detail_desc` regex                                             |
| `closure`                                |               0% | —                                                               |
| `material`                               |              67% | `detail_desc` regex                                             |
| `pattern`                                |             100% | H&M's 30 coarse values; 17 145 rows say only "All over pattern" |
| style axes                               |             100% | inferred from shelf, fabric, price                              |
| `attributes` JSON                        |              53% | five regex booleans                                             |

The regexes have run out of road: the text that names a neckline already did, and the rest of the
catalogue is silent. The photograph is not.

## 2. Attributes the pass produces

### Layer 1 — slots the engine already has

- **`aesthetics`** — up to 3 of the 32 catalog slugs with weights. The largest gap: aesthetic
  search, occasion style priors and every user preference vector are built on these 32 dimensions,
  and the product side is empty, so dimensions 0–31 of the style vector were deleted rather than
  left as a coin toss (`packages/catalog/src/vectors.ts`). This pass is what puts them back.
- **`pattern`** — one of the 15 catalog slugs, replacing H&M's coarse label.
- **`printSubject`** — new column, one of `none, slogan, character, logo, floral, animal, abstract,
landscape, photo`. A third of the catalogue is kidswear and nearly all of it is printed; H&M files
  every one of them under "All over pattern".
- **`fit`, `silhouette`, `length`, `neckline`, `sleeve`, `closure`** — the vocabularies in
  `packages/catalog/src/taxonomy/fits.ts`, read off the photograph.
- **Style axes** — the model scores what is visible: `formality`, `boldness`, `structure`,
  `coverage`, `texture`. The measurable axes keep their measured source: `warmth` from material and
  selling season, `trendiness` from sales momentum, `price-tier` from price. A model never overrides
  a number the data already knows.
- **`material`** — only for rows the description left blank, and only from the visually separable
  subset (knit, denim, leather, satin, lace, fleece, corduroy, velvet, suede, tweed, mesh, sequin).
  Cotton against polyester is not a judgement a photograph supports, and the pass does not make it.

### Layer 2 — new

- **Design details** — a closed set of ~18 booleans written into the existing `attributes` JSON
  next to `pockets` and `lined`: `ruffle, pleats, cutout, slit, belt, embroidery, sequin,
distressed, ribbed, cable_knit, lace_trim, asymmetric, sheer, tie_bow, fringe, button_front,
drawstring, logo`. `attribute_match` already scores `attributes[key] === true` against
  `mustHave` / `mustAvoid`, so "不要蕾絲" works the day the column lands. The intent lexicon's
  `ATTRIBUTES` table gains a bilingual row per detail.
- **`occasions`** — chosen per item from the 12 catalog slugs. Today every article on the same
  merchandising shelf shares one list.
- **`styleCaption`** — one sentence, English and Chinese. The English one joins the FTS index so a
  vibe query has text to match; both are quotable as recommendation evidence.

Explicitly not in scope: free-text tags (no closed vocabulary, no index), model-produced
embeddings (that is FashionCLIP's job, a separate track), body-shape or size advice.

## 3. How it is produced

- **Model** `gpt-5.6-luna`, the project's configured `OPENAI_TEXT_MODEL`. It accepts image input and
  is the cheapest of the 5.6 family.
- **Call** Responses API, one article per call. An `input_image` pointing at the R2 object plus the
  text the catalogue does have — `prod_name`, `product_type_name`, `detail_desc`, `colour_group_name`,
  `section_name` — so the model reads the photograph and the copy together. `detail: "low"` is
  enough for a 512 px product shot.
- **Output** Structured Outputs, `strict: true`, with every enum generated from the catalog arrays.
  A value outside the taxonomy is unrepresentable rather than merely discouraged. Each field carries
  a confidence, and the object carries one sentence of evidence.
- **Live, not Batch** The Batch API is half price but returns within 24 hours. The run is live with
  bounded concurrency so the catalogue is enriched in hours, resumable article by article.
- **Prompt cache** The vocabulary definitions are a fixed system prefix, billed at a tenth after the
  first call.

Cost per article is roughly 500 image tokens, 600 fresh input, 700 cached input, 200 output.

| Scope             | gpt-5.6-luna, live |
| ----------------- | ------------------ |
| 200-article pilot | < US$0.10          |
| 105 100 articles  | ≈ US$40            |

Validation before the full run: 200 articles, then agreement against the columns H&M does ship —
a row H&M calls "Solid" should come back `solid`, and the perceived colour should match. That
agreement rate is the quantified, reproducible number the brief asks for.

## 4. Data model

### `article_vision` — the audit record

One row per article. The validated payload is kept verbatim, because it is the evidence behind
every derived column: a recommendation can say the model saw an oversized cable-knit in oatmeal and
therefore called it quiet-luxury. Re-running with a different model writes a new `version` and the
two can be compared instead of one silently replacing the other.

```
article_id PK, model, version, payload JSON, confidence REAL,
caption_en, caption_zh, image_key, input_tokens, output_tokens, latency_ms, created_at
```

Derived columns are materialised from it by a separate step, so a prompt fix re-runs the cheap half.

### `articles` — new columns

`aesthetics` (ordered slug list), `silhouette`, `print_subject`, `style_caption`. The design details
go into the existing `attributes` JSON; the weights behind `aesthetics` live in the style vector,
which `describeVector` reads back rather than storing twice.

### Style vector — back to 64 dimensions

The layout returns to the one `docs/ARCHITECTURE.md` and `ENGINE_SPEC.md` already document:
`A = [0, 32)` aesthetics, `C = [32, 44)` colours, `X = [44, 52)` axes, `G = [52, 64)` groups.
`article_vectors` gains `v32` … `v63`. The block weights in `packages/engine/src/vector.ts` gain
their `A` entry back.

This also repairs a live bug: `scanVector` in `packages/engine/src/recommend/search.ts` still writes
aesthetics at `aestheticIndex(slug)`, which under the 32-dimension layout lands inside the colour
block, so a query naming a style perturbs colours instead.

### Facets

`aggregateFacets` already reads an `aesthetic` dimension that the facet query never emits. With the
column populated the query emits it and the aesthetic facet stops being empty.

### Trend analytics

`trend_signals.dimension` gains `detail`, keyed by design-detail slug, and
`manufacturing_recommendations` can name one. This is the point of the whole exercise for the
manufacturing side: a factory does not cut "quiet luxury", it cuts a mock neck, a dropped shoulder
and a cable knit in oatmeal. Necklines, sleeves, closures and design details are tech-pack fields,
so the consumer's sentence and the production brief end up in one vocabulary.

A low-confidence tag is also a question worth asking: Engine 01 can turn it into a clarification
("印花還是刺繡？") instead of guessing, which puts all three engines on the same attribute 語彙.

## 5. Build order

1. `article_vision` table, new `articles` columns, migration `0003`.
2. `packages/hm/src/vision.ts` — vocabulary, strict JSON schema, prompt.
3. `packages/hm/scripts/vision.ts` — the live runner, resumable, with cost accounting.
4. Materialisation: vision row → columns → style vector.
5. 64-dimension restore across catalog, db and engine.
6. Lexicon rows for the design details; facet query; trend `detail` dimension.
