# ENGINE_SPEC — `@lookline/engine` (Engines 01 / 02 / 03 + graph & trend analytics)

Status: final synthesis. Binding order: `docs/ARCHITECTURE.md` > `docs/CONTRACTS.md` +
`packages/engine/src/types.ts` + `packages/db/src/schema.ts` > this document > the proposals it
was synthesised from. Every exported name and type in `packages/engine/src/types.ts` is kept
verbatim; this spec only **adds optional fields** and defines internals.

Interactive execution follows [LATENCY_SPEC.md](LATENCY_SPEC.md): deterministic results are the
initial path, text enrichment shares a 3.5 s provider budget, and image rendering shares 25 s.
These budgets reserve browser work within the 5 s / 30 s product deadlines. Existing algorithmic
targets below measure engine work only; browser milestones remain the acceptance criteria.

Conventions used below:

- "Product columns" always means `packages/db/src/schema.ts` `products` (`material` is a single
  text, `stock` int, `popularity` real, `colorHex`, `secondaryColorHex`, `seasons[]`,
  `occasions[]`, `aesthetics[]`, `attributes` jsonb, `sizes[]`, `sizeSystem`, `tier`).
- Vectors are `number[]` of length 64; block offsets `A=0..31`, `C=32..43`, `X=44..51`, `G=52..63`.
- `σ(x) = 1/(1+e^-x)`; `clamp01(x) = min(1, max(0, x))`; `cos(a,b)` is cosine over a dim range,
  `0` when either norm is 0. All stored vectors are non-negative, so cosine ∈ [0, 1].
- Money is integer TWD. Rounding of converted budgets: nearest 100 when ≥ 1000, else nearest 10.
- No `Math.random()` / `Date.now()` in engine code except `llm/client.ts` and runtime id
  generation (`nanoid`). Every function that needs time takes `now: Date`; every function that
  needs randomness takes `seed: number` and uses `createRng(seed)` from `@lookline/catalog`.

---

## 0. Shared vocabulary and constants (`src/constants/*`)

### 0.1 Aesthetics (32 slugs the engine tables are keyed by)

`@lookline/catalog` owns the ordered `AESTHETICS` list and its indices; the engine never hard-codes
an index (it calls `aestheticIndex(slug)`). The engine tables below are keyed by these 32 slugs.
Re-keying rule if `CATALOG_SPEC.md` ships a different list: rows whose slug does not exist in the
catalog are dropped; every catalog slug missing from a table gets the **neutral row**
(axes all 0.5, colour prior `{black:.4, white:.4, neutral:.4}`). This rule is implemented once in
`constants/aesthetics.ts` (`resolveAestheticTables(AESTHETICS)`), and a unit test asserts every
catalog slug has a row after resolution.

| #   | slug           | labelZh  | #   | slug           | labelZh  |
| --- | -------------- | -------- | --- | -------------- | -------- |
| 1   | minimalist     | 極簡     | 17  | athleisure     | 運動休閒 |
| 2   | quiet-luxury   | 靜奢     | 18  | workwear       | 工裝     |
| 3   | old-money      | 老錢風   | 19  | military       | 軍裝     |
| 4   | classic        | 經典     | 20  | normcore       | 基本款   |
| 5   | preppy         | 學院     | 21  | romantic       | 浪漫     |
| 6   | korean-minimal | 韓系簡約 | 22  | coquette       | 甜美少女 |
| 7   | scandi         | 北歐     | 23  | cottagecore    | 田園     |
| 8   | clean-girl     | 乾淨系   | 24  | bohemian       | 波希米亞 |
| 9   | streetwear     | 街頭     | 25  | balletcore     | 芭蕾風   |
| 10  | y2k            | Y2K      | 26  | vintage-retro  | 復古     |
| 11  | grunge         | 頹廢搖滾 | 27  | glam           | 華麗     |
| 12  | punk           | 龐克     | 28  | avant-garde    | 前衛     |
| 13  | gothic         | 哥德     | 29  | harajuku       | 原宿     |
| 14  | dark-academia  | 暗黑學院 | 30  | resort         | 度假     |
| 15  | techwear       | 機能     | 31  | western        | 西部     |
| 16  | gorpcore       | 山系     | 32  | artsy-eclectic | 藝術混搭 |

### 0.2 `AESTHETIC_AXIS_PRIOR` (used by intent axis inference and by synthetic users)

Columns: formality, warmth, boldness, structure, coverage, texture, trendiness (price-tier has no
aesthetic prior; it comes from budget only).

| slug           | form | warm | bold | struct | cover | text | trend |
| -------------- | ---- | ---- | ---- | ------ | ----- | ---- | ----- |
| minimalist     | .55  | .50  | .15  | .60    | .60   | .30  | .50   |
| quiet-luxury   | .80  | .50  | .10  | .70    | .80   | .50  | .70   |
| old-money      | .80  | .50  | .20  | .70    | .80   | .50  | .50   |
| classic        | .70  | .50  | .20  | .70    | .80   | .50  | .30   |
| preppy         | .65  | .50  | .40  | .60    | .70   | .40  | .40   |
| korean-minimal | .50  | .50  | .20  | .50    | .70   | .30  | .85   |
| scandi         | .50  | .60  | .15  | .50    | .70   | .50  | .60   |
| clean-girl     | .50  | .40  | .20  | .50    | .50   | .20  | .80   |
| streetwear     | .20  | .50  | .70  | .30    | .60   | .40  | .80   |
| y2k            | .20  | .30  | .90  | .30    | .30   | .50  | .85   |
| grunge         | .15  | .60  | .60  | .20    | .70   | .70  | .50   |
| punk           | .10  | .50  | .95  | .40    | .50   | .80  | .50   |
| gothic         | .40  | .60  | .80  | .50    | .70   | .70  | .50   |
| dark-academia  | .70  | .70  | .30  | .60    | .90   | .70  | .50   |
| techwear       | .30  | .60  | .60  | .70    | .80   | .50  | .70   |
| gorpcore       | .20  | .80  | .50  | .40    | .80   | .70  | .75   |
| athleisure     | .15  | .40  | .40  | .40    | .50   | .30  | .60   |
| workwear       | .30  | .60  | .30  | .70    | .80   | .80  | .50   |
| military       | .35  | .60  | .40  | .70    | .80   | .70  | .40   |
| normcore       | .35  | .50  | .05  | .40    | .60   | .20  | .30   |
| romantic       | .55  | .40  | .50  | .20    | .60   | .70  | .50   |
| coquette       | .40  | .40  | .60  | .30    | .40   | .60  | .80   |
| cottagecore    | .35  | .50  | .30  | .20    | .80   | .70  | .50   |
| bohemian       | .30  | .40  | .60  | .10    | .70   | .80  | .40   |
| balletcore     | .40  | .30  | .40  | .20    | .50   | .50  | .80   |
| vintage-retro  | .45  | .50  | .50  | .40    | .70   | .70  | .40   |
| glam           | .85  | .30  | .90  | .50    | .30   | .90  | .60   |
| avant-garde    | .50  | .50  | .95  | .80    | .70   | .70  | .90   |
| harajuku       | .20  | .40  | .95  | .30    | .50   | .70  | .80   |
| resort         | .35  | .15  | .50  | .20    | .35   | .50  | .60   |
| western        | .35  | .55  | .50  | .50    | .70   | .80  | .40   |
| artsy-eclectic | .40  | .50  | .80  | .40    | .60   | .70  | .70   |

### 0.3 `AESTHETIC_COLOR_PRIOR` (aesthetic → colour-family weights; blank = 0)

| slug           | black | white | grey | neutral | brown | red | pink | y-o | green | blue | purple | multi |
| -------------- | ----- | ----- | ---- | ------- | ----- | --- | ---- | --- | ----- | ---- | ------ | ----- |
| minimalist     | .5    | .6    | .5   | .5      |       |     |      |     |       |      |        |       |
| quiet-luxury   | .4    | .4    | .3   | .6      | .5    |     |      |     |       | .3   |        |       |
| old-money      |       | .4    |      | .6      | .4    |     |      |     | .3    | .5   |        |       |
| classic        | .4    | .5    | .4   | .5      |       |     |      |     |       | .5   |        |       |
| preppy         |       | .4    |      | .4      |       | .4  |      |     | .3    | .6   |        |       |
| korean-minimal | .3    | .5    | .3   | .5      |       |     |      |     |       |      |        |       |
| scandi         | .3    | .5    | .5   | .5      |       |     |      |     |       |      |        |       |
| clean-girl     |       | .6    |      | .6      | .3    |     |      |     |       |      |        |       |
| streetwear     | .6    | .4    | .4   |         |       |     |      |     |       |      |        | .3    |
| y2k            |       |       |      |         |       |     | .6   |     |       | .4   | .4     | .5    |
| grunge         | .6    |       | .4   |         |       | .3  |      |     | .3    |      |        |       |
| punk           | .7    |       |      |         |       | .5  |      |     |       |      |        |       |
| gothic         | .8    |       |      |         |       | .3  |      |     |       |      | .4     |       |
| dark-academia  | .4    |       | .3   |         | .6    |     |      |     | .4    |      |        |       |
| techwear       | .8    |       | .4   |         |       |     |      |     |       |      |        |       |
| gorpcore       | .4    |       |      | .3      |       |     |      | .4  | .5    |      |        |       |
| athleisure     | .5    | .4    | .4   |         |       |     |      |     |       | .3   |        |       |
| workwear       |       |       |      | .5      | .6    |     |      |     | .4    | .4   |        |       |
| military       | .3    |       |      | .4      | .3    |     |      |     | .7    |      |        |       |
| normcore       |       | .4    | .4   | .4      |       |     |      |     |       | .4   |        |       |
| romantic       |       | .5    |      | .3      |       |     | .6   |     |       |      | .3     |       |
| coquette       |       | .5    |      |         |       |     | .7   |     |       |      |        |       |
| cottagecore    |       | .4    |      | .4      |       |     | .3   | .3  | .5    |      |        | .3    |
| bohemian       |       |       |      | .4      | .5    | .3  |      | .4  |       |      |        | .4    |
| balletcore     |       | .5    |      | .4      |       |     | .6   |     |       |      |        |       |
| vintage-retro  |       |       |      | .4      | .5    | .3  |      | .4  |       | .3   |        |       |
| glam           | .4    |       |      |         |       | .4  |      |     |       |      |        | .7    |
| avant-garde    | .7    | .3    |      |         |       |     |      |     |       |      |        |       |
| harajuku       |       |       |      |         |       |     | .5   | .3  |       |      | .3     | .6    |
| resort         |       | .6    |      | .4      |       |     |      | .4  |       | .4   |        | .3    |
| western        |       |       |      | .4      | .6    | .3  |      |     |       | .4   |        |       |
| artsy-eclectic |       |       |      |         |       |     |      | .3  | .3    |      | .3     | .6    |

### 0.4 Colour family geometry (fallback when `colorHex` is unusable) and the neutral set

`NEUTRAL_FAMILIES = {black, white, grey, neutral, brown}`. Primary source of hue/lightness/saturation
is `hexToHsl(product.colorHex)`; the table is used only when parsing the hex fails.

| family         | hue° | L   | S   |
| -------------- | ---- | --- | --- |
| black          | 0    | .05 | 0   |
| white          | 0    | .97 | 0   |
| grey           | 0    | .55 | 0   |
| neutral        | 40   | .82 | .15 |
| brown          | 25   | .35 | .45 |
| red            | 0    | .45 | .75 |
| pink           | 340  | .75 | .60 |
| yellow-orange  | 40   | .60 | .80 |
| green          | 120  | .40 | .50 |
| blue           | 220  | .45 | .60 |
| purple         | 280  | .45 | .50 |
| multi-metallic | 45   | .60 | .70 |

### 0.5 Occasions (engine-owned; `Intent.occasion` is a free string in the contract)

Slugs and the prior table used by both parsers. Colour weights feed the intent vector at ×0.7;
`avoid` entries become `mustAvoid` tokens `color:<family>` with an assumption.

| slug             | zh       | en synonyms                                       | zh synonyms              | formality | coverage | boldness | template     |
| ---------------- | -------- | ------------------------------------------------- | ------------------------ | --------- | -------- | -------- | ------------ |
| wedding-guest    | 婚禮賓客 | wedding, wedding guest, reception                 | 婚禮 喜宴 婚宴           | .75       | .60      | .45      | formal       |
| office           | 上班     | office, work, commute, business casual, workday   | 上班 辦公室 通勤 工作    | .65       | .70      | .30      | work         |
| interview        | 面試     | interview, job interview                          | 面試                     | .80       | .80      | .20      | work         |
| date             | 約會     | date, first date, dinner date                     | 約會                     | .50       | .50      | .50      | smart-casual |
| party            | 派對     | party, club, night out, birthday party            | 派對 趴 夜店 生日趴      | .55       | .40      | .70      | party        |
| festival         | 音樂祭   | festival, music festival                          | 音樂祭 音樂節            | .20       | .40      | .80      | festival     |
| travel           | 旅行     | travel, trip, vacation, holiday, sightseeing      | 旅行 旅遊 出國 出遊 去玩 | .30       | .60      | .30      | travel       |
| hiking           | 登山     | hiking, hike, trail, camping, outdoor             | 登山 爬山 健行 露營 戶外 | .10       | .80      | .40      | outdoor      |
| gym              | 健身     | gym, workout, running, training, sport, exercise  | 健身 健身房 跑步 運動    | .05       | .50      | .40      | sport        |
| beach            | 海邊     | beach, seaside, pool, island                      | 海邊 沙灘 海島 沖繩 墾丁 | .10       | .30      | .60      | beach        |
| casual-daily     | 日常     | everyday, daily, casual, weekend                  | 日常 平常 每天 週末      | .30       | .60      | .35      | casual       |
| graduation       | 畢業典禮 | graduation, commencement                          | 畢業 畢業典禮            | .65       | .65      | .40      | formal       |
| funeral          | 告別式   | funeral, memorial                                 | 告別式 喪禮              | .85       | .90      | .05      | formal       |
| school           | 上學     | school, campus, class                             | 上學 學校 上課 校園      | .30       | .70      | .30      | casual       |
| gala             | 晚宴     | gala, black tie, awards, banquet                  | 晚宴 頒獎 尾牙           | .95       | .50      | .60      | formal       |
| lunar-new-year   | 過年     | lunar new year, chinese new year, cny             | 過年 新年 春節 拜年      | .50       | .60      | .60      | smart-casual |
| concert          | 演唱會   | concert, gig, live show                           | 演唱會 演出              | .20       | .50      | .70      | casual       |
| family-gathering | 家庭聚會 | family dinner, family gathering, meet the parents | 家庭聚餐 家族聚會 見家長 | .50       | .70      | .30      | smart-casual |

Occasion aesthetic and colour priors:

| slug             | aesthetics (weight)                                             | colours (weight)                                 | avoid                                                         |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| wedding-guest    | classic .6, romantic .5, glam .4, old-money .4, quiet-luxury .3 | neutral .5, pink .3, blue .3                     | white                                                         |
| office           | classic .6, minimalist .5, quiet-luxury .4, korean-minimal .3   | black .4, white .4, grey .4, neutral .4, blue .3 | –                                                             |
| interview        | classic .7, minimalist .5, quiet-luxury .3                      | black .5, white .5, grey .4, blue .4             | –                                                             |
| date             | romantic .5, korean-minimal .4, classic .3, quiet-luxury .3     | black .3, neutral .3, pink .2, red .2            | –                                                             |
| party            | glam .6, y2k .3, streetwear .3                                  | black .5, multi-metallic .4, red .3              | –                                                             |
| festival         | bohemian .6, y2k .4, streetwear .4, harajuku .3                 | multi-metallic .4, yellow-orange .3              | –                                                             |
| travel           | minimalist .4, athleisure .4, gorpcore .3, korean-minimal .3    | neutral .4, black .3                             | –                                                             |
| hiking           | gorpcore .9, techwear .4, athleisure .3                         | green .4, black .3, yellow-orange .2             | –                                                             |
| gym              | athleisure .9                                                   | black .5, grey .3                                | –                                                             |
| beach            | resort .8, bohemian .3                                          | white .4, blue .4, yellow-orange .3              | –                                                             |
| casual-daily     | minimalist .4, classic .4, streetwear .3, korean-minimal .3     | neutral .3, black .3, white .3                   | –                                                             |
| graduation       | classic .5, preppy .4, romantic .4                              | white .3, neutral .3, blue .3                    | –                                                             |
| funeral          | classic .7, minimalist .5                                       | black 1.0                                        | red, pink, yellow-orange, green, blue, purple, multi-metallic |
| school           | preppy .5, korean-minimal .4, streetwear .3                     | blue .3, white .3, neutral .3                    | –                                                             |
| gala             | glam .9, old-money .4                                           | black .5, multi-metallic .5, red .3              | –                                                             |
| lunar-new-year   | classic .4, romantic .3, coquette .3                            | red .8, yellow-orange .3                         | black, white                                                  |
| concert          | streetwear .6, grunge .4, y2k .3                                | black .6                                         | –                                                             |
| family-gathering | classic .5, korean-minimal .3, preppy .3                        | neutral .4, blue .3                              | –                                                             |

### 0.6 Seasons, materials, fits

Taiwan month→season: 3–5 spring, 6–9 summer, 10–11 autumn, 12–2 winter. Season → axis targets:
`spring {warmth .40, coverage .50}`, `summer {.15, .30}`, `autumn {.60, .70}`, `winter {.90, .90}`.
Material and fit slugs come from catalog `MATERIALS` / `FITS` (`LEXICON.materials`,
`LEXICON.fits`); the engine only needs `MaterialDef.warmth/texture` and `FitDef.structure`.

### 0.7 Currency (`CURRENCY_RATES`, TWD per unit; fixed demo rates)

| code | rate  | tokens (case-insensitive)          |
| ---- | ----- | ---------------------------------- |
| TWD  | 1     | `nt$ ntd twd 元 塊 台幣 新台幣 nt` |
| USD  | 32    | `us$ usd 美金 美元 dollars bucks`  |
| JPY  | 0.21  | `jpy ¥ 円 日圓 日幣 yen`           |
| EUR  | 35    | `eur € 歐元 euro euros`            |
| GBP  | 41    | `gbp £ 英鎊 pound pounds`          |
| KRW  | 0.024 | `krw ₩ 韓元 won`                   |
| CNY  | 4.4   | `cny rmb 人民幣 yuan`              |
| HKD  | 4.1   | `hkd hk$ 港幣`                     |
| SGD  | 24    | `sgd s$ 新幣`                      |
| AUD  | 21    | `aud a$ 澳幣`                      |

Bare `$`: TWD (confidence .85) when locale is `zh-TW` or `mixed`; USD (confidence .70) when locale
is `en` and amount < 1000; TWD (confidence .60) when `en` and amount ≥ 1000. Confidence < .75
emits the non-blocking `currency` clarification.

### 0.8 Vector helpers (`src/vector.ts`)

```ts
export const BLOCK = { A: [0, 32], C: [32, 44], X: [44, 52], G: [52, 64] } as const
export function cosineRange(a, b, from, to): number // 0 if either sub-norm is 0
export function blockScale(v, w: { A: number; C: number; X: number; G: number }): number[]
export function blockCosine(a, b, w): number // cosine of blockScale(a,w) vs blockScale(b,w)
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null
export function toPgVector(v): string // "[0.1,...]" 6 decimals
```

Block-weighted similarity is achieved inside pgvector by scaling the **query** vector; products are
stored unscaled. Retrieval query weights: `RETRIEVAL_BLOCK_WEIGHTS = { A: 1.0, C: 0.7, X: 0, G: 1.0 }`
(axes are zeroed: a dot product cannot express closeness to 0.5-ish targets; axes are scored in
`attribute_match`). Similarity scoring weights: `SIMILARITY_BLOCK_WEIGHTS = { A: 1.0, C: 0.7, X: 0, G: 0 }`.
Preference cosine weights: `PREFERENCE_BLOCK_WEIGHTS = { A: 1.0, C: 0.7, X: 0.5, G: 0 }`.

---

## 1. Engine 01 — Intent

### 1.1 Schema (`src/intent/schema.ts`)

The zod schema is the contract `Intent` plus optional engine fields. Nothing in the contract is
renamed. `mode` is `'single' | 'outfit' | 'browse'`; a gift is `mode:'single'` (or `'outfit'`)
with `recipient.kind === 'other'`.

```ts
export const IntentSchema = z.object({
  utterance: z.string().max(500),
  locale: z.enum(['zh-TW', 'en', 'mixed']),
  mode: z.enum(['single', 'outfit', 'browse']),
  department: Department.optional(),
  categoryGroups: z.array(CategoryGroup).max(6).default([]),
  subcategories: z.array(z.string()).max(6).default([]),
  colors: z.array(z.string()).default([]), // catalog colour names ("camel")
  colorFamilies: z.array(ColorFamily).max(6).default([]), // explicit only
  aesthetics: z.array(z.string()).max(6).default([]), // explicit + inferred, weight-desc
  materials: z.array(z.string()).max(4).default([]),
  patterns: z.array(z.string()).max(4).default([]),
  fits: z.array(z.string()).max(2).default([]),
  occasion: z.string().optional(),
  season: Season.optional(), // includes 'all-season'
  budget: z
    .object({
      min: z.number().int().nonnegative().optional(),
      max: z.number().int().positive().optional(),
      currency: z.literal('TWD'),
      original: z.string().optional(), // verbatim phrase, e.g. "under $100"
      // engine additions
      strictness: z.enum(['hard', 'soft', 'flexible']).optional(), // default 'soft'
      scope: z.enum(['total', 'per_item']).optional(), // default: outfit→total, else per_item
      originalAmount: z.number().optional(),
      originalCurrency: z.string().optional(),
    })
    .optional(),
  recipient: z.object({
    kind: z.enum(['self', 'other', 'undisclosed']),
    relation: z.string().optional(), // father|mother|partner|spouse|child|sibling|friend|colleague|boss|unknown
    department: Department.optional(),
    label: z.string().optional(), // "Alice", "my dad"
  }),
  sizes: z.record(z.string(), z.string()).optional(), // { alpha:'M', 'numeric-waist':'28', 'eu-shoe':'42' }
  mustHave: z.array(z.string()).max(8).default([]), // tokens "<slot>:<slug>" (see 1.2)
  mustAvoid: z.array(z.string()).max(8).default([]),
  vibe: z.string().optional(),
  referenceLookId: z.string().optional(),
  referenceHandle: z.string().optional(),
  assumptions: z.array(
    z.object({
      slot: z.string(),
      value: z.string(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
      source: z.enum(['utterance', 'context', 'occasion_prior', 'default', 'llm']).optional(),
    }),
  ),
  clarifications: z.array(
    z.object({
      slot: z.string(),
      question: z.string(),
      options: z.array(z.string()).min(2).max(5),
      blocking: z.boolean().optional(), // default false
    }),
  ),
  confidence: z.number().min(0).max(1),
  // engine additions
  quantity: z.number().int().min(1).max(8).optional(), // pieces requested
  aestheticWeights: z.record(z.string(), z.number()).optional(),
  colorWeights: z.record(z.string(), z.number()).optional(),
  axisTargets: z.record(z.string(), z.number()).optional(), // resolved absolute targets in [0,1]
  excludeCategoryGroups: z.array(CategoryGroup).optional(),
  referenceRole: z.enum(['style-source', 'coordinate-with']).optional(),
  giftCategoryPrior: z.array(CategoryGroup).optional(),
  parser: z.enum(['lexicon', 'llm', 'merged']).optional(),
})
```

`IntentContext` additions (all optional): `now?: Date` (season inference; when absent no date
inference happens), `contacts?: Array<{ userId: string; displayName: string; handle: string;
department?: Department; latestLookId?: string; latestLookIds?: string[] }>` (supplied by the web
layer for reference resolution), `brands?: Array<{ id: number; name: string; slug: string }>`
(brand lexicon, cached 10 min by the web layer), `trendingAesthetics?: string[]` (top-3 today, for
`browse`).

### 1.2 Constraint tokens

`mustHave` / `mustAvoid` entries are canonical strings `"<slot>:<value>"`:

| slot          | value                                                       | applied as                                                                                       |
| ------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `color`       | colour family                                               | SQL `NOT color_family = ANY` (avoid) / colour sub-check (have)                                   |
| `material`    | material slug                                               | SQL `NOT material = ANY` / material sub-check                                                    |
| `subcategory` | subcategory slug                                            | SQL `NOT subcategory = ANY` / subcategory filter                                                 |
| `group`       | category group                                              | `excludeCategoryGroups` (avoid) / `categoryGroups` (have)                                        |
| `brand`       | brand slug                                                  | brand id exclusion / inclusion (resolved from `ctx.brands` or in `recommend` via `brands` table) |
| `pattern`     | pattern slug                                                | in-process drop / pattern sub-check                                                              |
| `attribute`   | `waterproof`, `pockets`, `logo`, `hood`, `stretch`, `lined` | `attributes @> {"<k>": true}` (have) / `NOT` (avoid)                                             |
| `text`        | free token                                                  | in-process substring test on `name`, `description`, `brandName`                                  |

### 1.3 Parsing pipeline (`src/intent/index.ts`)

```
parseIntent(utterance, ctx):
  t0 = performance.now()
  lex = parseIntentOffline(utterance, ctx)                         // always, sync, pure
  if ctx.offline → return lexicon result (provider 'offline')
  search = await compileSearchIntent(utterance, 1.8 s)             // §1.3.1, skipped without TYPESAFE_API_KEY
        catch → warn and leave null; a failed decision never becomes a silent LLM call
  route = routeIntent(lex, search)                                 // §1.3.1
  decided = finalize(mergeJev(lex, search, ctx), ctx)              // when the decision answered
  if !route.escalate → return { intent: decided, provider: 'jev', model: search.model, route, latencyMs }
  if ctx.deferRefinement → return decided result plus `refine()`   // the caller runs it out of band
  llm = await parseIntentLlm(utterance, ctx, getLlm())             // shared 3.5 s deadline, medium reasoning / thinking
  if !llm → return the decided result
  merged = finalize(mergeJev(mergeLlm(lex, llm, ctx), search, ctx), ctx)   // §1.6 then §1.3.1, one finalize
  return { intent: merged, vector: …, provider, model, route, latencyMs }
```

The decision stage runs in front of the generative parser because nearly every description is a
set of catalog attributes, and Jev decides those from the catalog's own vocabulary in a fraction of
the text budget: measured over the §1.10 scenarios, in-band `parseIntent` is 283–954 ms (median 349) against a generative parse that does not fit in 3.5 s at all.

Follow-ups: if `ctx.previousIntent` exists and `isFollowUp(utterance, previousIntent)` (§1.8), the
new utterance is parsed alone and merged with `mergeIntent(previous, next)` before `finalize`.

### 1.3.1 Escalation routing (`src/intent/jev-parser.ts`)

`routeIntent(lex, search)` decides whether the closed-option decision is enough. It escalates when:

| Reason            | Source                                             | Scenario             |
| ----------------- | -------------------------------------------------- | -------------------- |
| `decision-failed` | no decision (unconfigured or the service errored)  | —                    |
| `reference`       | `lex.referenceHandle` / `referenceLookId` (§1.4.8) | F2, F14              |
| `recipient`       | `lex.recipient.kind === 'other'` (§1.4.4)          | F3, F8, F12          |
| `type-unclear`    | `search.typeRelevance < 0.5`                       | F1, F6, F9, F10, F16 |
| `no-catalog-term` | `search.candidateCount === 0`                      | F2, F3, F14, F16     |

The first two are deterministic because neither a reference nor a recipient is a product attribute;
no amount of catalog vocabulary produces them. The last two come from the decision itself.

Two signals were measured and rejected. Uncovered spans do not discriminate (every sentence leaves
some): the service answers questions without reporting which words produced each answer, so
everything it resolves semantically looks uncovered. `search.unresolved` fires more often on the
sentences the decision handles completely.

`mergeJev` folds a decision into the lexical intent: positive predicates above
`MIN_PREDICATE_PROBABILITY` fill categories, colours, materials, patterns, fits, occasion, season
and department; negatives become `mustAvoid` tokens for the slots §2 understands and are dropped
otherwise rather than degrading to a text match; `typePrior` fills the garment type only when the
sentence named none; ordinal constraints enter as `signals.axisHints` so `finalize` keeps deriving
`axisTargets`; and the budget stays with the deterministic parser, which is the only stage allowed
to produce numbers.

### 1.4 Offline lexicon parser (`src/intent/lexicon-parser.ts`)

Pure and deterministic: byte-identical output for identical `(utterance, ctx)`.

1. **Normalise**: NFKC; full-width digits/punctuation → ASCII; lowercase Latin; collapse
   whitespace; strip emoji.
2. **Locale**: CJK codepoint ratio ≥ 0.30 → `zh-TW`; = 0 → `en`; else `mixed`.
3. **Clauses**: split on `，,。.;；、` and on the words `and`, `but`, `但`, `不過`, `然後`, `而且`.
   Every match records its clause index; negation is clause-local.
4. **Negation scope**: triggers zh `不要 不想 別 不能 不喜歡 避免 除了 不含 沒有 拒絕 不用`, en
   `no not don't dont without avoid except never anything but -free hate`. Scope = the rest of the
   clause after the trigger (max 4 dictionary hits). Hits inside scope go to `mustAvoid`
   (colour / material / subcategory / group / brand / pattern / attribute); degree phrases
   (`太正式 too formal`, `太俗`, `太短`, `太露`, `太貴`) map to axis deltas or subcategory avoids (§1.4.6).
5. **Dictionary scan**: longest-match-first over `LEXICON.*` from catalog (aesthetics, colours,
   colour families, subcategories, category groups, materials, patterns, fits, seasons,
   departments, occasions) plus the engine tables below; whole-word for Latin, substring for CJK;
   a match consumes its span so 「黑色帽T」 yields `color:black` + `subcategory:hoodie` and never
   `hat`. Explicit aesthetic hits get weight 1.0; vibe-word hits (§1.4.5) get their listed weight.
6. **Numbers / budget / sizes** (§1.4.1–1.4.3).
7. **Recipient & department** (§1.4.4).
8. **Occasion, season, mode, quantity, references** (§1.4.7–1.4.9).
9. **Priors**: occasion priors (§0.5) fill `aestheticWeights`, `colorWeights`, `axisTargets`,
   `giftCategoryPrior`, `mustAvoid` colours, each recorded as an assumption `source:'occasion_prior'`.
10. **Axis composition**: `axisTargets[k] = clamp01((prior_k ?? aestheticMean_k ?? 0.5) + 0.5·hint_k)`
    where `aestheticMean_k` is the `aestheticWeights`-weighted mean of `AESTHETIC_AXIS_PRIOR` and
    `hint_k` is the summed modifier delta (§1.4.6, clamped to [−1, 1]). Season sets warmth/coverage
    (§0.6) before hints. Example F1: `0.75 + 0.5·(−0.35) = 0.575`.
11. **Clarifications** (§1.5) and **confidence** (§1.7). `vibe` = utterance with consumed spans
    removed, trimmed, or undefined when empty. `parser = 'lexicon'`.

#### 1.4.1 Numbers (`src/intent/numbers.ts`)

| pattern                                            | value                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `\d{1,3}(,\d{3})+` / `\d+(\.\d+)?`                 | literal (commas removed)                                                                                           |
| `(\d+(\.\d+)?)\s*k`                                | ×1000                                                                                                              |
| `(\d+(\.\d+)?)\s*千`                               | ×1000                                                                                                              |
| `(\d+(\.\d+)?)\s*萬`                               | ×10000                                                                                                             |
| CJK numerals over `零一二兩三四五六七八九十百千萬` | standard CJK parser: 五千=5000, 三千五=3500, 一萬二=12000, 兩千=2000, 一千五=1500, 五百=500, 十五=15, 一百零五=105 |
| `(\d+)\s*(歲                                       | years? old)`                                                                                                       | `ageHint` (never budget)                           |
| `(\d+)\s*(件                                       | 個                                                                                                                 | 雙                                                 | 套                                     | pieces?                  | items?)` | `quantity` (never budget); `套` also sets mode outfit |
| `(waist                                            | 腰圍                                                                                                               | 腰)\s*(2[6-9]\|3\d\|40)`or`(2[6-9]\|3\d\|40)\s*(腰 | waist)`                                | `sizes['numeric-waist']` |
| `(eu                                               | size                                                                                                               | 尺寸)?\s*(3[5-9]\|4[0-6])\s*(號                    | 碼)?` when a footwear token is present | `sizes['eu-shoe']`       |
| `\b(xs\|s\|m\|l\|xl\|xxl)\b`, `(特小               | 小號                                                                                                               | 中號                                               | 大號                                   | 特大)`, `medium          | large    | small`                                                | `sizes.alpha` (S/M/L uppercase) |
| `(\d+)\s*(cm                                       | 公分)`                                                                                                             | ignored for slots; kept in `vibe`                  |

#### 1.4.2 Budget qualifiers (`src/intent/money.ts`)

| zh                                                         | en                                                                           | result                                                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `N 以內`, `N 以下`, `N 內`, `不超過 N`, `最多 N`, `N 之內` | `under N`, `below N`, `max N`, `up to N`, `less than N`, `within N`, `N max` | `{max:N, strictness:'hard'}`                                                                                    |
| `預算 N` (no other qualifier)                              | `budget N`, `N budget`                                                       | `{max:N, strictness:'soft'}` + assumption "budget read as an upper bound" (.8)                                  |
| `N 左右`, `大概 N`, `大約 N`, `N 上下`, `差不多 N`         | `around N`, `about N`, `~N`, `roughly N`                                     | `{min: round(0.75N), max: round(1.25N), strictness:'soft'}`                                                     |
| `N 到 M`, `N~M`, `N-M`, `N–M`                              | `N to M`, `between N and M`, `N-M`                                           | `{min:N, max:M, strictness:'hard'}`                                                                             |
| `N 以上`, `至少 N`                                         | `over N`, `at least N`, `N+`, `more than N`                                  | `{min:N, strictness:'hard'}`                                                                                    |
| `便宜`, `平價`, `學生價`, `省錢` (no number)               | `cheap`, `affordable`, `on a budget`, `budget-friendly`                      | single: `{max:1500}`; outfit: `{max:4000}`; `strictness:'soft'`; `axisTargets['price-tier']=0.2`; assumption .5 |
| `高級`, `精品`, `奢華`, `貴一點` (no number)               | `luxury`, `high-end`, `premium`, `splurge`                                   | single: `{min:8000}`; outfit: `{min:25000}`; `axisTargets['price-tier']=0.85`; assumption .5                    |
| `不限`, `無上限`, `隨便` (near 預算)                       | `no limit`, `flexible`, `money no object`                                    | `{strictness:'flexible'}`                                                                                       |
| `每件`, `一件` + amount                                    | `each`, `per item`, `apiece`                                                 | `scope:'per_item'`                                                                                              |

Guard: a number adjacent to quantity/size/age/date words (`件 個 雙 套 號 碼 歲 cm 月 日 天 週`) is
never money. Currency is detected from tokens within 2 characters of the number, else §0.7 bare
rules, else TWD when a budget qualifier is present (confidence .75). Conversion: `toTwd(amount,
code) = round(amount × rate)` then §0 rounding; `budget.original` keeps the verbatim phrase,
`originalAmount`/`originalCurrency` the raw values. Conversion adds
`{slot:'budget.currency', value:'USD', confidence, reason:'100 USD → NT$3,200 at fixed demo rate 32'}`.

No budget at all: `budget` undefined; the ranking uses a soft budget (§2.1). For `mode:'outfit'`
the non-blocking clarification `budget` is emitted (§1.5).

#### 1.4.3 Size systems — matched only when a category token narrows the system: alpha for any

apparel group, `numeric-waist` for bottoms/tailoring, `eu-shoe` for footwear/activewear shoes;
one-size subcategories (bags, most accessories, jewelry) ignore sizes.

#### 1.4.4 Recipient and department (`src/intent/recipient.ts`)

Gift verbs: zh `送 買給 給 幫…買 禮物`, en `gift for, present for, for my, buy for, get my`.
Self markers: zh `我 我要 我想 幫我 自己`, en `I, me, my, myself, I want, I need` (not followed by a
relation noun). Self is the default when nothing else matches (assumption .85).

| surfaces                                                   | kind                                  | relation  | department                                   | conf |
| ---------------------------------------------------------- | ------------------------------------- | --------- | -------------------------------------------- | ---- |
| 爸 爸爸 父親 老爸 dad father                               | other                                 | father    | men                                          | .95  |
| 媽 媽媽 母親 老媽 mom mum mother                           | other                                 | mother    | women                                        | .95  |
| 男友 男朋友 boyfriend bf                                   | other                                 | partner   | men                                          | .95  |
| 女友 女朋友 girlfriend gf                                  | other                                 | partner   | women                                        | .95  |
| 老公 先生 丈夫 husband                                     | other                                 | spouse    | men                                          | .95  |
| 老婆 太太 妻子 wife                                        | other                                 | spouse    | women                                        | .95  |
| 另一半 伴侶 partner so                                     | other                                 | partner   | – (clarification `recipient.department`)     | .80  |
| 兒子 son                                                   | other                                 | child     | kids (men if ageHint ≥ 18 or `adult`/`成年`) | .80  |
| 女兒 daughter                                              | other                                 | child     | kids (women if ageHint ≥ 18)                 | .80  |
| 小孩 小朋友 孩子 kid child children 姪子 姪女 nephew niece | other                                 | child     | kids                                         | .90  |
| 哥 弟 兄弟 brother                                         | other                                 | sibling   | men                                          | .90  |
| 姊 姐 妹 姊妹 sister                                       | other                                 | sibling   | women                                        | .90  |
| 朋友 friend buddy (with a gift verb)                       | other                                 | friend    | – (clarification)                            | .80  |
| 朋友 friend (no gift verb, e.g. 朋友婚禮)                  | self                                  | –         | ctx.user.department                          | .85  |
| 同事 colleague coworker                                    | other                                 | colleague | – (clarification)                            | .80  |
| 老闆 主管 boss manager                                     | other                                 | boss      | – (clarification)                            | .80  |
| 男生 男的 男生版 for a guy for him men's 男裝              | keep kind; if none set: other/unknown | –         | men                                          | .80  |
| 女生 女的 女生版 for a girl for her women's 女裝           | keep kind; if none set: other/unknown | –         | women                                        | .80  |
| 童裝 kids' children's                                      | –                                     | –         | kids                                         | .95  |
| 不方便說 rather not say doesn't matter who                 | undisclosed                           | –         | unisex                                       | 1.0  |
| capitalised name or handle in `ctx.contacts`               | other                                 | friend    | contact.department                           | .90  |

Department precedence: explicit token (1.0) → relation inference → `ctx.user.department` when
recipient is self (.90) → `unisex` (.40, non-blocking clarification `department`). `for a guy`
with `ctx.user.department === 'men'` and no gift verb → self (.80). `他/她` alone never sets a
department. `recipient.label` = the surface text ("my dad", "Alice").

#### 1.4.5 Engine-owned synonym supplements (union with catalog `LEXICON`)

Aesthetic vibe words (weight < 1 unless listed as explicit):

| slug           | explicit (1.0)                  | vibe (weight)                                           |
| -------------- | ------------------------------- | ------------------------------------------------------- |
| minimalist     | 極簡 簡約 minimal minimalist    | 簡單 素 素色 clean simple basic understated (.7)        |
| quiet-luxury   | quiet luxury 靜奢 低調奢華      | 質感 有質感 elevated polished (.6)                      |
| old-money      | old money 老錢 老錢風           | 貴氣 名媛 heritage (.5)                                 |
| classic        | 經典 classic timeless           | 百搭 耐看 基本款 staple versatile (.6)                  |
| preppy         | 學院 學院風 preppy ivy          | 校園 collegiate varsity (.6)                            |
| korean-minimal | 韓系 韓風 korean k-style        | 韓國 (.8)                                               |
| scandi         | 北歐 scandi scandinavian nordic | –                                                       |
| clean-girl     | clean girl 乾淨系               | 乾淨 素淨 fresh (.5)                                    |
| streetwear     | 街頭 街頭風 streetwear street   | 潮 潮牌 hype skate (.7)                                 |
| y2k            | y2k 千禧                        | 辣妹 2000s (.6)                                         |
| grunge         | grunge 頹廢 油漬搖滾            | 破舊 distressed 90s (.6)                                |
| punk           | 龐克 朋克 punk                  | –                                                       |
| gothic         | 哥德 goth gothic                | 暗黑 暗系 dark (.6)                                     |
| dark-academia  | dark academia 暗黑學院          | –                                                       |
| techwear       | techwear 機能風 科技感          | tactical (.7)                                           |
| gorpcore       | gorpcore 山系                   | 登山 健行 hiking outdoorsy trail 露營 camping 戶外 (.8) |
| athleisure     | athleisure 運動休閒 運動風      | 運動 gym running 跑步 sporty (.7)                       |
| workwear       | 工裝 工裝風 workwear            | utility 工作褲 (.6)                                     |
| military       | 軍裝 軍風 military              | army 軍綠 (.5)                                          |
| normcore       | normcore 基本款                 | 平常 普通 不張揚 everyday plain (.5)                    |
| romantic       | 浪漫 romantic                   | 柔美 溫柔 仙女 飄逸 soft feminine flowy (.6)            |
| coquette       | coquette 甜美 少女              | 蝴蝶結 bow 可愛 cute girly (.6)                         |
| cottagecore    | cottagecore 田園 森林系 森女    | 碎花 floral prairie (.6)                                |
| bohemian       | 波希米亞 波西米亞 boho bohemian | 民族風 folk (.7)                                        |
| balletcore     | 芭蕾 芭蕾風 ballet balletcore   | –                                                       |
| vintage-retro  | 復古 vintage retro 古著         | 懷舊 70s 80s 90s (.8)                                   |
| glam           | 華麗 glam glamorous 晚宴感      | 亮眼 閃 亮片 sparkly sequin (.5)                        |
| avant-garde    | 前衛 avant-garde 解構           | 設計感 experimental (.6)                                |
| harajuku       | 原宿 harajuku 日系街頭          | 日系 japanese street (.6)                               |
| resort         | 度假 渡假 resort vacation       | 海島 海邊感 度假感 (.6)                                 |
| western        | 西部 western cowboy 牛仔風      | 牛仔靴 (.5)                                             |
| artsy-eclectic | 藝術 artsy eclectic 混搭        | 文青 個性 creative arty (.6)                            |

Colour group words (added to `colorWeights` only, never to `colorFamilies`):
`淡色 淺色 pastel light` → white .6, neutral .6, pink .5; `大地色 大地色系 earth tones earthy` → brown .8,
neutral .8, green .5; `深色 dark tones dark colours` → black .8, grey .5, blue .4;
`中性色 neutrals` → black, white, grey, neutral, brown at .6; `亮色 亮一點 bright colourful colorful` →
yellow-orange, pink, blue, green at .5 and `boldness` hint +0.4; `黑白 monochrome` → black .8,
white .8, grey .5; `全黑 all black` → `colorFamilies:['black']` (explicit). Extra colour names →
family: camel/tan/caramel/焦糖/駝 → brown; ivory/cream/米白/奶油白/oat/燕麥 → neutral; navy/藏青/海軍藍/
丹寧藍 → blue; olive/sage/軍綠/橄欖 → green; burgundy/wine/酒紅/maroon → red; blush/rose/玫瑰 → pink;
mustard/芥末 → yellow-orange; lavender/lilac/薰衣草 → purple; charcoal/炭灰 → grey;
gold/silver/metallic/金/銀/花色/印花/print/floral → multi-metallic (`花的`, `花色` in negation scope →
`mustAvoid pattern:floral` + `color:multi-metallic`).

Mode words: `一套 整套 套裝 穿搭 outfit look full outfit whole look 一身 搭配 配一套` → mode outfit.
Browse words: `隨便 看看 逛逛 browse just looking 不知道 沒想法 推薦一下 whatever` → mode browse when no
category/occasion/aesthetic hit.

#### 1.4.6 Modifiers → axis hints (`Δ` summed per axis, clamped to [−1, 1]) and structural effects

| tokens                                                                                   | effect                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 正式 正式一點 formal dressy                                                              | formality +0.5                                                                                    |
| 不要太正式 不想太正式 別太正式 not too formal semi-formal                                | formality −0.35                                                                                   |
| 休閒 隨性 casual relaxed laid-back 太正式(in negation)                                   | formality −0.4                                                                                    |
| 保暖 厚 溫暖 warm cozy thick                                                             | warmth +0.5                                                                                       |
| 涼 涼快 透氣 輕薄 breathable light cool                                                  | warmth −0.5                                                                                       |
| 低調 素 subtle understated 不要太花 不要太俗 不要太浮誇 not too loud not trying too hard | boldness −0.4                                                                                     |
| 亮眼 搶眼 顯眼 bold statement standout                                                   | boldness +0.5                                                                                     |
| 挺 有型 structured sharp tailored                                                        | structure +0.4                                                                                    |
| 軟 柔 飄逸 flowy drapey soft                                                             | structure −0.4                                                                                    |
| 舒適 舒服 comfortable comfy                                                              | structure −0.3; `fits:['relaxed']` if none                                                        |
| 遮 保守 不要太露 modest covered                                                          | coverage +0.4                                                                                     |
| 露 性感 sexy revealing                                                                   | coverage −0.4                                                                                     |
| 不要太短 too short (with dresses/bottoms)                                                | coverage +0.3; `mustAvoid subcategory:mini-dress` when dresses; `subcategory:shorts` when bottoms |
| 流行 當季 新款 潮 trendy trending in-season 最近流行                                     | trendiness +0.5                                                                                   |
| 耐看 不退流行 經典款 timeless                                                            | trendiness −0.3                                                                                   |
| 太貴 too expensive pricey (negated)                                                      | price-tier −0.3                                                                                   |
| 顯瘦 slimming flattering 修身 合身 slim fit fitted                                       | `fits:['slim']`                                                                                   |
| 寬鬆 寬版 oversize oversized baggy loose 落肩                                            | `fits:['oversized']`                                                                              |
| 短版 cropped                                                                             | `fits:['cropped']`; 長版 longline → `fits:['longline']`                                           |
| 防水 waterproof 防風 windproof                                                           | `mustHave attribute:waterproof`                                                                   |
| 口袋 pockets                                                                             | `mustHave attribute:pockets`                                                                      |
| 無logo no logo logo-free 不要logo                                                        | `mustAvoid attribute:logo`                                                                        |
| 實用 practical functional                                                                | structure +0.2; `giftCategoryPrior` prefers accessories/bags when gift                            |
| 過敏 allergic (with a material)                                                          | `mustAvoid material:<m>`                                                                          |

#### 1.4.7 Occasion, season, mode, quantity

- Occasion: first occasion hit by clause order; a second distinct hit adds assumption
  `{slot:'occasion', value:<first>, confidence:.6, reason:'two occasions mentioned; using the first'}`.
  Occasion synonyms = §0.5 columns ∪ `LEXICON.occasions` terms whose value maps to a §0.5 slug.
- Season: explicit season token wins; else if `ctx.now` is set and the utterance has a date phrase
  (`下週 下個月 這週末 next week next month this weekend 明天 tomorrow`) or the occasion ∈
  {wedding-guest, travel, hiking, beach, festival, graduation, gala}, season = season of
  `ctx.now` shifted (+7 d for 下週/next week, +30 d for 下個月/next month) with assumption
  `source:'context'`, confidence .7. `熱 hot` → summer (.7); `冷 cold` → winter (.7).
- Mode: `browse` if browse words and no category/occasion/aesthetic; else `outfit` if mode words,
  or occasion present and no category/subcategory hit, or `referenceLookId` resolved with
  `style-source` role; else `single`.
- Quantity: explicit `N 件/pieces`; `3 or 4` / `三四件` → upper bound (assumption .7); otherwise
  `quantity` stays undefined (`single` is treated as 1; `outfit` lets the template decide, §3.1).
- Gift category prior when `recipient.kind === 'other'` and no category: relation `father` →
  `[outerwear, accessories, footwear, tops]`; `mother` → `[bags, accessories, jewelry, tops]`;
  `partner`/`spouse` with department women → `[jewelry, bags, accessories, dresses]`; with men →
  `[accessories, tops, outerwear, footwear]`; `child` → `[tops, outerwear, footwear, accessories]`;
  `friend`/`colleague`/`boss`/`unknown` → `[accessories, bags, loungewear, tops]`; occasion hiking →
  `[outerwear, footwear, accessories, activewear]` overrides. Stored in `giftCategoryPrior`
  (soft, §2.3) — `categoryGroups` stays empty until the user answers the clarification.

#### 1.4.8 References (`src/intent/reference.ts`)

Patterns: `<Name>的 look`, `<Name> 那套`, `像 <Name> 那樣`, `like <Name>'s look`, `<Name>'s outfit`,
`something like <Name>` → `referenceHandle = <Name>`, `referenceRole:'style-source'`;
`跟 <Name> 一起`, `和 <Name> 一起`, `with <Name>`, `match <Name>`, `跟他的 look 搭` →
`referenceRole:'coordinate-with'` and `recipient` unchanged (self). `<Name>` is a capitalised Latin
token or any `ctx.contacts[].displayName/handle` (CJK names matched by exact contact name).
Resolution: contact with `latestLookId` → `referenceLookId`; `latestLookIds.length > 1` → blocking
clarification `referenceLookId` with up to 4 look ids as options; no contact → `referenceHandle`
only, assumption `{slot:'referenceLookId', value:'', confidence:.3, reason:'Could not resolve <Name>'}`.
When the page passes `ctx.previousIntent?.referenceLookId` (Make It Mine) it is kept.

### 1.5 Clarification policy (`src/intent/clarify.ts`)

Emit at most 2, ordered by the table; `blocking` is true only for the first two rows. Everything
else is an assumption rendered as a tappable chip (the UI synthesises a clarification from the
assumption when tapped). A clarification is suppressed when the slot already has a value from
context.

| condition                                                                                       | slot                   | question zh / en                                           | options                             | blocking            |
| ----------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------- | ----------------------------------- | ------------------- |
| department unresolved (no explicit, no relation, no ctx department)                             | `department`           | 這件是女裝、男裝還是中性？ / Which section should we shop? | women, men, unisex                  | yes                 |
| `referenceHandle` resolves to > 1 Look                                                          | `referenceLookId`      | 你指的是哪一個 Look？ / Which Look do you mean?            | look ids (≤ 4)                      | yes                 |
| recipient other with relation ∈ {friend, colleague, boss, partner, unknown} and department null | `recipient.department` | 對方是男生還是女生？ / Is it for a man or a woman?         | women, men, unisex                  | no (default unisex) |
| gift (recipient other) and no category                                                          | `categoryGroups`       | 想送哪一類？ / What kind of gift?                          | the 4 groups of `giftCategoryPrior` | no                  |
| mode outfit and no budget                                                                       | `budget.max`           | 預算大概多少？ / Roughly what budget?                      | 3000, 6000, 12000, none             | no                  |
| bare `$` with confidence < .75                                                                  | `budget.currency`      | 金額是台幣還是美金？ / Is that TWD or USD?                 | TWD, USD                            | no                  |
| recipient department kids and no size                                                           | `sizes.alpha`          | 小朋友的尺寸？ / Kid's size?                               | XS, S, M, L                         | no                  |
| mode browse with nothing filled                                                                 | `occasion`             | 想先看哪種場合？ / What occasion?                          | casual-daily, office, date, travel  | no                  |

`applyClarification(intent, slot, value)` sets the slot, removes the clarification, replaces any
assumption on that slot with `{confidence:1, source:'utterance'}`, and re-runs `finalize`.
`isClarificationAnswer(utterance, previous)` is true when `previous.clarifications` is non-empty and
the utterance (normalised) equals an option, its zh/en label, or is ≤ 12 characters and contains
an option label.

### 1.6 LLM path (`src/intent/llm-parser.ts`)

Shop uses [Jev decisions](REALTIME_FILTER_SPEC.md) for known-option live filters,
with exact values handled by code. This is a separate decision contract, not another `generateJson`
provider. The generative path below serves open-ended Say it requests independently.

- `LlmIntentOutput` = `IntentSchema` minus `utterance, locale, assumptions, clarifications,
confidence, parser, budget, department` plus
  `budgetRaw: { amount: number|null; amount2: number|null; currency: string|null; kind: 'max'|'min'|'around'|'range'|null; scope: 'total'|'per_item'|null }`,
  `assumptions: [{slot, value, confidence, reason}]`, `clarifications: [{slot, question, options}]`,
  `rawMentions: string[]`.
- System prompt `INTENT_PROMPT_V1` (static string, versioned): the full slug lists (aesthetics with
  labelZh, colour families, category groups, subcategories, materials, patterns, fits, occasions,
  relations), the rules below, and 4 few-shot pairs (fixtures F1, F3, F11, F14 with their expected
  JSON).
  Rules: "Use only the listed slugs. Copy the budget number and currency exactly as written; never
  convert. `recipient.kind = 'other'` only when the sentence says it is for someone else. Every
  inferred slot must appear in `assumptions` with the phrase that triggered it. Ask a clarification
  only when two answers would change the result materially; never more than 2. Output language of
  questions and reasons = language of the sentence."
- User message: `Sentence: <utterance>\nToday: <ctx.now ISO date or 'unknown'>\nUserDepartment: <..>\nContacts: <names>\nPreviousIntent: <json or null>`.
- Post-processing (code wins on numbers): `budget` is rebuilt from the lexicon result whenever the
  lexicon found a number; otherwise from `budgetRaw` via §1.4.2 rules. `sizes`, `quantity`,
  `recipient.department` from the lexicon when the lexicon found them at confidence ≥ .9. Unknown
  enum values are fuzzy-mapped (Levenshtein ≤ 2 against slugs and `LEXICON` terms); unmapped values
  go to `rawMentions` → appended to `vibe` with assumption confidence .3.
- Merge (`mergeLlm`): LLM wins on `aesthetics/aestheticWeights, occasion, mode, categoryGroups,
subcategories, mustHave/mustAvoid (unioned with lexicon negation hits), recipient.relation,
vibe, fits, materials`; lexicon wins on all numbers and on department at confidence ≥ .9;
  assumptions present in both keep the higher confidence; `parser = 'merged'`; `confidence` per
  §1.7 recomputed. Zod failure or shared deadline (3.5 s) → lexicon result with provider `'offline'`.
- The web layer runs both in parallel and shows the lexicon card immediately, swapping in the LLM
  card with a "refined by AI" chip when it arrives.

### 1.7 Confidence

`confidence = clamp(0.3, 0.98, mean(slotConfidence over filled slots) − 0.10·#blockingClarifications)`
where explicit hits have confidence 1.0 and inferred slots the confidence of their assumption.
Filled slots counted: mode, department, categoryGroups, colorFamilies, aesthetics, occasion,
season, budget, recipient, sizes, fits, materials (only those non-empty).

### 1.8 Dialogue state — `mergeIntent(prev, next)` and follow-up phrases (`src/intent/dialogue.ts`)

`isFollowUp(utterance, prev)` is true when the utterance matches a phrase below or is a
clarification answer (§1.5). Any slot `next` fills explicitly replaces `prev`'s; unspecified slots
are kept; `assumptions`/`clarifications`/`confidence` are recomputed; `previousUtterance` is
appended to `vibe` for the LLM only.

| phrase (zh / en)                                              | effect on `prev`                                                                    |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 再便宜一點 便宜點 便宜一點 / cheaper, less expensive          | `budget.max ×= 0.8` (round to 10); if no budget: `axisTargets['price-tier'] −= 0.2` |
| 貴一點也可以 可以再貴一點 / can go higher, pricier is fine    | `budget.max ×= 1.3`                                                                 |
| 換成X色 改X色 X色的 / make it X, in X instead, X version      | `colorFamilies = [X]`, `colorWeights = {X:1}`                                       |
| 不要這個 不要那件 / not this one (with `exclude` ids from UI) | handled by `RecommendRequest.exclude` + `dismiss` feedback                          |
| 正式一點 / more formal, dressier                              | `axisTargets.formality += 0.15`                                                     |
| 休閒一點 / more casual                                        | `axisTargets.formality −= 0.15`                                                     |
| 只要上衣 只要X / just the top, only the X                     | `mode='single'`, `categoryGroups=[group(X)]`                                        |
| 整套 幫我配一套 / whole outfit                                | `mode='outfit'`                                                                     |
| 給我自己 我自己穿 / for me instead                            | `recipient={kind:'self'}`, department from ctx                                      |
| 換個風格 別的風格 / something different                       | `exclude` top-10 previous ids (web layer), `diversity` λ doubled for this turn      |

### 1.9 Intent → vector — `intentToVector(intent, base?)` (`src/intent/vectorize.ts`)

```
v = zeros(64)
// A: aesthetics
for (slug,w) in aestheticWeights: v[A+idx(slug)] = max(v[..], w)         // explicit 1.0, prior/vibe weights
for slug in mustAvoid 'aesthetic:*' (rare): v[..] = 0
if intent.mode==='browse' && all zero: for slug in ctx.trendingAesthetics (≤3): 0.6, else classic .4, minimalist .4
if all zero: classic .4, minimalist .4                                      // keeps cosine non-degenerate
normalise so max = 1
// C: colours
for f in colorFamilies: v[C+idx(f)] = 1.0
for (f,w) in colorWeights: v[..] = max(v[..], w)                            // occasion prior ×0.7 already applied
if no colour set and aesthetics non-empty: v[C+idx(f)] = max over slugs of AESTHETIC_COLOR_PRIOR[slug][f] × aestheticWeights[slug]
for 'color:f' in mustAvoid: v[C+idx(f)] = 0
// X: axes (targets; zeroed by RETRIEVAL_BLOCK_WEIGHTS at query time)
for k in AXES: v[X+idx(k)] = axisTargets[k] ?? 0.5 ; price-tier = budget ? clamp01((ln(perItemMax) − ln 300)/(ln 30000 − ln 300)) : (axisTargets['price-tier'] ?? 0.45)
   where perItemMax = budget.max ?? (budget.min ? budget.min×1.5 : null); for outfit scope 'total': perItemMax = budget.max × 0.45
// G: category
mode single|browse: v[G+idx(g)] = 1 for g in categoryGroups (0 if empty); mode outfit: all 0 (per-slot one-hot is set by the outfit solver)
// preference blend (Engine 03 hook)
if base (64-d) provided: β = min(0.4, 0.10 + 0.02·eventCount) with eventCount from ctx (default β = 0.25 when unknown);
   v[0..51] = (1−β)·v[0..51] + β·base[0..51]; G untouched
return v   (not L2-normalised; callers use blockScale for retrieval)
```

`referenceLookVector(look)`: `look.styleVector` if present else mean of its products' vectors with
G zeroed. For `referenceRole:'style-source'`: `v[A] = 0.5·v[A] + 0.5·ref[A]`, `v[C] = 0.4·v[C] +
0.6·ref[C]` before normalisation; `trendiness` target 0.65.

### 1.10 Fixtures (`test/fixtures/intents.ts`) — exact expected offline parses

Default ctx: `now = 2026-09-18T09:00:00+08:00` (autumn), `user.department = 'women'`,
`contacts = [{ userId:'u_000002', displayName:'Alice', handle:'alice', department:'women', latestLookId:'lk_alice_01' }, { userId:'u_000003', displayName:'Jacob', handle:'jacob', department:'men', latestLookId:'lk_jacob_01' }]`.
Only non-default fields are listed; `assumptions` lists `slot` (value) and `clarifications` lists
`slot[blocking]`. Assumption confidences follow the tables above.

| id  | utterance (ctx override)                                       | expected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | 「下週要去朋友婚禮，預算五千，不想太正式」                     | locale zh-TW; mode outfit; occasion wedding-guest; season autumn; budget {max 5000, soft, total, original "預算五千"}; recipient self/women; aesthetics [classic, romantic, glam, old-money, quiet-luxury]; colorWeights {neutral .35, pink .21, blue .21}; mustAvoid [color:white]; axisTargets {formality .575, coverage .6, boldness .45, warmth .6}; quantity undefined; assumptions: season(autumn), aesthetics, mustAvoid(color:white), axisTargets.formality(.575 "婚禮 75%，不想太正式 −17.5%"), budget.strictness(soft), mode(outfit); clarifications: none |
| F2  | "something like Alice's look but for a guy"                    | locale en; mode outfit; referenceHandle Alice; referenceLookId lk_alice_01; referenceRole style-source; recipient {other, unknown, men, label "a guy"}; department men; assumptions: referenceLookId(.9), recipient.kind(other .8), department(men .8); clarifications: budget.max[no] only (department is resolved by "for a guy")                                                                                                                                                                                                                                  |
| F3  | "gift for my dad under $100, he likes hiking"                  | mode single; recipient {other, father, men, label "my dad"}; department men; occasion hiking; aesthetics [gorpcore, techwear, athleisure]; budget {max 3200, hard, per_item, original "under $100", originalAmount 100, originalCurrency USD}; giftCategoryPrior [outerwear, footwear, accessories, activewear]; axisTargets {formality .1, coverage .8, boldness .4, warmth .6}; assumptions: budget.currency(USD .70), categoryGroups(prior .5), season(autumn .7); clarifications: categoryGroups[no], budget.currency[no]                                        |
| F4  | 「幫我找一件黑色的oversize帽T，三千以內」                      | locale mixed; mode single; quantity 1; categoryGroups [tops]; subcategories [hoodie]; colorFamilies [black]; fits [oversized]; budget {max 3000, hard, per_item}; recipient self/women; aesthetics []; assumptions: department(women, context .9); clarifications: none; confidence ≥ .9                                                                                                                                                                                                                                                                             |
| F5  | 「面試要穿的，整套不要超過八千，不要牛仔褲」                   | mode outfit; occasion interview; budget {max 8000, hard, total}; mustAvoid [subcategory:jeans]; aesthetics [classic, minimalist, quiet-luxury]; axisTargets {formality .8, coverage .8, boldness .2}; assumptions: aesthetics, colorWeights, season(autumn)                                                                                                                                                                                                                                                                                                          |
| F6  | 「夏天去沖繩玩，要度假感，淺色，預算大概一萬」                 | mode outfit; occasion beach (沖繩 token) ; season summer (explicit); aesthetics [resort, bohemian]; colorWeights {white .6, neutral .6, pink .5, blue .28, yellow-orange .21}; budget {min 7500, max 12500, soft, total}; axisTargets {formality .1, coverage .3, boldness .6, warmth .15}; assumptions: mode(outfit .7), aesthetics                                                                                                                                                                                                                                 |
| F7  | "I want a warm coat for winter, camel or grey, around 6000 NT" | mode single; categoryGroups [outerwear]; subcategories [coat]; colors [camel, grey]; colorFamilies [brown, grey]; season winter; axisTargets {warmth 1.0 (0.9+0.25 clamped), coverage .9}; budget {min 4500, max 7500, soft, per_item}; assumptions: department(women)                                                                                                                                                                                                                                                                                               |
| F8  | 「送女友的生日禮物，她喜歡韓系簡約，三千左右，項鍊或耳環」     | mode single; recipient {other, partner, women}; department women; aesthetics [korean-minimal, minimalist]; categoryGroups [jewelry]; subcategories [necklace, earrings]; budget {min 2250, max 3750, soft, per_item}; assumptions: none required; clarifications: none                                                                                                                                                                                                                                                                                               |
| F9  | "gym fit, all black, cheap" (ctx men)                          | mode outfit; occasion gym; colorFamilies [black]; aesthetics [athleisure]; budget {max 4000, soft, total}; axisTargets {formality .05, price-tier .2}; assumptions: budget(cheap .5), mode(outfit)                                                                                                                                                                                                                                                                                                                                                                   |
| F10 | 「過年要穿的，紅色但不要太俗」                                 | mode outfit; occasion lunar-new-year; colorFamilies [red]; mustAvoid [color:black, color:white]; axisTargets {formality .5, boldness .4 (0.6−0.2), coverage .6}; aesthetics [classic, romantic, coquette]; assumptions: aesthetics, mustAvoid; clarifications: budget.max[no]                                                                                                                                                                                                                                                                                        |
| F11 | "running shoes size 42, not Nike" (ctx department undefined)   | locale en; mode single; categoryGroups [footwear]; subcategories [sneakers]; mustHave [text:running]; sizes {'eu-shoe':'42'}; mustAvoid [text:nike]; aesthetics [athleisure]; occasion gym; department unisex; assumptions: department(unisex .4), mustAvoid(brand not in catalog .5); clarifications: department[yes]                                                                                                                                                                                                                                               |
| F12 | 「幫我爸買件襯衫，他 L 號，不要花的」                          | mode single; quantity 1; recipient {other, father, men}; department men; subcategories [shirt]; categoryGroups [tops]; sizes {alpha 'L'}; mustAvoid [pattern:floral, color:multi-metallic]; assumptions: none required; clarifications: none                                                                                                                                                                                                                                                                                                                         |
| F13 | "office outfit for summer, medium, earth tones, no polyester"  | mode outfit; occasion office; season summer; sizes {alpha 'M'}; colorWeights {brown .8, neutral .8, green .5, black .28, white .28, grey .28, blue .21}; mustAvoid [material:polyester]; aesthetics [classic, minimalist, quiet-luxury, korean-minimal]; axisTargets {formality .65, coverage .7, boldness .3, warmth .15} (order rule stated below the table)                                                                                                                                                                                                       |
| F14 | 「想跟 Jacob 一起去音樂祭，幫我配一套跟他的 look 搭的」        | mode outfit; occasion festival; referenceHandle Jacob; referenceLookId lk_jacob_01; referenceRole coordinate-with; recipient self/women; aesthetics [bohemian, y2k, streetwear, harajuku]; assumptions: referenceLookId(.7), season(autumn); clarifications: budget.max[no]                                                                                                                                                                                                                                                                                          |
| F15 | "2 white tees under 800 each"                                  | mode single; quantity 2; subcategories [t-shirt]; categoryGroups [tops]; colorFamilies [white]; budget {max 800, hard, per_item}                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| F16 | 「我不知道，隨便看看」                                         | mode browse; nothing else filled; vibe "我不知道，隨便看看"; assumptions: mode(browse .5), department(women); clarifications: occasion[no]; confidence .5                                                                                                                                                                                                                                                                                                                                                                                                            |
| F17 | follow-up 「再便宜一點，換成藍色」 with previousIntent = F4    | all F4 slots kept; budget.max 2400; colorFamilies [blue]; colorWeights {blue 1}; assumption budget("上限 ×0.8", .8)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

F13 resolution rule (stated once): season targets are applied first, then occasion prior for
formality/coverage/boldness overrides coverage, then hints. So F13 `axisTargets = {formality .65,
coverage .7, boldness .3, warmth .15}`.

---

## 2. Engine 02 — Retrieval, ranking, explanation

### 2.1 Retrieval (`src/recommend/retrieve.ts`)

```ts
export interface RetrieveParams {
  vector: number[] // block-scaled with RETRIEVAL_BLOCK_WEIGHTS
  departments: Department[] // resolved + 'unisex'; kids alone; unresolved → ['women','men','unisex']
  categoryGroups: CategoryGroup[] | null // null = any
  excludeGroups: CategoryGroup[]
  subcategories: string[] | null
  priceMin: number | null
  priceMax: number | null // already widened (below)
  excludeMaterials: string[]
  excludeColorFamilies: ColorFamily[]
  excludeSubcategories: string[]
  excludeBrandIds: number[]
  excludeProductIds: number[]
  requireAttributes: Record<string, true>
  excludeAttributes: Record<string, true>
  limit: number
}
export interface Candidate {
  product: Product
  brandName: string
  cos: number
  channels: Set<'vector' | 'social' | 'trend'>
  socialEvidence: SocialEvidence[]
  trendEvidence: TrendEvidence | null
}
export interface Retriever {
  retrieve(p: RetrieveParams): Promise<Candidate[]>
}
export class PgRetriever implements Retriever {
  constructor(db: Database)
}
export class MemoryRetriever implements Retriever {
  constructor(products: Array<Product & { brandName: string }>)
} // brute-force cosine, identical filters
```

Budget widening: `hard` → `priceMax = max`; `soft` → `round(max × 1.30)`; `flexible` or none →
null; `priceMin = round(min × 0.85)` when set. Outfit slots: `priceMax = round(budget.max ×
slotShareMax[group] × 1.3)` when a total budget exists (§3.1).

Limits: single 300; browse 400; outfit 120 per slot; `similarProducts` 60; `completeTheLook` 80
per slot; `suggestRemix` 120 per slot.

```sql
SET LOCAL hnsw.ef_search = 200;
SET LOCAL hnsw.iterative_scan = 'relaxed_order';   -- pgvector ≥ 0.8; ignored otherwise
SELECT p.*, b.name AS brand_name, 1 - (p.style_vector <=> $1::vector) AS cos
FROM products p JOIN brands b ON b.id = p.brand_id
WHERE p.stock > 0
  AND p.department = ANY($2::department[])
  AND ($3::text[] IS NULL OR p.category_group = ANY($3))
  AND NOT (p.category_group = ANY($4::text[]))
  AND ($5::text[] IS NULL OR p.subcategory = ANY($5))
  AND ($6::int IS NULL OR p.price >= $6)
  AND ($7::int IS NULL OR p.price <= $7)
  AND NOT (p.material = ANY($8::text[]))
  AND NOT (p.color_family = ANY($9::text[]))
  AND NOT (p.subcategory = ANY($10::text[]))
  AND NOT (p.brand_id = ANY($11::int[]))
  AND NOT (p.id = ANY($12::int[]))
  AND ($13::jsonb IS NULL OR p.attributes @> $13)
  AND ($14::jsonb IS NULL OR NOT (p.attributes @> $14))   -- $14 is NULL when there is nothing to exclude
ORDER BY p.style_vector <=> $1::vector
LIMIT $15;
```

Parameter rules: `$3`, `$5`, `$13`, `$14` are passed as SQL `NULL` when unused; every array
parameter is passed as an empty array (never NULL) when unused, so the `NOT (... = ANY(...))`
clauses evaluate to true.

The existing index `products_style_vector_idx` (HNSW cosine) plus `products_dept_group_price_idx`
are sufficient. Latency target at 100k rows: ≤ 40 ms per call; outfit slots run with `Promise.all`.

Relaxation ladder when a call returns < 20 rows (each step is recorded in
`RecommendResponse.timings['relaxed:<step>'] = 1` and in every item's explanation summary as a
caveat): (1) drop `subcategories`; (2) `priceMax ×= 1.25`; (3) add `unisex` if absent (never for
kids); (4) drop `excludeColorFamilies`; (5) drop `categoryGroups` (browse only).

Secondary channels (unioned, deduplicated by id, same prefilters applied in-process):

| channel | source                                                                                                                                                                     | limit | evidence                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------- |
| social  | `look_products` of Looks created in the last 30 d by users `n` with `trust(user,n) ≥ 0.1` (§5.1), plus `purchases` and `SAVE` interactions by those users in the last 30 d | 50    | `{ userId, displayName, kind: 'look'     | 'purchase' | 'save' | 'advise', lookId?, strength, at }` |
| trend   | products whose `aesthetics && top-5 aesthetic keys` and `category_group` with today's `trend_signals` momentum ≥ 60, `ORDER BY popularity DESC`                            | 30    | `{ dimension, key, momentum, emerging }` |

Guests (no `userId`) skip the social channel. `trend` channel skipped when `trend_signals` has no
row for today.

### 2.2 Scoring context and weights (`src/recommend/score.ts`, `weights.ts`)

```ts
export interface RankContext {
  intent: Intent
  intentVector: number[]
  now: Date
  seed: number
  user: {
    id: string
    department: Department
    eventCount: number
    giftEventCount: number
    preference: number[] | null
    giftPreference: number[] | null
    brandCounts: Map<number, { purchases: number; saves: number; dismisses: number }>
    trusted: Array<{ userId: string; displayName: string; strength: number }>
  } | null
  trend: Map<
    string,
    { momentum: number; velocity: number; emerging: boolean; crossCluster: number }
  > // key "aesthetic_category:<a>|<g>", "aesthetic:<a>", "color:<f>"
  popularityMax: number
  weights: Record<FactorName, number>
  slot?: CategoryGroup // outfit slot being scored
}
```

`DEFAULT_WEIGHTS` = arm `balanced` (§4.4). The eight positive weights sum to 1.00; `diversity`
holds λ (a penalty weight, not part of the sum); `compatibility` is 0 outside outfits.

### 2.3 Factors (`src/recommend/factors.ts`) — one function per `FactorName`

Each returns `{ value, applicable, evidence: string, details: Record<string, unknown> }`. Weights of
non-applicable factors are redistributed proportionally over applicable positive factors so
`Σ contribution === score` always holds (asserted ±1e-9). `contribution = w'·value`.

| factor             | value ∈ [0,1]                                                                                                                                                                                                                                                                                                                                                                                                                                     | applicable when                                                          | evidence string (en / zh)                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `style_similarity` | `blockCosine(intentVector, product.styleVector, SIMILARITY_BLOCK_WEIGHTS)`; add `+0.05·[channel has 'social' or 'trend']` capped at 1                                                                                                                                                                                                                                                                                                             | always                                                                   | "matches quiet-luxury (0.82), minimalist (0.61); colour black" / 「風格對到靜奢 (0.82)、極簡 (0.61)；黑色也符合」 — top-2 aesthetics by `intent_w × product_w`, colour named when the product family has intent weight ≥ .4 |
| `attribute_match`  | weighted mean of **specified** sub-checks: subcategory .30 (exact 1 / same group .5 / 0), colour .25 (primary family 1 / secondary hex family .6 / 0; colour-group weights count as `colorWeights[f] ≥ .5`), material .15 (1/0), pattern .05, season .10 (`seasons` contains intent season or `all-season` → 1, else .3), fit .10 (exact 1 / adjacent .5 / 0; adjacency: slim–regular, regular–relaxed, relaxed–oversized), axes .15 (`1 − mean_k | axisTargets_k − product_k                                                | `over specified axes excluding price-tier), mustHave .10 (fraction of`attribute:`/`text:` tokens found), giftCategoryPrior .10 (`categoryGroup ∈ prior` → 1)                                                                | any sub-check specified                                                                                                                      | "checks: hoodie, black, oversized; formality within 0.08" / 「符合：帽T、黑色、寬鬆；正式度差 0.08」                                 |
| `budget_fit`       | in `[min,max]` → 1; over max: `max(0, 1 − (price − max)/(0.5·max))`; under min: `max(0, 1 − (min − price)/min)`; price-tier axis only: `1 −                                                                                                                                                                                                                                                                                                       | tier − product_tier                                                      | `; no budget and `ctx.user.budgetHint`: tier of hint used as a soft max with the same over-formula                                                                                                                          | budget, price-tier target or budgetHint present                                                                                              | "NT$2,180, within NT$3,000" / 「NT$2,180，在預算 3,000 內」; over: "NT$3,300, 10% over budget — kept because the rest fits strongly" |
| `user_preference`  | `blockCosine(pref, product.styleVector, PREFERENCE_BLOCK_WEIGHTS)` where `pref = giftPreference` when `intent.recipient.kind === 'other'` (if `giftEventCount ≥ 3`, else self at ×0.5 blend with department centroid, assumption line「你幫別人買的資料還不多，先參考通用範圍」/ "not much gift history yet"), else self preference                                                                                                               | chosen vector exists and its event count ≥ 3                             | "close to the gorpcore pieces you saved (3 signals)" / 「跟你常收藏的山系單品很像（3 次互動）」; gift: "in line with what you picked for your dad before"                                                                   |
| `social_signal`    | `s = Σ_{e ∈ socialEvidence} strength_e × kindW_e`, kindW: look 1.0, advise .9, purchase .6, save .3; `value = 1 − exp(−s)`                                                                                                                                                                                                                                                                                                                        | user has ≥ 1 trusted edge                                                | "Alice wore this in a Look last week" / 「Alice 上週用它做了 Look」; multiple: "2 people whose taste you trust used it recently"                                                                                            |
| `trend_momentum`   | `momentum/100` of the best matching key among `aesthetic_category:<tag>                                                                                                                                                                                                                                                                                                                                                                           | <group>`(product tags),`aesthetic:<tag>`, `color:<family>`; missing → .3 | trend map non-empty                                                                                                                                                                                                         | emerging: "gorpcore outerwear is spreading across 4 taste circles" / 「山系×外套正在 4 個品味圈擴散」; else "gorpcore momentum 72 this week" |
| `brand_affinity`   | `min(1, 0.4 + 0.15·purchases + 0.05·saves − 0.2·dismisses)`; cold → .4                                                                                                                                                                                                                                                                                                                                                                            | user exists                                                              | "you've bought Northline 2 times" / 「你買過 Northline 2 次」                                                                                                                                                               |
| `popularity_prior` | `log1p(popularity)/log1p(popularityMax)`                                                                                                                                                                                                                                                                                                                                                                                                          | always                                                                   | "a frequent pick lately" / 「最近很多人選」                                                                                                                                                                                 |
| `diversity`        | value ∈ [−1, 0]: `−max_{j∈selected} sim(i,j)`, `sim = 0.5·cos_A(i,j) + 0.3·[same subcategory] + 0.2·[same brand]`; first item 0                                                                                                                                                                                                                                                                                                                   | during MMR                                                               | "similar to #2 (0.71)" / 「與第 2 件相近 (0.71)」                                                                                                                                                                           |
| `compatibility`    | outfit only: mean pairwise `compat` with the other items of the outfit (§3.2)                                                                                                                                                                                                                                                                                                                                                                     | product is inside an outfit                                              | "pairs with the black trousers (0.86)" / 「與黑色長褲很搭 (0.86)」                                                                                                                                                          |

Hard filters applied in-process before scoring (beyond SQL): `text:` mustAvoid tokens matching
`name|description|brandName`; `pattern:` avoid; `sizes` requested and the product's `sizes[]`
lacks the value **for that size system** (products of other systems are unaffected); kids
department mismatch. Nothing hard-filtered ever appears as a factor.

### 2.4 Ranking (`rank(cands, ctx, opts)`), re-rank and `recommend()`

1. Hard filters → factors 1–8 for every candidate → `score = Σ contribution`.
2. Sort by score desc, ties by `popularity` desc then `id` asc.
3. Greedy MMR over the top 60: repeatedly pick `argmax score_i + λ·value_div(i)` (λ =
   `weights.diversity`, default .15); record the `diversity` factor (contribution ≤ 0) so the shown
   sum still reconciles to the displayed score. Hard caps: ≤ 2 items per brand and ≤ 4 per
   subcategory in the top 20 (browse: ≤ 3 per brand).
4. Take `limit` (default 10; `/shop` grid 24), build explanations (§2.5).

`recommend(db, req)`:
`weights = req.weights ?? bandit.choose(context)` → retrieve (single/browse: one call; outfit: per
slot) → load `RankContext` (preference, trusted, brand counts, trend map, popularityMax cached
10 min) → rank → `outfits` when `req.outfits ?? intent.mode === 'outfit'` (§3) → log one
`impression` feedback event per shown item with `context: { armId, weights, position, intentSessionId, contextVector }` →
`RecommendResponse { items, outfits, candidates, weights, intentVector, timings }`.

`similarProducts(db, productId, opts)`: pseudo-intent from the product (aesthetics at
1.0/.6/.4 from `aesthetics[]`, colour family 1.0, axes from the vector, same department + group,
price within [0.5, 2]×), retrieval 60, rank with λ .25, limit 12.

`searchProducts(db, q)`: full-text (`to_tsvector('simple', name||' '||description) @@ websearch_to_tsquery`)
OR trigram `name % q`, plus the lexicon parse of `q` mapped to filters (`parseIntentOffline` with
`mode` forced browse); filters from `ProductSearch`; sorts: relevance = `ts_rank + 0.3·cos(intentVector)`,
`popular` = popularity desc, `trending` = trend_score desc, `new` = created_at desc; facets over
the whole filtered set — every matching row, never a `LIMIT`ed slice of it: an unordered limit
follows whichever index the planner picks, and under `category_group IN (…)` that is the category
index, so the slice is all one group and the rest count zero. The search counts the category
groups and colour families with one filtered aggregate per value (one pass) and the aesthetics by
grouping the stored JSON text; on remote D1 that is 315 660 rows read and under 400 ms for the
unfiltered 105k catalogue, 39 686 rows and ~60 ms for a category (the earlier `json_each` shape
read 916 218 rows in ~600 ms). The construction facets of `SEARCH_FACETS` (`countFacet`) are
counted one facet at a time when asked for, at the cost of the total count. Top 12 each; page
size default 24. Filters are the `SEARCH_FACETS` registry of `@lookline/catalog`: OR within a
facet, AND across, exclusions by SQL with unknown values kept; `keywords` (`whale|orca`) are AND-ed
FTS concepts that skip the lexicon.

### 2.5 Explanation rendering (`src/recommend/explain.ts`)

`Explanation.factors` = all 10 factors (compatibility present with weight 0 outside outfits), sorted
by `|contribution|` desc, each with `evidence` string from §2.3 (`details` kept as an optional field
for the drawer). `summary` = the top ≤ 3 factors with `contribution ≥ 0.04` and `value ≥ 0.5`
rendered as their evidence fragments joined by `; ` (zh: `；`), ≤ 140 characters (zh ≤ 60 CJK),
followed by a caveat in parentheses when `budget_fit.value < 0.7` ("8% over budget") or a
relaxation happened ("subcategory filter relaxed"). If nothing qualifies: "best overall fit for
your request" / 「與你的需求整體最相符」. Locale = intent locale (`mixed` → zh-TW).

`prose` (optional, LLM): one `generateJson` call per result list with schema
`{ sentences: Array<{ productId: number; text: string }> }`, temperature 0.3, shared timeout 3.5 s, prompt
"Rewrite each template sentence into one natural {locale} sentence ≤ 25 words / 40 CJK chars using
only the facts given. No marketing adjectives." Guard (`src/llm/guard.ts` `assertGrounded(text,
evidence)`): every digit sequence and every capitalised token / brand / person / aesthetic name in
the output must appear in the concatenated evidence strings; on failure `prose` is omitted for
that item. LRU cache of 500 keyed by `sha1(productId + summary)`.

---

## 3. Outfit solver (`src/recommend/outfit/*`)

### 3.1 Slot templates (`templates.ts`)

Template key from the occasion table (§0.5); `null` occasion → `casual`. Core alternatives are
mutually exclusive plans: **A** = `dresses`; **B** = `tops + bottoms`; **C** = `tailoring(blazer or
suit) + tops(shirt) + bottoms`. All plans are solved and their outfits compete. Shares are the
maximum fraction of the total budget per slot (`slotShareMax`).

| template     | plans (women)                                    | plans (men/unisex) | required extra slots      | optional slots (seasonal rule)                                     |
| ------------ | ------------------------------------------------ | ------------------ | ------------------------- | ------------------------------------------------------------------ |
| formal       | A, C, B                                          | C, B               | footwear                  | bags, jewelry, outerwear (required when season ∈ {autumn, winter}) |
| work         | B, C, A                                          | B, C               | footwear                  | outerwear (autumn/winter), bags, accessories                       |
| smart-casual | B, A                                             | B                  | footwear                  | outerwear (autumn/winter), bags, jewelry, accessories              |
| party        | A, B                                             | B, C               | footwear                  | bags, jewelry, outerwear (winter)                                  |
| festival     | B, A                                             | B                  | footwear, accessories     | bags, jewelry, outerwear (autumn/winter)                           |
| travel       | B                                                | B                  | outerwear, footwear, bags | accessories                                                        |
| casual       | B, A                                             | B                  | footwear                  | outerwear (autumn/winter), bags, accessories                       |
| sport        | activewear(top) + activewear(bottom)             | same               | footwear                  | outerwear, bags, accessories                                       |
| outdoor      | B (tops or activewear) + (bottoms or activewear) | same               | outerwear, footwear       | accessories, bags                                                  |
| beach        | swimwear + (tops or dresses)                     | swimwear + tops    | footwear                  | accessories, bags                                                  |

Department `kids`: plans B only, no jewelry/tailoring. `excludeCategoryGroups` removes slots and
plans (F5-like "no tailoring" removes C). `quantity` caps optional slots (required first, optional
in table order). Slot subcategory hints: formal-men `tailoring ∈ {blazer, suit}`, `tops ∈ {shirt,
dress-shirt}`; sport footwear ∈ {sneakers, running-shoes}; beach footwear ∈ {sandals, slides};
outdoor footwear ∈ {hiking-boots, boots, sneakers}; travel bags ∈ {backpack, crossbody}.
Hints are soft (`subcategories` filter first; relaxation step 1 drops them).

`slotShareMax`: dresses .55, tailoring .50, outerwear .50, footwear .40, tops .30, bottoms .35,
bags .35, jewelry .25, accessories .15, activewear .30, swimwear .35, loungewear .30.
`minPrice` for optional slots = 300.

Per-slot retrieval: intent vector with `G` one-hot for the slot's group(s); for `footwear, bags,
accessories, jewelry` the colour block is `0.5·intent + 0.5·neutralPrior` (black, white, neutral,
brown at .6) so accessories default to neutrals; `priceMax` per §2.1; rank with `k = 25`
(anchor slot 40), λ .10.

### 3.2 Pairwise compatibility (`compat.ts`)

`compat(a, b) = 0.35·colour + 0.30·aesthetic + 0.20·formality + 0.15·season`, clamped [0,1].
Pairs `accessories×jewelry` and `bags×jewelry` are not scored.

`colour(a, b)` with `hsl = hexToHsl(colorHex)` (fallback §0.4), `neutral = family ∈ NEUTRAL_FAMILIES || s < 0.12`:

```
both neutral: 0.85; +0.05 if |Δl| ≥ 0.25; 0.70 if both black
one neutral: 0.90
multi-metallic: 0.80 with a neutral, 0.50 with a chromatic, 0.30 with another multi-metallic
same family (chromatic): 0.80; 0.70 if |Δl| < 0.10
Δh = min(|h_a−h_b|, 360−|h_a−h_b|):
  Δh ≤ 40 → 0.80 (analogous); 150 ≤ Δh ≤ 210 → 0.75 (complementary); 100 ≤ Δh < 150 → 0.65 (triadic); else 0.45
both s > 0.70 and chromatic → −0.10 (two loud colours)
secondaryColorHex: colour(a,b) = 0.7·primary + 0.3·max(secondary pairings) when either has one
explicit intent colours: no change (already in item scores)
```

`aesthetic(a, b) = cosineRange(a, b, 0, 32)`; +0.10 if they share a tag in `aesthetics[]`; capped 1.
`formality(a, b) = 1 − |a[X+0] − b[X+0]|`; ×0.8 when both `boldness` (`X+2`) > 0.7 (one statement piece).
`season(a, b)`: 1 if `seasons` intersect or either contains `all-season`; 0.5 if adjacent seasons;
0.3 otherwise; when the intent has a season, multiply by 1 if both carry it, 0.85 if one, 0.7 if none.

Coordinate-with (`referenceRole:'coordinate-with'`, partner look `L` with vector and palette):
each candidate's item score gets `+0.15·compat(item, L)` (recorded inside the `compatibility`
factor evidence "harmonises with Jacob's Look"), and outfits whose dominant colour family has
`colour(dominant, L.dominant) < 0.65` are dropped (if all are dropped, keep the best and add the
caveat "palette differs from Jacob's Look").

### 3.3 Beam search (`solver.ts`)

```
solveOutfits(plans, candidatesBySlot, intent, budget, opts = { beam: 8, perSlot: 25, returnK: intent outfitCount ?? 3, seed })
for plan in plans:
  order = plan core slots (dresses | tops→bottoms | tailoring→tops→bottoms), then footwear, outerwear, bags, accessories, jewelry, activewear, swimwear (only slots present)
  beam = [ { items: [], cost: 0, itemSum: 0, pairSum: 0, pairs: 0 } ]
  for slot in order:
    next = []
    for s in beam:
      options = top perSlot candidates of slot (pre-sorted score desc, id asc) + [SKIP] if slot optional
      for c in options:
        if c ≠ SKIP:
          if budget.max and s.cost + c.price + minRemainingRequired(after slot) > budget.max × (strictness hard ? 1.00 : 1.15) → continue
          if c.id ∈ s.items → continue
          pairSum' = s.pairSum + Σ_{i ∈ s.items} compat(i, c) (skipping unscored pairs); pairs' accordingly
        f = 0.60·(itemSum'/n) + 0.35·(pairSum'/max(pairs',1)) + 0.05·util − samenessPenalty − budgetPenalty
          util = budget.max ? min(1, projectedCost/budget.max) : 1 − |mean price-tier − intent price-tier|
                 projectedCost = cost' + Σ_{remaining required} medianPrice(slot)
          samenessPenalty = 0.10·[same brand as any item] + 0.15·[same chromatic family as ≥ 2 items]
          budgetPenalty = strictness soft ? max(0, cost'/budget.max − 1) : 0
        next.push(s')
    dedupe next by sorted product-id set; sort by f desc, tie (cost asc, first id asc); beam = next[0..beam]
  keep terminal states (all required slots filled, cost ≤ budget.max·(hard?1:1.15)); if none, keep the cheapest complete state flagged over-budget (caveat "NT$X over budget")
pool = all plans' terminal states; diversify(pool, returnK)
```

`minRemainingRequired(slot)` = Σ over remaining required slots of the minimum candidate price
(precomputed). Complexity ≤ 3 plans × 8 slots × 8 beam × 26 options × ≤ 7 pair evaluations
≈ 35k compat calls, < 20 ms.

`diversify`: greedily accept outfits in `f` order such that Jaccard(product ids) ≤ 0.4 with every
accepted outfit **and** (dominant aesthetic differs or core item differs); if fewer than `returnK`
qualify, relax to Jaccard ≤ 0.6, then ≤ 0.8.

### 3.4 Output mapping to the contract `Outfit`

- `id` = `sha1(sorted product ids).slice(0, 12)` (deterministic).
- `items` = `RankedItem[]` with `role` ∈ {top, bottom, dress, outer, shoes, bag, accessory,
  jewelry, activewear, swimwear, tailoring}; each item's factors are rescaled ×0.60 and a
  `compatibility` factor (weight 0.35, value = mean compat with the other items) is appended so
  `Σ contribution = item score inside the outfit`.
- `total` = Σ price; `budget` = `budget.max`; `compatibility` = mean pairwise compat;
  `styleVector` = `deriveLookStyle(items).styleVector`.
- `explanation.summary` = label + budget sentence + best pairing sentence + strongest item reason:
  「經典・半正式：總價 NT$4,680（預算 5,000 的 94%）；黑 × 米色中性配色；風格對到靜奢」 /
  "Classic · Smart: NT$4,680 (94% of 5,000); black × beige neutral pairing; matches quiet-luxury".
  Label = top aesthetic of the mean `A` block + formality bucket (< .35 casual/休閒, .35–.65
  smart/半正式, > .65 formal/正式). `explanation.factors` = `[compatibility (mean pair), budget_fit
(outfit-level), style_similarity (mean item)]`.
- Pairing sentences (all pairs computed; the UI shows the top 3 by compat and any pair < 0.5 as a
  caution), chosen by the dominant component:

| dominant              | zh                                                  | en                                                                         |
| --------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| colour, one neutral   | {A} 是中性色，撐住 {B} 的{family_b}                 | {A} is neutral, so it anchors the {family_b} {B}                           |
| colour, both neutral  | 黑 × 米：中性配色                                   | black × beige: neutral pairing                                             |
| colour, same family   | 同色系不同深淺，有層次                              | tonal pairing                                                              |
| colour, analogous     | {family_a} 配 {family_b} 是鄰近色                   | {family_a} and {family_b} are analogous                                    |
| colour, complementary | {family_a} 配 {family_b} 是互補色，有記憶點         | {family_a} and {family_b} are complementary                                |
| aesthetic ≥ .8        | 都是 {tag} 路線                                     | both lean {tag}                                                            |
| formality diff ≤ .1   | 正式度一致                                          | same level of dressiness                                                   |
| season                | 都適合{season}穿                                    | both suit {season}                                                         |
| caution (compat < .5) | 注意：{A} 比 {B} 正式很多 / 兩件都很搶眼 / 色相衝突 | note: {A} is much dressier than {B} / two statement pieces / colours clash |

### 3.5 `completeTheLook(db, productId, opts)` and `suggestRemix(db, sourceLookId, userId, opts)`

- `completeTheLook`: pseudo-intent from the product (as in `similarProducts`), occasion from
  `product.occasions[0]` mapped to a template (default casual), plans B/A minus the product's group,
  the product pinned into its slot (cost counted, price included in `total`), budget `opts.budget ??
user.budgetHint × 3 ?? null`, `count = opts.count ?? 2`.
- `suggestRemix` (Make It Mine): intent from `referenceLookVector(source)` with
  `referenceRole:'style-source'`, department/sizes/preference of `userId`, budget `opts.budget ??
median(user purchases) × 3 ?? source total × 1.2`; per-slot candidates get a `+0.3` bonus inside
  `attribute_match` (sub-check `keptFromSource` weight .3: same `colorFamily` or same `subcategory`
  as a source item). Returns `RemixSuggestion { sourceLook, items (best outfit's items with roles),
explanation (outfit explanation + "kept: palette black/neutral, aesthetics quiet-luxury; swapped:
skirt → wide-leg trousers"), keptAesthetics (source top-3 tags present in the result mean A
block ≥ .4), palette (source palette families present in the result) }`.

---

## 4. Engine 03 — Preference feedback loop (`src/preference/*`)

### 4.1 Rewards (`rewards.ts`) — exactly the 9 contract `FeedbackKind`s; variants via `context`

| kind        | reward r                       | context modifiers                                                                                                    | target vector                                                                                           |
| ----------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| impression  | 0                              | `{ armId, weights, position, contextVector }` — never updates a vector; needed for bandit denominators               | –                                                                                                       |
| click       | +0.10                          | –                                                                                                                    | self / gift by `forOthers`                                                                              |
| save        | +0.40                          | –                                                                                                                    | same                                                                                                    |
| dismiss     | −0.30                          | –                                                                                                                    | same                                                                                                    |
| add_to_bag  | +0.60                          | –                                                                                                                    | same                                                                                                    |
| purchase    | +1.00                          | `{ forKind }`: `self` → self; `other` → gift (`forOthers = true`); `undisclosed` → self at ×0.5 **and** gift at ×0.5 | per `forKind`                                                                                           |
| ask_choice  | +0.35 chosen / −0.10 rejected  | `{ chosen: boolean, role: 'asker'                                                                                    | 'adviser', askId }`; adviser rows are +0.15 on the adviser's **gift** vector (what you pick for others) | asker: self; adviser: gift |
| remix       | +0.60 kept / −0.15 swapped-out | `{ kept: boolean, sourceLookId }`; one row per source product; the remixer's self vector                             | self                                                                                                    |
| look_create | +0.80                          | `{ lookId }`; one row per product in the Look (or the Look vector when `productId` is null)                          | self                                                                                                    |

`reward` is written on the row at insert time. Event vector `v_e` = `product.styleVector`, or
`look.styleVector` when only `lookId` is set. `recordFeedback(db, input)` inserts the row, applies
§4.2 to `users.preferenceVector` / `users.giftPreferenceVector`, and writes a
`preference_snapshots` row when `eventCount % 5 === 0` or `kind === 'purchase'`
(`version = previous + 1`, `topAesthetics` per §4.5, `metrics = { mass, confidence, giftMass,
giftEventCount, cosToPrevious }`, `eventCount`). Attribution for the bandit: an event with
`intentSessionId` credits the impression batch of that session (§4.4).

### 4.2 Update rule (`update.ts`)

State per user and target `t ∈ {self, gift}`: `{ p: number[64], n: number, mass: number, lastAt }`
(`n`/`mass` live in the latest snapshot `metrics`; `p` in `users`). Prior `p0` = department
centroid (mean of catalog vectors of the user's department, computed once per process from a
seeded 2,000-product sample via `generateProduct` — no table), with `X` block 0.5 and `G` uniform 1/12.

```
applyEvent(state, v, r, scale, now):
  Δdays = (now − lastAt)/86400 (0 on first event)
  p ← p0 + (p − p0)·2^(−Δdays/45)                      // decay toward prior
  η  = max(0.05, 0.25 / sqrt(1 + n/20)) · scale         // scale: 1.0, or 0.5 for undisclosed halves
  g  = r > 0 ? r : 0.5·r                                 // negatives move half as far
  p[0..51] ← clamp01(p[0..51] + η·g·(v[0..51] − p[0..51]))
  p[52..63] ← r > 0 ? (1 − 0.5η)·p[52..63] + 0.5η·v[52..63] : p[52..63]
  n ← n + 1; mass ← mass·2^(−Δdays/45) + |r|; lastAt ← now
effective(state, now): p_eff = p0 + (p − p0)·2^(−Δdays/45); confidence = mass/(mass + 3)
```

Tests assert: η(0)=.25, η(20)=.1768, floor .05; a purchase of `v[a]=1` never decreases `p[a]`;
dismiss moves half as far as a save of equal magnitude; after 45 idle days the distance to prior
halves; confidence ≈ .25 after one purchase; `forOthers` events never touch self.

### 4.3 Profile (`profile.ts`) — `getPreferenceProfile(db, userId)`

- `vector` / `giftVector` = effective vectors (null when `n < 1`).
- `topAesthetics` (≤ 5, weight ≥ .25): `weight = p_eff[A+idx]`; `confidence = weight × (1 − exp(−n_tag/5))`
  with `n_tag` = positive events whose product has `v[tag] ≥ 0.4` (from the last 200 events);
  `evidence` = up to 3 strings "saved Northline wool coat (+0.40, 3 Sep)" / 「收藏 Northline 羊毛大衣（+0.40，9/3）」
  of the events with the largest `|r|·decay·v[tag]`.
- `topColorFamilies` = top 3 of `C`; `axes` = `X` block; `giftTopAesthetics` same on the gift vector.
- `snapshots` = last 10 `preference_snapshots` rows; the `/me` card shows `cosToPrevious` as the
  "what changed" line and the delta of top aesthetics vs the snapshot ≥ 7 days old.
- `bandit.arms` = per user from `feedback_events`: `pulls` = impression batches served under each
  arm, `meanReward` = mean attributed slate reward (§4.4).
- Users with `n < 3`: `topAesthetics = []` and the UI shows "still learning — 3 − n more signals"
  / 「還在學習中，再 {3−n} 次互動」.

### 4.4 Contextual bandit — global disjoint LinUCB over blend-weight arms (`bandit.ts`)

Arms (positive weights sum to 1.00; `diversity` λ listed; `compatibility` 0):

| arm                | style | attr | budget | pref | social | trend | brand | pop | λ   |
| ------------------ | ----- | ---- | ------ | ---- | ------ | ----- | ----- | --- | --- |
| balanced (default) | .30   | .15  | .10    | .15  | .10    | .07   | .05   | .03 | .15 |
| intent-strict      | .40   | .25  | .12    | .05  | .05    | .03   | .02   | .08 | .15 |
| taste-led          | .22   | .12  | .08    | .32  | .08    | .05   | .05   | .03 | .15 |
| social-led         | .22   | .12  | .08    | .15  | .25    | .05   | .05   | .03 | .15 |
| trend-led          | .22   | .12  | .08    | .12  | .10    | .23   | .05   | .03 | .15 |
| explore            | .28   | .14  | .10    | .14  | .08    | .10   | .02   | .04 | .30 |

Context `x ∈ R^8` (all in [0,1]): `[1, min(1, n_self/50), 1[recipient other], min(1, |trusted|/10),
intent.confidence, 1[mode outfit], 1[budget.max set], min(1, daysSinceSignup/60)]`.
State per arm `A_a ∈ R^{8×8}` (init `I`), `b_a ∈ R^8` (init 0), `pulls_a`, `rewardSum_a`; α = 0.6.
Selection: `θ_a = A_a^{-1} b_a`; `ucb_a = θ_aᵀx + α·sqrt(xᵀA_a^{-1}x)`; argmax, ties → table order.
Users with `n_self < 3` are forced to `balanced` (no exploration on an empty profile) unless
`RecommendRequest.weights` is given. 8×8 inverse by Gauss–Jordan in `linalg.ts`.
Slate reward when a slate closes (next `recommend` by the same user, or 24 h):
`R = clip(Σ_{events attributed to the slate} r_e / log2(position + 2), −1, 1)` mapped to `[0,1]` by
`(R + 1)/2`; update `A_a += x xᵀ`, `b_a += R'·x`, `pulls_a += 1`, `rewardSum_a += R'`.

Persistence: **schema addition (the only one this spec requires)** — table `bandit_state (id text
primary key, state jsonb not null, updated_at timestamptz not null default now())` with the single
row `id = 'global'`; the state is also a pure function of `feedback_events` (impressions carry
`armId` and `contextVector`; rewards attach via `intentSessionId`), so `runAnalytics` rebuilds it
by replay (`rebuildBanditFromEvents`) and the row is a cache. If the table is absent at runtime the
engine keeps the state in a process-level cache rebuilt by replay of the last 5,000 slates on
first use and logs a warning. `PreferenceProfile.bandit` and `/me` show the current arm, its UCB
values, and the reason string "social-led — friends' picks converted for you 3 of 4 times".

### 4.5 Evaluation — `evaluatePreferenceLoop(config): EvalResult` (sync, pure, `evaluate.ts`)

Runs entirely in memory: catalog subset = `generateProduct(i, config.seed, brands)` for
`i = 1..config.catalogSize` (default 20,000 via `pnpm evaluate`; tests use 2,000), `MemoryRetriever`,
the lexicon parser, `rank`, §4.2 and §4.4 exactly as in production. `Math.random` is stubbed to
throw in `vitest.setup.ts`. Optional `EvalConfig` additions: `seeds?: number[]` (default
`[seed]`; `pnpm evaluate` uses 5 seeds `seed..seed+4`), `conditions?` (default all below).

Synthetic users (`sim-users.ts`, `makeSyntheticUsers(n, seed)`): archetype ∈ 12 fixed archetypes
(`gorp-tech: gorpcore, techwear`; `quiet-lux: quiet-luxury, old-money`; `street-y2k: streetwear, y2k`;
`korean-min: korean-minimal, minimalist`; `romantic-cottage: romantic, cottagecore`;
`office-classic: classic, preppy`; `glam-party: glam, avant-garde`; `boho-resort: bohemian, resort`;
`scandi-clean: scandi, clean-girl`; `goth-punk: gothic, punk`; `athleisure: athleisure, normcore`;
`artsy-vintage: artsy-eclectic, vintage-retro`), hidden taste `h`: primary tags at [1.0, 0.7] plus
one random tag at 0.3; colours from `AESTHETIC_COLOR_PRIOR` of the primaries (max-merged) plus one
random family at 0.4; axes = `AESTHETIC_AXIS_PRIOR` mean + N(0, .08) clipped; `G` = department
frequencies; department by archetype (women/men/unisex 0.5/0.4/0.1); `budgetMax` log-uniform
[1500, 12000]; `pickiness ρ ∈ [0.5, 0.9]` uniform; 12 intent templates per department drawn from
the fixtures' phrasing with occasion/season/budget slots filled from the persona (budget ≈
`budgetMax` ± 30%).

Relevance: `rel(p) = blockCosine(h, v_p, PREFERENCE_BLOCK_WEIGHTS) × budgetOk(p)` where `budgetOk =
1` if `price ≤ budgetMax` else `max(0, 1 − (price − budgetMax)/(0.5·budgetMax))`. Ground truth per
(user, template): `REL = top 2%` of the template's candidate pool (precomputed once, 300 candidates
per (user, template) by brute-force retrieval → 200 × 12 × 20k = 48M cosines, ≈ 2 s) with graded
gains `rel` binned to {3, 2, 1, 0} at the 99th / 97th / 90th percentiles of the pool.

Click model (rng from `hashSeed(seed, userIndex, round)`), per slate item `i` at position `pos`:
`examine = 1/log2(pos + 2)`; `P(click | examined) = σ(12·(rel − ρ))`; `P(save | click) = σ(10·(rel −
ρ − 0.05))`; `P(purchase | save) = σ(10·(rel − ρ − 0.12))·[price ≤ 1.2·budgetMax]` (≤ 1 purchase
per round); `P(dismiss | examined, no click) = 0.15·σ(10·(ρ − rel))`; `config.noise` flips each
click/dismiss decision with that probability.

Conditions (same users, same rng streams):

| condition                    | preference updates                                                      | weights         | EvalRound keys                                            |
| ---------------------------- | ----------------------------------------------------------------------- | --------------- | --------------------------------------------------------- |
| `static` (contract baseline) | none                                                                    | `intent-strict` | `baselineHitRate, baselineNdcg, baselineCumulativeReward` |
| `learned`                    | §4.2                                                                    | `balanced`      | `prefOnlyHitRate, prefOnlyNdcg`                           |
| `full` (contract "learned")  | §4.2                                                                    | LinUCB (§4.4)   | `hitRate, ndcg, cumulativeReward, cosineToTruth`          |
| `placebo`                    | §4.2 with rewards permuted across the round's events (item-independent) | LinUCB          | `placeboHitRate, placeboNdcg`                             |
| `oracle`                     | preference := `h`, confidence 1                                         | `taste-led`     | `oracleHitRate, oracleNdcg`                               |

Per round (mean over users): `hitRate = 1[slate ∩ REL ≠ ∅]`; `ndcg@k` with gain `2^rel − 1`;
`cumulativeReward` = running Σ of §4.1 rewards; `cosineToTruth = blockCosine(p_eff, h,
PREFERENCE_BLOCK_WEIGHTS)`; also `armShare_<arm>` for `full`. With several seeds the series holds
means and the summary adds `ci95_liftNdcg` (t-distribution over seeds) and `placeboLiftNdcg`.
`summary.roundsToBeatBaseline` = first round where `ndcg > baselineNdcg` for 3 consecutive rounds
(−1 if never). `explicitAestheticRecall` (round K) = share of hidden primary tags present in the
profile's top-3.

Pre-registered success criterion (asserted by the sim test on `seed 1, users 40, rounds 12,
catalogSize 2000, k 10`): `full.ndcg(12) ≥ 1.15 × static.ndcg(12)`; `cosineToTruth` non-decreasing in
≥ 10 of 12 rounds and `≥ round-1 value + 0.12`; `|placebo.ndcg(12) − static.ndcg(12)| ≤ 0.03`;
`oracle.ndcg ≥ full.ndcg`; identical config → byte-identical JSON. Runtime target: the sim test <
10 s; `pnpm evaluate` (200 × 30 × 5 conditions × 5 seeds on 20k) < 3 min, stored in
`evaluation_runs` and rendered on `/trends` (NDCG@10 and cosine lines with CI bands, cumulative
reward bars, arm-share stacked area, table at rounds 1/5/10/20/30, caption with the reproduction
command `pnpm evaluate -- --seed 42 --users 200 --rounds 30`).

---

## 5. Graph and trend analytics (`src/analytics/*`)

`runAnalytics(db, { now })` runs, in order and idempotently: relationships → taste clusters →
social clusters → lineage stats → trend signals (last 60 days) → manufacturing → bandit rebuild.

### 5.1 Relationships (`graph/relationships.ts`)

`deriveRelationships(interactions (180 d), purchases, askResponses, now) → RelationshipRow[]`
(`aUserId → bUserId`, contract kinds only). `weight = 1 − exp(−Σ base·2^(−age_days/30) / 4)`,
`count` = contributing events, `lastAt` = latest event. Rows with `Σ base·decay < 0.05` dropped.

| kind        | trigger                                                                                                                               | direction | base                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------- |
| asks        | `ASK` A→B                                                                                                                             | A→B       | 1.0                                           |
| trusts      | `ADVISE` B→A followed by A `SAVE`/`PURCHASE` of the advised product within 7 d (`source_interaction_id` or `purchases.source_ask_id`) | A→B       | 2.0 (purchase) / 1.0 (save)                   |
| trusts      | `ADVISE` B→A not followed                                                                                                             | A→B       | 0.3                                           |
| inspired_by | A `REMIX` of B's Look                                                                                                                 | A→B       | 1.5                                           |
| inspired_by | `INSPIRE` (A's purchase with `source_look_id` owned by B)                                                                             | A→B       | 2.5                                           |
| styles      | `STYLE` B→A (B styled A / answered a style_me Ask with a Look)                                                                        | B→A       | 1.5 (+1.5 if A purchased from it within 14 d) |
| buys_for    | `BUY_FOR` A→B                                                                                                                         | A→B       | 2.0                                           |
| shops_with  | `TOGETHER` participants (both directions)                                                                                             | A↔B       | 1.5                                           |
| remixed     | A `REMIX` of B's Look (inverse view)                                                                                                  | B→A       | 1.0                                           |

`trust(A, B) = clamp01(1.0·w_trusts + 0.7·w_inspired_by + 0.6·w_styles + 0.5·w_asks + 0.5·w_shops_with + 0.3·w_buys_for)`
— the `strength` used by the social channel and `social_signal`; `trusted` = top 20 by trust.
`getUserNetwork` returns the raw rows (never rendered as scores to end users).

### 5.2 Taste clusters (`graph/cluster.ts`) and social clusters

`kmeans(vectors, k, seed, { iters: 30, tol: 1e-4 })` with k-means++ init (`createRng(seed)`),
cosine distance over `blockScale(v, PREFERENCE_BLOCK_WEIGHTS)` L2-normalised; empty clusters are
re-seeded with the farthest point. `chooseK(n)`: n < 100 → 3; < 400 → 5; < 1500 → 8; else 10.
Users with `eventCount ≥ 3` fit; others are assigned to the nearest centroid. Written to
`users.tasteCluster`. Label = top-2 centroid aesthetics ("korean-minimal / minimalist");
`TrendDashboard.clusters` recomputes centroids from members at read time (no cluster table).
Social clusters: keep the simulation's `users.socialCluster`; users with null get label
propagation over the undirected relationship graph (weights = Σ kinds) for 10 iterations, ties by
lowest label, seeded by the taste cluster.

### 5.3 Lineage stats (`trend/lineage.ts`) → `lineage_stats`

Tree edges: `looks.parent_look_id`; Together editions are children of each `look_participants.source_look_id`.
BFS from each root (`parent_look_id IS NULL`), visited-set guard.

| column                  | definition                                                                             |
| ----------------------- | -------------------------------------------------------------------------------------- |
| depth                   | longest root→leaf path (root = 0)                                                      |
| nodes                   | Looks in the tree incl. root                                                           |
| uniquePeople            | distinct owners ∪ distinct actors of `SAVE/REACT/ASK/ADVISE/SHARE` on tree Looks       |
| clustersReached         | distinct `users.tasteCluster` of owners (null counts as none; min 1)                   |
| shares / asks / remixes | `SHARE` / `ASK` interactions on tree Looks; remix Looks in tree                        |
| purchases / gmv         | `purchases.source_look_id ∈ tree`, count and Σ `price × quantity` (buyer ≠ root owner) |
| velocity                | `(nodes − 1) / max(1, (lastAt − firstAt) in days)`                                     |
| shareToRemixRate        | `remixes / max(shares, 1)`                                                             |
| remixToPurchaseRate     | `purchases / max(remixes, 1)`                                                          |
| firstAt / lastAt        | root `created_at` / latest tree Look `created_at`                                      |

`getLineage(db, lookId)` returns `LineageTree` with the root's `LineageNode` tree (≤ 200 nodes; per
node `purchases`, `gmv`, `reactions`), `stats`, and `path` (root→look). Influencers
(`TrendDashboard.influencers`, top 10): per user, `remixesCaused` = remix children of their Looks,
`downstreamPurchases`/`downstreamGmv` over subtrees of their Looks, `clustersReached` union,
`influence = 1 − exp(−(0.5·log1p(remixesCaused) + 0.3·log1p(downstreamPurchases) + 0.2·clustersReached)/2)`.

### 5.4 Daily trend signals (`trend/signals.ts`) → `trend_signals`

Keys per dimension: `aesthetic` (product `aesthetics[]`, look `aesthetics[]`, intent aesthetics with
weight ≥ .5), `category` (`category_group`), `color` (`color_family`), `silhouette` (`silhouette`
column, or `silhouette_id`), `aesthetic_category` (`<tag>|<group>`). An event contributes once per
key it maps to; a Look contributes through its products, deduplicated per key. Momentum scale
0–100.

Event weights: `VIEW 1, SEARCH 2 (intent_sessions rows keyed by intent aesthetics/categories/colours),
SAVE 3, ASK 2, ADVISE 2, REACT 2, SHARE 4, LOOK_CREATE 5, REMIX 6, TOGETHER 5, INSPIRE 6, PURCHASE 10,
BUY_FOR 10, DISMISS −1`.

Per key and day `d` (window ends at `d` 23:59 local):

```
volume         = Σ weights on day d (integer, stored)
volume_7d      = Σ d−6..d ;  volume_prev_7d = Σ d−13..d−7
velocity       = (volume_7d − volume_prev_7d) / (volume_prev_7d + 10)
crossCluster   = (c/k) · (H/ln c) with c = clusters contributing ≥ 2 weighted units in d−6..d, H = Shannon entropy of cluster shares; c ≤ 1 → 1/k
conversion     = purchases_7d / (saves_7d + remixes_7d + asks_7d + 5)
gmv            = Σ purchase price×quantity carrying the key in d−6..d
lineageReach   = 1 − exp(−Σ uniquePeople over root Looks carrying the key created in d−13..d / 50)
volNorm        = min(1, log1p(volume_7d) / log1p(V95))   with V95 = 95th percentile of volume_7d in the dimension that day
momentum       = 100 · clamp01(0.30·(clip(velocity, −1, 3) + 1)/4 + 0.25·crossCluster + 0.20·min(1, conversion/0.5) + 0.15·lineageReach + 0.10·volNorm)
emerging       = volume_7d < median(volume_7d in dimension) AND velocity ≥ 0.5 AND c ≥ 2 AND volume_7d ≥ 20 AND daily volume rose on ≥ 2 of the last 3 days
status (evidence.status) = dormant (volume_7d < 5) | emerging | rising (velocity ≥ .25) | fading (velocity ≤ −.3) | stable
evidence = { status, volume7d, volumePrev7d, spreadClusters: c, byCluster: {id: volume}, daily: [14 numbers], topProducts: [5 ids], topRootLooks: [3 ids], searches7d, purchases7d, remixes7d }
```

`getTrendDashboard(db, { days = 14, now })` fills `TrendSeries` from the latest day (`series` =
the 14-day `daily` array), `emerging` = all rows with `emerging = true` sorted by momentum, and
the headline from raw tables over the window (`purchasesFromLooks` = purchases with
`source_look_id`, `crossClusterShare` = share of remixes whose remixer cluster ≠ source owner
cluster, `avgLineageDepth` = mean `lineage_stats.depth` over roots created in the window).

### 5.5 Manufacturing recommendations (`trend/manufacturing.ts`) → `manufacturing_recommendations`

Triples `(aesthetic, categoryGroup, colorFamily)` with ≥ 10 weighted events in 14 d (colour may be
null for the pair-level row). Inputs per triple: `demand14d` = weighted events; `demandIntents14d`
= `intent_sessions` (14 d) whose intent has the tag with weight ≥ .5, the group (or outfit mode with
the group in its template's required slots), and the family (or no colour); `momentum` from the
`aesthetic_category` row × `(0.5 + 0.5·colour momentum/100)`; `conversion`, `crossCluster`,
`clusters` from that row; `supply` = in-stock products matching; `lowStockShare` = share of matching
products with `stock < 5`; `searchGap` = sessions matching the triple with no purchase in the same
session / matching sessions; `dominantSubcategory` = most frequent subcategory among matching
products in Looks/purchases (7 d).

```
supplyGap  = 1 − exp(−demandIntents14d / (supply + 1))
score      = 0.35·momentum/100 + 0.25·supplyGap + 0.20·min(1, conversion/0.5) + 0.20·crossCluster
confidence = min(1, log1p(demand14d)/log1p(200)) · (0.5 + 0.5·crossCluster) · min(1, daysConsistent/7)
signal     = develop  if score ≥ 0.60 and (supply < 20 or searchGap ≥ 0.4)
           | stock    if score ≥ 0.50 and supply ≥ 20 and lowStockShare ≥ 0.3
           | watch    if 0.40 ≤ score < 0.60 or (emerging and confidence ≥ 0.3)
           | (not emitted)
projectedDemand = round(demandIntents14d × (1 + max(0, velocity)) × 2)      // next-28-day sessions
```

Output top 12 by `score·confidence`, ≤ 3 per aesthetic, `rank` 1..12; `evidence = { signal,
score, demand14d, demandIntents14d, supply, lowStockShare, searchGap, velocity, conversion,
crossCluster, clusters, dominantSilhouette, topRootLooks: [≤3 ids], sampleIntents: [3 verbatim utterances],
topProducts: [≤5 ids], clusterLabels }`.
`rationale` (zh-TW template; en equivalent when the dashboard locale is en):
「建議{開款|備料|觀察}：{aesthetic}×{category}・{colour}。近 14 天 {demandIntents14d} 次搜尋、{remixes} 次 remix、{purchases} 筆購買，跨 {clusters} 個品味圈，轉換率 {conversion%}；現有庫存 {supply} 款{ ，其中 {lowStock%} 低庫存}。」
The optional LLM polish reuses `assertGrounded`. `/api/trends/manufacturing.csv` exports the rows.

---

## 6. Module layout and public API

```
packages/engine/src
  index.ts                      re-exports (unchanged barrel)
  types.ts                      contract (unchanged) + optional-field additions listed above
  vector.ts                     BLOCK, cosineRange, blockScale, blockCosine, hexToHsl, toPgVector
  constants/aesthetics.ts       AESTHETIC_SLUGS, AESTHETIC_AXIS_PRIOR, AESTHETIC_COLOR_PRIOR, resolveAestheticTables
  constants/occasions.ts        OCCASIONS (§0.5), OCCASION_PRIORS, TEMPLATE_KEY
  constants/colors.ts           NEUTRAL_FAMILIES, COLOR_GEOMETRY, COLOR_GROUP_WORDS, EXTRA_COLOR_NAMES
  constants/currency.ts         CURRENCY_RATES, tokens
  llm/index.ts                  getLlm() (OpenAI → Gemini → offline), withTimeout
  llm/guard.ts                  assertGrounded(text, evidence[])
  intent/schema.ts              IntentSchema, LlmIntentOutput
  intent/numbers.ts             parseNumbers, cjkToNumber, extractSizes, extractQuantity
  intent/money.ts               extractBudget, toTwd
  intent/recipient.ts           detectRecipient, resolveDepartment
  intent/lexicon.ts             engine synonym tables (§1.4.5, §1.4.6), scanLexicon(text, entries, negationWindow)
  intent/reference.ts           detectReference, resolveReference(ctx.contacts)
  intent/lexicon-parser.ts      parseIntentOffline
  intent/llm-parser.ts          parseIntentLlm, INTENT_PROMPT_V1, mergeLlm
  intent/clarify.ts             buildClarifications, applyClarification, isClarificationAnswer
  intent/dialogue.ts            isFollowUp, mergeIntent
  intent/finalize.ts            priors, axis composition, confidence
  intent/vectorize.ts           intentToVector, referenceLookVector
  intent/index.ts               parseIntent (contract signatures)
  recommend/retrieve.ts         RetrieveParams, PgRetriever, MemoryRetriever, relaxation ladder, social/trend channels
  recommend/factors.ts          10 factor functions
  recommend/weights.ts          ARMS, DEFAULT_WEIGHTS, redistribute
  recommend/score.ts            rank(), hardFilters(), mmr()
  recommend/explain.ts          summary templates zh/en, buildExplanation, polishWithLlm
  recommend/search.ts           searchProducts
  recommend/outfit/templates.ts SLOT_TEMPLATES, slotShareMax, planFor(intent)
  recommend/outfit/compat.ts    colourHarmony, compat
  recommend/outfit/solver.ts    solveOutfits, diversify
  recommend/outfit/explain.ts   pairingSentence, outfitExplanation, label
  recommend/index.ts            recommend, similarProducts, completeTheLook, searchProducts (contract)
  preference/rewards.ts         REWARDS, rewardFor(input)
  preference/update.ts          applyEvent, effective, departmentPrior
  preference/profile.ts         buildProfile
  preference/linalg.ts          invert8x8, matVec, outer
  preference/bandit.ts          LinUCB { choose, update, serialize, deserialize }, contextVector, rebuildBanditFromEvents
  preference/sim-users.ts       ARCHETYPES, makeSyntheticUsers, intentTemplates, clickModel
  preference/evaluate.ts        evaluatePreferenceLoop (contract), metrics
  preference/index.ts           recordFeedback, getPreferenceProfile, evaluatePreferenceLoop (contract)
  analytics/graph/relationships.ts  deriveRelationships, trust
  analytics/graph/cluster.ts        kmeans, chooseK, clusterUsers, labelPropagation
  analytics/trend/lineage.ts        computeLineage, influencers
  analytics/trend/signals.ts        computeTrendSignals, EVENT_WEIGHTS
  analytics/trend/manufacturing.ts  recommendManufacturing
  analytics/queries.ts              every SQL/drizzle query of this module
  analytics/index.ts                runAnalytics, getTrendDashboard, getLineage, getUserNetwork (contract)
  social/, looks/                   owned by the social/looks spec; they call recordFeedback and deriveLookStyle
```

Dependency rule: everything except `*/index.ts`, `recommend/retrieve.ts (PgRetriever)`,
`recommend/search.ts`, `analytics/queries.ts`, `llm/index.ts` is pure (no `@lookline/db` import,
no I/O). Contract exports keep their names and signatures exactly; new named exports
(`PgRetriever`, `MemoryRetriever`, `ARMS`, `LinUCB`, `OCCASIONS`, `OCCASION_PRIORS`, `SLOT_TEMPLATES`,
`applyClarification`, `mergeIntent`, `computeTrendSignals`, `computeLineage`,
`recommendManufacturing`, `deriveRelationships`, `kmeans`, `makeSyntheticUsers`) are additions.

DB access by module (all through `db: Database` first argument):

| module     | reads                                                                                                                                                                                                                                                                                                             | writes                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| intent     | nothing (contacts/brands/trending arrive in `IntentContext` from the web layer)                                                                                                                                                                                                                                   | `intent_sessions` (web layer after `parseIntent`)                                                                                                                                                                                     |
| recommend  | `products ⋈ brands` (§2.1), `users` (vectors, department, budgetHint), `relationships` (trust), `look_products ⋈ looks` (social channel, 30 d), `purchases`/`interactions SAVE` (social channel), `trend_signals` (today), `feedback_events` (brand counts 90 d), `bandit_state`, `max(popularity)` cached 10 min | `feedback_events` (impressions with arm/context)                                                                                                                                                                                      |
| preference | `feedback_events`, `users`, `preference_snapshots`, `products.style_vector`, `looks.style_vector`, `bandit_state`                                                                                                                                                                                                 | `feedback_events`, `users.preference_vector/gift_preference_vector`, `preference_snapshots`, `bandit_state`                                                                                                                           |
| analytics  | `interactions` (180 d, paged 10k), `purchases`, `asks`, `ask_responses`, `looks`, `look_products`, `look_participants`, `users`, `intent_sessions` (14 d), `products` (tagging/supply), `feedback_events` (bandit replay), `evaluation_runs` (latest)                                                             | `relationships` (transactional rebuild), `users.taste_cluster/social_cluster`, `lineage_stats`, `trend_signals` (delete-by-day + insert), `manufacturing_recommendations` (truncate + insert), `products.trend_score`, `bandit_state` |

Scripts (`packages/engine/package.json`): `analytics` (existing), `intent -- "<sentence>"` prints
the offline and (when a key exists) LLM parse side by side for the README.

---

## 7. Implementation checklist (in build order; each step ends green on `typecheck` + `test`)

1. `vector.ts`, `constants/*` (all tables above transcribed), `llm/guard.ts`; unit tests for cosine, blockScale ranking equivalence, hexToHsl, resolveAestheticTables.
2. `intent/numbers.ts`, `money.ts`, `recipient.ts`, `lexicon.ts`, `reference.ts` with their tests.
3. `intent/lexicon-parser.ts` + `finalize.ts` + `clarify.ts` + `dialogue.ts` + `vectorize.ts`; the 17 fixtures pass; `parseIntentOffline`, `intentToVector` exported.
4. `llm/index.ts` (`getLlm`, provider order OpenAI → Gemini → offline, never throws) and `intent/llm-parser.ts` with a mocked client test; `parseIntent` exported.
5. `recommend/retrieve.ts` (`MemoryRetriever` first, `PgRetriever` second with an SQL snapshot test), `factors.ts`, `weights.ts`, `score.ts`, `explain.ts`.
6. `recommend/outfit/*` and `recommend/index.ts` (`recommend`, `similarProducts`, `completeTheLook`, `searchProducts`).
7. `preference/rewards.ts`, `update.ts`, `profile.ts`, `linalg.ts`, `bandit.ts`; `bandit_state` migration in `packages/db`; `recordFeedback`, `getPreferenceProfile`.
8. `preference/sim-users.ts`, `evaluate.ts`; `evaluatePreferenceLoop` meets the pre-registered criterion on the small config.
9. `analytics/*`: relationships → clusters → lineage → signals → manufacturing → bandit replay; `runAnalytics`, `getTrendDashboard`, `getLineage`, `getUserNetwork`.
10. `scripts/intent.ts`; README reproduction lines; `pnpm check` green.

Cut list if time runs out (in this order): wardrobe channel (already excluded), LLM prose
polish, trend retrieval channel, label propagation for social clusters (keep sim values), CSV
export, `explicitAestheticRecall` metric.

## 8. Test plan (`packages/engine/test/`, vitest, no network, no Postgres; `vitest.setup.ts` stubs `Math.random` to throw; `TZ=Asia/Taipei`)

Fixtures: `catalog-500.json` (500 products from `generateProduct(i, 42, brands)`, checked in),
`intents.ts` (§1.10), `users-20.json` (20 synthetic users, seed 7), `interactions-60d.json`
(1,200 interactions, 80 purchases, 60 looks, one lineage tree of depth 4 rooted at `lk_root_1`,
two taste clusters, generated by the sim with seed 7 and checked in).

| file                                                                   | asserts                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vector.test.ts`                                                       | cosine identical = 1, orthogonal = 0, zero-norm = 0; `blockScale` ranking equals weighted dot ranking; `hexToHsl('#000000')` l=0, `'#ff0000'` h=0 s=1 l=.5; `toPgVector` 6 decimals                                                                                                                                                                                                                                                          |
| `constants.test.ts`                                                    | every catalog aesthetic slug has axis/colour rows after `resolveAestheticTables`; every arm's positive weights sum to 1.00 ± 1e-9; §0.5 slugs unique                                                                                                                                                                                                                                                                                         |
| `intent/numbers.test.ts`                                               | 五千 3千 3k 1,200 一萬二 三千五 兩千 十五 一百零五 1.5萬; `60歲` is age; `2 件` is quantity; waist 28; EU 42 with shoes; `M`/`medium`/`中號`                                                                                                                                                                                                                                                                                                 |
| `intent/money.test.ts`                                                 | every row of §1.4.2; `$100` en → 3200 (.70) with clarification; `$5000` zh → TWD (.85); `NT$8000`; `150 dollars` → 4800; `€50` → 1750; `¥30000` → 6300; rounding rules                                                                                                                                                                                                                                                                       |
| `intent/recipient.test.ts`                                             | every row of §1.4.4; `for a guy` with men profile → self; contact name resolution; 朋友婚禮 stays self                                                                                                                                                                                                                                                                                                                                       |
| `intent/lexicon-parser.test.ts`                                        | F1–F16 deep-partial equality on listed fields; assumptions carry listed slots with `confidence ∈ [0,1]` and non-empty reasons; clarifications exactly as listed and `blocking` only in F11; clause-local negation (「不要牛仔褲，要黑色」 keeps black); longest match 「黑色帽T」; idempotence                                                                                                                                               |
| `intent/dialogue.test.ts`                                              | F17; `applyClarification` removes the question and sets confidence 1; unrelated utterance is not a follow-up; each §1.8 phrase                                                                                                                                                                                                                                                                                                               |
| `intent/vectorize.test.ts`                                             | F4: streetwear/black/tops dims; F1 formality dim .575; outfit base has G all zero; mustAvoid colour dim 0; preference blend never touches G; browse fallback; reference blend 50/50; determinism                                                                                                                                                                                                                                             |
| `intent/llm-parser.test.ts`                                            | mocked `generateJson`: lexicon budget overrides LLM budget; OOV aesthetic dropped to vibe with .3 assumption; invalid JSON/timeout → `provider 'offline'`, `parser 'lexicon'`                                                                                                                                                                                                                                                                |
| `recommend/retrieve.test.ts`                                           | `MemoryRetriever` applies every filter incl. unisex inclusion, kids isolation, price widening per strictness, attribute have/avoid; ordering equals brute force; relaxation ladder order and recorded steps; `PgRetriever.buildQuery` SQL + params snapshot for F4 and an outfit slot                                                                                                                                                        |
| `recommend/factors.test.ts`                                            | each factor ∈ range with `applicable` flag and non-empty evidence; `budget_fit` at price 0.5×, 1×, 1.1× (0.8), 1.25× (0.5), 1.5× (0) of max; `attribute_match` sub-check weights and fit adjacency; axes sub-check value; `user_preference` not applicable below 3 events and gift routing; `social_signal` `1−e^{−s}`; `trend_momentum` missing → .3; `diversity` ≤ 0                                                                       |
| `recommend/score.test.ts`                                              | weights redistribute to sum 1 with inapplicable factors; `score === Σ contribution` (±1e-9) for every item incl. MMR penalty; ties by popularity then id; brand ≤ 2 / subcategory ≤ 4 caps; hard filters drop `text:` avoid, size mismatch, kids mismatch                                                                                                                                                                                    |
| `recommend/explain.test.ts`                                            | golden zh/en summaries for 6 items; length caps; over-budget caveat; nothing below 0.04 contribution mentioned; `assertGrounded` rejects a foreign number and a foreign brand name                                                                                                                                                                                                                                                           |
| `recommend/outfit/compat.test.ts`                                      | harmony table: black+camel .90, white+black .90, black+black .70, navy+navy Δl .3 → .80, red+green (Δh 120) .65, orange+blue (Δh 180) .75, yellow+green (Δh 80) .45, two saturated chromatics −.10, two multi-metallic .30; formality statement-piece rule; season adjacency; symmetry                                                                                                                                                       |
| `recommend/outfit/solver.test.ts`                                      | F1 on catalog-500: 3 outfits, each total ≤ 5000·1.15 (soft) and ≤ 5000 for hard, required slots filled, Jaccard ≤ 0.4 or relaxed rule, different core or aesthetic; determinism; plan C excluded when tailoring excluded; impossible budget (200) returns one flagged outfit; optional slot skipped when it lowers `f`; coordinate-with raises compat with the partner look; `Σ contribution` of each outfit item equals its in-outfit score |
| `recommend/remix.test.ts`                                              | `suggestRemix` (memory retriever) keeps ≥ 2 of 3 source colour families when candidates allow; `keptAesthetics` ⊆ source tags; `palette` non-empty                                                                                                                                                                                                                                                                                           |
| `preference/update.test.ts`                                            | η schedule (0 → .25, 20 → .1768, floor .05); purchase monotone; dismiss half magnitude; undisclosed halves to both vectors; `forOthers` never touches self; decay: 45 idle days halve the distance; confidence after one purchase ≈ .25; 20 gorpcore saves → `cos(p_A, e_gorpcore) > .85`                                                                                                                                                    |
| `preference/bandit.test.ts`                                            | identity state → `balanced` wins ties; after 200 pulls where `social-led` earns .8 and others .1 under `has_trusted = 1`, it is chosen ≥ 90% for that context and `balanced` for cold users; serialize round-trip; 8×8 inverse vs known matrix; `rebuildBanditFromEvents` reproduces a state from logged impressions and rewards                                                                                                             |
| `preference/profile.test.ts`                                           | confidence formula values; ≤ 5 aesthetics with weight ≥ .25; evidence = top-3 by `                                                                                                                                                                                                                                                                                                                                                           | r                                                                                                                                                                                                                                                                                                 | ·decay·v[tag]`; "still learning" below 3 events; `bandit.arms` pulls/meanReward from events |
| `preference/evaluate.test.ts`                                          | seed 1, users 40, rounds 12, catalogSize 2000: criterion of §4.5; byte-identical JSON on rerun; seed 2 differs but still passes; `EvalRound` contains all contract keys plus extras; runtime < 10 s                                                                                                                                                                                                                                          |
| `analytics/relationships.test.ts`                                      | hand-computed weights for 3 pairs incl. decay; `trusts` only when the advice is followed within 7 d (else .3); symmetric `shops_with`; pruning < .05; `trust()` composite                                                                                                                                                                                                                                                                    |
| `analytics/cluster.test.ts`                                            | 3 separated blobs → 3 clusters, exact membership; determinism; `chooseK` table; empty-cluster reseed; label propagation converges in ≤ 10 iterations                                                                                                                                                                                                                                                                                         |
| `analytics/lineage.test.ts`                                            | `lk_root_1`: depth 4, nodes 9, uniquePeople 7, clustersReached 2, shares/remixes/purchases counts, `gmv` = fixture sum, velocity, rates; cycle guard; influencer ordering                                                                                                                                                                                                                                                                    |
| `analytics/signals.test.ts`                                            | hand-computed key `korean-minimal                                                                                                                                                                                                                                                                                                                                                                                                            | outerwear`over 14 fixture days: volume, volume_7d, velocity with pseudo-count, crossCluster (even split over 2 of 8 clusters = .25), conversion, momentum ∈ [0,100] and monotone in velocity;`emerging` requires all five conditions (five single-failure negatives, one positive); status ladder |
| `analytics/manufacturing.test.ts`                                      | supplyGap; develop / stock / watch / not-emitted branches; ≤ 3 per aesthetic, rank 1..12; `projectedDemand`; rationale contains every cited number; `sampleIntents` are verbatim utterances                                                                                                                                                                                                                                                  |
| `integration/*.test.ts` (`describe.skipIf(!process.env.DATABASE_URL)`) | `PgRetriever` returns ≤ limit rows honouring every prefilter on the seeded catalog; HNSW vs brute-force recall@300 ≥ 0.9 on 20 fixture intents; `recommend` p95 < 150 ms single, `outfits` < 400 ms; `runAnalytics` for the seeded 60-day simulation < 30 s and idempotent (second run yields identical row counts)                                                                                                                          |
