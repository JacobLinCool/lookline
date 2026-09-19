# Catalog specification — taxonomy and the 100k product generator

Owner: `packages/catalog` (`@lookline/catalog`). Binding documents, in order of precedence:
`docs/ARCHITECTURE.md` → `docs/CONTRACTS.md` + the code stubs (`packages/catalog/src/types.ts`,
`rng.ts`, `vectors.ts`, `index.ts`, `packages/db/src/schema.ts`) → this spec. Where this spec and a
stub disagree on an exported _name or shape_, the stub wins; this spec may add exports and optional
fields but never renames or removes.

Every table below is complete: the implementer transcribes it into TypeScript `as const` tables.
Numbers are the values; there are no placeholders.

## 0. Decisions and invariants

| Decision                 | Value                                                                                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Catalog size             | `DEFAULT_CATALOG_SIZE = 100_000`; `CATALOG_SIZE` env may be smaller (dev) — a smaller catalog is always the **id-prefix** of the full one (§7.2).                                                                                                                        |
| Seed                     | `DEFAULT_CATALOG_SEED = 20260918`; `CATALOG_SEED` env overrides. `CATALOG_VERSION = '1.0.0'` bumps on any table change.                                                                                                                                                  |
| Ids                      | products `1..N` (`id = i + 1`), brands `1..150`. `slug` and `name` unique by construction (§6.2), `dupKey` unique by construction (§7.5). No repair pass.                                                                                                                |
| Purity                   | `generateProduct(i, seed, brands, size?)` depends only on its arguments and static tables. Workers may take any partition of `[0, N)`.                                                                                                                                   |
| Style vector             | 64-d, layout per ARCHITECTURE.md. Aesthetic block sparse (≤ 5 non-zero, primary ≥ 0.85). Colour block: primary family 1.0, secondary family 0.4.                                                                                                                         |
| Departments              | `women`, `men`, `unisex`, `kids`. Kids never luxury (§7.1).                                                                                                                                                                                                              |
| Sizes                    | `alpha` XS–XXL, `numeric-waist` 26–40, `eu-shoe` 35–46, `one-size`. Kids shoes use `eu-shoe` 35–39.                                                                                                                                                                      |
| Money                    | integer TWD; charm-rounded per magnitude (§5.2); `[base×0.3, base×40]` clamp.                                                                                                                                                                                            |
| Text                     | English UI copy; every taxonomy entry has `labelZh` + bilingual `synonyms`; `LEXICON` exported (§12).                                                                                                                                                                    |
| Images                   | `renderProductSvg` 600×800, pure string templating, never persisted; served immutable from `/api/products/[id]/image`.                                                                                                                                                   |
| DB columns not in schema | `compareAtPrice`, `dropYear`, `collection`, `primaryAesthetic`, `secondaryAesthetic`, `soldOutSizes`, schema-specific extras live in `products.attributes` (jsonb, `Record<string, string \| number \| boolean>`). `rating = 0` means "no reviews" (column is NOT NULL). |

Sources: backbone = Proposal 3 (plan → cells → weighted sampling without replacement, 32
audience-aware aesthetics, 150 hard-coded brands, tier-group price ladder, written copy templates).
Grafted: P2 evidence strings, `NEIGHBOURS` + secondary aesthetic, `COLOR_HARMONY` /
`FORMALITY_TOLERANCE` / `SLOT_SETS` / `pairScore`, zh-TW lexicon, per-concern RNG streams, kids /
attribute price multipliers, kids render treatment, coprime id scramble. P1: concrete SVG pattern
defs and worked silhouette paths, sold-out sizes, rating shrinkage, price-tier axis blending tier
ordinal with log-price, ≥ 2 eligible brands per cell test, `PAIRINGS` shared with complete-the-look.

---

## 1. Taxonomy

### 1.1 Category groups (`CATEGORY_GROUPS`, order = vector dims 52–63)

| idx | slug        | name        | labelZh | synonyms (extra)                                | solidShare |
| --- | ----------- | ----------- | ------- | ----------------------------------------------- | ---------- |
| 0   | tops        | Tops        | 上衣    | top, shirt, tee, 上身, 衣服                     | .62        |
| 1   | bottoms     | Bottoms     | 下身    | pants, trousers, skirt, 褲子, 裙子, 下著        | .72        |
| 2   | dresses     | Dresses     | 洋裝    | dress, jumpsuit, 連身裙, 連衣裙, 洋裝           | .55        |
| 3   | outerwear   | Outerwear   | 外套    | jacket, coat, 外套, 夾克, 大衣                  | .74        |
| 4   | footwear    | Footwear    | 鞋      | shoes, sneakers, boots, 鞋子, 鞋款              | .82        |
| 5   | bags        | Bags        | 包款    | bag, handbag, purse, 包, 包包, 袋               | .78        |
| 6   | accessories | Accessories | 配件    | accessory, hat, belt, scarf, 配飾, 帽子         | .70        |
| 7   | jewelry     | Jewelry     | 珠寶    | jewellery, necklace, earrings, ring, 首飾, 飾品 | .95        |
| 8   | activewear  | Activewear  | 運動服  | sportswear, gym, athletic, 運動, 健身           | .70        |
| 9   | swimwear    | Swimwear    | 泳裝    | swimsuit, bikini, swim, 泳衣, 泳褲              | .55        |
| 10  | loungewear  | Loungewear  | 居家服  | pyjamas, pajamas, sleepwear, 睡衣, 家居         | .66        |
| 11  | tailoring   | Tailoring   | 西裝    | suit, blazer, formal, 西服, 正裝                | .80        |

`solidShare` is the target share of `solid` pattern inside the group (used by the global pattern
rebalancing in §7.4; tested ±6 pp).

### 1.2 Categories (`CATEGORIES`, 46)

| slug                    | name                      | labelZh        | group       | subcategories                                                           |
| ----------------------- | ------------------------- | -------------- | ----------- | ----------------------------------------------------------------------- |
| t-shirts                | T-Shirts                  | T恤            | tops        | tee, tank-top, crop-top                                                 |
| shirts                  | Shirts                    | 襯衫           | tops        | button-down-shirt, linen-shirt, polo-shirt                              |
| blouses                 | Blouses                   | 女衫           | tops        | blouse, camisole, bodysuit                                              |
| knitwear                | Knitwear                  | 針織           | tops        | crewneck-sweater, cardigan, turtleneck                                  |
| sweats                  | Sweats                    | 衛衣           | tops        | hoodie, sweatshirt                                                      |
| jeans                   | Jeans                     | 牛仔褲         | bottoms     | jeans                                                                   |
| trousers                | Trousers                  | 長褲           | bottoms     | chinos, wide-leg-trousers, cargo-pants, leggings                        |
| shorts                  | Shorts                    | 短褲           | bottoms     | casual-shorts                                                           |
| skirts                  | Skirts                    | 裙子           | bottoms     | mini-skirt, midi-skirt, maxi-skirt, pleated-skirt                       |
| overalls                | Overalls                  | 吊帶褲         | bottoms     | overalls                                                                |
| day-dresses             | Day Dresses               | 日常洋裝       | dresses     | mini-dress, midi-dress, maxi-dress, shirt-dress, wrap-dress, knit-dress |
| evening-dresses         | Evening Dresses           | 晚裝           | dresses     | slip-dress, evening-gown                                                |
| jumpsuits               | Jumpsuits                 | 連身褲         | dresses     | jumpsuit                                                                |
| jackets                 | Jackets                   | 夾克           | outerwear   | denim-jacket, bomber-jacket, biker-jacket, overshirt                    |
| technical-outerwear     | Technical Outerwear       | 機能外套       | outerwear   | puffer-jacket, windbreaker, fleece-jacket, parka                        |
| coats                   | Coats                     | 大衣           | outerwear   | trench-coat, wool-coat                                                  |
| sneakers                | Sneakers                  | 運動鞋         | footwear    | sneaker, running-shoe                                                   |
| flats                   | Flats                     | 平底鞋         | footwear    | loafer, derby, ballet-flat                                              |
| boots                   | Boots                     | 靴子           | footwear    | chelsea-boot, ankle-boot, knee-high-boot, combat-boot, hiking-boot      |
| heels                   | Heels                     | 高跟鞋         | footwear    | pump, heeled-sandal                                                     |
| sandals                 | Sandals                   | 涼鞋           | footwear    | flat-sandal, slide                                                      |
| handbags                | Handbags                  | 手袋           | bags        | tote, shoulder-bag, crossbody, mini-bag, clutch, bucket-bag             |
| carry                   | Carry                     | 背包           | bags        | backpack, belt-bag, duffle                                              |
| hats                    | Hats                      | 帽子           | accessories | baseball-cap, beanie, bucket-hat                                        |
| belts-watches           | Belts & Watches           | 皮帶與手錶     | accessories | belt, watch                                                             |
| scarves-ties            | Scarves & Ties            | 圍巾與領帶     | accessories | scarf, tie                                                              |
| eyewear                 | Eyewear                   | 眼鏡           | accessories | sunglasses                                                              |
| socks                   | Socks                     | 襪子           | accessories | socks                                                                   |
| hair-accessories        | Hair Accessories          | 髮飾           | accessories | hair-clip                                                               |
| necklaces               | Necklaces                 | 項鍊           | jewelry     | necklace                                                                |
| earrings                | Earrings                  | 耳環           | jewelry     | earrings                                                                |
| bracelets-rings         | Bracelets & Rings         | 手鍊與戒指     | jewelry     | bracelet, ring                                                          |
| brooches                | Brooches                  | 胸針           | jewelry     | brooch                                                                  |
| performance-tops        | Performance Tops          | 運動上衣       | activewear  | sports-bra, performance-tee                                             |
| performance-bottoms     | Performance Bottoms       | 運動下身       | activewear  | training-tights, running-shorts, bike-shorts, joggers                   |
| track                   | Track                     | 運動外套       | activewear  | track-jacket                                                            |
| bikinis                 | Bikinis                   | 比基尼         | swimwear    | bikini-top, bikini-bottom                                               |
| swimsuits               | Swimsuits                 | 泳衣           | swimwear    | one-piece, swim-trunks, rash-guard                                      |
| beachwear               | Beachwear                 | 海灘服         | swimwear    | cover-up                                                                |
| sleepwear               | Sleepwear                 | 睡衣           | loungewear  | pajama-set, nightgown, robe                                             |
| lounge-sets             | Lounge Sets               | 休閒家居       | loungewear  | sweatpants, lounge-shorts                                               |
| slippers                | Slippers                  | 拖鞋           | loungewear  | slipper                                                                 |
| suits                   | Suits                     | 套裝           | tailoring   | two-piece-suit, tuxedo                                                  |
| tailored-jackets        | Tailored Jackets          | 西裝外套       | tailoring   | blazer, waistcoat                                                       |
| tailored-bottoms        | Tailored Bottoms          | 西裝褲裙       | tailoring   | tailored-trousers, pencil-skirt                                         |
| tailored-dresses-shirts | Tailored Dresses & Shirts | 正裝洋裝與襯衫 | tailoring   | sheath-dress, dress-shirt                                               |

### 1.3 Subcategories (`SUBCATEGORIES`, 109)

Columns: `depts` letters W/M/U/K = women/men/unisex/kids; `size` = size system (`a` alpha,
`n` numeric-waist, `e` eu-shoe, `o` one-size; kids always use `a` where the row says `n`);
`schema` = attribute schema id (§1.4); `w` = sampling weight inside (department, group); `S` =
season code (§2.7); `noun` = display noun used by the name grammar (injective over the 109 rows —
tested). `synonyms` are _extra_ terms; every entry also gets its slug words, lower-cased name and
`labelZh` automatically. The silhouette id per subcategory is in §9.2; economics in §5.1.

| slug              | name               | labelZh    | synonyms (extra)                               | depts | size | schema         | w   | S   | noun              |
| ----------------- | ------------------ | ---------- | ---------------------------------------------- | ----- | ---- | -------------- | --- | --- | ----------------- |
| tee               | T-Shirt            | T恤        | t-shirt, tshirt, 短T, 短袖                     | WMUK  | a    | tee            | 30  | Y   | Tee               |
| tank-top          | Tank Top           | 背心       | tank, vest, singlet, 無袖                      | WMUK  | a    | tank           | 8   | S   | Tank              |
| crop-top          | Crop Top           | 短版上衣   | cropped top, 露臍, 短版                        | WK    | a    | tank           | 6   | S   | Crop Top          |
| polo-shirt        | Polo Shirt         | Polo衫     | polo, 有領T                                    | WMUK  | a    | shirt          | 8   | Y   | Polo              |
| button-down-shirt | Button-Down Shirt  | 襯衫       | shirt, oxford, 長袖襯衫                        | WMU   | a    | shirt          | 16  | Y   | Shirt             |
| linen-shirt       | Linen Shirt        | 亞麻襯衫   | linen, 麻襯衫                                  | WMU   | a    | shirt          | 6   | S   | Linen Shirt       |
| blouse            | Blouse             | 女衫       | top, 上衣, 雪紡衫                              | W     | a    | blouse         | 14  | Y   | Blouse            |
| camisole          | Camisole           | 細肩帶上衣 | cami, 吊帶, 細肩帶                             | W     | a    | tank           | 6   | S   | Camisole          |
| bodysuit          | Bodysuit           | 連身衣     | body, 連體衣                                   | W     | a    | bodysuit       | 5   | Y   | Bodysuit          |
| crewneck-sweater  | Crewneck Sweater   | 圓領毛衣   | sweater, jumper, pullover, knit, 毛衣, 針織衫  | WMUK  | a    | knit           | 16  | W   | Sweater           |
| cardigan          | Cardigan           | 開襟衫     | cardi, 針織外套, 開衫                          | WMUK  | a    | knit           | 10  | T   | Cardigan          |
| turtleneck        | Turtleneck         | 高領毛衣   | roll neck, polo neck, 高領                     | WMU   | a    | knit           | 7   | W   | Turtleneck        |
| hoodie            | Hoodie             | 連帽衫     | hooded sweatshirt, 帽T, 連帽                   | WMUK  | a    | sweat          | 14  | T   | Hoodie            |
| sweatshirt        | Sweatshirt         | 衛衣       | crewneck, 大學T, 圓領衛衣                      | WMUK  | a    | sweat          | 10  | T   | Sweatshirt        |
| jeans             | Jeans              | 牛仔褲     | denim, 丹寧, 牛仔                              | WMUK  | n    | pant           | 30  | Y   | Jeans             |
| chinos            | Chinos             | 卡其褲     | chino, khakis, 休閒褲                          | WMUK  | n    | pant           | 14  | Y   | Chinos            |
| wide-leg-trousers | Wide-Leg Trousers  | 寬褲       | wide leg pants, palazzo, 闊腿褲, 寬版褲        | WMU   | n    | pant           | 12  | Y   | Wide-Leg Trousers |
| cargo-pants       | Cargo Pants        | 工裝褲     | cargos, utility pants, 多口袋褲                | WMUK  | n    | pant           | 9   | Y   | Cargo Pants       |
| leggings          | Leggings           | 內搭褲     | tights, 緊身褲, 打底褲                         | WK    | a    | active-bottom  | 8   | Y   | Leggings          |
| casual-shorts     | Shorts             | 短褲       | shorts, 休閒短褲                               | WMUK  | a    | short          | 14  | S   | Shorts            |
| mini-skirt        | Mini Skirt         | 短裙       | miniskirt, 迷你裙                              | WK    | a    | skirt          | 8   | S   | Mini Skirt        |
| midi-skirt        | Midi Skirt         | 中長裙     | midi, 及膝裙, 中裙                             | W     | a    | skirt          | 10  | Y   | Midi Skirt        |
| maxi-skirt        | Maxi Skirt         | 長裙       | maxi, 及踝裙                                   | W     | a    | skirt          | 6   | S   | Maxi Skirt        |
| pleated-skirt     | Pleated Skirt      | 百褶裙     | pleats, 褶裙                                   | WK    | a    | skirt          | 6   | Y   | Pleated Skirt     |
| overalls          | Overalls           | 吊帶褲     | dungarees, bib overalls, 工裝吊帶              | WUK   | a    | overalls       | 4   | Y   | Overalls          |
| mini-dress        | Mini Dress         | 短洋裝     | short dress, 短裙洋裝                          | WK    | a    | dress          | 16  | S   | Mini Dress        |
| midi-dress        | Midi Dress         | 中長洋裝   | midi, 及膝洋裝                                 | WK    | a    | dress          | 20  | Y   | Midi Dress        |
| maxi-dress        | Maxi Dress         | 長洋裝     | long dress, 長裙洋裝                           | WK    | a    | dress          | 12  | S   | Maxi Dress        |
| shirt-dress       | Shirt Dress        | 襯衫洋裝   | shirtdress, 襯衫裙                             | W     | a    | dress          | 8   | Y   | Shirt Dress       |
| slip-dress        | Slip Dress         | 吊帶洋裝   | slip, 緞面洋裝, 細肩帶洋裝                     | W     | a    | dress          | 8   | S   | Slip Dress        |
| wrap-dress        | Wrap Dress         | 裹身洋裝   | wrap, 綁帶洋裝                                 | W     | a    | dress          | 8   | Y   | Wrap Dress        |
| knit-dress        | Knit Dress         | 針織洋裝   | sweater dress, 毛衣裙                          | W     | a    | dress          | 8   | W   | Knit Dress        |
| evening-gown      | Evening Gown       | 晚禮服     | gown, formal dress, 禮服                       | W     | a    | dress          | 4   | Y   | Gown              |
| jumpsuit          | Jumpsuit           | 連身褲     | romper, playsuit, 連體褲                       | WK    | a    | jumpsuit       | 6   | Y   | Jumpsuit          |
| denim-jacket      | Denim Jacket       | 牛仔外套   | jean jacket, trucker, 丹寧外套                 | WMUK  | a    | jacket         | 12  | T   | Denim Jacket      |
| bomber-jacket     | Bomber Jacket      | 飛行外套   | bomber, ma-1, 飛行夾克                         | WMUK  | a    | jacket         | 10  | T   | Bomber            |
| biker-jacket      | Biker Jacket       | 騎士外套   | leather jacket, moto, 皮衣, 皮外套             | WMU   | a    | jacket         | 6   | T   | Biker Jacket      |
| puffer-jacket     | Puffer Jacket      | 羽絨外套   | puffer, down jacket, 羽絨, 鋪棉                | WMUK  | a    | puffer         | 12  | W   | Puffer            |
| windbreaker       | Windbreaker        | 風衣外套   | shell, rain jacket, 防風, 防水外套             | WMUK  | a    | jacket         | 8   | T   | Windbreaker       |
| fleece-jacket     | Fleece Jacket      | 刷毛外套   | fleece, polar, 搖粒絨                          | WMUK  | a    | jacket         | 8   | W   | Fleece            |
| overshirt         | Overshirt          | 襯衫外套   | shacket, chore jacket, 工裝外套                | WMU   | a    | jacket         | 8   | T   | Overshirt         |
| parka             | Parka              | 派克大衣   | anorak, 長版羽絨, 連帽大衣                     | WMUK  | a    | coat           | 6   | W   | Parka             |
| trench-coat       | Trench Coat        | 風衣       | trench, mac, 長風衣                            | WMU   | a    | coat           | 8   | T   | Trench            |
| wool-coat         | Wool Coat          | 羊毛大衣   | overcoat, topcoat, 大衣, 毛呢                  | WMU   | a    | coat           | 10  | W   | Coat              |
| sneaker           | Sneaker            | 休閒鞋     | sneakers, trainers, 球鞋, 板鞋                 | WMUK  | e    | sneaker        | 30  | Y   | Sneaker           |
| running-shoe      | Running Shoe       | 跑鞋       | runner, trainer, 慢跑鞋, 運動鞋                | WMUK  | e    | sneaker        | 14  | Y   | Runner            |
| loafer            | Loafer             | 樂福鞋     | penny loafer, moccasin, 樂福                   | WMU   | e    | shoe           | 10  | Y   | Loafer            |
| derby             | Derby              | 德比鞋     | oxford shoe, brogue, 皮鞋, 紳士鞋              | WM    | e    | shoe           | 6   | Y   | Derby             |
| ballet-flat       | Ballet Flat        | 芭蕾平底鞋 | flats, mary jane, 平底鞋, 娃娃鞋               | WK    | e    | shoe           | 8   | Y   | Ballet Flat       |
| chelsea-boot      | Chelsea Boot       | 切爾西靴   | chelsea, 短靴                                  | WMU   | e    | boot           | 8   | W   | Chelsea Boot      |
| ankle-boot        | Ankle Boot         | 踝靴       | bootie, 短靴, 裸靴                             | WK    | e    | boot           | 10  | W   | Ankle Boot        |
| knee-high-boot    | Knee-High Boot     | 長靴       | tall boot, riding boot, 及膝靴                 | W     | e    | boot           | 5   | W   | Knee Boot         |
| combat-boot       | Combat Boot        | 軍靴       | lace-up boot, 馬丁靴, 軍靴                     | WMUK  | e    | boot           | 8   | W   | Combat Boot       |
| hiking-boot       | Hiking Boot        | 登山靴     | trail boot, 登山鞋                             | WMUK  | e    | boot           | 6   | W   | Hiking Boot       |
| pump              | Pump               | 高跟鞋     | heels, stiletto, court shoe, 高跟, 尖頭鞋      | W     | e    | shoe           | 8   | Y   | Pump              |
| heeled-sandal     | Heeled Sandal      | 高跟涼鞋   | strappy sandal, 涼鞋跟鞋                       | W     | e    | shoe           | 6   | S   | Heeled Sandal     |
| flat-sandal       | Flat Sandal        | 平底涼鞋   | sandals, 涼鞋                                  | WMUK  | e    | sandal         | 10  | S   | Sandal            |
| slide             | Slide              | 拖鞋       | slides, flip flop, mule, 拖鞋, 夾腳拖          | WMUK  | e    | sandal         | 8   | S   | Slide             |
| tote              | Tote               | 托特包     | tote bag, shopper, 大包, 手提袋                | WMU   | o    | bag            | 22  | Y   | Tote              |
| shoulder-bag      | Shoulder Bag       | 肩背包     | baguette, hobo, 單肩包                         | WM    | o    | bag            | 16  | Y   | Shoulder Bag      |
| crossbody         | Crossbody Bag      | 斜背包     | cross body, messenger, satchel, 斜挎包, 側背包 | WMU   | o    | bag            | 18  | Y   | Crossbody         |
| mini-bag          | Mini Bag           | 迷你包     | micro bag, 小包                                | W     | o    | bag            | 8   | Y   | Mini Bag          |
| clutch            | Clutch             | 手拿包     | evening bag, pouch, 晚宴包                     | W     | o    | bag            | 6   | Y   | Clutch            |
| bucket-bag        | Bucket Bag         | 水桶包     | drawstring bag, 水桶袋                         | W     | o    | bag            | 8   | Y   | Bucket Bag        |
| backpack          | Backpack           | 後背包     | rucksack, daypack, 背包, 雙肩包                | WMUK  | o    | bag            | 16  | Y   | Backpack          |
| belt-bag          | Belt Bag           | 腰包       | fanny pack, bum bag, sling, 胸包               | WMUK  | o    | bag            | 8   | Y   | Belt Bag          |
| duffle            | Duffle             | 旅行袋     | duffel, weekender, gym bag, 行李袋             | MU    | o    | bag            | 5   | Y   | Duffle            |
| baseball-cap      | Baseball Cap       | 棒球帽     | cap, dad hat, 鴨舌帽, 老帽                     | WMUK  | o    | hat            | 16  | Y   | Cap               |
| beanie            | Beanie             | 毛帽       | knit hat, 針織帽, 冷帽                         | WMUK  | o    | hat            | 10  | W   | Beanie            |
| bucket-hat        | Bucket Hat         | 漁夫帽     | fisherman hat, 漁夫                            | WMUK  | o    | hat            | 10  | S   | Bucket Hat        |
| belt              | Belt               | 皮帶       | leather belt, 腰帶                             | WMU   | o    | belt           | 12  | Y   | Belt              |
| watch             | Watch              | 手錶       | wristwatch, timepiece, 腕錶, 錶                | WMU   | o    | watch          | 6   | Y   | Watch             |
| scarf             | Scarf              | 圍巾       | wrap, shawl, 披肩, 絲巾                        | WMUK  | o    | scarf          | 12  | W   | Scarf             |
| tie               | Tie                | 領帶       | necktie, 領結                                  | M     | o    | tie            | 6   | Y   | Tie               |
| sunglasses        | Sunglasses         | 太陽眼鏡   | shades, sunnies, 墨鏡                          | WMU   | o    | sunglasses     | 12  | S   | Sunglasses        |
| socks             | Socks              | 襪子       | sock, crew socks, 襪                           | WMUK  | o    | socks          | 12  | Y   | Socks             |
| hair-clip         | Hair Clip          | 髮夾       | claw clip, barrette, scrunchie, 髮飾, 鯊魚夾   | WK    | o    | hair-clip      | 6   | Y   | Hair Clip         |
| necklace          | Necklace           | 項鍊       | chain, pendant, choker, 頸鍊                   | WMU   | o    | jewel          | 28  | Y   | Necklace          |
| earrings          | Earrings           | 耳環       | earring, hoops, studs, 耳飾, 耳釘              | WU    | o    | jewel          | 28  | Y   | Earrings          |
| bracelet          | Bracelet           | 手鍊       | bangle, cuff, 手環                             | WMU   | o    | jewel          | 16  | Y   | Bracelet          |
| ring              | Ring               | 戒指       | band, signet, 指環                             | WMU   | o    | jewel          | 20  | Y   | Ring              |
| brooch            | Brooch             | 胸針       | pin, lapel pin, 別針                           | WMU   | o    | jewel          | 4   | Y   | Brooch            |
| sports-bra        | Sports Bra         | 運動內衣   | bra top, 運動胸衣                              | W     | a    | active-top     | 14  | Y   | Sports Bra        |
| performance-tee   | Performance Tee    | 運動T恤    | training tee, gym shirt, 排汗衫, 機能T         | WMUK  | a    | active-top     | 18  | Y   | Training Tee      |
| training-tights   | Training Tights    | 運動緊身褲 | gym leggings, 運動褲, 瑜珈褲                   | WK    | a    | active-bottom  | 16  | Y   | Training Tights   |
| running-shorts    | Running Shorts     | 跑步短褲   | gym shorts, 運動短褲                           | WMUK  | a    | active-bottom  | 14  | S   | Running Shorts    |
| bike-shorts       | Bike Shorts        | 單車短褲   | cycling shorts, biker shorts, 騎行褲           | WU    | a    | active-bottom  | 8   | S   | Bike Shorts       |
| track-jacket      | Track Jacket       | 運動外套   | zip jacket, warm-up jacket, 運動夾克           | WMUK  | a    | jacket         | 12  | T   | Track Jacket      |
| joggers           | Joggers            | 慢跑褲     | track pants, 運動長褲, 束口褲                  | WMUK  | a    | active-bottom  | 16  | Y   | Joggers           |
| bikini-top        | Bikini Top         | 比基尼上衣 | swim top, 泳裝上衣                             | W     | a    | swim-top       | 22  | S   | Bikini Top        |
| bikini-bottom     | Bikini Bottom      | 比基尼下身 | swim bottom, 泳裝下身                          | W     | a    | swim-bottom    | 20  | S   | Bikini Bottom     |
| one-piece         | One-Piece Swimsuit | 連身泳衣   | swimsuit, one piece, 泳衣                      | WK    | a    | one-piece      | 20  | S   | Swimsuit          |
| swim-trunks       | Swim Trunks        | 泳褲       | board shorts, swim shorts, 海灘褲              | MK    | a    | trunks         | 20  | S   | Swim Trunks       |
| rash-guard        | Rash Guard         | 防曬泳衣   | rashie, swim shirt, 水母衣, 防磨衣             | WMK   | a    | rash-guard     | 10  | S   | Rash Guard        |
| cover-up          | Cover-Up           | 罩衫       | kaftan, beach dress, sarong, 沙灘罩衫          | W     | a    | cover-up       | 8   | S   | Cover-Up          |
| pajama-set        | Pajama Set         | 睡衣套裝   | pyjamas, pjs, 睡衣                             | WMUK  | a    | lounge         | 18  | Y   | Pajama Set        |
| nightgown         | Nightgown          | 睡裙       | nightie, nightdress, 睡袍裙                    | WK    | a    | nightgown      | 8   | S   | Nightgown         |
| robe              | Robe               | 浴袍       | dressing gown, bathrobe, 睡袍                  | WMU   | a    | robe           | 10  | W   | Robe              |
| sweatpants        | Sweatpants         | 棉褲       | lounge pants, 休閒棉褲, 家居褲                 | WMUK  | a    | active-bottom  | 18  | Y   | Sweatpants        |
| lounge-shorts     | Lounge Shorts      | 居家短褲   | sleep shorts, 家居短褲                         | WMUK  | a    | short          | 10  | S   | Lounge Shorts     |
| slipper           | Slipper            | 室內拖鞋   | house shoes, 室內鞋, 毛拖                      | WMUK  | e    | sandal         | 10  | W   | Slipper           |
| blazer            | Blazer             | 西裝外套   | sport coat, suit jacket, 西外                  | WMU   | a    | tailor-jacket  | 24  | Y   | Blazer            |
| two-piece-suit    | Two-Piece Suit     | 兩件式西裝 | suit, 套裝, 西裝                               | WM    | a    | suit           | 10  | Y   | Suit              |
| tuxedo            | Tuxedo             | 燕尾服     | dinner suit, black tie, 禮服西裝               | M     | a    | suit           | 3   | Y   | Tuxedo            |
| waistcoat         | Waistcoat          | 背心西裝   | vest, gilet, 西裝背心                          | WMU   | a    | waistcoat      | 6   | Y   | Waistcoat         |
| tailored-trousers | Tailored Trousers  | 西裝褲     | dress pants, slacks, 西褲                      | WMU   | n    | tailor-trouser | 20  | Y   | Trousers          |
| pencil-skirt      | Pencil Skirt       | 鉛筆裙     | office skirt, 窄裙, 包臀裙                     | W     | a    | skirt          | 8   | Y   | Pencil Skirt      |
| sheath-dress      | Sheath Dress       | 修身洋裝   | office dress, 西裝洋裝, 直筒洋裝               | W     | a    | dress          | 8   | Y   | Sheath Dress      |
| dress-shirt       | Dress Shirt        | 正式襯衫   | formal shirt, 商務襯衫, 白襯衫                 | WM    | a    | dress-shirt    | 14  | Y   | Dress Shirt       |

### 1.4 Attribute schemas (`ATTRIBUTE_SCHEMAS`, 46)

Each schema lists, for the six denormalised columns (`fit`, `silhouette`, `length`, `neckline`,
`sleeve`, `closure`) the allowed values with sampling weights, and `extras` written into
`attributes` JSON. A column absent from a schema is `null` on the product. Weights are relative
integers. Subcategory overrides (`sub:` lines) replace the column's list for that subcategory.

| schema         | fit                                                                                                                                                                                               | silhouette                                                                                                                                                                                                                                                                                                                            | length                                                                                                                                                                | neckline                                                                                                                                                                           | sleeve                                                                                                                                      | closure                                                                                                                                                                                    | extras                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tee            | slim 15 regular 40 relaxed 25 oversized 15 boxy 5                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | regular 70 cropped 18 longline 12                                                                                                                                     | crew 55 v-neck 15 scoop 10 henley 8 boat 5 square 4 mock 3                                                                                                                         | short 60 long 25 cap 8 raglan 7                                                                                                             | pull-on 100                                                                                                                                                                                | –                                                                                                                                                                                                                                                                                                                                                    |
| tank           | fitted 30 slim 25 regular 25 relaxed 20                                                                                                                                                           | –                                                                                                                                                                                                                                                                                                                                     | regular 70 cropped 30; `sub: crop-top` cropped 100; `sub: camisole` regular 100                                                                                       | scoop 35 crew 25 square 20 halter 10 v-neck 10                                                                                                                                     | sleeveless 100                                                                                                                              | pull-on 100                                                                                                                                                                                | –                                                                                                                                                                                                                                                                                                                                                    |
| bodysuit       | fitted 70 slim 30                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | regular 100                                                                                                                                                           | scoop 30 square 25 crew 20 halter 10 v-neck 10 off-shoulder 5                                                                                                                      | long 40 sleeveless 30 short 20 three-quarter 10                                                                                             | snap 100                                                                                                                                                                                   | –                                                                                                                                                                                                                                                                                                                                                    |
| shirt          | slim 25 regular 45 relaxed 20 oversized 10                                                                                                                                                        | –                                                                                                                                                                                                                                                                                                                                     | regular 85 longline 15                                                                                                                                                | collar 100                                                                                                                                                                         | long 70 short 30; `sub: polo-shirt` short 85 long 15; `sub: linen-shirt` long 55 short 45                                                   | button 95 snap 5; `sub: polo-shirt` pull-on 100                                                                                                                                            | collar: point 50 button-down 25 band 10 camp 15 (`sub: polo-shirt` polo 100)                                                                                                                                                                                                                                                                         |
| blouse         | slim 20 regular 45 relaxed 35                                                                                                                                                                     | –                                                                                                                                                                                                                                                                                                                                     | regular 75 cropped 10 longline 15                                                                                                                                     | v-neck 25 crew 15 square 15 collar 15 boat 10 off-shoulder 10 sweetheart 5 halter 5                                                                                                | long 35 short 20 puff 20 three-quarter 10 sleeveless 10 elbow 5                                                                             | button 50 pull-on 35 zip 15                                                                                                                                                                | –                                                                                                                                                                                                                                                                                                                                                    |
| knit           | slim 20 regular 40 relaxed 25 oversized 15                                                                                                                                                        | –                                                                                                                                                                                                                                                                                                                                     | regular 75 cropped 15 longline 10                                                                                                                                     | crew 55 v-neck 15 mock 10 boat 10 turtle 10; `sub: turtleneck` turtle 100; `sub: cardigan` v-neck 60 crew 40                                                                       | long 90 short 10                                                                                                                            | pull-on 100; `sub: cardigan` button 80 zip 10 pull-on 10                                                                                                                                   | gauge: fine 35 medium 45 chunky 20                                                                                                                                                                                                                                                                                                                   |
| sweat          | regular 35 relaxed 35 oversized 25 boxy 5                                                                                                                                                         | –                                                                                                                                                                                                                                                                                                                                     | regular 75 cropped 15 longline 10                                                                                                                                     | crew 100; `sub: hoodie` hood 100                                                                                                                                                   | long 100                                                                                                                                    | pull-on 85 zip 15                                                                                                                                                                          | weight: midweight 60 heavyweight 40; hood: none 100 (`sub: hoodie` fixed 100)                                                                                                                                                                                                                                                                        |
| pant           | skinny 8 slim 20 straight 30 tapered 12 relaxed 15 wide 10 flared 5                                                                                                                               | –                                                                                                                                                                                                                                                                                                                                     | regular 70 cropped 20 ankle 10                                                                                                                                        | –                                                                                                                                                                                  | –                                                                                                                                           | zip 65 button 20 drawstring 15; `sub: cargo-pants` zip 60 drawstring 40                                                                                                                    | rise: low 10 mid 55 high 35; `sub: jeans` wash: raw 10 dark-wash 25 mid-wash 35 light-wash 20 black 10                                                                                                                                                                                                                                               |
| short          | slim 15 regular 35 relaxed 35 wide 15                                                                                                                                                             | –                                                                                                                                                                                                                                                                                                                                     | short 60 knee 40                                                                                                                                                      | –                                                                                                                                                                                  | –                                                                                                                                           | zip 45 drawstring 40 button 15                                                                                                                                                             | rise: mid 60 high 40                                                                                                                                                                                                                                                                                                                                 |
| skirt          | –                                                                                                                                                                                                 | a-line 35 pencil 20 pleated 15 tiered 10 wrap 10 column 10; `sub: pleated-skirt` pleated 100; `sub: pencil-skirt` pencil 100                                                                                                                                                                                                          | `sub: mini-skirt` mini 100; `sub: midi-skirt` midi 100; `sub: maxi-skirt` maxi 100; `sub: pleated-skirt` mini 30 midi 55 maxi 15; `sub: pencil-skirt` knee 50 midi 50 | –                                                                                                                                                                                  | –                                                                                                                                           | zip 70 button 15 wrap-tie 15                                                                                                                                                               | rise: mid 55 high 45                                                                                                                                                                                                                                                                                                                                 |
| overalls       | relaxed 50 straight 30 wide 20                                                                                                                                                                    | –                                                                                                                                                                                                                                                                                                                                     | full 75 short 25                                                                                                                                                      | –                                                                                                                                                                                  | –                                                                                                                                           | buckle 70 button 30                                                                                                                                                                        | –                                                                                                                                                                                                                                                                                                                                                    |
| dress          | –                                                                                                                                                                                                 | a-line 25 fit-and-flare 15 shift 15 wrap 10 slip 10 bodycon 10 column 10 tiered 5; `sub: slip-dress` slip 100; `sub: wrap-dress` wrap 100; `sub: sheath-dress` column 60 bodycon 40; `sub: evening-gown` column 50 a-line 30 fit-and-flare 20; `sub: knit-dress` bodycon 40 column 30 shift 30; `sub: shirt-dress` shift 50 a-line 50 | `sub: mini-dress` mini 100; `sub: midi-dress` midi 100; `sub: maxi-dress` maxi 100; `sub: evening-gown` floor 70 maxi 30; others midi 50 mini 25 maxi 25              | v-neck 20 crew 15 square 15 scoop 10 sweetheart 10 halter 8 off-shoulder 7 boat 5 collar 5 turtle 5; `sub: shirt-dress` collar 100; `sub: slip-dress` v-neck 50 square 30 scoop 20 | short 25 long 20 sleeveless 20 puff 15 three-quarter 10 cap 5 elbow 5; `sub: slip-dress` sleeveless 100; `sub: knit-dress` long 80 short 20 | zip 50 pull-on 30 button 15 wrap-tie 5; `sub: wrap-dress` wrap-tie 100; `sub: shirt-dress` button 100                                                                                      | –                                                                                                                                                                                                                                                                                                                                                    |
| jumpsuit       | slim 20 regular 40 relaxed 30 wide 10                                                                                                                                                             | –                                                                                                                                                                                                                                                                                                                                     | full 85 cropped 15                                                                                                                                                    | v-neck 25 square 20 crew 20 halter 15 collar 10 sweetheart 10                                                                                                                      | sleeveless 30 short 30 long 30 puff 10                                                                                                      | zip 60 button 30 wrap-tie 10                                                                                                                                                               | –                                                                                                                                                                                                                                                                                                                                                    |
| jacket         | slim 20 regular 45 relaxed 25 oversized 10                                                                                                                                                        | –                                                                                                                                                                                                                                                                                                                                     | regular 60 cropped 25 longline 15                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | zip 55 button 30 snap 15; `sub: biker-jacket` zip 100; `sub: windbreaker` zip 100; `sub: fleece-jacket` zip 90 pull-on 10; `sub: track-jacket` zip 100; `sub: overshirt` button 70 snap 30 | hood: none 70 fixed 20 detachable 10 (`sub: windbreaker` fixed 70 none 30; `sub: biker-jacket` none 100); lining: unlined 30 quilted 30 mesh 20 shearling 10 fleece 10                                                                                                                                                                               |
| puffer         | regular 45 relaxed 35 oversized 20                                                                                                                                                                | –                                                                                                                                                                                                                                                                                                                                     | regular 55 cropped 15 longline 30                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | zip 100                                                                                                                                                                                    | hood: fixed 55 detachable 25 none 20; insulation: light 30 medium 45 heavy 25                                                                                                                                                                                                                                                                        |
| coat           | slim 20 regular 45 relaxed 25 oversized 10                                                                                                                                                        | –                                                                                                                                                                                                                                                                                                                                     | longline 55 regular 30 full 15                                                                                                                                        | –                                                                                                                                                                                  | –                                                                                                                                           | button 60 belt 20 zip 20; `sub: trench-coat` belt 60 button 40; `sub: parka` zip 100                                                                                                       | buttons: single 60 double 40; hood: none 80 detachable 20 (`sub: parka` fixed 70 detachable 30); lining: quilted 40 unlined 30 shearling 15 fleece 15                                                                                                                                                                                                |
| sneaker        | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | lace-up 85 slip-on 10 velcro 5                                                                                                                                                             | height: low 70 mid 15 high 15 (`sub: running-shoe` low 100); sole: cupsole 30 vulcanised 30 foam 30 gum 10 (`sub: running-shoe` foam 100); toe: round 100                                                                                                                                                                                            |
| shoe           | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | slip-on 60 buckle 20 lace-up 20; `sub: derby` lace-up 100; `sub: ballet-flat` slip-on 100; `sub: pump` slip-on 100; `sub: heeled-sandal` buckle 70 slip-on 30                              | heel: flat 30 kitten 20 block 30 stiletto 15 platform 5 (`sub: loafer`/`derby`/`ballet-flat` flat 100; `sub: pump` stiletto 40 block 35 kitten 25); toe: round 40 almond 30 pointed 20 square 10; sole: leather 60 rubber 40                                                                                                                         |
| boot           | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | zip 40 lace-up 35 slip-on 25; `sub: chelsea-boot` slip-on 100; `sub: combat-boot` lace-up 100; `sub: hiking-boot` lace-up 100                                                              | shaft: ankle 60 mid-calf 25 knee 15 (`sub: knee-high-boot` knee 100; `sub: chelsea-boot`/`ankle-boot` ankle 100); heel: flat 30 block 40 lug 20 kitten 10 (`sub: combat-boot`/`hiking-boot` lug 100); toe: round 60 almond 25 pointed 15                                                                                                             |
| sandal         | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | slip-on 70 buckle 30; `sub: slide` slip-on 100; `sub: slipper` slip-on 100                                                                                                                 | sole: rubber 40 leather 25 cork 15 eva 20 (`sub: slipper` eva 60 rubber 40); toe: open 100 (`sub: slipper` closed 60 open 40)                                                                                                                                                                                                                        |
| bag            | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | zip 45 magnetic 25 snap 20 drawstring 10; `sub: bucket-bag` drawstring 100; `sub: clutch` magnetic 60 zip 40                                                                               | size: mini 20 small 35 medium 30 large 15 (`sub: mini-bag` mini 100; `sub: duffle` large 100; `sub: tote` medium 50 large 50); strap: top-handle 25 shoulder 30 crossbody 25 adjustable 15 chain 5 (`sub: backpack` adjustable 100; `sub: belt-bag` adjustable 100; `sub: clutch` none 70 chain 30); hardware: gold 35 silver 35 gunmetal 15 none 15 |
| hat            | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | –                                                                                                                                                                                          | brim: short 60 none 20 wide 20 (`sub: beanie` none 100; `sub: baseball-cap` short 100); fitment: adjustable 60 one-size 40                                                                                                                                                                                                                           |
| belt           | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | buckle 100                                                                                                                                                                                 | hardware: gold 35 silver 40 gunmetal 25; width: slim 30 regular 50 wide 20                                                                                                                                                                                                                                                                           |
| watch          | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | buckle 100                                                                                                                                                                                 | case: 36mm 35 40mm 45 42mm 20; strap: leather 45 steel 35 nylon 20; dial: white 35 black 35 blue 15 green 15                                                                                                                                                                                                                                         |
| scarf          | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | –                                                                                                                                                                                          | weave: knit 50 woven 30 silk 20; fringe: yes 55 no 45                                                                                                                                                                                                                                                                                                |
| tie            | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | –                                                                                                                                                                                          | width: slim 30 regular 55 wide 15; weave: satin 30 grenadine 20 knit 20 twill 30                                                                                                                                                                                                                                                                     |
| sunglasses     | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | –                                                                                                                                                                                          | frame: round 25 square 30 cat-eye 20 aviator 15 shield 10; lens: dark 50 gradient 25 mirrored 15 clear 10                                                                                                                                                                                                                                            |
| socks          | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | ankle 30 crew 55 knee 15                                                                                                                                              | –                                                                                                                                                                                  | –                                                                                                                                           | –                                                                                                                                                                                          | pack: single 60 3-pack 40                                                                                                                                                                                                                                                                                                                            |
| hair-clip      | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | –                                                                                                                                                                                          | style: claw 50 barrette 30 bow 20                                                                                                                                                                                                                                                                                                                    |
| jewel          | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | –                                                                                                                                                                                          | stone: none 50 pearl 20 cubic-zirconia 15 enamel 10 onyx 5; scale: dainty 40 regular 40 statement 20; type: `sub: necklace` chain 40 pendant 40 choker 20; `sub: earrings` stud 35 hoop 35 drop 30; `sub: bracelet` chain 40 bangle 30 cuff 30; `sub: ring` band 50 signet 30 stone 20; `sub: brooch` pin 100                                        |
| active-top     | fitted 40 compression 15 regular 30 relaxed 15                                                                                                                                                    | –                                                                                                                                                                                                                                                                                                                                     | regular 70 cropped 30                                                                                                                                                 | crew 40 scoop 30 racerback 20 v-neck 10                                                                                                                                            | short 45 sleeveless 35 long 20; `sub: sports-bra` sleeveless 100                                                                            | pull-on 100                                                                                                                                                                                | support: light 30 medium 45 high 25 (`sub: performance-tee` none 100)                                                                                                                                                                                                                                                                                |
| active-bottom  | fitted 30 compression 15 regular 25 relaxed 20 tapered 10; `sub: leggings`/`training-tights`/`bike-shorts` fitted 70 compression 30; `sub: joggers`/`sweatpants` relaxed 50 tapered 35 regular 15 | –                                                                                                                                                                                                                                                                                                                                     | full 60 cropped 25 short 15; `sub: running-shorts`/`bike-shorts` short 100; `sub: joggers`/`sweatpants` full 85 cropped 15                                            | –                                                                                                                                                                                  | –                                                                                                                                           | pull-on 70 drawstring 30                                                                                                                                                                   | rise: mid 50 high 50; pocket: yes 60 no 40                                                                                                                                                                                                                                                                                                           |
| swim-top       | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | –                                                                                                                                                                                          | cut: triangle 35 bandeau 25 halter 25 sports 15; coverage: minimal 30 moderate 50 full 20                                                                                                                                                                                                                                                            |
| swim-bottom    | –                                                                                                                                                                                                 | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | –                                                                                                                                                                                  | –                                                                                                                                           | –                                                                                                                                                                                          | cut: classic 40 high-leg 25 boy-short 15 high-waist 20; coverage: minimal 25 moderate 50 full 25                                                                                                                                                                                                                                                     |
| one-piece      | fitted 100                                                                                                                                                                                        | –                                                                                                                                                                                                                                                                                                                                     | –                                                                                                                                                                     | scoop 35 square 25 halter 20 v-neck 20                                                                                                                                             | sleeveless 100                                                                                                                              | pull-on 100                                                                                                                                                                                | cut: classic 50 high-leg 30 cut-out 20; coverage: moderate 60 full 40                                                                                                                                                                                                                                                                                |
| trunks         | regular 50 relaxed 50                                                                                                                                                                             | –                                                                                                                                                                                                                                                                                                                                     | short 55 knee 45                                                                                                                                                      | –                                                                                                                                                                                  | –                                                                                                                                           | drawstring 100                                                                                                                                                                             | lining: mesh 70 none 30                                                                                                                                                                                                                                                                                                                              |
| rash-guard     | fitted 60 regular 40                                                                                                                                                                              | –                                                                                                                                                                                                                                                                                                                                     | regular 100                                                                                                                                                           | crew 80 mock 20                                                                                                                                                                    | long 60 short 40                                                                                                                            | pull-on 80 zip 20                                                                                                                                                                          | upf: 50 100                                                                                                                                                                                                                                                                                                                                          |
| cover-up       | relaxed 60 oversized 40                                                                                                                                                                           | shift 40 tiered 30 wrap 30                                                                                                                                                                                                                                                                                                            | midi 40 maxi 40 mini 20                                                                                                                                               | v-neck 50 boat 30 halter 20                                                                                                                                                        | sleeveless 40 short 30 long 30                                                                                                              | pull-on 70 wrap-tie 30                                                                                                                                                                     | –                                                                                                                                                                                                                                                                                                                                                    |
| lounge         | regular 40 relaxed 45 oversized 15                                                                                                                                                                | –                                                                                                                                                                                                                                                                                                                                     | full 70 short 30                                                                                                                                                      | crew 45 v-neck 30 collar 25                                                                                                                                                        | long 55 short 45                                                                                                                            | button 40 pull-on 60                                                                                                                                                                       | weight: lightweight 35 midweight 45 plush 20                                                                                                                                                                                                                                                                                                         |
| nightgown      | regular 45 relaxed 55                                                                                                                                                                             | slip 40 shift 40 a-line 20                                                                                                                                                                                                                                                                                                            | mini 30 midi 50 maxi 20                                                                                                                                               | v-neck 40 scoop 30 square 20 sweetheart 10                                                                                                                                         | sleeveless 45 short 35 long 20                                                                                                              | pull-on 100                                                                                                                                                                                | weight: lightweight 60 midweight 40                                                                                                                                                                                                                                                                                                                  |
| robe           | relaxed 60 oversized 40                                                                                                                                                                           | –                                                                                                                                                                                                                                                                                                                                     | midi 40 maxi 40 knee 20                                                                                                                                               | –                                                                                                                                                                                  | long 80 three-quarter 20                                                                                                                    | belt 100                                                                                                                                                                                   | weight: lightweight 30 midweight 35 plush 35                                                                                                                                                                                                                                                                                                         |
| tailor-jacket  | slim 35 regular 45 relaxed 15 oversized 5                                                                                                                                                         | –                                                                                                                                                                                                                                                                                                                                     | regular 80 cropped 10 longline 10                                                                                                                                     | –                                                                                                                                                                                  | long 100                                                                                                                                    | button 100                                                                                                                                                                                 | lapel: notch 60 peak 25 shawl 15; buttons: single-1 20 single-2 45 single-3 10 double-4 10 double-6 15; vent: single 40 double 45 none 15; canvas: half 50 full 20 fused 30                                                                                                                                                                          |
| suit           | slim 40 regular 45 relaxed 15                                                                                                                                                                     | –                                                                                                                                                                                                                                                                                                                                     | regular 100                                                                                                                                                           | –                                                                                                                                                                                  | long 100                                                                                                                                    | button 100                                                                                                                                                                                 | lapel: notch 55 peak 30 shawl 15 (`sub: tuxedo` shawl 50 peak 50); buttons: single-1 20 single-2 60 double-6 20; trouser-fit: slim 40 straight 45 tapered 15                                                                                                                                                                                         |
| waistcoat      | slim 50 regular 40 relaxed 10                                                                                                                                                                     | –                                                                                                                                                                                                                                                                                                                                     | regular 100                                                                                                                                                           | v-neck 100                                                                                                                                                                         | sleeveless 100                                                                                                                              | button 100                                                                                                                                                                                 | buttons: single-4 30 single-5 45 single-6 25; back: fabric 55 satin 45                                                                                                                                                                                                                                                                               |
| tailor-trouser | slim 30 straight 40 tapered 15 wide 10 relaxed 5                                                                                                                                                  | –                                                                                                                                                                                                                                                                                                                                     | regular 70 cropped 20 ankle 10                                                                                                                                        | –                                                                                                                                                                                  | –                                                                                                                                           | zip 80 button 20                                                                                                                                                                           | rise: mid 60 high 40; pleats: flat-front 55 single 30 double 15; hem: plain 65 cuffed 35                                                                                                                                                                                                                                                             |
| dress-shirt    | slim 45 regular 45 relaxed 10                                                                                                                                                                     | –                                                                                                                                                                                                                                                                                                                                     | regular 100                                                                                                                                                           | collar 100                                                                                                                                                                         | long 100                                                                                                                                    | button 100                                                                                                                                                                                 | collar: spread 40 point 30 cutaway 15 button-down 15; cuff: barrel 75 french 25                                                                                                                                                                                                                                                                      |

Subcategory → schema mapping is the `schema` column of §1.3. `SubcategoryDef.attributes` (the
contract field) is derived: the list of the six columns that are non-`–` in the schema.

Consistency rules applied after sampling (in this order): (1) `sleeve = sleeveless` ⇒ neckline ∉
{turtle, collar}; re-draw neckline from the remaining list. (2) `fit ∈ {compression, fitted}` ⇒
`length ≠ longline`. (3) Kids: `heel ∈ {stiletto, kitten}` ⇒ `block`; `rise = low` ⇒ `mid`;
`coverage = minimal` ⇒ `moderate`. (4) Men: `silhouette`, `neckline ∈ {sweetheart, off-shoulder,
halter}` never apply (schemas with them are women/kids-only subcategories anyway). (5) `hood ≠ none`
⇒ `neckline = null`.

### 1.5 Sizes (`SIZE_RUNS`)

| system        | women                      | men                     | unisex                        | kids           |
| ------------- | -------------------------- | ----------------------- | ----------------------------- | -------------- |
| alpha         | XS S M L XL XXL            | XS S M L XL XXL         | XS S M L XL XXL               | XS S M L XL    |
| numeric-waist | 26 27 28 29 30 31 32 33 34 | 28 30 32 34 36 38 40    | 28 30 32 34 36 38             | (uses alpha)   |
| eu-shoe       | 35 36 37 38 39 40 41       | 39 40 41 42 43 44 45 46 | 36 37 38 39 40 41 42 43 44 45 | 35 36 37 38 39 |
| one-size      | OS                         | OS                      | OS                            | OS             |

`sizes` column = the run offered for the product: 70 % full run; 25 % drop 1–2 sizes at the ends
(stream `sizes`: drop count 1 with p .7, side start/end with p .5 each); 5 % a single size (the
run's median). `attributes.soldOutSizes` = comma-joined subset of `sizes` where each size is sold
out with p = .15 (stream `stock`); empty string when none. `stock = 0` ⇒ `soldOutSizes = sizes`.
Kids alpha labels map to age bands in the UI (XS 3–4Y, S 5–6Y, M 7–8Y, L 9–10Y, XL 11–12Y).

---

## 2. Vocabulary

### 2.1 Colours (`COLORS`, 48 — 4 per family; family order = vector dims 32–43)

`bold` ∈ [0,1] feeds boldness; `L` = lightness class (L light / M mid / D dark) used by the
secondary-colour rules; `fAdj` formality adjustment; `trend` ∈ [0,1]. `ColorDef` gets an added
`slug` field (the stub keys colours by `name`; `findColor` accepts slug or name).

| slug           | name           | labelZh  | synonyms (extra)                      | hex     | family         | bold | L   | fAdj | trend |
| -------------- | -------------- | -------- | ------------------------------------- | ------- | -------------- | ---- | --- | ---- | ----- |
| jet-black      | Jet Black      | 黑       | black, 黑色, 全黑                     | #111114 | black          | .10  | D   | +.05 | .5    |
| washed-black   | Washed Black   | 水洗黑   | faded black, 炭黑                     | #2B2A2E | black          | .10  | D   | 0    | .5    |
| onyx           | Onyx           | 縞黑     | deep black, 墨黑                      | #17181C | black          | .12  | D   | +.05 | .55   |
| ink            | Ink            | 墨色     | blue-black, 深藍黑                    | #1B1F2E | black          | .15  | D   | +.05 | .55   |
| optic-white    | Optic White    | 純白     | white, bright white, 白色             | #F8F8F6 | white          | .15  | L   | +.05 | .5    |
| ivory          | Ivory          | 象牙白   | cream, 米白                           | #F3EEDF | white          | .12  | L   | +.05 | .6    |
| off-white      | Off-White      | 米白     | bone, 米色白                          | #EFEDE6 | white          | .10  | L   | 0    | .55   |
| ecru           | Ecru           | 亞麻白   | natural, unbleached, 原色             | #E9E3D3 | white          | .10  | L   | 0    | .55   |
| heather-grey   | Heather Grey   | 麻灰     | grey marl, 灰色, 淺灰                 | #A9A9AE | grey           | .08  | M   | 0    | .5    |
| charcoal       | Charcoal       | 炭灰     | dark grey, 深灰                       | #4A4B50 | grey           | .10  | D   | +.05 | .5    |
| slate          | Slate          | 石板灰   | blue grey, 灰藍                       | #6B7280 | grey           | .12  | M   | +.02 | .55   |
| dove-grey      | Dove Grey      | 鴿灰     | light grey, 淺灰, 銀灰                | #C9C9CB | grey           | .08  | L   | 0    | .5    |
| oatmeal        | Oatmeal        | 燕麥色   | 燕麥, 淺米                            | #D9CDB8 | neutral        | .10  | L   | 0    | .7    |
| beige          | Beige          | 米色     | 米黃, 卡其米                          | #D6C3A5 | neutral        | .10  | L   | 0    | .6    |
| sand           | Sand           | 沙色     | 沙, 淺卡其                            | #CDB58F | neutral        | .12  | M   | 0    | .6    |
| stone          | Stone          | 石色     | greige, taupe, khaki, 卡其, 灰米      | #B8AD9A | neutral        | .10  | M   | 0    | .6    |
| camel          | Camel          | 駝色     | 駝, 焦糖                              | #B98B55 | brown          | .25  | M   | +.05 | .7    |
| chocolate      | Chocolate      | 巧克力棕 | dark brown, 深棕, 咖啡                | #4E342E | brown          | .20  | D   | +.03 | .6    |
| tan            | Tan            | 淺棕     | 棕褐, 卡其棕                          | #C69C6D | brown          | .22  | M   | 0    | .55   |
| cognac         | Cognac         | 干邑棕   | saddle, 焦糖棕, 紅棕                  | #8B4A2B | brown          | .30  | M   | +.03 | .6    |
| crimson        | Crimson        | 正紅     | red, 紅色, 大紅                       | #B3122E | red            | .80  | M   | 0    | .55   |
| burgundy       | Burgundy       | 酒紅     | wine, oxblood, 勃根地                 | #6B1E2E | red            | .55  | D   | +.05 | .65   |
| brick          | Brick          | 磚紅     | rust, 鐵鏽紅, 磚                      | #A3462F | red            | .55  | M   | 0    | .55   |
| tomato         | Tomato         | 番茄紅   | bright red, 亮紅, 橘紅                | #E2452E | red            | .90  | M   | −.05 | .5    |
| blush          | Blush          | 裸粉     | nude pink, 粉, 淡粉                   | #E8B4B8 | pink           | .30  | L   | 0    | .65   |
| baby-pink      | Baby Pink      | 嬰兒粉   | pastel pink, 粉紅, 淺粉               | #F4C6D4 | pink           | .40  | L   | −.03 | .6    |
| hot-pink       | Hot Pink       | 桃紅     | fuchsia, magenta, 桃紅色, 亮粉        | #E3308A | pink           | .95  | M   | −.05 | .6    |
| dusty-rose     | Dusty Rose     | 乾燥玫瑰 | rose, mauve pink, 玫瑰粉, 豆沙        | #C98A94 | pink           | .35  | M   | +.02 | .6    |
| butter         | Butter         | 奶油黃   | pale yellow, 淡黃, 鵝黃               | #F3E2A0 | yellow-orange  | .45  | L   | −.03 | .7    |
| mustard        | Mustard        | 芥末黃   | ochre, 芥黃, 薑黃                     | #C9A227 | yellow-orange  | .65  | M   | 0    | .55   |
| tangerine      | Tangerine      | 橘色     | orange, 橙, 亮橘                      | #F07E26 | yellow-orange  | .90  | M   | −.05 | .55   |
| terracotta     | Terracotta     | 陶土色   | clay, burnt orange, 磚橘, 陶土        | #C4653F | yellow-orange  | .60  | M   | 0    | .6    |
| olive          | Olive          | 橄欖綠   | army green, 軍綠, 橄欖                | #6E6C3E | green          | .25  | M   | 0    | .6    |
| forest         | Forest         | 森林綠   | dark green, hunter, 深綠, 墨綠        | #204D31 | green          | .35  | D   | +.02 | .55   |
| sage           | Sage           | 鼠尾草綠 | 灰綠, 抹茶, 淺綠                      | #A6B392 | green          | .20  | L   | 0    | .7    |
| emerald        | Emerald        | 祖母綠   | bright green, 翠綠, 寶石綠            | #128A5F | green          | .80  | M   | 0    | .55   |
| navy           | Navy           | 海軍藍   | dark blue, 深藍, 藏青                 | #1C2A4A | blue           | .15  | D   | +.05 | .5    |
| cobalt         | Cobalt         | 鈷藍     | royal blue, 寶藍, 亮藍                | #2551C2 | blue           | .85  | M   | 0    | .55   |
| sky            | Sky            | 天藍     | light blue, baby blue, 淺藍, 粉藍     | #9FCAE9 | blue           | .35  | L   | −.02 | .6    |
| mid-wash-denim | Mid-Wash Denim | 中藍丹寧 | denim blue, indigo, 牛仔藍, 靛藍      | #5E7EA8 | blue           | .25  | M   | −.03 | .55   |
| lavender       | Lavender       | 薰衣草紫 | lilac, 淡紫, 丁香                     | #B8A8D9 | purple         | .35  | L   | 0    | .65   |
| plum           | Plum           | 梅紫     | aubergine, 深紫, 茄紫                 | #5C2A57 | purple         | .45  | D   | +.02 | .55   |
| violet         | Violet         | 紫羅蘭   | purple, 紫色, 亮紫                    | #7B3FB3 | purple         | .85  | M   | 0    | .5    |
| mauve          | Mauve          | 藕紫     | 灰紫, 藕色                            | #9F7F91 | purple         | .25  | M   | 0    | .6    |
| gold           | Gold           | 金色     | golden, 金, 黃金                      | #C9A43A | multi-metallic | .75  | M   | +.02 | .6    |
| silver         | Silver         | 銀色     | 銀, 白銀                              | #BFC3CA | multi-metallic | .55  | L   | 0    | .55   |
| rose-gold      | Rose Gold      | 玫瑰金   | 玫瑰金色                              | #B8767D | multi-metallic | .55  | M   | 0    | .6    |
| multicolour    | Multicolour    | 多色     | multi, rainbow, colourful, 彩色, 撞色 | #6C5CE7 | multi-metallic | 1.00 | M   | −.05 | .5    |

Family-level `labelZh` / synonyms (`COLOR_FAMILIES` lexicon): black 黑/黑色; white 白/白色; grey
灰/灰色; neutral 中性色/米色系/大地色; brown 棕/咖啡色; red 紅/紅色; pink 粉/粉色; yellow-orange
黃橘/黃色/橘色; green 綠/綠色; blue 藍/藍色; purple 紫/紫色; multi-metallic 金屬色/多色/金銀.

### 2.2 Colour priors per group (`COLOR_PRIOR[group][family]`) and department multipliers

| group       | black | white | grey | neutral | brown | red | pink | y-o | green | blue | purple | multi |
| ----------- | ----- | ----- | ---- | ------- | ----- | --- | ---- | --- | ----- | ---- | ------ | ----- |
| tops        | 16    | 16    | 10   | 10      | 5     | 5   | 6    | 5   | 7     | 12   | 4      | 4     |
| bottoms     | 18    | 6     | 8    | 14      | 8     | 3   | 3    | 3   | 8     | 24   | 2      | 3     |
| dresses     | 14    | 8     | 4    | 8       | 4     | 9   | 12   | 6   | 9     | 12   | 8      | 6     |
| outerwear   | 20    | 6     | 10   | 14      | 10    | 4   | 3    | 4   | 10    | 14   | 2      | 3     |
| footwear    | 22    | 14    | 8    | 10      | 14    | 4   | 4    | 3   | 5     | 8    | 2      | 6     |
| bags        | 22    | 6     | 6    | 12      | 20    | 5   | 6    | 3   | 6     | 6    | 3      | 5     |
| accessories | 20    | 8     | 10   | 10      | 8     | 6   | 6    | 5   | 8     | 10   | 4      | 5     |
| jewelry     | 4     | 4     | 2    | 2       | 2     | 3   | 5    | 3   | 4     | 3    | 3      | 65    |
| activewear  | 24    | 8     | 12   | 6       | 2     | 5   | 8    | 5   | 8     | 12   | 6      | 4     |
| swimwear    | 16    | 8     | 3    | 5       | 3     | 9   | 10   | 8   | 10    | 14   | 6      | 8     |
| loungewear  | 8     | 10    | 16   | 12      | 4     | 4   | 12   | 5   | 8     | 12   | 6      | 3     |
| tailoring   | 22    | 6     | 18   | 12      | 6     | 3   | 3    | 1   | 6     | 20   | 2      | 1     |

`DEPT_COLOR_MULT`: men → pink .30, purple .50, yellow-orange .70; unisex → pink .60; kids → black .50,
grey .60, brown .70; women → all 1. Within a family, named colours are uniform × `(1 + 0.3·trend)`
unless boosted by an aesthetic (§3). Jewelry colour rule: material `gold-vermeil` ⇒ colour `gold`;
`sterling-silver`, `stainless-steel` ⇒ `silver`; `pearl-resin` ⇒ uniform over {ivory, silver,
rose-gold, blush}; then with p = .15 the stone colour (§1.4) is ignored. Jeans colour rule: colour
∈ {mid-wash-denim, navy, ink, jet-black, washed-black, sky, ecru, optic-white, stone} only; the
`wash` extra is forced consistent (mid-wash-denim → mid-wash; navy/ink → dark-wash; sky → light-wash;
jet-black/washed-black → black; ecru/optic-white/stone → raw).

### 2.3 Patterns (`PATTERNS`, 15)

`groups` = applicable groups; `secondary` = secondary-colour rule (§7.6); `bold`, `tex`, `fAdj`,
`trend` as before; `prior` = global weight before aesthetic boosts. `PatternDef.boldness = bold`.

| slug          | name          | labelZh    | synonyms (extra)                    | groups                                                            | prior | secondary     | bold | tex | fAdj | trend |
| ------------- | ------------- | ---------- | ----------------------------------- | ----------------------------------------------------------------- | ----- | ------------- | ---- | --- | ---- | ----- |
| solid         | Solid         | 素色       | plain, 純色, 單色                   | *                                                                 | 58    | none          | 0    | 0   | 0    | .5    |
| breton-stripe | Breton Stripe | 條紋       | stripe, striped, 橫條, 條紋         | tops bottoms dresses loungewear swimwear accessories activewear   | 6     | contrast      | .35  | .10 | 0    | .5    |
| pinstripe     | Pinstripe     | 細直條     | pin stripe, 西裝條紋                | tailoring tops bottoms outerwear                                  | 3     | contrast-soft | .20  | .10 | +.10 | .5    |
| gingham       | Gingham       | 格紋       | check, picnic check, 方格, 小格紋   | tops dresses bottoms accessories loungewear                       | 3     | white         | .40  | .10 | −.02 | .55   |
| plaid         | Plaid         | 蘇格蘭格紋 | tartan, flannel check, 格子, 大格紋 | tops outerwear bottoms accessories loungewear tailoring           | 5     | harmony       | .45  | .25 | 0    | .5    |
| houndstooth   | Houndstooth   | 千鳥格     | dogtooth, 千鳥紋                    | tailoring outerwear bags accessories bottoms                      | 2     | contrast      | .40  | .25 | +.08 | .55   |
| polka-dot     | Polka Dot     | 圓點       | dots, spotted, 點點, 波點           | dresses tops accessories loungewear swimwear                      | 3     | contrast      | .40  | .05 | 0    | .5    |
| ditsy-floral  | Ditsy Floral  | 小碎花     | small floral, 碎花                  | dresses tops bottoms loungewear swimwear accessories              | 4     | harmony       | .45  | .10 | −.02 | .55   |
| bold-floral   | Bold Floral   | 大花卉     | floral, tropical print, 花卉, 大花  | dresses tops swimwear bottoms accessories                         | 3     | harmony       | .75  | .15 | −.05 | .6    |
| leopard       | Leopard       | 豹紋       | animal print, cheetah, 豹點         | outerwear footwear bags accessories dresses tops                  | 2     | leopard       | .80  | .35 | −.05 | .7    |
| tie-dye       | Tie-Dye       | 紮染       | tiedye, 渲染                        | tops loungewear swimwear activewear                               | 2     | harmony       | .80  | .15 | −.10 | .55   |
| camo          | Camo          | 迷彩       | camouflage, 迷彩紋                  | outerwear bottoms bags accessories tops                           | 2     | camo          | .60  | .15 | −.08 | .5    |
| colour-block  | Colour-Block  | 撞色       | color block, panelled, 拼色         | tops outerwear activewear swimwear bags footwear accessories      | 3     | harmony       | .65  | .05 | −.03 | .65   |
| monogram      | Monogram      | 老花       | logo print, 字母印花, 滿版logo      | bags accessories tops outerwear footwear                          | 2     | contrast-soft | .55  | .15 | 0    | .7    |
| geometric     | Geometric     | 幾何       | abstract, geo print, 幾何圖形       | tops dresses bottoms accessories bags swimwear activewear jewelry | 2     | harmony       | .60  | .15 | −.02 | .6    |

`PATTERNLESS_MATERIALS` (only `solid`): leather, suede, vegan-leather, shearling, rubber,
sterling-silver, gold-vermeil, stainless-steel, pearl-resin, sequin, lace, acetate. `velvet` allows
only solid and leopard. `denim` allows only solid, breton-stripe (shirts) and camo (bottoms).

### 2.4 Materials (`MATERIALS`, 37)

`MaterialDef` = `{slug, name, labelZh, synonyms, groups, warmth, texture}` + added `structure`,
`priceFactor`, `formality`, `adj` (name adjective for the name grammar), `care` (§6.3).

| slug               | name               | labelZh    | synonyms (extra)                             | groups                                                          | warm | tex | struct | priceF | fAdj | adj          | care      |
| ------------------ | ------------------ | ---------- | -------------------------------------------- | --------------------------------------------------------------- | ---- | --- | ------ | ------ | ---- | ------------ | --------- |
| cotton-jersey      | Cotton Jersey      | 棉質       | cotton, jersey, 純棉, 棉                     | tops bottoms dresses loungewear activewear swimwear accessories | .35  | .15 | .15    | 1.00   | −.05 | Cotton       | wash      |
| cotton-poplin      | Cotton Poplin      | 府綢棉     | poplin, 棉布, 襯衫布                         | tops dresses bottoms outerwear loungewear tailoring             | .30  | .20 | .45    | 1.05   | +.05 | Poplin       | wash      |
| linen              | Linen              | 亞麻       | flax, 麻, 麻料                               | tops bottoms dresses outerwear loungewear swimwear tailoring    | .20  | .45 | .30    | 1.20   | 0    | Linen        | wash      |
| denim              | Denim              | 丹寧       | jean, 牛仔布                                 | tops bottoms dresses outerwear bags accessories                 | .45  | .45 | .60    | 1.10   | −.05 | Denim        | wash      |
| corduroy           | Corduroy           | 燈芯絨     | cord, 條絨                                   | bottoms outerwear tops tailoring accessories                    | .60  | .65 | .50    | 1.15   | 0    | Corduroy     | wash      |
| twill              | Cotton Twill       | 斜紋棉     | chino cloth, 斜紋布                          | bottoms outerwear tops tailoring bags accessories               | .45  | .35 | .55    | 1.05   | +.03 | Twill        | wash      |
| silk               | Silk               | 真絲       | 蠶絲, 絲                                     | tops dresses accessories loungewear tailoring                   | .35  | .25 | .20    | 2.20   | +.15 | Silk         | dry-clean |
| satin              | Satin              | 緞面       | sateen, 緞, 絲光                             | tops dresses loungewear footwear bags accessories               | .30  | .20 | .20    | 1.30   | +.10 | Satin        | dry-clean |
| chiffon            | Chiffon            | 雪紡       | 雪紡紗                                       | tops dresses swimwear                                           | .15  | .30 | .10    | 1.20   | +.05 | Chiffon      | hand-wash |
| viscose            | Viscose            | 嫘縈       | rayon, lyocell, tencel, 人造絲, 天絲         | tops dresses bottoms loungewear                                 | .30  | .20 | .20    | 1.00   | 0    | Viscose      | hand-wash |
| wool               | Wool               | 羊毛       | 毛料, 毛呢                                   | outerwear tailoring bottoms tops accessories                    | .85  | .55 | .70    | 1.60   | +.12 | Wool         | dry-clean |
| merino             | Merino             | 美麗諾羊毛 | merino wool, 美麗諾                          | tops accessories loungewear activewear                          | .75  | .30 | .25    | 1.50   | +.05 | Merino       | hand-wash |
| cashmere           | Cashmere           | 喀什米爾   | 羊絨, 開司米                                 | tops accessories loungewear outerwear                           | .90  | .35 | .20    | 2.80   | +.10 | Cashmere     | hand-wash |
| mohair-blend       | Mohair Blend       | 馬海毛     | mohair, fuzzy knit, 馬海毛混紡               | tops outerwear accessories                                      | .85  | .85 | .15    | 1.60   | 0    | Mohair       | hand-wash |
| tweed              | Tweed              | 粗花呢     | 花呢                                         | tailoring outerwear bottoms bags accessories                    | .80  | .80 | .75    | 1.70   | +.12 | Tweed        | dry-clean |
| flannel            | Flannel            | 法蘭絨     | brushed cotton, 法蘭絨布                     | tops loungewear outerwear bottoms                               | .65  | .50 | .30    | 1.05   | −.05 | Flannel      | wash      |
| fleece             | Fleece             | 刷毛       | polar fleece, 搖粒絨, 絨                     | outerwear tops loungewear activewear accessories                | .75  | .60 | .20    | 1.00   | −.10 | Fleece       | wash      |
| french-terry       | French Terry       | 毛圈棉     | terry, loopback, 毛圈布                      | tops bottoms loungewear activewear                              | .55  | .40 | .20    | 1.00   | −.08 | Terry        | wash      |
| nylon              | Nylon              | 尼龍       | 尼龍布                                       | outerwear bags bottoms activewear accessories footwear          | .40  | .20 | .45    | 1.10   | −.05 | Nylon        | technical |
| recycled-polyester | Recycled Polyester | 再生聚酯   | polyester, recycled poly, 聚酯纖維, 環保紗   | outerwear activewear bags accessories swimwear tops             | .45  | .20 | .40    | 0.95   | −.05 | Recycled     | technical |
| performance-knit   | Performance Knit   | 機能針織   | stretch knit, lycra, spandex, 彈性布, 機能布 | activewear swimwear tops bottoms loungewear                     | .35  | .15 | .20    | 1.05   | −.10 | Stretch      | technical |
| leather            | Leather            | 皮革       | full-grain, 真皮, 牛皮                       | outerwear footwear bags accessories bottoms                     | .60  | .40 | .85    | 2.40   | +.10 | Leather      | leather   |
| suede              | Suede              | 麂皮       | nubuck, 麂皮絨                               | footwear outerwear bags accessories bottoms                     | .60  | .60 | .60    | 2.00   | +.05 | Suede        | leather   |
| vegan-leather      | Vegan Leather      | 合成皮     | faux leather, pu leather, 人造皮, PU         | outerwear footwear bags accessories bottoms                     | .50  | .35 | .70    | 1.15   | 0    | Faux-Leather | leather   |
| shearling          | Shearling          | 羊羔毛     | sherpa, teddy, 羔羊毛, 泰迪絨                | outerwear footwear accessories bags                             | .95  | .90 | .50    | 2.60   | +.05 | Shearling    | leather   |
| canvas             | Canvas             | 帆布       | 帆布料                                       | bags footwear outerwear accessories bottoms                     | .40  | .50 | .65    | 0.95   | −.05 | Canvas       | wash      |
| raffia             | Raffia             | 拉菲草     | straw, woven straw, 草編, 藤編               | bags accessories footwear                                       | .20  | .85 | .55    | 1.10   | −.03 | Raffia       | wipe      |
| rubber             | Rubber / EVA       | 橡膠       | eva, foam, 橡膠底, 發泡                      | footwear accessories                                            | .25  | .30 | .60    | 0.80   | −.15 | Rubber       | wipe      |
| mesh               | Mesh               | 網布       | 網眼, 透氣網                                 | activewear footwear tops swimwear accessories                   | .15  | .35 | .15    | 0.95   | −.10 | Mesh         | technical |
| velvet             | Velvet             | 絲絨       | velour, 天鵝絨, 絨布                         | dresses tops outerwear footwear bags accessories tailoring      | .65  | .75 | .35    | 1.50   | +.10 | Velvet       | dry-clean |
| lace               | Lace               | 蕾絲       | 蕾絲布                                       | tops dresses loungewear accessories                             | .20  | .70 | .10    | 1.40   | +.05 | Lace         | hand-wash |
| sequin             | Sequin             | 亮片       | sequined, 珠片                               | dresses tops bags accessories                                   | .30  | .90 | .35    | 1.60   | +.05 | Sequin       | dry-clean |
| sterling-silver    | Sterling Silver    | 純銀       | 925 silver, 925銀, 銀飾                      | jewelry accessories                                             | .10  | .30 | .90    | 1.60   | +.05 | Silver       | metal     |
| gold-vermeil       | Gold Vermeil       | 鍍金銀     | gold plated, 14k, 鍍金, 金飾                 | jewelry accessories                                             | .10  | .30 | .90    | 2.00   | +.08 | Gold         | metal     |
| stainless-steel    | Stainless Steel    | 不鏽鋼     | steel, 鋼                                    | jewelry accessories                                             | .10  | .25 | .95    | 0.90   | 0    | Steel        | metal     |
| acetate            | Acetate            | 醋酸纖維   | 板材, 膠框                                   | accessories                                                     | .10  | .25 | .90    | 1.20   | 0    | Acetate      | wipe      |
| pearl-resin        | Pearl & Resin      | 珍珠樹脂   | pearl, resin, 珍珠, 樹脂                     | jewelry accessories                                             | .10  | .45 | .70    | 1.10   | +.05 | Pearl        | metal     |

`KIDS_EXCLUDED_MATERIALS`: silk, cashmere, sequin, lace, mohair-blend, shearling (footwear excepted).

Material priors per subcategory (`MATERIAL_PRIOR[subcat]`; unlisted-but-group-applicable get 1):

| subcategories                                                                                          | prior (material:weight)                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| tee, tank-top, crop-top, bodysuit, performance-tee†                                                    | cotton-jersey:60 performance-knit:10 viscose:10 linen:6 satin:5 (†performance-tee: performance-knit:60 recycled-polyester:25 mesh:15) |
| camisole                                                                                               | satin:30 cotton-jersey:25 silk:15 viscose:15 lace:10 chiffon:5                                                                        |
| polo-shirt                                                                                             | cotton-jersey:55 merino:15 performance-knit:15 linen:8                                                                                |
| button-down-shirt                                                                                      | cotton-poplin:55 twill:12 flannel:12 linen:8 denim:6 silk:4                                                                           |
| dress-shirt                                                                                            | cotton-poplin:80 twill:10 linen:10                                                                                                    |
| linen-shirt                                                                                            | linen:100                                                                                                                             |
| blouse                                                                                                 | viscose:30 cotton-poplin:25 silk:20 satin:12 chiffon:8 lace:5                                                                         |
| crewneck-sweater, cardigan, turtleneck                                                                 | merino:30 wool:22 cotton-jersey:18 cashmere:12 mohair-blend:10                                                                        |
| hoodie, sweatshirt, sweatpants, joggers, lounge-shorts                                                 | french-terry:55 fleece:25 cotton-jersey:20                                                                                            |
| jeans, denim-jacket                                                                                    | denim:100                                                                                                                             |
| chinos, casual-shorts                                                                                  | twill:55 cotton-poplin:15 linen:12 nylon:10 corduroy:8                                                                                |
| cargo-pants                                                                                            | twill:40 nylon:25 cotton-poplin:15 linen:10 corduroy:10                                                                               |
| wide-leg-trousers, tailored-trousers                                                                   | wool:25 twill:22 viscose:18 linen:15 cotton-poplin:12 corduroy:8                                                                      |
| leggings, training-tights, bike-shorts, sports-bra                                                     | performance-knit:70 cotton-jersey:20 mesh:10                                                                                          |
| mini-skirt, midi-skirt, maxi-skirt, pleated-skirt, overalls                                            | cotton-poplin:25 denim:22 viscose:18 twill:12 satin:8 wool:8 corduroy:7                                                               |
| pencil-skirt                                                                                           | wool:35 twill:30 viscose:20 cotton-poplin:15                                                                                          |
| mini-dress, midi-dress, maxi-dress, wrap-dress, shirt-dress                                            | viscose:28 cotton-poplin:22 linen:14 cotton-jersey:10 chiffon:10 satin:8 silk:8                                                       |
| slip-dress                                                                                             | satin:50 silk:30 viscose:20                                                                                                           |
| knit-dress                                                                                             | merino:35 cotton-jersey:30 wool:20 mohair-blend:15                                                                                    |
| evening-gown                                                                                           | satin:30 silk:22 chiffon:15 velvet:12 sequin:11 wool:10                                                                               |
| sheath-dress                                                                                           | wool:40 viscose:30 cotton-poplin:20 satin:10                                                                                          |
| jumpsuit                                                                                               | linen:25 twill:25 viscose:22 denim:15 satin:13                                                                                        |
| bomber-jacket                                                                                          | nylon:50 recycled-polyester:28 satin:12 leather:10                                                                                    |
| windbreaker, track-jacket                                                                              | nylon:55 recycled-polyester:45                                                                                                        |
| biker-jacket                                                                                           | leather:55 vegan-leather:35 suede:10                                                                                                  |
| puffer-jacket, parka                                                                                   | nylon:55 recycled-polyester:35 shearling:5 canvas:5                                                                                   |
| fleece-jacket                                                                                          | fleece:100                                                                                                                            |
| overshirt                                                                                              | flannel:30 twill:25 corduroy:20 wool:15 denim:10                                                                                      |
| trench-coat                                                                                            | twill:55 cotton-poplin:30 nylon:15                                                                                                    |
| wool-coat                                                                                              | wool:75 cashmere:15 tweed:10                                                                                                          |
| blazer, two-piece-suit, tuxedo, waistcoat                                                              | wool:50 twill:18 linen:14 tweed:10 velvet:8                                                                                           |
| sneaker, running-shoe                                                                                  | mesh:30 canvas:25 leather:20 recycled-polyester:15 suede:10                                                                           |
| loafer, derby, pump, heeled-sandal, ballet-flat, chelsea-boot, ankle-boot, knee-high-boot, combat-boot | leather:55 suede:25 vegan-leather:15 velvet:5                                                                                         |
| hiking-boot                                                                                            | leather:60 nylon:20 suede:15 vegan-leather:5                                                                                          |
| flat-sandal, slide                                                                                     | leather:30 rubber:30 vegan-leather:20 raffia:10 shearling:10                                                                          |
| slipper                                                                                                | shearling:40 fleece:30 rubber:15 cotton-jersey:15                                                                                     |
| tote, shoulder-bag, crossbody, mini-bag, clutch, bucket-bag, backpack, belt-bag, duffle                | leather:35 vegan-leather:22 canvas:18 nylon:15 suede:5 raffia:5                                                                       |
| baseball-cap, bucket-hat                                                                               | twill:50 cotton-poplin:20 nylon:15 canvas:10 corduroy:5                                                                               |
| beanie, scarf                                                                                          | merino:35 wool:25 cashmere:15 mohair-blend:10 cotton-jersey:15                                                                        |
| belt                                                                                                   | leather:60 vegan-leather:25 canvas:15                                                                                                 |
| watch                                                                                                  | stainless-steel:60 leather:30 nylon:10                                                                                                |
| tie                                                                                                    | silk:60 wool:20 cotton-poplin:20                                                                                                      |
| sunglasses                                                                                             | acetate:75 stainless-steel:25                                                                                                         |
| socks                                                                                                  | cotton-jersey:70 merino:20 performance-knit:10                                                                                        |
| hair-clip                                                                                              | acetate:50 satin:25 pearl-resin:25                                                                                                    |
| necklace, earrings, bracelet, ring, brooch                                                             | gold-vermeil:35 sterling-silver:35 stainless-steel:15 pearl-resin:15                                                                  |
| running-shorts                                                                                         | performance-knit:60 recycled-polyester:25 mesh:15                                                                                     |
| bikini-top, bikini-bottom, one-piece, swim-trunks, rash-guard                                          | performance-knit:75 recycled-polyester:20 mesh:5                                                                                      |
| cover-up                                                                                               | linen:40 viscose:35 chiffon:25                                                                                                        |
| pajama-set, nightgown                                                                                  | cotton-jersey:35 cotton-poplin:25 satin:20 silk:10 flannel:10                                                                         |
| robe                                                                                                   | cotton-jersey:35 fleece:25 satin:20 silk:10 linen:10                                                                                  |

### 2.5 Fits, silhouettes, lengths, necklines, sleeves, closures

`FITS` (`FitDef`: slug, name, labelZh, synonyms, structure):

| slug        | name        | labelZh | synonyms                        | structure |
| ----------- | ----------- | ------- | ------------------------------- | --------- |
| fitted      | Fitted      | 貼身    | tight, bodycon fit, 修身, 緊身  | .55       |
| compression | Compression | 壓縮    | compressive, 壓力               | .50       |
| skinny      | Skinny      | 窄管    | skinny fit, 緊身褲型, 鉛筆褲    | .55       |
| slim        | Slim        | 合身    | slim fit, 修身版                | .60       |
| regular     | Regular     | 標準    | classic fit, 正常版, 標準版     | .50       |
| straight    | Straight    | 直筒    | straight leg, 直筒褲            | .55       |
| tapered     | Tapered     | 錐形    | tapered leg, 錐形褲, 縮口       | .55       |
| relaxed     | Relaxed     | 寬鬆    | loose, easy fit, 寬鬆版, 休閒版 | .35       |
| oversized   | Oversized   | 超寬鬆  | oversize, 落肩, 大版            | .25       |
| boxy        | Boxy        | 方正    | boxy fit, 方版, 短寬            | .40       |
| wide        | Wide        | 寬版    | wide leg, 寬褲, 闊腿            | .30       |
| flared      | Flared      | 喇叭    | bootcut, flare, 喇叭褲          | .40       |

`SILHOUETTE_VALUES` (dress/skirt `silhouette` column; structure in brackets): a-line 傘狀 (.45),
bodycon 緊身 (.55), shift 直身 (.45), fit-and-flare 收腰傘襬 (.50), wrap 裹身 (.35), slip 吊帶 (.10),
column 直筒 (.55), tiered 蛋糕層次 (.30), pencil 鉛筆 (.60), pleated 百褶 (.45).
`LENGTHS`: cropped 短版, regular 標準, longline 長版, short 短, knee 及膝, mini 迷你, midi 中長, maxi 長, floor 及地, ankle 九分, full 全長.
`NECKLINES`: crew 圓領, v-neck V領, scoop 大圓領, square 方領, boat 船領, mock 小高領, turtle 高領, halter 掛脖, sweetheart 心形領, off-shoulder 一字領, collar 有領, henley 亨利領, racerback 挖背, hood 連帽.
`SLEEVES`: sleeveless 無袖, cap 蓋袖, short 短袖, elbow 五分袖, three-quarter 七分袖, long 長袖, puff 泡泡袖, raglan 拉克蘭袖.
`CLOSURES`: pull-on 套頭, button 鈕扣, zip 拉鍊, snap 暗扣, drawstring 抽繩, wrap-tie 綁帶, lace-up 綁帶鞋, buckle 扣環, slip-on 套入, velcro 魔鬼氈, belt 腰帶, magnetic 磁扣.

Fit adjustments used by the axes (§8): `oversized, boxy, wide, flared` → coverage +.03, boldness
+.05, structure −.05; `fitted, skinny, compression` and silhouette `bodycon` → coverage −.03,
boldness +.05.

### 2.6 Occasions (`OCCASIONS`, 12)

| slug          | name           | labelZh    | synonyms                                    | formality | favoured subcategories (score 1; group listed = every subcategory of the group)                                                    |
| ------------- | -------------- | ---------- | ------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| everyday      | Everyday       | 日常       | daily, casual, 平日, 休閒                   | .25       | tee, jeans, sneaker, tote, hoodie, chinos, crossbody, polo-shirt, sweatshirt, baseball-cap, backpack, socks                        |
| work          | Work           | 上班       | office, business, 辦公室, 通勤              | .65       | blazer, tailored-trousers, button-down-shirt, loafer, tote, midi-skirt, sheath-dress, dress-shirt, pencil-skirt, turtleneck, watch |
| date-night    | Date Night     | 約會       | date, dinner, 晚餐, 約會夜                  | .60       | slip-dress, mini-dress, heeled-sandal, biker-jacket, blouse, earrings, bodysuit, mini-bag, pump                                    |
| wedding-guest | Wedding Guest  | 婚禮賓客   | wedding, 婚禮, 喜宴                         | .85       | midi-dress, maxi-dress, evening-gown, pump, clutch, two-piece-suit, tie, sheath-dress, heeled-sandal                               |
| party         | Party          | 派對       | night out, club, 夜店, 聚會                 | .55       | mini-dress, pump, clutch, earrings, bodysuit, crop-top, heeled-sandal, mini-bag                                                    |
| travel        | Travel         | 旅行       | trip, vacation, airport, 出國, 旅遊         | .30       | duffle, backpack, sneaker, wide-leg-trousers, cardigan, windbreaker, belt-bag, joggers, sunglasses                                 |
| workout       | Workout        | 運動       | gym, training, run, 健身, 跑步              | .05       | activewear, running-shoe                                                                                                           |
| beach         | Beach          | 海邊       | pool, seaside, 海灘, 泳池, 度假             | .10       | swimwear, slide, flat-sandal, bucket-hat, sunglasses, linen-shirt                                                                  |
| festival      | Festival       | 音樂節     | concert, 演唱會, 戶外活動                   | .20       | crop-top, casual-shorts, combat-boot, belt-bag, sunglasses, bucket-hat, denim-jacket, hair-clip                                    |
| brunch        | Weekend Brunch | 週末早午餐 | weekend, cafe, 週末, 下午茶                 | .40       | midi-dress, linen-shirt, ballet-flat, cardigan, mini-bag, blouse, wide-leg-trousers, loafer                                        |
| formal        | Formal Event   | 正式場合   | black tie, gala, ceremony, 正式, 晚宴, 典禮 | .95       | tuxedo, evening-gown, two-piece-suit, pump, derby, brooch, tie, clutch, watch                                                      |
| lounge        | Lounge         | 居家       | home, sleep, cozy, 在家, 睡覺               | .05       | loungewear, sweatpants, slipper, hoodie, socks                                                                                     |

Occasion assignment (§7.8): `occasions[0]` = argmax over occasions of
`favoured(sub) ? 1 : 0.4 − |occ.formality − product.formality|` (ties → table order); then with
p = .6 a second occasion (uniform over the remaining occasions with `|Δformality| ≤ .3`) and with
p = .3 a third. 1–3 unique occasions.

### 2.7 Seasons (`SEASONS`)

`SEASONS` = spring 春, summer 夏, autumn 秋, winter 冬, all-season 四季. Prior by subcategory code:

| code | all-season | spring | summer | autumn | winter |
| ---- | ---------- | ------ | ------ | ------ | ------ |
| A    | .45        | .15    | .15    | .15    | .10    |
| S    | .15        | .25    | .55    | .05    | .00    |
| W    | .15        | .05    | .00    | .30    | .50    |
| T    | .25        | .30    | .10    | .30    | .05    |
| Y    | .30        | .175   | .175   | .175   | .175   |

Material override: `warm ≥ .75` moves .20 of mass from (spring, summer) to (autumn, winter) pro
rata; `warm ≤ .20` the reverse. `seasons` column = `[primary]`, plus with p = .35 (stream `season`)
one adjacent season (spring↔summer, autumn↔winter; `all-season` gets no second). Collection code
`attributes.collection` = `SS{yy}` for spring/summer, `AW{yy}` for autumn/winter, `CORE{yy}` for
all-season, where `yy` = last two digits of `dropYear` (§5.5).

---

## 3. The 32 aesthetics (`AESTHETICS`, order = vector dims 0–31)

### 3.1 Identity and parameters

`dept` = W/M/U/K multipliers; `bg` = SVG background tint; `trend`, `fAdj`, `bold` feed the axes
(stored on `AestheticDef.axes` as `{ trendiness, formality, boldness }`); `prior` = global prior
used when the primary is not a brand home aesthetic (§3.4); `neighbours` = `NEIGHBOURS[slug]`
(secondary aesthetic candidates; every listed slug exists — tested).

| dim | slug           | name           | labelZh  | synonyms (extra)                            | definition                                                                           | dept W/M/U/K | bg      | trend | fAdj | bold | prior | neighbours                                           |
| --- | -------------- | -------------- | -------- | ------------------------------------------- | ------------------------------------------------------------------------------------ | ------------ | ------- | ----- | ---- | ---- | ----- | ---------------------------------------------------- |
| 0   | minimalist     | Minimalist     | 極簡     | minimal, clean, 簡約, 極簡風                | Clean lines, neutral palette, no logos, one idea per garment.                        | 1/1/1/.3     | #F3F1EC | .55   | +.05 | .10  | .050  | scandi, quiet-luxury, normcore, clean-girl           |
| 1   | quiet-luxury   | Quiet Luxury   | 低調奢華 | old money, stealth wealth, 老錢風, 靜奢     | Understated luxury: cashmere, camel, tailoring, nothing that shouts.                 | 1/.8/.4/.1   | #EFE8DC | .70   | +.12 | .10  | .035  | minimalist, corporate-chic, dark-academia, scandi    |
| 2   | streetwear     | Streetwear     | 街頭     | street, hype, 街頭風, 潮流                  | Oversized hoodies, graphic tees, chunky sneakers, logo energy.                       | .7/1/1/.5    | #E9E9EA | .75   | −.12 | .50  | .055  | k-street, techwear, normcore, y2k                    |
| 3   | y2k            | Y2K            | 千禧     | 2000s, millennium, 千禧風, 辣妹             | Early-2000s revival: low rise, baby tees, butterfly clips, shine.                    | 1/.3/.5/.2   | #F6E4F0 | .80   | −.15 | .70  | .030  | k-street, coquette, glam, streetwear                 |
| 4   | grunge         | Grunge         | 頹廢搖滾 | 90s grunge, 油漬搖滾                        | 90s flannel, ripped denim, combat boots, deliberately undone.                        | .8/1/1/.1    | #E4E2E0 | .50   | −.15 | .40  | .025  | punk, goth, workwear, streetwear                     |
| 5   | gorpcore       | Gorpcore       | 山系     | outdoor, hiking style, 機能戶外, 戶外風     | Technical outdoor gear worn in the city: fleece, shells, trail shoes.                | .7/1/1/.4    | #E6EAE3 | .70   | −.15 | .40  | .030  | techwear, workwear, athleisure, normcore             |
| 6   | preppy         | Preppy         | 學院     | ivy, collegiate, 學院風, 常春藤             | Collegiate classics: polos, chinos, loafers, stripes and plaid.                      | 1/1/.5/.8    | #E8EEF6 | .50   | +.08 | .30  | .030  | dark-academia, coastal, corporate-chic, quiet-luxury |
| 7   | cottagecore    | Cottagecore    | 田園     | cottage, prairie, 田園風, 森林系            | Pastoral romance: prairie dresses, florals, linen, gingham, baskets.                 | 1/.1/.2/.6   | #F1F3E6 | .55   | −.03 | .30  | .030  | romantic, boho, coastal, coquette                    |
| 8   | coastal        | Coastal        | 海岸     | riviera, coastal grandmother, 海邊風, 度假  | Coastal ease: linen, stripes, white, straw.                                          | 1/.7/.5/.4   | #EAF2F5 | .60   | 0    | .20  | .035  | resort, scandi, preppy, cottagecore                  |
| 9   | dark-academia  | Dark Academia  | 暗黑學院 | academia, scholarly, 學術風, 復古學院       | Library romance: tweed, turtlenecks, pleats, oxblood, brass.                         | 1/1/.5/.1    | #E9E3DA | .55   | +.12 | .20  | .030  | preppy, quiet-luxury, goth, corporate-chic           |
| 10  | balletcore     | Balletcore     | 芭蕾     | ballet, 芭蕾風                              | Studio softness: wrap knits, ribbon, blush, leg-warmer layering.                     | 1/0/.1/.5    | #F8E9EE | .65   | 0    | .20  | .022  | coquette, romantic, clean-girl, athleisure           |
| 11  | techwear       | Techwear       | 機能     | tech, urban ninja, 機能風, 都市機能         | Urban technical: black shells, straps, taped seams, modular pockets.                 | .4/1/1/.1    | #DDDFE3 | .60   | −.10 | .30  | .025  | gorpcore, streetwear, avant-garde, k-street          |
| 12  | boho           | Boho           | 波希米亞 | bohemian, 波西米亞, 民族風                  | Bohemian layering: crochet, fringe, earthy prints, flowing maxis.                    | 1/.2/.3/.2   | #F2EADF | .50   | −.05 | .50  | .028  | cottagecore, retro-70s, resort, western              |
| 13  | athleisure     | Athleisure     | 運動休閒 | sporty, gym-to-street, 運動風, 機能休閒     | Gym-to-street: leggings, sports bras, sleek trainers, matching sets.                 | 1/1/.8/.5    | #E7EBEF | .70   | −.15 | .30  | .050  | clean-girl, gorpcore, normcore, balletcore           |
| 14  | romantic       | Romantic       | 浪漫     | feminine, soft, 浪漫風, 甜美                | Soft femininity: ruffles, puff sleeves, florals, satin, drape.                       | 1/0/.05/.3   | #F7EBEF | .55   | +.05 | .30  | .030  | coquette, cottagecore, balletcore, glam              |
| 15  | retro-70s      | Retro 70s      | 復古70   | seventies, 70s, 七零年代, 復古              | Seventies revival: flares, suede, corduroy, warm browns and rust.                    | 1/.8/.5/.1   | #F1E7D8 | .50   | −.03 | .50  | .022  | boho, western, workwear, grunge                      |
| 16  | workwear       | Workwear       | 工裝     | utility, heritage, 工裝風, 阿美咔嘰         | Heritage utility: chore coats, canvas, selvedge denim, rugged boots.                 | .6/1/1/.3    | #EBE6DC | .55   | −.05 | .20  | .033  | city-boy, gorpcore, western, normcore                |
| 17  | clean-girl     | Clean Girl     | 乾淨女孩 | clean look, polished, 乾淨風, 高級感        | Sleek and polished: neutral bodysuits, gold hoops, monochrome sets.                  | 1/0/.2/.1    | #F2EEE8 | .75   | +.03 | .15  | .035  | minimalist, athleisure, balletcore, quiet-luxury     |
| 18  | avant-garde    | Avant-Garde    | 前衛     | conceptual, deconstructed, 前衛風, 解構     | Sculptural, deconstructed, asymmetric; fashion as architecture.                      | 1/.7/1/0     | #E3E1E3 | .60   | +.05 | .60  | .020  | minimalist, goth, techwear, mob-wife                 |
| 19  | coquette       | Coquette       | 嬌俏     | bows, girly, 蝴蝶結風, 少女                 | Bows, lace, pearls, cherry red; hyper-feminine and playful.                          | 1/0/.05/.4   | #FAE8EC | .70   | 0    | .40  | .030  | romantic, balletcore, y2k, cottagecore               |
| 20  | normcore       | Normcore       | 基本     | basic, everyday, 基本款, 素人風             | Deliberately unremarkable basics: straight jeans, plain tees, dad trainers.          | .8/1/1/.6    | #ECECEA | .45   | −.03 | .05  | .050  | minimalist, streetwear, workwear, athleisure         |
| 21  | scandi         | Scandi         | 北歐     | scandinavian, nordic, 北歐風, 斯堪地        | Nordic minimal-cosy: soft wool, muted tones, functional shapes.                      | 1/.8/.8/.7   | #EEEDE9 | .60   | +.02 | .15  | .035  | minimalist, coastal, quiet-luxury, normcore          |
| 22  | city-boy       | City Boy       | 城市男孩 | citiboy, popeye, 日系城市, 日系             | Tokyo city-boy: loose chinos, wide shorts, workwear-meets-prep layering.             | .3/1/1/.1    | #E8EBEA | .70   | 0    | .20  | .030  | workwear, normcore, preppy, k-street                 |
| 23  | glam           | Glam           | 華麗     | glamour, glitz, 華麗風, 派對                | Night-out glamour: sequins, satin, metallics, heels, statement earrings.             | 1/.1/.05/0   | #EEE5EC | .60   | +.10 | .80  | .025  | mob-wife, romantic, y2k, resort                      |
| 24  | punk           | Punk           | 龐克     | rock, 龐克風, 搖滾                          | Studs, tartan, leather, safety pins; anti-establishment tailoring.                   | .8/1/1/0     | #E2E0E2 | .50   | −.10 | .70  | .020  | grunge, goth, streetwear, avant-garde                |
| 25  | mob-wife       | Mob Wife       | 黑幫貴婦 | maximal glam, fur and leopard, 貴婦風, 豹紋 | Maximalist glamour: shearling, leopard, gold, oversized sunglasses.                  | 1/.05/.05/0  | #EBE3DF | .70   | +.05 | .80  | .018  | glam, retro-70s, avant-garde, quiet-luxury           |
| 26  | western        | Western        | 西部     | cowboy, cowgirl, 牛仔風, 西部風             | Cowboy revival: denim on denim, fringe, boots, pearl snaps.                          | .9/1/.5/.2   | #F0E9DE | .65   | −.05 | .45  | .022  | workwear, retro-70s, boho, grunge                    |
| 27  | resort         | Resort         | 度假     | vacation, tropical, 度假風, 熱帶            | Tropical holiday: bright prints, palm florals, kaftans, straw, sandals.              | 1/.7/.4/.6   | #EAF4EE | .55   | −.08 | .70  | .030  | coastal, boho, glam, y2k                             |
| 28  | goth           | Goth           | 哥德     | gothic, dark, 哥德風, 暗黑                  | Dark romance: all black, lace, velvet, silver hardware, platforms.                   | 1/.6/.7/0    | #DED9DF | .50   | 0    | .55  | .020  | punk, dark-academia, avant-garde, grunge             |
| 29  | kidcore        | Kidcore        | 童趣     | playful, colourful kids, 童趣風, 童裝       | Playful primaries, cartoons, rainbows, comfort first.                                | .1/.05/.2/1  | #FBF1DC | .50   | −.20 | .80  | .030  | streetwear, athleisure, preppy, resort               |
| 30  | corporate-chic | Corporate Chic | 都會職場 | office siren, workwear chic, 職場風, 通勤   | Office-siren modern workwear: sharp tailoring, pencil skirts, sleek pumps.           | 1/1/.2/0     | #E8EAEF | .60   | +.20 | .20  | .035  | quiet-luxury, minimalist, preppy, dark-academia      |
| 31  | k-street       | K-Street       | 韓系街頭 | korean street, seoul style, 韓系, 韓風      | Seoul street: oversized layering, soft monochrome, cropped jackets, chunky trainers. | 1/1/1/.3     | #EEF0F2 | .80   | −.10 | .35  | .040  | streetwear, y2k, city-boy, athleisure                |

Priors sum to 1.000 (tested to 1e-6).

### 3.2 Favourites (`AestheticDef.favours`)

Scoring in §3.4: `S_cat` = 1 for a favoured subcategory, .5 for another subcategory of a group that
contains a favourite (`favours.categoryGroups` = derived set of those groups), else 0. `S_col` =
1 for a favoured named colour, .5 for a colour in a favoured family (`favours.colorFamilies` =
families of the listed colours), else 0. `S_mat` = 1 favoured, .25 otherwise. `S_pat` = 1 favoured;
`solid` scores .5 when not listed; else 0. `S_fit` = 1 when `fit` or `silhouette` is favoured,
else .4. Every id below exists in §1.3 / §2.1 / §2.4 / §2.3 / §2.5 (tested).

| slug           | subcategories                                                                                                                                                  | colours                                                                               | materials                                                                    | patterns                                                             | fits / silhouettes                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| minimalist     | tee, button-down-shirt, wide-leg-trousers, wool-coat, tote, loafer, sneaker, crewneck-sweater, midi-dress, turtleneck, tailored-trousers, crossbody            | optic-white, jet-black, oatmeal, stone, heather-grey, ivory, charcoal, off-white      | cotton-poplin, merino, wool, leather, linen, cotton-jersey                   | solid                                                                | regular, relaxed, straight, slim, column, shift    |
| quiet-luxury   | crewneck-sweater, wool-coat, trench-coat, blazer, tailored-trousers, loafer, tote, blouse, midi-skirt, pencil-skirt, shoulder-bag, scarf, watch                | camel, ivory, navy, chocolate, oatmeal, charcoal, tan, burgundy                       | cashmere, wool, silk, leather, merino, suede                                 | solid, pinstripe, houndstooth                                        | regular, slim, straight, column, pencil            |
| streetwear     | hoodie, sweatshirt, tee, cargo-pants, joggers, sneaker, bomber-jacket, baseball-cap, beanie, belt-bag, backpack, puffer-jacket                                 | jet-black, optic-white, heather-grey, tomato, cobalt, tangerine, forest, washed-black | french-terry, cotton-jersey, nylon, denim, fleece                            | monogram, colour-block, camo, solid                                  | oversized, boxy, relaxed, wide                     |
| y2k            | crop-top, camisole, mini-skirt, jeans, bodysuit, mini-bag, hair-clip, heeled-sandal, tank-top, track-jacket, sunglasses, belt                                  | baby-pink, hot-pink, butter, sky, lavender, silver, optic-white, mid-wash-denim       | satin, performance-knit, denim, mesh, velvet, cotton-jersey                  | monogram, colour-block, geometric, ditsy-floral, tie-dye             | fitted, skinny, bodycon, slim                      |
| grunge         | button-down-shirt, tee, jeans, combat-boot, cardigan, biker-jacket, beanie, slip-dress, denim-jacket, overshirt                                                | washed-black, charcoal, burgundy, forest, olive, ink, heather-grey                    | flannel, denim, leather, cotton-jersey, mohair-blend                         | plaid, solid, breton-stripe                                          | oversized, relaxed, straight, slip                 |
| gorpcore       | fleece-jacket, windbreaker, puffer-jacket, parka, cargo-pants, hiking-boot, running-shoe, belt-bag, backpack, beanie, bucket-hat, track-jacket                 | olive, forest, tangerine, navy, stone, charcoal, cobalt, mustard                      | fleece, nylon, recycled-polyester, performance-knit, rubber                  | colour-block, solid, camo                                            | relaxed, regular, oversized, tapered               |
| preppy         | polo-shirt, button-down-shirt, chinos, crewneck-sweater, cardigan, pleated-skirt, loafer, blazer, casual-shorts, baseball-cap, tote, derby                     | navy, optic-white, crimson, forest, butter, sky, stone, camel                         | cotton-poplin, cotton-jersey, merino, twill, tweed, leather                  | breton-stripe, gingham, plaid, houndstooth, solid                    | regular, slim, straight, pleated, a-line           |
| cottagecore    | midi-dress, maxi-dress, blouse, cardigan, midi-skirt, wrap-dress, flat-sandal, tote, bucket-hat, hair-clip, linen-shirt, nightgown                             | sage, butter, blush, oatmeal, ivory, dusty-rose, lavender, sky                        | linen, cotton-poplin, lace, viscose, raffia, chiffon                         | ditsy-floral, gingham, bold-floral, solid                            | relaxed, regular, fit-and-flare, tiered, a-line    |
| coastal        | linen-shirt, wide-leg-trousers, casual-shorts, maxi-dress, cover-up, flat-sandal, slide, tote, sunglasses, bucket-hat, cardigan, one-piece                     | optic-white, ivory, sand, sky, navy, sage, oatmeal, beige                             | linen, cotton-poplin, raffia, canvas, cotton-jersey                          | breton-stripe, solid, gingham                                        | relaxed, regular, wide, shift                      |
| dark-academia  | turtleneck, blazer, pleated-skirt, tailored-trousers, cardigan, derby, chelsea-boot, wool-coat, button-down-shirt, tie, brooch, tote                           | chocolate, burgundy, forest, charcoal, camel, ink, stone, plum                        | tweed, wool, corduroy, flannel, leather, merino                              | houndstooth, plaid, pinstripe, solid                                 | slim, regular, tapered, pleated, pencil            |
| balletcore     | cardigan, bodysuit, ballet-flat, midi-skirt, leggings, crop-top, hair-clip, socks, camisole, wrap-dress, knit-dress, training-tights                           | blush, baby-pink, ivory, dusty-rose, off-white, lavender, jet-black                   | cotton-jersey, mohair-blend, satin, mesh, lace, merino                       | solid, ditsy-floral                                                  | fitted, slim, wrap, a-line                         |
| techwear       | windbreaker, cargo-pants, bomber-jacket, belt-bag, backpack, sneaker, combat-boot, performance-tee, joggers, puffer-jacket, sunglasses, running-shoe           | jet-black, onyx, charcoal, slate, olive, ink, washed-black                            | nylon, recycled-polyester, performance-knit, rubber, mesh                    | solid, camo, geometric                                               | tapered, relaxed, regular, slim                    |
| boho           | maxi-dress, maxi-skirt, blouse, cardigan, wide-leg-trousers, flat-sandal, bucket-bag, necklace, bracelet, scarf, cover-up, earrings                            | terracotta, mustard, tan, olive, burgundy, oatmeal, cognac, brick                     | viscose, linen, suede, raffia, lace, chiffon, cotton-poplin                  | bold-floral, geometric, ditsy-floral, tie-dye                        | relaxed, wide, tiered, wrap, flared                |
| athleisure     | training-tights, sports-bra, bike-shorts, performance-tee, track-jacket, joggers, sneaker, running-shoe, hoodie, baseball-cap, belt-bag, tank-top              | jet-black, heather-grey, sage, mauve, navy, optic-white, dusty-rose, slate            | performance-knit, recycled-polyester, french-terry, mesh, nylon              | solid, colour-block                                                  | fitted, compression, regular, relaxed, tapered     |
| romantic       | blouse, midi-dress, wrap-dress, slip-dress, mini-dress, midi-skirt, heeled-sandal, pump, earrings, mini-bag, camisole, evening-gown                            | blush, dusty-rose, lavender, butter, ivory, sky, mauve, baby-pink                     | chiffon, satin, silk, lace, viscose, cotton-poplin                           | ditsy-floral, bold-floral, polka-dot, solid                          | fit-and-flare, a-line, fitted, regular, wrap, slip |
| retro-70s      | jeans, wide-leg-trousers, button-down-shirt, biker-jacket, knee-high-boot, sunglasses, maxi-dress, crewneck-sweater, turtleneck, belt, shoulder-bag, overshirt | cognac, mustard, terracotta, chocolate, olive, tan, burgundy, camel                   | corduroy, suede, denim, velvet, wool, viscose                                | geometric, bold-floral, solid, breton-stripe                         | flared, fitted, slim, wide, wrap                   |
| workwear       | overshirt, denim-jacket, cargo-pants, jeans, chinos, button-down-shirt, combat-boot, hiking-boot, beanie, overalls, belt, tote                                 | stone, tan, navy, olive, chocolate, mid-wash-denim, brick, charcoal                   | canvas, denim, twill, corduroy, flannel, leather, wool                       | solid, plaid, breton-stripe                                          | relaxed, straight, regular                         |
| clean-girl     | bodysuit, tank-top, leggings, wide-leg-trousers, blazer, mini-bag, earrings, necklace, sneaker, slide, midi-dress, crop-top                                    | optic-white, beige, oatmeal, jet-black, sand, camel, stone, ivory                     | cotton-jersey, performance-knit, viscose, gold-vermeil, vegan-leather, satin | solid                                                                | fitted, slim, regular, column, wide                |
| avant-garde    | wool-coat, wide-leg-trousers, maxi-dress, blazer, jumpsuit, combat-boot, tote, turtleneck, biker-jacket, evening-gown, earrings, overshirt                     | jet-black, onyx, optic-white, charcoal, slate, ink, washed-black                      | wool, nylon, leather, viscose, performance-knit, satin                       | solid, geometric, colour-block                                       | oversized, boxy, wide, column                      |
| coquette       | mini-dress, camisole, mini-skirt, ballet-flat, hair-clip, necklace, earrings, cardigan, blouse, socks, slip-dress, mini-bag                                    | baby-pink, blush, crimson, ivory, optic-white, dusty-rose, jet-black                  | lace, satin, silk, cotton-poplin, pearl-resin, chiffon                       | polka-dot, ditsy-floral, gingham, solid                              | fitted, fit-and-flare, slim, a-line, slip          |
| normcore       | tee, jeans, chinos, crewneck-sweater, sneaker, fleece-jacket, baseball-cap, casual-shorts, denim-jacket, socks, polo-shirt, sweatshirt                         | heather-grey, navy, optic-white, mid-wash-denim, stone, jet-black, beige, dove-grey   | cotton-jersey, denim, fleece, twill, cotton-poplin                           | solid, breton-stripe                                                 | regular, straight, relaxed                         |
| scandi         | crewneck-sweater, cardigan, wool-coat, wide-leg-trousers, midi-dress, turtleneck, sneaker, chelsea-boot, scarf, beanie, tote, puffer-jacket                    | oatmeal, stone, sage, ivory, charcoal, camel, sky, heather-grey                       | merino, wool, mohair-blend, linen, cotton-poplin, recycled-polyester         | solid, breton-stripe, geometric                                      | relaxed, regular, oversized, shift                 |
| city-boy       | button-down-shirt, chinos, wide-leg-trousers, casual-shorts, overshirt, sneaker, loafer, crewneck-sweater, bucket-hat, tote, socks, denim-jacket               | navy, stone, optic-white, olive, sand, mid-wash-denim, chocolate, sage                | cotton-poplin, twill, linen, canvas, merino, denim                           | solid, breton-stripe, plaid, gingham                                 | wide, relaxed, oversized, boxy                     |
| glam           | mini-dress, evening-gown, slip-dress, pump, heeled-sandal, clutch, earrings, necklace, blazer, bodysuit, midi-skirt, jumpsuit                                  | gold, silver, jet-black, crimson, hot-pink, emerald, plum, violet                     | sequin, satin, silk, velvet, gold-vermeil, vegan-leather                     | solid, geometric, leopard                                            | fitted, bodycon, slim, column                      |
| punk           | biker-jacket, combat-boot, tee, jeans, pleated-skirt, mini-skirt, belt, necklace, bracelet, waistcoat, bomber-jacket, sneaker                                  | jet-black, crimson, optic-white, charcoal, tomato, plum, washed-black                 | leather, denim, vegan-leather, cotton-jersey, mohair-blend, stainless-steel  | plaid, solid, leopard, breton-stripe                                 | skinny, slim, fitted, pleated                      |
| mob-wife       | wool-coat, biker-jacket, sunglasses, shoulder-bag, pump, knee-high-boot, earrings, necklace, midi-dress, blazer, slip-dress, belt                              | jet-black, gold, crimson, chocolate, burgundy, camel, plum, cognac                    | shearling, leather, velvet, satin, gold-vermeil, silk                        | leopard, solid, houndstooth                                          | oversized, fitted, slim, bodycon                   |
| western        | denim-jacket, jeans, button-down-shirt, knee-high-boot, ankle-boot, belt, overshirt, midi-skirt, casual-shorts, scarf, necklace, chelsea-boot                  | mid-wash-denim, tan, cognac, chocolate, optic-white, brick, sky, stone                | denim, suede, leather, cotton-poplin, canvas, corduroy                       | plaid, solid, geometric, bold-floral                                 | straight, flared, slim, relaxed, a-line            |
| resort         | cover-up, bikini-top, bikini-bottom, one-piece, swim-trunks, maxi-dress, casual-shorts, linen-shirt, flat-sandal, slide, sunglasses, tote                      | tangerine, emerald, hot-pink, butter, sky, optic-white, sand, cobalt                  | linen, viscose, cotton-poplin, raffia, performance-knit, rubber              | bold-floral, geometric, breton-stripe, colour-block, tie-dye         | relaxed, wide, regular, tiered, wrap               |
| goth           | maxi-dress, slip-dress, combat-boot, biker-jacket, turtleneck, mini-skirt, leggings, necklace, ring, blouse, wool-coat, bracelet                               | jet-black, onyx, washed-black, burgundy, plum, silver, ink                            | velvet, lace, leather, vegan-leather, mesh, sterling-silver, satin           | solid, geometric                                                     | fitted, slim, oversized, column, slip              |
| kidcore        | tee, hoodie, sweatshirt, leggings, casual-shorts, sneaker, overalls, mini-dress, backpack, baseball-cap, bucket-hat, socks, pajama-set, rash-guard, slide      | tomato, cobalt, butter, emerald, hot-pink, tangerine, optic-white, multicolour        | cotton-jersey, french-terry, fleece, denim, rubber, recycled-polyester       | colour-block, polka-dot, breton-stripe, geometric, tie-dye, monogram | regular, relaxed, a-line                           |
| corporate-chic | blazer, tailored-trousers, pencil-skirt, sheath-dress, dress-shirt, two-piece-suit, pump, loafer, tote, blouse, waistcoat, wool-coat, tie                      | navy, charcoal, jet-black, optic-white, ivory, burgundy, camel, stone                 | wool, twill, cotton-poplin, silk, viscose, leather                           | pinstripe, solid, houndstooth                                        | slim, fitted, regular, straight, pencil, column    |
| k-street       | hoodie, sweatshirt, bomber-jacket, wide-leg-trousers, cargo-pants, sneaker, bucket-hat, baseball-cap, crop-top, tee, pleated-skirt, crossbody, cardigan        | optic-white, jet-black, heather-grey, beige, sky, lavender, sage, stone               | french-terry, cotton-jersey, nylon, denim, mohair-blend, performance-knit    | solid, monogram, colour-block, breton-stripe                         | oversized, boxy, wide, relaxed, pleated            |

### 3.3 Aesthetic-specific attribute boosts (secondary attributes, §7.7)

Applied as multipliers on the schema value weights when the product's primary aesthetic matches:
romantic → sleeve puff ×3, neckline sweetheart ×2; coquette → sleeve puff ×3, stone pearl ×4,
hair-clip style bow ×4; techwear → closure zip ×3, hood fixed ×2, colour block ×0 (n/a); glam →
heel stiletto ×3, scale statement ×3, stone cubic-zirconia ×2; clean-girl → scale dainty ×3, rise
high ×2; y2k → rise low ×4, length cropped ×3; streetwear/k-street → height high ×2, sole foam ×2,
length longline ×2; punk → toe pointed ×2, hardware silver ×3; mob-wife → lining shearling ×4,
frame shield ×3; balletcore → sleeve long ×2 (wrap silhouette already favoured); kidcore → closure
velcro ×5, pack 3-pack ×2; corporate-chic → lapel notch ×2, heel kitten ×2; avant-garde → length
longline ×3, buttons double ×2; gorpcore → hood fixed ×3, insulation heavy ×2; quiet-luxury → gauge
fine ×2, buttons double ×2; workwear → closure snap ×3, wash raw ×3; western → closure snap ×4,
heel block ×2; dark-academia → collar button-down ×2, pleats single ×2. All other combinations ×1.

### 3.4 Weight derivation, primary/secondary selection, evidence

For product `p` and aesthetic `a` (all lookups from §3.2):

```
raw(a) = 0.45·S_cat + 0.20·S_col + 0.15·S_mat + 0.10·S_pat + 0.10·S_fit
home(a) = brand.homeAesthetics includes a ? brand.homeWeights[a] : 0        // weights sum to 1
score(a) = raw(a) · (home(a) > 0 ? 1.0 : 0.6) · deptMult(a, p.department)
primary  = argmax_a score(a)   (ties → lower dim); requires S_cat(primary) > 0,
           otherwise argmax restricted to brand home aesthetics with S_cat > 0,
           otherwise the brand's first home aesthetic.
secondary = argmax over NEIGHBOURS[primary] of raw(a), kept only if raw(a) ≥ 0.30 and
            deptMult(a, dept) > 0; else null.
w(a) = clamp01(raw(a) + 0.15·home(a))
w(primary)   = max(w(primary), 0.85)
w(secondary) = max(w(secondary), 0.55)            // if present
zero every w(a) < 0.15; keep the top 5 by weight (ties → lower dim)
```

Result: `aesthetics` column = slugs sorted by weight desc (primary first, 1–5 entries);
`attributes.primaryAesthetic`, `attributes.secondaryAesthetic` ('' when none). Dims 0–31 carry
the weights. No random draw is involved: the primary emerges from the attributes with a home-brand
bias, which yields attribute-consistent cross-aesthetic variety (a "minimalist" brand's plaid flannel
overshirt lands on grunge or workwear).

**Evidence** (`explainAesthetics(product): Array<{slug, weight, evidence: string[]}>`, exported):
for each non-zero aesthetic, collect the terms whose weighted contribution ≥ 0.10:
`"{subcategory name} (category)"`, `"{colour name} (colour)"`, `"{material name} (material)"`,
`"{pattern name} (pattern)"`, `"{fit or silhouette name} (fit)"`, plus `"{brand name} (brand)"`
when `home(a) > 0`. Every non-zero aesthetic has ≥ 1 evidence string (tested). The engine surfaces
these through `explanation.factors[].evidence`.

---

## 4. Brand system (150 brands)

### 4.1 Record

```ts
export interface GeneratedBrand /* extends Omit<NewBrand,'createdAt'|'id'> */ {
  id: number
  slug: string
  name: string
  tier: BrandTier
  homeAesthetics: string[] // DB column; ordered, 1–2 slugs
  homeDepartments: string[] // DB column; departments with weight > 0
  priceMultiplier: number // DB column
  origin: string | null // DB column: city
  description: string | null // DB column: tagline
  // in-memory extras (recomputed deterministically by generateBrands(seed)):
  homeWeights: number[] // parallel to homeAesthetics, sums to 1
  departmentWeights: Partial<Record<Department, number>>
  groupWeights: Partial<Record<CategoryGroup, number>> // unlisted = 0 (generalists: 0.15 everywhere unlisted)
  popularity: number // 0–1
  trend: number // 0–1
  voice: 'crisp' | 'warm' | 'technical' | 'playful' | 'editorial'
  founded: number
  generalist: boolean
}
```

`slug` = ASCII kebab-case of `name` with diacritics stripped and `&` → `and` (`Étoile Enfant` →
`etoile-enfant`, `Kōri` → `kori`, `Fern & Co.` → `fern-and-co`). Tier counts: budget 30, mid 70,
premium 34, luxury 16 (12+18 / 20+50 / 12+22 / 6+10). Tier price bands: budget .45–.75, mid
.90–1.35, premium 1.8–3.0, luxury 5–12.

Brand **size** (share of the catalog) = `tierShare[tier] × zipf(rankWithinTier, s = 0.8)`,
normalised within tier, then clamped to [0.12 %, 1.5 %] and renormalised (largest remainder).
Tier shares: budget .30, mid .44, premium .18, luxury .08. Ranks within a tier are a seed-derived
permutation (`createRng(hashSeed(seed, 'brand-rank', tier)).shuffle(idsInTier)`).

### 4.2 Fully specified brands (1–50)

Columns: `home` = aesthetics with weights; `depts` = department weights; `groups` = group weights.

| id  | name              | tier    | home                                | depts         | groups                                                                                   | ×price | pop | trend | voice     | origin, founded    | tagline                              |
| --- | ----------------- | ------- | ----------------------------------- | ------------- | ---------------------------------------------------------------------------------------- | ------ | --- | ----- | --------- | ------------------ | ------------------------------------ |
| 1   | Arlo Basics       | budget  | normcore .6, minimalist .4          | W1 M1 U.8 K.6 | tops 1, bottoms 1, loungewear .6, accessories .3                                         | 0.55   | .95 | .3    | crisp     | Taipei, 2011       | Everyday, done properly.             |
| 2   | Pelican & Pip     | budget  | kidcore 1                           | K1            | tops 1, bottoms 1, outerwear .6, swimwear .5, loungewear .6, footwear .4, accessories .3 | 0.50   | .70 | .4    | playful   | Kaohsiung, 2015    | Built for playgrounds.               |
| 3   | Marlow Street     | budget  | streetwear .6, k-street .4          | U1 M1 W.8     | tops 1, bottoms .8, outerwear .6, accessories .5, bags .3                                | 0.60   | .85 | .7    | playful   | Seoul, 2016        | Loud basics.                         |
| 4   | Daily Thread      | budget  | normcore .5, clean-girl .5          | W1 M.7        | tops 1, bottoms .8, dresses .6, loungewear .5                                            | 0.55   | .90 | .4    | crisp     | Taichung, 2012     | Wardrobe staples, weekly.            |
| 5   | Tempo Active      | budget  | athleisure 1                        | W1 M1 U.6 K.5 | activewear 1, footwear .5, accessories .2                                                | 0.60   | .80 | .5    | technical | Kuala Lumpur, 2017 | Move more, spend less.               |
| 6   | Sunny Row         | budget  | coastal .5, resort .5               | W1            | dresses 1, swimwear .9, tops .6, accessories .3                                          | 0.55   | .60 | .4    | warm      | Cebu, 2018         | Holiday in every drawer.             |
| 7   | Bolt Kids         | budget  | kidcore .6, athleisure .4           | K1            | activewear 1, footwear .8, tops .6, accessories .3                                       | 0.50   | .55 | .4    | playful   | Taoyuan, 2019      | Fast feet, tough knees.              |
| 8   | Fern & Co.        | budget  | cottagecore .6, romantic .4         | W1 K.2        | dresses 1, tops .8, accessories .4, bottoms .3                                           | 0.60   | .65 | .45   | warm      | Chiang Mai, 2016   | Soft things for soft days.           |
| 9   | Grid Nine         | budget  | techwear .6, streetwear .4          | M1 U.8        | outerwear 1, bottoms .8, bags .6, accessories .3                                         | 0.65   | .60 | .55   | technical | Shenzhen, 2018     | Urban armour, entry level.           |
| 10  | Pocket Denim Co.  | budget  | normcore .5, workwear .5            | W1 M1 K.5     | bottoms 1, outerwear .5, tops .2                                                         | 0.60   | .75 | .35   | crisp     | Kaohsiung, 2009    | Denim without the drama.             |
| 11  | Hush Lounge       | budget  | clean-girl .5, scandi .5            | W1 M.6 U.6    | loungewear 1, tops .3                                                                    | 0.55   | .60 | .4    | warm      | Taipei, 2020       | Stay in, dress well.                 |
| 12  | Trinket Lab       | budget  | coquette .6, y2k .4                 | W1 K.2        | jewelry 1, accessories .6                                                                | 0.45   | .70 | .65   | playful   | Bangkok, 2019      | Tiny things, big mood.               |
| 13  | Halden Row        | mid     | minimalist .6, scandi .4            | W1 M1 U.5     | tops 1, bottoms .9, outerwear .8, tailoring .5, accessories .3                           | 1.10   | .85 | .55   | crisp     | Copenhagen, 2009   | Quiet, considered, worn daily.       |
| 14  | Cove & Salt       | mid     | coastal .6, resort .4               | W1 M.7        | tops .9, bottoms .7, swimwear 1, dresses .8, accessories .5                              | 1.00   | .70 | .5    | warm      | Lisbon, 2014       | Linen, sun, salt.                    |
| 15  | Northfold         | mid     | gorpcore .7, workwear .3            | M1 U1 W.7     | outerwear 1, footwear .6, bags .7, accessories .5, bottoms .4                            | 1.20   | .80 | .65   | technical | Vancouver, 2008    | Weatherproof, city-proof.            |
| 16  | Mira Sato         | mid     | clean-girl .5, romantic .5          | W1            | dresses 1, tops .9, bottoms .6, jewelry .4                                               | 1.15   | .85 | .7    | editorial | Tokyo, 2013        | Effortless is a discipline.          |
| 17  | Lumen Athletics   | mid     | athleisure 1                        | W1 M1 U.5     | activewear 1, footwear .6, bags .3, accessories .2                                       | 1.20   | .90 | .65   | technical | Portland, 2010     | Engineered for the everyday athlete. |
| 18  | Kestrel Supply    | mid     | workwear .6, city-boy .4            | M1 U.8        | tops 1, bottoms .9, outerwear .8, accessories .4                                         | 1.15   | .65 | .55   | crisp     | Osaka, 2012        | Made to be worn in.                  |
| 19  | Juniper Lane      | mid     | cottagecore .5, boho .5             | W1            | dresses 1, tops .8, bottoms .5, accessories .5, bags .3                                  | 1.00   | .70 | .5    | warm      | Melbourne, 2015    | Gathered, not grabbed.               |
| 20  | Ossa Studio       | mid     | avant-garde .6, minimalist .4       | W1 U.7        | dresses .8, outerwear 1, tops .8, bags .5, bottoms .5                                    | 1.30   | .50 | .6    | editorial | Antwerp, 2017      | Shape first.                         |
| 21  | Brixham & Sons    | mid     | preppy .6, dark-academia .4         | M1 W.8        | tops 1, tailoring .8, footwear .6, accessories .6, outerwear .5                          | 1.20   | .60 | .4    | crisp     | Edinburgh, 1998    | Since the library days.              |
| 22  | Solstice Swim     | mid     | resort .6, coastal .4               | W1 M.6 K.4    | swimwear 1                                                                               | 1.10   | .60 | .5    | warm      | Gold Coast, 2016   | Chlorine-tested, sun-approved.       |
| 23  | Nakamura Works    | mid     | city-boy .6, normcore .4            | M1 U.9 W.6    | footwear 1, bottoms .7, tops .6, accessories .3                                          | 1.25   | .75 | .6    | crisp     | Kobe, 2005         | Function is the style.               |
| 24  | Velo Noir         | mid     | techwear .6, streetwear .4          | M1 U.9        | outerwear 1, bags .8, bottoms .7, footwear .5                                            | 1.30   | .55 | .65   | technical | Berlin, 2018       | Ride through the city.               |
| 25  | Bloom & Bramble   | mid     | romantic .5, coquette .5            | W1 K.4        | dresses 1, tops .8, jewelry .5, accessories .5                                           | 1.00   | .70 | .6    | warm      | Bristol, 2014      | Prettiness on purpose.               |
| 26  | Tidewater         | mid     | western .6, workwear .4             | M1 W.9        | bottoms 1, footwear .8, outerwear .7, accessories .5, tops .5                            | 1.20   | .55 | .6    | warm      | Austin, 2011       | Boots first.                         |
| 27  | Seoul Ninety      | mid     | k-street .7, y2k .3                 | W1 M.9 U.9    | tops 1, bottoms .8, outerwear .8, accessories .6, bags .4                                | 1.05   | .90 | .85   | playful   | Seoul, 2019        | Oversized and on time.               |
| 28  | Cinder Athletics  | mid     | athleisure .6, gorpcore .4          | W1 M1         | activewear 1, outerwear .5, footwear .3                                                  | 1.15   | .60 | .55   | technical | Auckland, 2015     | Warm up outside.                     |
| 29  | Wren & Willow     | mid     | scandi .6, cottagecore .4           | W1 K.5        | tops 1, dresses .8, loungewear .7, accessories .3                                        | 1.10   | .65 | .5    | warm      | Stockholm, 2012    | Knitted for long evenings.           |
| 30  | Riot Club         | mid     | punk .6, grunge .4                  | U1 W.9 M.9    | tops 1, outerwear .8, footwear .7, accessories .6, jewelry .4                            | 1.10   | .55 | .5    | playful   | Manchester, 2010   | Wear it loud.                        |
| 31  | Palma Dolce       | mid     | resort .5, glam .5                  | W1            | dresses 1, swimwear .8, footwear .6, bags .5                                             | 1.20   | .50 | .55   | editorial | Palma, 2015        | Golden hour, all year.               |
| 32  | Loom & Ledger     | mid     | corporate-chic .6, minimalist .4    | W1 M1         | tailoring 1, tops .7, bags .4, footwear .3                                               | 1.30   | .60 | .5    | crisp     | Singapore, 2016    | Boardroom, minus the stiffness.      |
| 33  | Vesper Atelier    | premium | quiet-luxury .6, corporate-chic .4  | W1            | tailoring 1, dresses .8, outerwear .8, bags .5, tops .5                                  | 2.40   | .55 | .6    | editorial | Paris, 2007        | Cut close, worn long.                |
| 34  | Hollis Tailoring  | premium | corporate-chic .5, dark-academia .5 | M1 W.6        | tailoring 1, tops .6, accessories .5, footwear .3                                        | 2.60   | .50 | .4    | crisp     | London, 1989       | Measured twice.                      |
| 35  | Sable Noir        | premium | goth .6, avant-garde .4             | W1 U.6        | dresses 1, outerwear .8, jewelry .6, footwear .6, tops .5                                | 2.20   | .45 | .55   | editorial | Berlin, 2011       | Black is a spectrum.                 |
| 36  | Studio Ferra      | premium | glam .6, romantic .4                | W1            | dresses 1, footwear .8, jewelry .6, bags .6                                              | 2.50   | .55 | .6    | editorial | Milan, 2009        | Dressed for the exit.                |
| 37  | Orbit Technical   | premium | techwear .6, gorpcore .4            | M1 U1         | outerwear 1, bags .8, bottoms .7, footwear .5, accessories .3                            | 2.30   | .50 | .7    | technical | Tokyo, 2014        | Systems for weather.                 |
| 38  | Alder Street      | premium | minimalist .6, scandi .4            | W1 M1 U.6     | footwear 1, bags .8, tops .5, outerwear .5                                               | 2.00   | .60 | .55   | crisp     | Copenhagen, 2010   | Fewer, better, longer.               |
| 39  | Marigold House    | premium | boho .6, retro-70s .4               | W1            | dresses 1, bottoms .6, accessories .6, bags .5, tops .5                                  | 1.90   | .50 | .5    | warm      | Los Angeles, 2012  | Sunset in fabric.                    |
| 40  | Rui Oda           | premium | city-boy .6, minimalist .4          | M1 U.8        | tops 1, bottoms .9, outerwear .8, tailoring .4, accessories .3                           | 2.40   | .55 | .65   | crisp     | Tokyo, 2003        | Relaxed precision.                   |
| 41  | Étoile Enfant     | premium | kidcore .5, preppy .5               | K1            | tops 1, bottoms .9, dresses .7, outerwear .7, footwear .5, accessories .3                | 1.80   | .40 | .45   | warm      | Lyon, 2008         | Small clothes, grown-up cloth.       |
| 42  | Gaia Loom         | premium | cottagecore .5, scandi .5           | W1 U.4        | tops 1, dresses .7, loungewear .6, accessories .5                                        | 1.90   | .45 | .5    | warm      | Helsinki, 2013     | Woven slowly.                        |
| 43  | Kilo Nine         | premium | streetwear .6, k-street .4          | U1 M1 W.9     | footwear 1, tops .8, outerwear .7, bags .5, accessories .4                               | 2.20   | .75 | .85   | playful   | Seoul, 2015        | Drops, not seasons.                  |
| 44  | Cassia Fine       | premium | clean-girl .5, coquette .5          | W1            | jewelry 1, accessories .2                                                                | 2.00   | .60 | .6    | editorial | Taipei, 2016       | Gold you forget to take off.         |
| 45  | Maison Élodie     | luxury  | quiet-luxury .6, romantic .4        | W1            | bags 1, dresses .7, outerwear .7, footwear .6, jewelry .5, accessories .4                | 8.0    | .50 | .55   | editorial | Paris, 1962        | Heritage, quietly.                   |
| 46  | Castelmora        | luxury  | glam .6, mob-wife .4                | W1 M.5        | bags 1, footwear .8, outerwear .7, jewelry .6, accessories .6, dresses .5                | 9.0    | .55 | .65   | editorial | Rome, 1971         | Never understated.                   |
| 47  | Aurelio Benedetti | luxury  | corporate-chic .5, quiet-luxury .5  | M1 W.6        | tailoring 1, footwear .8, outerwear .7, accessories .5, tops .4                          | 7.0    | .40 | .4    | crisp     | Florence, 1958     | The suit is the argument.            |
| 48  | Kōri              | luxury  | avant-garde .7, techwear .3         | U1 W.9 M.8    | outerwear 1, dresses .6, footwear .6, bags .6, tops .5, bottoms .5                       | 6.0    | .35 | .7    | editorial | Tokyo, 1994        | Garments as questions.               |
| 49  | Verrine           | luxury  | coquette .5, glam .5                | W1            | jewelry 1, bags .7, dresses .5, footwear .5, accessories .4                              | 10.0   | .45 | .6    | editorial | Geneva, 1985       | Precious, playful.                   |
| 50  | Holm & Vatne      | luxury  | scandi .6, minimalist .4            | W1 M1 U.7     | outerwear 1, bags .7, footwear .6, tops .5, accessories .4                               | 5.0    | .35 | .5    | crisp     | Oslo, 2001         | Warmth without weight.               |

Generalists (`generalist: true`): 1, 4, 13 — they take weight .15 in every group not listed and
every department not listed, so every `(department, subcategory)` pair has ≥ 1 eligible brand.

### 4.3 Roster 51–150 (hard-coded; `name · tier · home aesthetics · departments`)

Tier letters b/m/p/l. Two aesthetics ⇒ weights .6/.4 in the listed order; one ⇒ 1.0. Department
weights: first listed 1, others .8. Group weights: 1 for every group containing a favoured
subcategory of the first home aesthetic (§3.2), .5 for groups of the second, .3 for accessories;
name-suffix restrictions override: `Kids` ⇒ K only; `Swim` ⇒ swimwear 1, accessories .3; `Active`
⇒ activewear 1, footwear .4; `Jewels` ⇒ jewelry 1, accessories .3; `Tailors` ⇒ tailoring 1, tops
.4; `Lounge` ⇒ loungewear 1, tops .3.

`51 Basic Fold ·b· normcore,scandi ·WMU` · `52 Daily Port Kids ·b· kidcore ·K` · `53 Metro Supply ·b· streetwear ·MU` · `54 Plain Goods ·b· minimalist ·WMU` · `55 Urban Swim ·b· resort ·WMK` · `56 Studio Lane ·b· clean-girl ·W` · `57 Prime Sport ·b· athleisure ·MU` · `58 Northline Wear ·b· gorpcore,normcore ·MU` · `59 Common Thread ·b· cottagecore ·W` · `60 Dock & Yard ·b· workwear ·M` · `61 Loft Basics ·b· k-street ·WU` · `62 Tram Label ·b· y2k ·W` · `63 Field Kids ·b· kidcore,preppy ·K` · `64 Simple Swim ·b· coastal ·W` · `65 Metro Lounge ·b· normcore ·WM` · `66 Plain Jewels ·b· clean-girl ·W` · `67 Yard Active ·b· athleisure ·WK` · `68 Port Basics ·b· coastal,normcore ·WMU` · `69 Ash & Fen ·m· scandi,minimalist ·WMU` · `70 Cedar Works ·m· workwear,western ·M` · `71 Hearth Studio ·m· cottagecore ·WK` · `72 Kiln Collective ·m· avant-garde ·U` · `73 Linden Atelier ·m· romantic ·W` · `74 Loam Supply ·m· gorpcore ·MU` · `75 Marsh & Moss ·m· boho ·W` · `76 Oriel House ·m· dark-academia,preppy ·WM` · `77 Pike Tailors ·m· corporate-chic ·M` · `78 Quay Swim ·m· coastal,resort ·WM` · `79 Reed Active ·m· athleisure ·W` · `80 Sable Studio ·m· goth ·WU` · `81 Selby & Slate ·m· minimalist,city-boy ·MU` · `82 Sorrel Kids ·m· kidcore ·K` · `83 Tarn Works ·m· techwear ·MU` · `84 Thistle Collective ·m· punk,grunge ·U` · `85 Vale Atelier ·m· quiet-luxury ·W` · `86 Wold Supply ·m· western ·MW` · `87 Birch & Elm ·m· scandi ·WMK` · `88 Harbor Studio ·m· coastal ·WM` · `89 Moss Active ·m· athleisure,gorpcore ·MU` · `90 Fen House ·m· romantic,coquette ·W` · `91 Ash Tailors ·m· corporate-chic ·WM` · `92 Slate Works ·m· streetwear ·MU` · `93 Kiln Kids ·m· kidcore,scandi ·K` · `94 Oriel Swim ·m· resort ·W` · `95 Reed & Thistle ·m· cottagecore,boho ·W` · `96 Quay Collective ·m· k-street ·WMU` · `97 Pike Supply ·m· workwear ·MU` · `98 Linden Lounge ·m· clean-girl ·WM` · `99 Sorrel Studio ·m· balletcore ·W` · `100 Cedar Jewels ·m· boho,romantic ·W` · `101 Marsh Tailors ·m· dark-academia ·M` · `102 Tarn & Vale ·m· minimalist ·WMU` · `103 Elm Active ·m· athleisure ·WK` · `104 Hearth Lounge ·m· scandi ·WMU` · `105 Loam Kids ·m· kidcore,gorpcore ·K` · `106 Selby House ·m· preppy ·WM` · `107 Birch Works ·m· normcore ·MU` · `108 Wold Studio ·m· retro-70s ·W` · `109 Harbor Jewels ·m· coastal,clean-girl ·W` · `110 Moss & Fen ·m· cottagecore ·W` · `111 Slate Atelier ·m· avant-garde,goth ·WU` · `112 Thistle Swim ·m· resort,glam ·W` · `113 Quay Works ·m· city-boy ·M` · `114 Ash Collective ·m· k-street,y2k ·WU` · `115 Kiln Active ·m· athleisure ·M` · `116 Vale Kids ·m· preppy,kidcore ·K` · `117 Sorrel & Reed ·m· balletcore,romantic ·W` · `118 Pike House ·m· western ·M` · `119 Ines Vance ·p· quiet-luxury ·W` · `120 Noor Okafor ·p· avant-garde ·WU` · `121 Teo Lindqvist ·p· scandi,minimalist ·MU` · `122 Yara Amsel ·p· romantic ·W` · `123 Hiro Tanaka ·p· city-boy ·M` · `124 Lior Marchetti ·p· corporate-chic ·M` · `125 Anouk Duval ·p· coquette,balletcore ·W` · `126 Sanne Reyes ·p· glam ·W` · `127 Rafael Bergman ·p· dark-academia ·MW` · `128 Mai Kwon ·p· k-street ·WU` · `129 Sofia Ferreira ·p· boho,resort ·W` · `130 Emil Halloran ·p· workwear,western ·M` · `131 Vance Atelier ·p· minimalist ·WM` · `132 Okafor Studio ·p· streetwear ·MU` · `133 Lindqvist Active ·p· athleisure,gorpcore ·WM` · `134 Amsel Jewels ·p· glam,mob-wife ·W` · `135 Tanaka Works ·p· techwear ·MU` · `136 Marchetti Tailors ·p· corporate-chic,quiet-luxury ·M` · `137 Duval Kids ·p· kidcore ·K` · `138 Reyes Swim ·p· resort ·W` · `139 Bergman House ·p· scandi ·WMU` · `140 Kwon Collective ·p· punk,goth ·U` · `141 Vauclair ·l· quiet-luxury ·WM` · `142 Ormond ·l· corporate-chic ·M` · `143 Serrano ·l· glam ·W` · `144 Lorenzetti ·l· mob-wife,glam ·W` · `145 Maison Aubrac ·l· romantic,coquette ·W` · `146 Castiglia ·l· quiet-luxury,minimalist ·WMU` · `147 Hessling ·l· avant-garde ·U` · `148 Marquand ·l· dark-academia,corporate-chic ·M` · `149 Ravel ·l· minimalist,scandi ·WU` · `150 Solenne ·l· resort,coastal ·W`

Remaining fields for 51–150, from `rng = createRng(hashSeed(seed, 'brand', id))`, drawn in this
order: `priceMultiplier = rng.float(lo, hi)` of the tier band rounded to 2 dp; `popularity =
clamp(rng.normal(0.55, 0.15), 0.2, 0.95)` rounded to 2 dp; `trend = rng.float(0.3, 0.9)` rounded to
2 dp; `voice = rng.weighted(VOICE_PRIOR[tier])` with budget {crisp 3, playful 3, warm 2, technical
2}, mid {crisp 3, warm 3, technical 2, playful 1, editorial 1}, premium {editorial 3, crisp 3,
warm 2, technical 2}, luxury {editorial 5, crisp 3}; `origin = rng.pick(CITIES[primaryAesthetic])`
where `CITIES` maps: scandi/minimalist → Copenhagen, Stockholm, Oslo, Helsinki, Aarhus; streetwear/
k-street/y2k → Seoul, Tokyo, Los Angeles, London, Taipei; city-boy/workwear/techwear → Tokyo,
Osaka, Kobe, Nagoya; coastal/resort → Kaohsiung, Lisbon, Sydney, Cebu, Palma; quiet-luxury/
corporate-chic/romantic/coquette/glam/mob-wife → Paris, Milan, Florence, Geneva; preppy/
dark-academia/punk/grunge/goth → London, Edinburgh, Manchester, Dublin; kidcore/normcore/
athleisure/clean-girl/balletcore → Taipei, Taichung, Taoyuan, Singapore, Vancouver; boho/
retro-70s/western/cottagecore/gorpcore/avant-garde → Austin, Melbourne, Portland, Antwerp,
Berlin; `founded = rng.int(1975, 2022)`; `description` = `rng.pick(TAGLINES[voice])` with
TAGLINES crisp: "Fewer things, made right." / "Cut clean. Worn long." / "Nothing to hide behind." /
"Designed to be repeated."; warm: "Made for long evenings." / "Softness you keep." / "Handed down,
not thrown out." / "Slow by choice."; technical: "Built for weather that changes its mind." /
"Every seam has a job." / "Tested, then tested again." / "Function first, always."; playful: "Loud
on purpose." / "Wear it before someone else does." / "Serious about not being serious." / "Colour
is a mood."; editorial: "A study in proportion." / "Worn in daylight, made for film." / "The edit,
not the trend." / "Cut in the city, worn everywhere." The 100 roster names, 50 specified names and
all 150 slugs are unique (tested). `homeDepartments` = departments with weight > 0.

Coverage rule (tested): every `(department, group)` cell of §7.1 with quota > 0 has ≥ 2 brands with
`departmentWeights[dept] > 0` and `groupWeights[group] > 0` excluding generalists, and kids has zero
luxury brands (kids × luxury share = 0 by construction).

---

## 5. Price, sale, stock, rating, popularity, release

### 5.1 Subcategory economics (`SUBCAT_ECON`)

`base` = mid-tier median TWD; `σ` = log-normal sigma; `minTier` (0 budget … 3 luxury); axis bases:
`form` formality, `cov` coverage, `struct` structure (these three are `SubcategoryDef.formality`,
`.coverage`, `.structure`).

| subcat            | base  | σ   | minTier | form | cov | struct |
| ----------------- | ----- | --- | ------- | ---- | --- | ------ |
| tee               | 890   | .25 | 0       | .15  | .45 | .15    |
| tank-top          | 690   | .25 | 0       | .10  | .35 | .10    |
| crop-top          | 790   | .25 | 0       | .10  | .25 | .10    |
| polo-shirt        | 1290  | .25 | 0       | .40  | .45 | .25    |
| button-down-shirt | 1690  | .25 | 0       | .55  | .55 | .45    |
| linen-shirt       | 1890  | .22 | 0       | .40  | .55 | .30    |
| blouse            | 1590  | .28 | 0       | .55  | .50 | .25    |
| camisole          | 890   | .25 | 0       | .30  | .30 | .10    |
| bodysuit          | 1090  | .25 | 0       | .30  | .45 | .15    |
| crewneck-sweater  | 1990  | .28 | 0       | .40  | .55 | .20    |
| cardigan          | 2190  | .28 | 0       | .40  | .55 | .20    |
| turtleneck        | 1490  | .25 | 0       | .50  | .60 | .20    |
| hoodie            | 1790  | .25 | 0       | .10  | .60 | .20    |
| sweatshirt        | 1490  | .25 | 0       | .12  | .55 | .20    |
| jeans             | 2290  | .30 | 0       | .30  | .55 | .55    |
| chinos            | 1790  | .25 | 0       | .50  | .55 | .50    |
| wide-leg-trousers | 1990  | .28 | 0       | .55  | .60 | .40    |
| cargo-pants       | 1990  | .25 | 0       | .20  | .55 | .50    |
| leggings          | 990   | .25 | 0       | .10  | .55 | .10    |
| casual-shorts     | 1190  | .25 | 0       | .20  | .30 | .35    |
| mini-skirt        | 1290  | .28 | 0       | .30  | .25 | .35    |
| midi-skirt        | 1690  | .28 | 0       | .50  | .45 | .35    |
| maxi-skirt        | 1890  | .28 | 0       | .40  | .60 | .25    |
| pleated-skirt     | 1590  | .25 | 0       | .50  | .40 | .45    |
| overalls          | 2490  | .25 | 0       | .10  | .65 | .50    |
| mini-dress        | 1990  | .30 | 0       | .45  | .40 | .30    |
| midi-dress        | 2490  | .30 | 0       | .55  | .60 | .30    |
| maxi-dress        | 2790  | .30 | 0       | .50  | .75 | .25    |
| shirt-dress       | 2290  | .28 | 0       | .55  | .60 | .40    |
| slip-dress        | 1990  | .30 | 0       | .55  | .45 | .10    |
| wrap-dress        | 2290  | .28 | 0       | .55  | .60 | .25    |
| knit-dress        | 2190  | .28 | 0       | .45  | .65 | .20    |
| evening-gown      | 5900  | .35 | 1       | .95  | .80 | .45    |
| jumpsuit          | 2590  | .28 | 0       | .45  | .75 | .40    |
| denim-jacket      | 2990  | .28 | 0       | .25  | .55 | .60    |
| bomber-jacket     | 3490  | .30 | 0       | .30  | .55 | .55    |
| biker-jacket      | 5900  | .32 | 1       | .35  | .55 | .80    |
| puffer-jacket     | 4490  | .30 | 0       | .20  | .65 | .45    |
| windbreaker       | 2690  | .28 | 0       | .15  | .60 | .40    |
| fleece-jacket     | 2290  | .25 | 0       | .10  | .60 | .25    |
| overshirt         | 2490  | .25 | 0       | .30  | .55 | .45    |
| parka             | 5490  | .30 | 0       | .25  | .80 | .55    |
| trench-coat       | 5900  | .30 | 1       | .70  | .80 | .70    |
| wool-coat         | 7900  | .32 | 1       | .75  | .80 | .75    |
| sneaker           | 2690  | .30 | 0       | .20  | .20 | .55    |
| running-shoe      | 3290  | .28 | 0       | .10  | .20 | .50    |
| loafer            | 3490  | .30 | 0       | .65  | .20 | .75    |
| derby             | 3990  | .30 | 0       | .80  | .20 | .85    |
| ballet-flat       | 2290  | .28 | 0       | .50  | .15 | .50    |
| chelsea-boot      | 4490  | .30 | 0       | .60  | .30 | .80    |
| ankle-boot        | 3990  | .30 | 0       | .55  | .30 | .80    |
| knee-high-boot    | 5900  | .32 | 1       | .60  | .45 | .80    |
| combat-boot       | 4490  | .30 | 0       | .30  | .35 | .85    |
| hiking-boot       | 4990  | .28 | 0       | .15  | .35 | .85    |
| pump              | 3290  | .30 | 0       | .85  | .15 | .70    |
| heeled-sandal     | 2990  | .30 | 0       | .65  | .10 | .55    |
| flat-sandal       | 1690  | .28 | 0       | .25  | .10 | .40    |
| slide             | 1190  | .28 | 0       | .10  | .10 | .35    |
| tote              | 2490  | .35 | 0       | .45  | 0   | .55    |
| shoulder-bag      | 3290  | .35 | 0       | .60  | 0   | .70    |
| crossbody         | 2690  | .35 | 0       | .40  | 0   | .65    |
| mini-bag          | 2290  | .35 | 0       | .55  | 0   | .70    |
| clutch            | 1990  | .35 | 0       | .85  | 0   | .70    |
| bucket-bag        | 2990  | .35 | 0       | .45  | 0   | .55    |
| backpack          | 2690  | .32 | 0       | .15  | 0   | .60    |
| belt-bag          | 1590  | .32 | 0       | .10  | 0   | .55    |
| duffle            | 3490  | .32 | 0       | .30  | 0   | .55    |
| baseball-cap      | 890   | .25 | 0       | .10  | 0   | .45    |
| beanie            | 690   | .25 | 0       | .10  | 0   | .10    |
| bucket-hat        | 890   | .25 | 0       | .10  | 0   | .35    |
| belt              | 1290  | .32 | 0       | .55  | 0   | .80    |
| watch             | 4990  | .40 | 0       | .60  | 0   | .90    |
| scarf             | 1190  | .32 | 0       | .45  | 0   | .10    |
| tie               | 1290  | .30 | 0       | .95  | 0   | .40    |
| sunglasses        | 1990  | .35 | 0       | .40  | 0   | .90    |
| socks             | 290   | .22 | 0       | .20  | 0   | .10    |
| hair-clip         | 390   | .30 | 0       | .20  | 0   | .70    |
| necklace          | 1490  | .40 | 0       | .55  | 0   | .90    |
| earrings          | 990   | .40 | 0       | .55  | 0   | .90    |
| bracelet          | 1190  | .40 | 0       | .50  | 0   | .90    |
| ring              | 990   | .40 | 0       | .55  | 0   | .95    |
| brooch            | 890   | .35 | 0       | .75  | 0   | .95    |
| sports-bra        | 1190  | .25 | 0       | .05  | .25 | .20    |
| performance-tee   | 890   | .25 | 0       | .05  | .45 | .15    |
| training-tights   | 1690  | .25 | 0       | .05  | .55 | .15    |
| running-shorts    | 990   | .25 | 0       | .05  | .25 | .20    |
| bike-shorts       | 1090  | .25 | 0       | .05  | .35 | .15    |
| track-jacket      | 2290  | .28 | 0       | .10  | .55 | .40    |
| joggers           | 1590  | .25 | 0       | .08  | .55 | .20    |
| bikini-top        | 990   | .28 | 0       | .05  | .10 | .15    |
| bikini-bottom     | 890   | .28 | 0       | .05  | .10 | .15    |
| one-piece         | 1790  | .28 | 0       | .10  | .30 | .20    |
| swim-trunks       | 1290  | .28 | 0       | .05  | .20 | .30    |
| rash-guard        | 1290  | .25 | 0       | .05  | .45 | .20    |
| cover-up          | 1590  | .30 | 0       | .20  | .60 | .10    |
| pajama-set        | 1690  | .28 | 0       | .10  | .70 | .15    |
| nightgown         | 1190  | .28 | 0       | .10  | .55 | .10    |
| robe              | 1990  | .30 | 0       | .15  | .75 | .15    |
| sweatpants        | 1290  | .25 | 0       | .05  | .55 | .15    |
| lounge-shorts     | 790   | .25 | 0       | .05  | .25 | .15    |
| slipper           | 990   | .28 | 0       | .05  | .10 | .30    |
| blazer            | 4490  | .32 | 0       | .80  | .55 | .85    |
| two-piece-suit    | 9900  | .32 | 1       | .95  | .80 | .90    |
| tuxedo            | 12900 | .30 | 1       | 1.00 | .80 | .95    |
| waistcoat         | 2290  | .30 | 0       | .70  | .40 | .75    |
| tailored-trousers | 2990  | .30 | 0       | .75  | .55 | .60    |
| pencil-skirt      | 2290  | .28 | 0       | .75  | .40 | .60    |
| sheath-dress      | 3490  | .30 | 0       | .80  | .60 | .60    |
| dress-shirt       | 1990  | .25 | 0       | .80  | .55 | .55    |

### 5.2 Price formula (stream `price`, draws in this order: z, saleU, discountU)

```
tierGroupF = TIER_GROUP[brand.tier][group]
deptMult   = { women: 1.00, men: 1.00, unisex: 0.95, kids: 0.62 }[department]
attrMult   = product of: gauge chunky 1.10 · insulation heavy 1.15 · bag size large 1.15 / mini 0.85
             · jewel scale statement 1.25 / dainty 0.90 · stone pearl 1.20 / cubic-zirconia 1.10
             · heel stiletto 1.10 · shaft knee 1.20 · length maxi or floor 1.10 · buttons double-* 1.08
             · lining shearling 1.25 · watch strap steel 1.15                 (else 1)
raw   = base × brand.priceMultiplier × tierGroupF × material.priceFactor × deptMult × attrMult
        × exp(σ · z)                                                     // z = rng.normal(0, 1)
price = clamp(roundRetail(raw), roundRetail(base × 0.3), roundRetail(base × 40))
```

`TIER_GROUP`:

| tier    | tops | bottoms | dresses | outerwear | footwear | bags | accessories | jewelry | activewear | swimwear | loungewear | tailoring |
| ------- | ---- | ------- | ------- | --------- | -------- | ---- | ----------- | ------- | ---------- | -------- | ---------- | --------- |
| budget  | 1.0  | 1.0     | 1.0     | 1.0       | 1.0      | 1.0  | 1.0         | 1.0     | 1.0        | 1.0      | 1.0        | 1.0       |
| mid     | 1.0  | 1.0     | 1.0     | 1.0       | 1.0      | 1.1  | 1.0         | 1.1     | 1.0        | 1.0      | 1.0        | 1.0       |
| premium | 1.0  | 1.0     | 1.1     | 1.1       | 1.2      | 1.4  | 1.1         | 1.6     | 0.9        | 1.0      | 1.0        | 1.1       |
| luxury  | 0.9  | 0.9     | 1.2     | 1.2       | 1.4      | 2.2  | 1.3         | 3.0     | 0.8        | 1.0      | 1.0        | 1.2       |

`roundRetail(x)`: `x < 1000` → `max(190, round(x/100)·100 − 10)` (…390, 690, 990); `1000 ≤ x <
10000` → `round(x/100)·100 − 10` (…1290, 4990); `10000 ≤ x < 50000` → `round(x/1000)·1000 − 100`
(…12900, 24900); `x ≥ 50000` → `round(x/5000)·5000` (…105000). Hard floor 190, ceiling 480000.

Worked examples: tee at Arlo Basics (×0.55, cotton-jersey) ≈ NT$490; at Halden Row ≈ NT$990;
at Rui Oda (×2.4) ≈ NT$2,190; tote at Maison Élodie (×8 × 2.2 × leather 2.4) ≈ NT$105,000; tuxedo
at Aurelio Benedetti (×7 × 1.2 × wool 1.6) ≈ NT$175,000.

**Sale**: `pSale = { budget .25, mid .20, premium .15, luxury .05 }[tier]`; if `saleU < pSale`:
`d = weighted({.15: 30, .20: 30, .30: 20, .40: 12, .50: 8})` (budget/mid restricted to ≤ .30,
renormalised); products with `dropYear = 2024` double `pSale` (cap .5).
`attributes.compareAtPrice = roundRetail(price / (1 − d))` (integer; absent when not on sale).

### 5.3 Stock (stream `stock`, draws: u, then the per-size sold-out draws of §1.5)

`u < .06` → 0; `.06 ≤ u < .20` → `int(1, 5)`; `.20 ≤ u < .78` → `int(6, 60)`; else `logUniformInt(61,
320)`. Kids, socks and accessories ×1.5 (cap 400). `stock ≤ 5` renders "low stock" in the UI.

### 5.4 Rating and reviews (stream `rating`, draws: u1, z via `normal`, u2)

```
subcatPop  = w / max w within the group                      // §1.3 weights, 0.1–1
recency    = { 2026: 1.0, 2025: 0.8, 2024: 0.6 }[dropYear]
pop        = brand.popularity × subcatPop × recency
hasReviews = u1 < 0.88·sqrt(pop) + 0.05
reviewCount= hasReviews ? min(4800, floor(exp(normal(ln 18, 1.1)) × (0.4 + 1.6·pop))) : 0
tierMean   = { budget 4.10, mid 4.20, premium 4.30, luxury 4.35 }[tier]
r          = clamp(tierMean + 0.32·z, 3.2, 5.0)
rating     = reviewCount === 0 ? 0 : round1((r·min(n,5) + tierMean·max(0, 5−n)) / 5)   // shrink toward tier mean when n < 5
popularity = round3(clamp01(pop × (0.7 + 0.3·u2)))             // static prior column
trendScore = 0                                                 // analytics owns it
```

Expected: mean rating (rated items) 4.15–4.35; ≈ 85–90 % rated; median reviewCount ≈ 20; top 1 %

> 1,000.

### 5.5 Release (stream `season`, after the season draws): `dropYear = weighted({2024: 20, 2025: 35,

2026: 45})`; `attributes.dropYear`; `createdAt`(passed to the seed script, not stored on`GeneratedProduct`) = first day of the launch month of `season`in`dropYear`(spring Feb, summer
May, autumn Aug, winter Nov, all-season Jan when`i`even, Jul when odd) +`int(0, 60)` days.
---

## 6. Names and descriptions

### 6.1 Line words (`LINE_WORDS`, 256, unique, index 0–255)

```
Aster Aldous Arbor Atlas Aurora Avalon Beacon Birch Bowen Brindle Brook Cairn Calder Canyon Cedar Clove
Coble Crest Cypress Dale Dune Echo Elm Ellis Ember Fenn Fjord Flint Ford Glen Grove Hale
Harbor Haven Hazel Heath Holt Idris Indie Iris Isla Juno Jasper Kai Keel Kellan Kelso Knox
Lark Ledger Linden Loch Loxley Lyra Mabel Marden Meadow Mesa Milo Minna Moss Nash Nell Noor
North Oak Odell Opal Orla Otis Pax Perry Pike Piper Quill Rae Reed Remy Ridge River
Roan Rook Rowan Rune Sabine Selby Shore Sloane Sol Sorrel Spruce Sterling Summit Sylvan Talia Tarn
Tess Thea Thorne Tide Tobin Trace Vale Vega Verity Vida Wade Wells Wilder Willa Wynn Yara
Yew Zadie Zephyr Zion Zola Alba Ansel Arden Astrid Bea Blythe Bodhi Briar Cael Cleo Cora
Dagny Della Dev Edie Elin Enzo Esme Etta Ezra Faye Finch Freya Gale Gia Greta Hana
Hugo Ines Ivo Jude Kira Lena Leo Lior Lux Mae Maren Nico Nina Nova Oren Orion
Ottilie Pia Quinn Rafa Romy Rosa Ruth Saga Sana Seren Soren Suki Theo Uma Una Vera
Viggo Wyatt Xavi Yuki Zane Amara Anouk Beck Cato Cyra Dax Eero Elio Fia Gus Hart
Ida Jori Kit Lina Lulu Marnie Neve Odie Pim Rex Selma Tove Ulla Bay Bluff Cliff
Delta Dell Fell Field Firth Gully Inlet Isle Knoll Lagoon Marsh Moor Pass Plain Point Reef
Rill Sound Strand Valley Wold Weir Crag Spur Tor Ness Hollow Rise Bank Amble Drift Glide
Halcyon Lull Meander Nomad Pause Ramble Roam Saunter Stroll Sway Trek Wander Waltz Arrow Ambra Corin
```

`ROMAN = ['', 'II', 'III', 'IV']` — used for cell ordinals ≥ 256 (§6.2).

### 6.2 Name grammar (stream `text`, draws in this order: descriptorU, materialU, colourU)

```
j          = ordinal of the product inside its (subcategory, brand) cell        (§7.4)
line       = LINE_WORDS[j mod 256] + (j ≥ 256 ? ' ' + ROMAN[floor(j / 256)] : '')
descriptor = descriptorU < 0.75 ? displayForm(first attribute with a display form) + ' ' : ''
materialAdj= materialU < 0.45 && material.adj not already in noun ? material.adj + ' ' : ''
colourSfx  = colourU < 0.35 ? ' in ' + colour.name : ''
name       = `${brand.name} ${line} ${descriptor}${materialAdj}${noun}${colourSfx}`
slug       = kebab(`${brand.slug}-${line}-${subcategory}`)   // e.g. arlo-basics-aster-tee, …-aster-ii-tee
```

Descriptor display forms, first match in this order: `fit` → Fitted / Slim / Regular (omitted) /
Relaxed / Oversized / Boxy / Skinny / Straight / Tapered / Wide-Leg / Flared / Compression;
`rise + fit` for pant/short/tailor-trouser schemas → `High-Rise Straight`, `Mid-Rise Wide-Leg`,
`Low-Rise Skinny` (regular fit → rise only: `High-Rise`); `silhouette` → A-Line / Bodycon / Shift /
Fit-and-Flare / Wrap / Slip / Column / Tiered / Pencil / Pleated (omitted when the noun already
contains the word: Wrap Dress, Slip Dress, Pleated Skirt, Pencil Skirt); `length` for dresses/
skirts only when not in the noun → Mini / Midi / Maxi / Floor-Length; `height` → High-Top /
Low-Top (low omitted for sneakers); `shaft` → Knee / Mid-Calf; `heel` → Kitten-Heel / Block-Heel /
Stiletto / Platform (flat omitted); `size` (bags) → Mini / Small / Large (medium omitted); `gauge`
→ Fine-Gauge / Chunky (medium omitted); `scale` → Dainty / Statement (regular omitted); `coverage`
→ Full-Coverage (others omitted); `weight` → Heavyweight / Plush (others omitted); `buttons`
double-* → Double-Breasted; `hood` fixed/detachable → Hooded; `insulation` heavy → Down-Filled;
`support` high → High-Support; `type` (jewel) → Chain / Pendant / Choker / Stud / Hoop / Drop /
Bangle / Cuff / Signet / Pin (band omitted); `frame` → Round / Square / Cat-Eye / Aviator /
Shield; `collar` (shirt) → Band-Collar / Camp-Collar (others omitted). When nothing matches,
`descriptor = ''`.

**Uniqueness proof.** `(brand, subcategory)` identifies the cell; `noun` is injective over
subcategories (tested); `line` is injective on `j` within a cell (256 words × Roman suffix, cell
size ≤ 512 asserted). Hence `(brand.name, line, noun)` — all substrings of `name` in fixed
positions — is unique across the catalog regardless of the optional tokens, and `slug` is unique
by the same argument. Neither depends on any other product, so generation is parallel-safe and
no reconciliation pass exists.

### 6.3 Descriptions (stream `text`, after the name draws: s1U, s2U, s3U, s3Present)

`description = S1 + ' ' + S2 + (s3Present < 0.6 ? ' ' + S3 : '')`. Slots: `{colour}` lower-case
colour name, `{material}` lower-case material name, `{fit}` fit name lower-case (silhouette name
for dress/skirt schemas; "regular" for schemas without fit), `{noun}` lower-case noun, `{Brand}`,
`{occasion}` `occasions[0]` name lower-case, `{Aesthetic}` primary aesthetic name, `{detail}` =
first non-null of neckline / sleeve / closure / sole / strap / hardware / stone as `"{value} {key}"`
(e.g. "crew neckline", "zip closure", "gold hardware"; "clean finish" when none), `{rise}`,
`{length}`, `{sleeve}`, `{neckline}`, `{closure}`, `{hood}` ("no" when none), `{sole}`, `{toe}`,
`{height}`, `{size}`, `{strap}`, `{hardware}`, `{scale}`, `{type}`, `{metal}` (material name),
`{stone}` (" with {stone}" or ""), `{support}`, `{waist}` (rise), `{cut}`, `{coverage}`,
`{weight}`, `{lapel}`, `{buttons}` ("single-breasted"/"double-breasted"), `{origin}` brand origin,
`{seasonName}` e.g. "Autumn 2026", `{pairing}` from `OUTFIT_PAIR`, `{careLine}` from `CARE_LINES`.
Sentence-initial slot values are capitalised. A test asserts no `{` remains.

S1 by group (5 each; `s1U` picks uniformly):

| group       | S1                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tops        | "A {fit} {noun} cut from {material} in {colour}." · "{Material} {noun} with a {detail} and an easy {fit} fit." · "This {colour} {noun} is made from {material} that softens with every wash." · "Our {fit} {noun} in {colour} {material}, finished with a {detail}." · "Lightweight {material} gives this {colour} {noun} its drape."                     |
| bottoms     | "{Fit} {noun} in {colour} {material} with a {detail}." · "Cut {fit} through the leg, these {colour} {noun} sit at a {rise} rise." · "{Material} {noun} in {colour}, built for long days." · "A {rise}-rise {noun} in {colour} {material}; the leg falls {fit}." · "These {noun} pair {material} with a {detail} for structure."                           |
| dresses     | "A {fit} {noun} in {colour} {material} with a {neckline} neckline." · "{Material} moves easily in this {colour} {noun}, cut {length}." · "This {colour} {noun} has {sleeve} sleeves and a {fit} line." · "Fluid {material} shapes a {fit} {noun} in {colour}." · "{Length}-length {noun} in {colour}, with a {detail}."                                   |
| outerwear   | "A {fit} {noun} in {colour} {material}, {length} length." · "{Material} shell, {closure} closure; this {colour} {noun} is built to be layered." · "The {noun} in {colour}: {material}, {hood} hood, {fit} through the body." · "{Length}-length {noun} cut from {material} in {colour}." · "Weatherproof {material} in {colour}, with a {closure} front." |
| footwear    | "A {colour} {noun} in {material} on a {sole} sole." · "{Material} upper, {detail}, {colour} throughout." · "This {noun} pairs a {toe} toe with {material} in {colour}." · "{Height}-profile {noun} in {colour} {material}." · "Built on a {sole} sole, the {noun} comes in {colour} {material}."                                                          |
| bags        | "A {size} {noun} in {colour} {material} with a {strap} strap." · "{Material} {noun} in {colour}; {closure} closure, {hardware} hardware." · "The {colour} {noun}: {size}, {material}, made to carry daily." · "Structured {material} gives this {colour} {noun} its shape." · "{Size} {noun} in {colour}, with {hardware} hardware and a {strap} strap."  |
| accessories | "A {colour} {noun} in {material}." · "{Material} {noun} in {colour}, {detail}." · "This {noun} comes in {colour} {material} with a {detail}." · "{Colour} {material} {noun}, one size." · "Simple {noun} in {colour}, made from {material}."                                                                                                              |
| jewelry     | "A {scale} {type} {noun} in {metal}{stone}." · "{Metal} {noun}, {scale} scale{stone}." · "This {type} {noun} is finished in {metal}." · "{Scale} {noun} in {metal}, designed to layer." · "A {type} {noun} in {metal}{stone}."                                                                                                                            |
| activewear  | "A {fit} {noun} in {colour} {material}, {length} length." · "{Material} with four-way stretch; this {colour} {noun} is cut {fit}." · "Sweat-wicking {material} in {colour}, {support} support." · "{Fit} {noun} in {colour}, built for {occasion}." · "The {noun} in {colour} {material} sits at a {waist} waist."                                        |
| swimwear    | "A {cut} {noun} in {colour} {material}, {coverage} coverage." · "{Material} with UPF 50, this {colour} {noun} is cut {cut}." · "{Coverage}-coverage {noun} in {colour}." · "The {colour} {noun}: {cut} cut, quick-dry {material}." · "Chlorine-resistant {material} in {colour}, {cut} style."                                                            |
| loungewear  | "A {fit} {noun} in {colour} {material}, {weight}." · "{Weight} {material} makes this {colour} {noun} a stay-in favourite." · "Soft {material} in {colour}, cut {fit}." · "The {noun} in {colour}: {weight} {material}, {length}." · "{Fit} {noun} in brushed {material}, {colour}."                                                                       |
| tailoring   | "A {fit} {noun} in {colour} {material} with {lapel} lapels, {buttons}." · "{Material} tailoring in {colour}, cut {fit}." · "This {colour} {noun} is half-canvassed {material} with a {lapel} lapel." · "{Fit} {noun} in {colour} {material}, {length} length." · "Sharp {material} in {colour}; {buttons}, {lapel} lapel."                                |

For swimwear rows without `cut`/`coverage` (rash-guard, cover-up, swim-trunks) use `{fit}` for
`{cut}` and "full" for `{coverage}`. For tailoring rows without `lapel` (trousers, skirt, dress,
shirt) `{lapel}` → "clean" and `{buttons}` → "{closure} closure".

S2 by `occasions[0]` (3 each; `s2U`):

| occasion      | S2                                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| everyday      | "Wear it with {pairing} for the everyday." · "An easy anchor for weekday rotation." · "Made for the days that have no plan."                  |
| work          | "Pair with {pairing} for the office." · "Reads polished under a blazer, relaxed without one." · "Desk to dinner without a change."            |
| date-night    | "Pair with {pairing} for dinner out." · "Built for low light and good company." · "Dress it up with {pairing}."                               |
| wedding-guest | "Wedding-guest ready with {pairing}." · "Elegant enough for the ceremony, easy enough for the dance floor." · "Finish with {pairing} and go." |
| party         | "Late nights, loud rooms." · "Wear it with {pairing} and nothing else matters." · "Made to be photographed."                                  |
| travel        | "Packs flat, wears well for hours." · "Pair with {pairing} for long-haul days." · "Made for airports and after."                              |
| workout       | "Tested through sprints, stretches and everything between." · "Pair with {pairing} for the studio." · "Made to move, then move on."           |
| beach         | "Sand, salt and long lunches." · "Wear over swim or with {pairing}." · "Made for the shoreline."                                              |
| festival      | "Layer with {pairing} for the fields." · "Built for three days on your feet." · "Made for dancing in the dust."                               |
| brunch        | "Pair with {pairing} for weekend mornings." · "Easy, relaxed, slightly dressed." · "Made for coffee that runs long."                          |
| formal        | "Reserved for the evening's best table." · "Pair with {pairing} for black-tie." · "Made for occasions with a dress code."                     |
| lounge        | "Made for slow mornings." · "Wear with {pairing} and stay in." · "Soft enough to sleep in, sharp enough to answer the door."                  |

S3 by brand voice (4 each; `s3U`):

| voice     | S3                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| crisp     | "{careLine}; it will outlast the trend." · "Designed in {origin}, made to be repaired." · "No logos, no shortcuts." · "{Brand} makes fewer things, better."                           |
| warm      | "Made in small runs by {Brand}." · "Softer each season you keep it." · "Designed in {origin} with long evenings in mind." · "Meant to be handed down."                                |
| technical | "Taped seams, bonded pockets, tested to {test}." · "Every panel earns its place." · "{careLine}. Packs into its own pocket." · "Built in {origin} for weather that changes its mind." |
| playful   | "Loud on purpose." · "Goes with everything you already own, sort of." · "Limited drop from {Brand}, {origin}." · "Wear it before someone else does."                                  |
| editorial | "From the {Brand} {seasonName} edit." · "Cut in {origin}; worn everywhere." · "A study in {Aesthetic}." · "Photographed on film, worn in daylight."                                   |

`{test}` = pick of {"10k mm", "20k cycles", "−10 °C"} (stream `text`, only when used).

`CARE_LINES` by `material.care`: wash → "Machine wash cold"; hand-wash → "Hand wash cold, dry
flat"; dry-clean → "Dry clean only"; leather → "Wipe clean; condition seasonally"; technical →
"Machine wash, hang dry"; metal → "Store dry; polish with a soft cloth"; wipe → "Wipe clean with a
damp cloth".

`OUTFIT_PAIR[group]` (`{pairing}` = uniform pick; also exported as `PAIRINGS` for the engine's
complete-the-look prior, which maps each phrase to the subcategory in brackets):

| group       | pairings                                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tops        | straight jeans [jeans] · tailored trousers [tailored-trousers] · a midi skirt [midi-skirt] · wide-leg trousers [wide-leg-trousers] · chinos [chinos]             |
| bottoms     | a tucked shirt [button-down-shirt] · a fine-gauge knit [crewneck-sweater] · a cropped tee [tee] · a blazer [blazer] · a hoodie [hoodie]                          |
| dresses     | flat sandals [flat-sandal] · ankle boots [ankle-boot] · a cropped jacket [denim-jacket] · a mini bag [mini-bag] · heeled sandals [heeled-sandal]                 |
| outerwear   | a turtleneck and straight jeans [turtleneck] · a slip dress [slip-dress] · a hoodie [hoodie] · tailored trousers [tailored-trousers] · chunky sneakers [sneaker] |
| footwear    | cropped trousers [tailored-trousers] · a midi skirt [midi-skirt] · wide jeans [jeans] · a shirt dress [shirt-dress] · joggers [joggers]                          |
| bags        | everyday layers [crewneck-sweater] · evening pieces [slip-dress] · a trench [trench-coat] · a linen shirt [linen-shirt] · a blazer [blazer]                      |
| accessories | your simplest outfits [tee] · a wool coat [wool-coat] · a linen shirt [linen-shirt] · a hoodie [hoodie] · a midi dress [midi-dress]                              |
| jewelry     | everything else in the wardrobe [blouse] · a slip dress [slip-dress] · a white tee [tee] · a turtleneck [turtleneck] · a blazer [blazer]                         |
| activewear  | running shoes [running-shoe] · a track jacket [track-jacket] · a sports bra [sports-bra] · training tights [training-tights] · a baseball cap [baseball-cap]     |
| swimwear    | a cover-up [cover-up] · slides [slide] · a bucket hat [bucket-hat] · sunglasses [sunglasses] · linen shorts [casual-shorts]                                      |
| loungewear  | slippers [slipper] · a robe [robe] · a cardigan [cardigan] · socks [socks] · a sweatshirt [sweatshirt]                                                           |
| tailoring   | a dress shirt [dress-shirt] · derbies [derby] · a silk tie [tie] · a tote [tote] · pumps [pump]                                                                  |

Descriptions need not be unique (≈ 2.1 M skeletons before slot filling). Length 90–420 chars, 2–3
sentences (tested).
---

## 7. Distribution targets, allocation plan and per-product sampling

### 7.1 Targets

| dimension                  | target                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| department                 | women 46 % · men 30 % · unisex 14 % · kids 10 % (exact by construction)                                                         |
| group share per department | `GROUP_SHARE` below (exact by construction)                                                                                     |
| tier                       | budget 30 % · mid 44 % · premium 18 % · luxury 8 % (±2 pp; emerges from brand sizes; kids 0 % luxury)                           |
| season                     | all-season ≈ 30 % · spring 17 · summer 22 · autumn 18 · winter 13 (±3 pp)                                                       |
| brand                      | 150 brands, each between 0.12 % and 1.5 %                                                                                       |
| subcategory                | every allowed `(department, subcategory)` pair ≥ 40 products; every subcategory ≥ 150                                           |
| aesthetics                 | every aesthetic is primary for ≥ 400 products (target ≥ 800); none > 9 %                                                        |
| diversity                  | ≥ 45,000 distinct `(subcategory, colour, material, pattern)`; ≥ 20,000 distinct `(subcategory, primaryAesthetic, colourFamily)` |

`GROUP_SHARE[dept][group]` (%; rows sum to 100):

| dept   | tops | bottoms | dresses | outerwear | footwear | bags | accessories | jewelry | activewear | swimwear | loungewear | tailoring |
| ------ | ---- | ------- | ------- | --------- | -------- | ---- | ----------- | ------- | ---------- | -------- | ---------- | --------- |
| women  | 18   | 11      | 16      | 8         | 11       | 9    | 6           | 7       | 5          | 3        | 3          | 3         |
| men    | 26   | 17      | 0       | 12        | 14       | 4    | 8           | 2       | 8          | 2        | 3          | 4         |
| unisex | 28   | 14      | 0       | 12        | 14       | 8    | 12          | 3       | 7          | 0        | 2          | 0         |
| kids   | 26   | 16      | 8       | 11        | 14       | 4    | 8           | 0       | 6          | 4        | 3          | 0         |

### 7.2 Plan (`createPlan(seed, planSize, brands)`) and id scramble

`planSize = max(DEFAULT_CATALOG_SIZE, size)`; a catalog of `size ≤ 100 000` is the id-prefix
`1..size` of the 100k plan, so product `i` is identical for every size ≤ 100k and dev seeds are a
uniform sample of the full catalog. Largest-remainder apportionment at every level; ties broken by
table order (deterministic; only brand sizes depend on the seed):

1. `planSize → dept counts` (§7.1).
2. per dept: `count → group counts` from `GROUP_SHARE`.
3. per (dept, group): `count → subcategory counts` ∝ `w` over subcategories listing the dept.
4. per (dept, subcategory): `count → brand counts` ∝ `brand.size × departmentWeights[dept] ×
groupWeights[group] × [tierIdx(brand) ≥ minTier(sub)] × [dept ≠ kids ∨ tier ≠ luxury]`; if the
   weight sum is 0, use the generalists (1, 4, 13) equally.
5. Leaves `(dept, subcategory, brand, n)` are grouped into cells `c = (subcategory, brand)`, sorted
   by `(subcategory index, brand id)` and given contiguous **slot** ranges `[cellStart, cellStart + n)`.
   `n ≤ 512` asserted.
6. Inside a cell, ordinal `j` → department: the cell's leaf counts laid out in dept order
   (women, men, unisex, kids) and permuted by `createRng(hashSeed(seed, 'cell-perm', cellId)).shuffle`.

**Id scramble**: product index `i ∈ [0, size)` maps to slot `j = (i × A + B) mod planSize` with
`A = 73 856 093`, `B = 12 345`; if `gcd(A, planSize) ≠ 1` (never for 100 000) increment `A` by 2
until coprime. Consecutive ids therefore interleave subcategories, brands and departments (the
walk is a low-discrepancy stride). `slotOf(i)`, `indexToCell(plan, j)` (binary search over
`cellStart[]`) and `cellOrdinal = j − cellStart` are pure. `cellId = subcategoryIndex × 1000 +
brandId`.

Plan size ≈ 5,500 cells; build < 50 ms; memoised per `(seed, planSize, brands.length)`.

### 7.3 Per-cell combo selection (`cellSelection(plan, cell)`) — the dedupe guarantee

For cell `c = (sub, brand)` with `n` products:

1. Mixture over the brand's home aesthetics: `π_a = homeWeights[a] · (S_cat(a, sub) + 0.2)`, normalised.
2. Combo space `K = Colours(48) × Materials(MATERIAL_PRIOR[sub] keys ∪ group-applicable) ×
Patterns(applicable to group ∩ material) × Fits(schema `fit`values, or`silhouette`values for
skirt/dress schemas, or`[null]`)`, enumerated in table order (colour-major).
3. `W(k) = COLOR_PRIOR[group][fam(col)] · MATERIAL_PRIOR[sub][mat] · PATTERN.prior[pat] ·
fitWeight(fit) · Σ_a π_a · (1 + 2·S_col(a, col)) · (1 + 2·S_mat(a, mat)) · (1 + 2·S_pat(a, pat)) ·
(1 + 1.5·S_fit(a, fit))`, times `deptMix` = Σ over the cell's departments of (share ×
   `DEPT_COLOR_MULT[dept][fam]` × `[material allowed for dept]`). `W = 0` for: patternless-material
   violations, jeans colour-rule violations, kids-excluded materials in kids-only cells,
   jewelry metal/colour rule violations. Otherwise `W ≥ 0.01` (floor).
4. Efraimidis–Spirakis: `key(k) = −ln(u_k) / W(k)` with `u_k = (hashSeed(seed, 'combo', cellId,
k) + 0.5) / 2^32`; take the `n` smallest keys (bounded heap). Weighted sampling **without
   replacement** ⇒ all `n` combos distinct. If `n > |{k : W(k) > 0}|` (never at default tables;
   asserted), wrap around and append `edition = 2, 3, …` to the dupKey.
5. Ordinal `j` gets `selected[perm(j)]` where `perm` is the same cell permutation as §7.2-6.

Cost: `|K|` (≤ 48 × 8 × 6 × 8 ≈ 18k, typically 2–5k) hash + log per cell; all cells ≈ 25 M ops ≈
1–3 s single-threaded. Selections are memoised per cell (`Map<cellId, Uint32Array>`, ~100k ints
total) so id-order iteration is amortised O(1) per product.

Department fix-ups after selection (never change the hard key): a men's product whose selected
colour family is pink/purple keeps it (weights already reduced); a kids product with an excluded
material in a mixed-department cell re-picks the material from the allowed list using stream
`attrs` (this changes the dupKey material for kids only; uniqueness is preserved because the
department is part of the dupKey).

### 7.4 Product record and per-product sampling order

`GeneratedProduct` = every `products` column except `createdAt` (§11 lists the exact shape).
Streams (`createRng(hashSeed(seed, label, i))`, one per label, fixed draw order inside each):

| step | stream   | produces                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | –        | `j = slotOf(i)`, cell, ordinal, department, brand, subcategory, `tier = brand.tier`, colour/material/pattern/fit from §7.3                                                                                                                                                                                                                                                                                                                                    |
| 1    | `attrs`  | schema columns not fixed by the combo (silhouette for non-skirt/dress, length, neckline, sleeve, closure) then extras, each `rng.weighted` over schema weights × §3.3 boosts (§3.3 boosts need a primary before the attributes exist: compute a **provisional primary** from the combo alone, i.e. §3.4 with `S_fit` = .4, apply the boosts, then compute the final primary after all attributes). Then consistency rules §1.4, then secondary colour (§7.6). |
| 2    | `season` | season, second season, dropYear, createdAt offset (§2.7, §5.5)                                                                                                                                                                                                                                                                                                                                                                                                |
| 3    | `sizes`  | size run (§1.5)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4    | `price`  | z, saleU, discountU (§5.2)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5    | `stock`  | stock u, then per-size sold-out draws (§5.3, §1.5)                                                                                                                                                                                                                                                                                                                                                                                                            |
| 6    | `rating` | u1, z, u2 (§5.4)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7    | `text`   | descriptorU, materialU, colourU, s1U, s2U, s3U, s3Present, (test) (§6)                                                                                                                                                                                                                                                                                                                                                                                        |
| 8    | –        | occasions (§2.6; the p = .6 / .3 draws come from stream `text` after the description draws), aesthetics + evidence (§3.4), axes + style vector (§8), `imageSeed = hashSeed(seed, 'image', i) & 0x7fffffff`, `silhouetteId` (§9.2), dupKey                                                                                                                                                                                                                     |

Adding a draw to a stream shifts only later draws of that stream; adding a new stream changes
nothing existing. Any change still bumps `CATALOG_VERSION` because the golden hash covers all
fields.

### 7.5 Duplicate key

```
dupKey(p) = [brandId, subcategory, department, colorName, material, pattern, fit ?? silhouette ?? '-', edition ?? 1].join('|')
```

Unique across the catalog by §7.3 (the E–S selection is without replacement inside a cell; cells
are disjoint by `(subcategory, brand)`; department is included so mixed-department cells cannot
collide after kids fix-ups). Exported as `duplicateKey(product)`; tested directly on the full
catalog.

### 7.6 Secondary colour (`secondaryColorFor`, stream `attrs`, after the extras)

`SECONDARY_RULE[pattern.secondary]`: `none` → `null` (solid); footwear/bags with `solid` get a
neutral trim with p = .20: `jet-black` for L/M primaries, `ivory` for D. `contrast` → primary `L=D`
⇒ `optic-white`; `L=L` ⇒ `jet-black` (or `navy` when primary aesthetic ∈ {preppy, coastal});
`L=M` ⇒ `ivory`. `contrast-soft` → same with `ivory` / `charcoal` / `oatmeal`. `white` →
`optic-white`. `harmony` → a colour from the primary aesthetic's favoured colours whose family
differs from the primary's (uniform; fallback: the next family on the ring black→grey→white→
neutral→brown→red→pink→yellow-orange→green→blue→purple→black, its first colour). `leopard` → base
forced into {camel, tan, mustard} (nearest by table order to the selected colour; the dupKey keeps
the selected colour), secondary `jet-black`. `camo` → secondary `olive`; tertiary handled in the
renderer. `secondaryColorHex` column = secondary's hex or `null`.

### 7.7 Attribute boosts

§3.3 multipliers apply to the provisional primary aesthetic (step 1). Boost keys that do not exist
in the schema are ignored.

### 7.8 Occasions

Per §2.6 using the product's formality axis value (computed before occasions; §8).
---

## 8. Style vector and compatibility exports

### 8.1 `toStyleVector(input: StyleVectorInput): number[]` (contract signature)

Pure; used by products (via `productStyleInput(p)`) and by the engine for intents and users.

| dims  | rule                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0–31  | `v[aestheticIndex(slug)] = clamp01(weight)` for each entry of `input.aesthetics`; unknown slugs ignored.                                                |
| 32–43 | `v[colorFamilyIndex(colorFamily)] = 1.0`; if `secondaryColorFamily` is set and ≠ primary family: `v[colorFamilyIndex(secondary)] = max(existing, 0.4)`. |
| 44–51 | `v[axisIndex(axis)] = clamp01(input.axes[axis] ?? 0)` for the 8 axes (missing = 0).                                                                     |
| 52–63 | `v[categoryGroupIndex(group)] = 1` when `categoryGroup` is set; all zero for intents without a group.                                                   |

`productStyleInput(p)` (exported) builds the input: aesthetics = `{slug: weight}` from §3.4
(weights recoverable from `p.styleVector`), families from `colorFamily` / `secondaryColorHex`
(family looked up by hex → colour), axes from §8.2, `categoryGroup`.

### 8.2 Axes (`computeAxes(p)`, exported), all `clamp01`

| axis       | formula                                                                                                                                                                                                                                                                                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| formality  | `sub.form + material.fAdj + pattern.fAdj + colour.fAdj + AESTHETIC.fAdj(primary) + tierAdj` with tierAdj budget −.03, mid 0, premium +.03, luxury +.06                                                                                                                                               |
| warmth     | garments (sub.cov > 0): `0.60·material.warm + 0.25·sub.cov + seasonAdj` with seasonAdj winter +.15, autumn +.05, spring −.05, summer −.15, all-season 0; `hood ≠ none` +.05; sleeve long +.05, sleeveless −.05. Non-garments: `0.5·material.warm + 0.1`; beanie / scarf +.25.                        |
| boldness   | `0.45·colour.bold + 0.35·pattern.bold + 0.20·AESTHETIC.bold(primary) + fitAdj (§2.5) + (secondaryColorHex ? .05 : 0)`                                                                                                                                                                                |
| structure  | `0.6·sub.struct + 0.4·material.struct + fitAdj (§2.5)`                                                                                                                                                                                                                                               |
| price-tier | `0.5·tierBase + 0.5·clamp01((ln price − ln(0.3·base)) / (ln(40·base) − ln(0.3·base)))` with tierBase budget .10, mid .35, premium .65, luxury .90                                                                                                                                                    |
| coverage   | `sub.cov + lengthAdj + sleeveAdj + fitAdj (§2.5)`; lengthAdj: mini/cropped/short −.10, knee 0, midi +.05, maxi/floor/full +.15, longline +.05; sleeveAdj: sleeveless/cap −.10, short −.05, three-quarter +.03, long +.10; swim coverage minimal −.05 / full +.10; non-garment groups keep the base 0 |
| texture    | `0.7·material.tex + 0.3·pattern.tex`; gauge chunky +.15, fine −.05; lining shearling +.10                                                                                                                                                                                                            |
| trendiness | `0.55·AESTHETIC.trend(primary) + 0.20·brand.trend + 0.15·recency + 0.10·pattern.trend` with recency 2026 → 1.0, 2025 → .6, 2024 → .3                                                                                                                                                                 |

Sanity (tested): mean formality tailoring > activewear + .4; mean warmth winter > summer + .2;
kids mean boldness > tailoring mean boldness; price-tier monotone in price within a subcategory.

### 8.3 Vector helpers (contract)

`normalizeVector(v)` → unit L2 (zero vector stays zero); `cosineSimilarity(a, b)` → dot/(‖a‖‖b‖),
0 when either is zero; `blendVectors(vectors, weights?)` → weighted mean (equal weights default)
then `clamp01` per dim; `describeVector(v)` → `{aesthetics: top 5 non-zero sorted desc with names,
colorFamilies: non-zero sorted desc, axes: the 8 values keyed by axis, categoryGroups: non-zero}`.
`zeroVector()`, `STYLE_DIMENSIONS = 64`. Added: `STYLE_BLOCKS = { aesthetics: [0, 32], colors:
[32, 44], axes: [44, 52], groups: [52, 64] }` and `weightStyleVector(v, { aesthetics, colors,
axes, groups })` — an **in-process rerank helper only**; pgvector cosine runs on the raw stored
vector.

### 8.4 Outfit compatibility data (exported for `packages/engine` outfit solver)

`COLOR_HARMONY[12][12]` (family order of §2.1; symmetric):

```
        blk  wht  gry  neu  brn  red  pnk  y-o  grn  blu  pur  mul
black   .80  .90  .90  .85  .70  .85  .75  .70  .75  .85  .75  .80
white   .90  .70  .85  .90  .80  .80  .85  .80  .80  .90  .75  .80
grey    .90  .85  .70  .80  .60  .70  .75  .60  .65  .85  .70  .70
neutral .85  .90  .80  .75  .85  .65  .80  .70  .80  .80  .65  .70
brown   .70  .80  .60  .85  .65  .55  .60  .75  .75  .70  .50  .70
red     .85  .80  .70  .65  .55  .40  .50  .50  .45  .70  .45  .60
pink    .75  .85  .75  .80  .60  .50  .55  .50  .60  .65  .70  .70
y-o     .70  .80  .60  .70  .75  .50  .50  .40  .60  .75  .45  .60
green   .75  .80  .65  .80  .75  .45  .60  .60  .50  .60  .50  .60
blue    .85  .90  .85  .80  .70  .70  .65  .75  .60  .70  .60  .70
purple  .75  .75  .70  .65  .50  .45  .70  .45  .50  .60  .50  .65
multi   .80  .80  .70  .70  .70  .60  .70  .60  .60  .70  .65  .50
```

`FORMALITY_TOLERANCE = 0.25`. `SLOT_SETS`: `casual` = top + bottom + shoes (+ outer) (+ bag);
`dress` = one-piece + shoes (+ outer) (+ bag) (+ jewelry); `tailored` = tailoring jacket +
dress-shirt + tailored-trousers | pencil-skirt + derby | pump | loafer; `gym` = activewear top +
activewear bottom + running-shoe; `beach` = swim top + swim bottom | one-piece + cover-up +
sandal | slide. Slot roles per group: tops/activewear-tops → `top`; bottoms/activewear-bottoms/
tailored-bottoms → `bottom`; dresses/sheath-dress/jumpsuit → `one-piece`; outerwear/blazer/
track-jacket → `outer`; footwear/slipper → `shoes`; bags → `bag`; jewelry → `jewelry`;
accessories → `accessory`. `pairScore(a, b)` = `0.5·COLOR_HARMONY[famA][famB] + 0.3·(1 −
min(1, |formA − formB| / FORMALITY_TOLERANCE)) + 0.2·aestheticOverlap` where `aestheticOverlap` =
cosine over dims 0–31.
---

## 9. SVG rendering (`renderProductSvg(input: ProductRenderInput): string`)

Contract input: `{ silhouetteId, colorHex, secondaryColorHex?, pattern, aesthetics, imageSeed,
categoryGroup, name?, brandName? }`; added optional `department?` (kids treatment). Output:
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" width="600" height="800">...</svg>`,
pure string templating (module-level strings, `parts.push`, one `join`), no DOM, no library, at
most 25 microseconds per render, 1.5–4 KB. Never persisted; `GET /api/products/[id]/image`
recomputes from the DB row with `Cache-Control: public, max-age=31536000, immutable` and
`ETag = "{CATALOG_VERSION}:{id}"`.

### 9.1 Layers (in order)

1. `<rect width="600" height="800" fill="{bg}"/>` with `bg = AESTHETIC.bg(aesthetics[0])` (fallback
   `#EFEEEA`), then `<ellipse cx="300" cy="360" rx="260" ry="330" fill="#fff" opacity=".18"/>`.
2. `<defs>`: `<clipPath id="c"><path d="{SIL.body}"/></clipPath>`; `<linearGradient id="sh" x1="0"
y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1"
stop-color="#000" stop-opacity=".16"/></linearGradient>`; the pattern def (§9.3) when
   `pattern !== 'solid'`; for colour `multicolour` (hex `#6C5CE7`) a `<linearGradient id="mc">` with
   stops `#E93A8F #F28A2E #F3E7A9 #128A5F #2551C2` at 0/25/50/75/100 %.
3. Drop shadow: `<ellipse cx="300" cy="{SIL.shadowY}" rx="{SIL.shadowRx}" ry="14" fill="#000" opacity=".10"/>`.
4. Body: `<path d="{SIL.body}" fill="{colorHex | url(#mc)}"/>`.
5. Pattern overlay: `<g clip-path="url(#c)"><rect width="600" height="800" fill="url(#p)"/></g>`
   (tie-dye: the body is drawn with `fill="url(#p)"` instead; colour-block: a second `<rect y="400"
width="600" height="400" fill="{S}"/>` inside the clip, or `x="400"` (vertical third) for bags
   and footwear).
6. Shade: `<path d="{SIL.body}" fill="url(#sh)"/>`.
7. Detail: `<path d="{SIL.detail}" fill="none" stroke="{darken(colorHex,.35)}" stroke-width="2.5"
stroke-linejoin="round"/>`; `SIL.buttons` as `<circle r="5" fill="{darken(colorHex,.5)}"/>`;
   hardware circles/rects filled `#C9A43A` gold, `#BFC3CA` silver, `#5C6672` gunmetal (bags, belts,
   watches choose gold/silver when `secondaryColorHex` equals the gold/silver hex, else gunmetal);
   a solid-pattern `secondaryColorHex` on footwear/bags fills `SIL.trim` (sole/strap) instead of
   the darkened primary.
8. Outline: `<path d="{SIL.body}" fill="none" stroke="{darken(colorHex,.30)}" stroke-width="3"
stroke-linejoin="round"/>`; for very light primaries (lightness > .90) the outline is `#B8B4AC`.
9. Kids (`department === 'kids'`): layers 3–8 wrapped in `<g transform="translate(60 100) scale(.8)">`
   plus three confetti circles r=9 at (90,120), (510,140), (470,700) filled `#F07E26`, `#2551C2`,
   `#F3E2A0`.
10. Corner label when `name` or `brandName` is given: `<text x="28" y="770" font-family="ui-sans-serif,
system-ui" font-size="18" fill="rgba(0,0,0,.45)">{BRAND INITIALS} · {last two words of name}</text>`
    (XML-escaped), and a 6 px swatch dot for the secondary colour at (560, 764).

`darken(hex, k)` / `lighten(hex, k)` mix each RGB channel toward 0 / 255 by fraction `k`
(integer math, memoised in a `Map`). `lightness = (0.299R + 0.587G + 0.114B) / 255`.

### 9.2 Silhouettes (`SILHOUETTES`, 65 base ids + 30 aliases)

```ts
interface Silhouette {
  body: string
  detail: string
  trim?: string
  buttons?: [number, number][]
  shadowY: number
  shadowRx: number
  patternScale: number
}
```

Base ids (65): `tee tank shirt blouse sweater cardigan hoodie sweatshirt pants pants-wide shorts
skirt-mini skirt-midi skirt-maxi overalls dress-mini dress-midi dress-maxi jumpsuit jacket puffer
coat trench sneaker boot-ankle boot-knee loafer flat pump sandal slide tote shoulder-bag crossbody
clutch bucket-bag backpack belt-bag duffle cap beanie bucket-hat belt scarf tie sunglasses socks
hair-clip watch necklace earrings bracelet ring brooch sports-bra bikini-top bikini-bottom one-piece
trunks kaftan pajama nightgown robe blazer waistcoat`.

Aliases (30; same `body` as the base unless noted, different `detail`): `tee-long` (long-sleeve
body), `tee-fitted` (rash-guard, performance-tee), `tank-cropped`, `tank-bodysuit`,
`shirt-overshirt`, `sweater-turtle`, `pants-cargo` (pocket detail), `pants-fitted` (leggings,
tights), `pants-cuff` (joggers, sweatpants), `shorts-fitted`, `skirt-midi-pleated`,
`skirt-midi-pencil`, `dress-midi-placket`, `dress-midi-straps`, `dress-midi-wrap`,
`dress-midi-column`, `dress-maxi-gown` (flared body), `jacket-rib` (bomber), `jacket-asym`
(biker), `jacket-hood` (windbreaker), `jacket-zip` (fleece, track), `coat-hood` (parka),
`sneaker-high` (taller body), `sneaker-runner`, `loafer-laces` (derby), `boot-ankle-laces`
(combat, hiking), `pump-straps` (heeled-sandal), `slide-fluffy` (slipper), `shoulder-bag-mini`
(scaled body), `blazer-suit`, `blazer-satin` (tuxedo). Tested: every key returned by
`silhouetteFor` exists; every body matches `/^M[\d\s.,MLCQZ-]+Z$/`.

`silhouetteFor(subcategory, attributes)` (the DB column `silhouetteId` stores the resolved key):
tee → tee (`sleeve = long` → tee-long); performance-tee, rash-guard → tee-fitted; tank-top,
camisole → tank; crop-top → tank-cropped; bodysuit → tank-bodysuit; polo-shirt,
button-down-shirt, linen-shirt, dress-shirt → shirt; overshirt → shirt-overshirt; blouse →
blouse; crewneck-sweater → sweater; turtleneck → sweater-turtle; cardigan → cardigan; hoodie →
hoodie; sweatshirt → sweatshirt; jeans, chinos, tailored-trousers → pants (`fit` wide/flared →
pants-wide); wide-leg-trousers → pants-wide; cargo-pants → pants-cargo; leggings,
training-tights → pants-fitted; joggers, sweatpants → pants-cuff; casual-shorts, running-shorts,
lounge-shorts → shorts; bike-shorts → shorts-fitted; mini-skirt → skirt-mini; midi-skirt →
skirt-midi; maxi-skirt → skirt-maxi; pleated-skirt → skirt-midi-pleated (`length = mini` →
skirt-mini); pencil-skirt → skirt-midi-pencil; overalls → overalls; mini-dress → dress-mini;
midi-dress, knit-dress → dress-midi; maxi-dress → dress-maxi; shirt-dress → dress-midi-placket;
slip-dress → dress-midi-straps; wrap-dress → dress-midi-wrap; sheath-dress → dress-midi-column;
evening-gown → dress-maxi-gown; jumpsuit → jumpsuit; denim-jacket → jacket; bomber-jacket →
jacket-rib; biker-jacket → jacket-asym; windbreaker → jacket-hood; fleece-jacket, track-jacket →
jacket-zip; puffer-jacket → puffer; parka → coat-hood; wool-coat → coat; trench-coat → trench;
sneaker → sneaker (`height = high` → sneaker-high); running-shoe → sneaker-runner; loafer →
loafer; derby → loafer-laces; ballet-flat → flat; chelsea-boot, ankle-boot → boot-ankle;
combat-boot, hiking-boot → boot-ankle-laces; knee-high-boot → boot-knee; pump → pump;
heeled-sandal → pump-straps; flat-sandal → sandal; slide → slide; slipper → slide-fluffy; tote →
tote; shoulder-bag → shoulder-bag; mini-bag → shoulder-bag-mini; crossbody → crossbody; clutch →
clutch; bucket-bag → bucket-bag; backpack → backpack; belt-bag → belt-bag; duffle → duffle;
baseball-cap → cap; beanie → beanie; bucket-hat → bucket-hat; belt → belt; watch → watch;
scarf → scarf; tie → tie; sunglasses → sunglasses; socks → socks; hair-clip → hair-clip;
necklace, earrings, bracelet, ring, brooch → same name; sports-bra → sports-bra; bikini-top,
bikini-bottom, one-piece → same name; swim-trunks → trunks; cover-up → kaftan; pajama-set →
pajama; nightgown → nightgown; robe → robe; blazer, waistcoat → same name; two-piece-suit →
blazer-suit; tuxedo → blazer-satin.

Authoring convention: 600×800 space; garments occupy x 120–480, y 110–690; footwear, bags,
accessories and jewelry are centred at about 70 % width; absolute commands only; at most 40
nodes per path; `detail` may contain several subpaths. Reference paths (transcribe verbatim;
author the rest to match):

```
tee      body   M180 150 L120 200 L150 300 L200 285 L200 690 L400 690 L400 285 L450 300 L480 200 L420 150 Q360 200 300 200 Q240 200 180 150 Z
         detail M250 150 Q300 215 350 150 Q300 175 250 150 Z
         shadowY 705  shadowRx 150  patternScale 1
sneaker  body   M110 520 C150 440 250 420 330 400 C400 385 450 420 490 500 L490 540 L110 540 Z
         detail M250 440 L300 420 M270 470 L320 450 M290 500 L340 480
         trim   M100 540 L500 540 Q510 580 480 590 L120 590 Q90 580 100 540 Z
         shadowY 610  shadowRx 210  patternScale .6
tote     body   M150 300 L450 300 L470 640 L130 640 Z
         detail M220 300 C220 220 260 200 300 200 C340 200 380 220 380 300 M150 340 L450 340
         shadowY 660  shadowRx 180  patternScale .8
```

`patternScale`: 1 for garments; .8 for bags, hats, scarves; .6 for footwear, small accessories,
jewelry.

### 9.3 Pattern definitions (`patternDef(pattern, S, D, L, scale, offset, initials)`)

`S` = secondaryColorHex (fallback `darken(primary,.3)`), `D = darken(primary,.3)`, `L =
lighten(primary,.35)`, `scale` = `SIL.patternScale`, `offset = imageSeed mod 17` (tile phase, so
identical patterns do not tile identically). All tiles are `<pattern id="p"
patternUnits="userSpaceOnUse" patternTransform="translate({offset},{offset})">` with width/height
multiplied by `scale`.

| pattern       | def (tile size before scaling)                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| breton-stripe | `width="40" height="28"` → `<rect width="40" height="12" fill="{S}"/>`                                                                                                                                                                                                                |
| pinstripe     | `width="18" height="18"` → `<rect width="1.5" height="18" fill="{S}" opacity=".7"/>`                                                                                                                                                                                                  |
| gingham       | `width="36" height="36"` → `<rect width="18" height="18" fill="{S}" opacity=".55"/><rect x="18" y="18" width="18" height="18" fill="{S}" opacity=".55"/><rect x="18" width="18" height="18" fill="{S}" opacity=".25"/><rect y="18" width="18" height="18" fill="{S}" opacity=".25"/>` |
| plaid         | `width="60" height="60"` → `<rect width="60" height="14" y="23" fill="{S}" opacity=".5"/><rect width="14" height="60" x="23" fill="{S}" opacity=".5"/><rect width="60" height="3" fill="{D}"/><rect width="3" height="60" fill="{D}"/>`                                               |
| houndstooth   | `width="32" height="32"` → `<path d="M0 0h16v16H0zM16 16h16v16H16zM16 0l16 16V0zM0 16l16 16H0z" fill="{S}"/>`                                                                                                                                                                         |
| polka-dot     | `width="40" height="40"` → `<circle cx="20" cy="20" r="7" fill="{S}"/>`                                                                                                                                                                                                               |
| ditsy-floral  | `width="40" height="40"` → two 5-petal groups (`<circle r="4">` ×5 at radius 6 around (12,12) and (30,30), fill `{S}`) + centre `<circle r="2.5">` fill `{L}`                                                                                                                         |
| bold-floral   | `width="120" height="120"` → 6-petal group (`<ellipse rx="14" ry="30">` ×6 rotated 0/60/120/180/240/300 about (60,60)) fill `{S}` opacity .85 + centre `<circle r="12">` fill `{D}` + leaf `<path d="M100 20 q30 20 0 50 q-30 -20 0 -50z" fill="{D}" opacity=".6"/>`                  |
| leopard       | `width="70" height="70"` → five rosettes at (14,16) (48,10) (30,40) (60,50) (10,58): outer blob `<path>` fill `#0A0A0A`, inner `<ellipse rx="7" ry="5">` fill `{L}`                                                                                                                   |
| tie-dye       | `<radialGradient id="p" cx=".5" cy=".45" r=".7">` stops: primary 0 %, `{S}` 35 %, `{L}` 60 %, `{S}` 100 % (used as the body fill; no tile)                                                                                                                                            |
| camo          | `width="140" height="140"` → four blob paths filled `{S}`, `#3B2A22`, `{D}`, `{L}`, opacity .85                                                                                                                                                                                       |
| colour-block  | no tile; second rect per §9.1 step 5                                                                                                                                                                                                                                                  |
| monogram      | `width="48" height="48"` → `<text x="8" y="30" font-family="system-ui" font-size="16" font-weight="700" fill="{S}" opacity=".55" transform="rotate(20 24 24)">{initials}</text>` with `initials` = first letters of the first two words of `brandName` (fallback `LL`)                |
| geometric     | `width="50" height="50"` → `<polygon points="0,50 25,0 50,50" fill="{S}" opacity=".6"/><polygon points="25,10 40,25 25,40 10,25" fill="{D}"/>`                                                                                                                                        |

Every pattern renders for a dark and a light base (tested); output is byte-identical across calls.

### 9.4 Extra renderers

`renderSwatchSvg(hex, secondaryHex?)` → 24×24 circle (split half/half when a secondary is given).
`renderOutfitSvg(inputs: ProductRenderInput[])` → up to 5 products side by side, each
`renderProductSvg` output nested as `<svg x="{k*300}" y="0" width="300" height="400" viewBox="0 0
600 800">` inside a `1500×400` canvas (the engine's offline Look-poster fallback may reuse it).
---

## 10. Determinism, PRNG, seeds

### 10.1 `createRng(seed)` and `hashSeed(...parts)` (contract stubs in `rng.ts`)

```ts
export function hashSeed(...parts: Array<string | number>): number {
  // FNV-1a 32-bit over the UTF-8 bytes of parts joined with '', then a murmur3 fmix
  let h = 0x811c9dc5 >>> 0
  for (const byte of new TextEncoder().encode(parts.map(String).join(''))) {
    h ^= byte
    h = Math.imul(h, 0x01000193) >>> 0
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

export function createRng(seed: number): Rng {
  // xoshiro128** with state filled by splitmix32
  let s = seed >>> 0
  const sm = () => {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
    return (z ^ (z >>> 15)) >>> 0
  }
  let a = sm(),
    b = sm(),
    c = sm(),
    d = sm()
  const rotl = (x: number, k: number) => ((x << k) | (x >>> (32 - k))) >>> 0
  const u32 = () => {
    const r = Math.imul(rotl(Math.imul(b, 5), 7), 9) >>> 0
    const t = b << 9
    c ^= a
    d ^= b
    b ^= c
    a ^= d
    c ^= t
    d = rotl(d, 11)
    return r
  }
  const next = () => u32() / 4294967296
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    float: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)]!,
    weighted: (items) => {
      /* one next() draw; cumulative sum over items[i][1]; weights <= 0 skipped; throws when total is 0 */
    },
    shuffle: (items) => {
      /* Fisher-Yates on a copy; one next() per position from the end */
    },
    normal: (mean, sd) => {
      /* Box-Muller: exactly two next() draws, no caching of the second value */
    },
  }
}
```

`logUniformInt(rng, lo, hi)` = `Math.round(Math.exp(rng.float(Math.log(lo), Math.log(hi))))`
(helper, not on the `Rng` interface).

### 10.2 Seed derivation

| object                           | seed                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| brand `k` roster fields (§4.3)   | `createRng(hashSeed(seed, 'brand', k))`                                                         |
| brand ranks within a tier (§4.1) | `createRng(hashSeed(seed, 'brand-rank', tier))`                                                 |
| cell permutation (§7.2 step 6)   | `createRng(hashSeed(seed, 'cell-perm', cellId))`                                                |
| combo key `k` of a cell (§7.3)   | `hashSeed(seed, 'combo', cellId, k)` — no RNG state, order-free                                 |
| product `i`, stream `X`          | `createRng(hashSeed(seed, X, i))` for `X` in `attrs, season, sizes, price, stock, rating, text` |
| `imageSeed`                      | `hashSeed(seed, 'image', i) & 0x7fffffff`                                                       |

`generateProduct(i, seed, brands, size = DEFAULT_CATALOG_SIZE)` is a pure function of its
arguments (the plan is memoised per `(seed, planSize, brands)` and rebuilt when the `brands` array
identity changes). `generateBrands(seed)` is pure. `generateCatalog({ seed, size, brands? })` uses
`brands ?? generateBrands(seed)` and maps `generateProduct` over `[0, size)`; `iterateCatalog(opts,
chunk = 2000)` yields chunks for the seed script. `generateCatalogParallel(opts)` splits `[0,
size)` into `os.availableParallelism()` contiguous ranges over `node:worker_threads`; its output
equals the serial run (golden-hash test).

### 10.3 Versioning

`CATALOG_VERSION = '1.0.0'`. `catalogDigest(products)` = SHA-256 over the lines
`id|slug|price|dupKey|styleVector.join(',')`. Fixtures `packages/catalog/test/fixtures/first10.json`
(products 1–10 at the default seed) and `hash.txt` (full 100k digest) are committed; any table
change bumps `CATALOG_VERSION` and regenerates both via `pnpm --filter @lookline/catalog fixtures`.
---

## 11. Types, module layout, public API, seed script

### 11.1 `GeneratedProduct` (contract: `Omit<NewProduct, 'createdAt' | 'id' | 'styleVector'> & { id; styleVector: number[] }`)

| column                                                           | value                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                             | `i + 1`                                                                                                                                                                                                    |
| `slug`, `name`, `description`                                    | §6                                                                                                                                                                                                         |
| `brandId`                                                        | cell brand                                                                                                                                                                                                 |
| `department`                                                     | §7.2 step 6                                                                                                                                                                                                |
| `categoryGroup`, `category`, `subcategory`                       | §1                                                                                                                                                                                                         |
| `silhouetteId`                                                   | `silhouetteFor(subcategory, attributes)` (§9.2)                                                                                                                                                            |
| `colorName`, `colorHex`, `colorFamily`                           | selected colour's `name`, `hex`, `family` (§2.1)                                                                                                                                                           |
| `secondaryColorHex`                                              | §7.6 or `null`                                                                                                                                                                                             |
| `pattern`, `material`                                            | slugs                                                                                                                                                                                                      |
| `fit`, `silhouette`, `length`, `neckline`, `sleeve`, `closure`   | schema columns (§1.4) or `null`                                                                                                                                                                            |
| `occasions`                                                      | 1–3 slugs (§2.6)                                                                                                                                                                                           |
| `seasons`                                                        | 1–2 slugs (§2.7)                                                                                                                                                                                           |
| `aesthetics`                                                     | 1–5 slugs, primary first (§3.4)                                                                                                                                                                            |
| `attributes`                                                     | `{ primaryAesthetic, secondaryAesthetic ('' when none), dropYear, collection, soldOutSizes, compareAtPrice?, colorSlug, secondaryColorSlug?, ...schema extras }` — every value a string, number or boolean |
| `styleVector`                                                    | `toStyleVector(productStyleInput(p))` (64 numbers)                                                                                                                                                         |
| `price`                                                          | §5.2                                                                                                                                                                                                       |
| `tier`                                                           | brand tier                                                                                                                                                                                                 |
| `sizeSystem`, `sizes`                                            | §1.5 (kids `numeric-waist` → `alpha`)                                                                                                                                                                      |
| `stock`, `rating`, `reviewCount`, `popularity`, `trendScore` (0) | §5.3–5.4                                                                                                                                                                                                   |
| `heroImageUrl`                                                   | `null`                                                                                                                                                                                                     |
| `imageSeed`                                                      | §10.2                                                                                                                                                                                                      |

`createdAt` (§5.5) is returned separately by `generateProductRow(i, ...)` = `{ product, createdAt }`
for the seed script; `duplicateKey(product)` and `explainAesthetics(product)` are functions, not
columns. `GeneratedBrand` per §4.1.

### 11.2 Module layout (`packages/catalog/src`; `index.ts` re-exports exactly `types`, `taxonomy`, `rng`, `vectors`, `generate`, `render` as the stub does)

```
index.ts                     barrel (unchanged)
types.ts                     contract types + added: Silhouette, Plan, Cell, AttributeSchema, SubcatEcon, ProductRow
constants.ts                 DEFAULT_CATALOG_SEED, DEFAULT_CATALOG_SIZE, CATALOG_VERSION, STYLE_BLOCKS
rng.ts                       createRng, hashSeed, logUniformInt (§10.1)
vectors.ts                   index helpers, zeroVector, toStyleVector, normalizeVector, cosineSimilarity, blendVectors,
                             describeVector, weightStyleVector, productStyleInput, computeAxes
taxonomy/index.ts            barrel for the taxonomy folder
taxonomy/groups.ts           CATEGORY_GROUPS (ordered), GROUP_META (labelZh, synonyms, solidShare)
taxonomy/categories.ts       CATEGORIES (46)
taxonomy/subcategories.ts    SUBCATEGORIES (109), SUBCAT_ECON, findSubcategory, subcategoriesFor(group, dept)
taxonomy/schemas.ts          ATTRIBUTE_SCHEMAS (46), schemaFor(sub), applyConsistencyRules
taxonomy/sizes.ts            SIZE_RUNS, sizeRunFor(system, dept)
taxonomy/colors.ts           COLORS (48), COLOR_FAMILIES (ordered), COLOR_PRIOR, DEPT_COLOR_MULT, findColor, colorByHex
taxonomy/patterns.ts         PATTERNS (15), PATTERNLESS_MATERIALS, patternsFor(group, material)
taxonomy/materials.ts        MATERIALS (37), MATERIAL_PRIOR, KIDS_EXCLUDED_MATERIALS, materialsFor(sub, dept)
taxonomy/fits.ts             FITS, SILHOUETTE_VALUES, LENGTHS, NECKLINES, SLEEVES, CLOSURES, fitAdjustments
taxonomy/occasions.ts        OCCASIONS, occasionsFor(product)
taxonomy/seasons.ts          SEASONS, SEASON_PRIOR, seasonFor(rng, sub, material)
taxonomy/aesthetics.ts       AESTHETICS (32, ordered), NEIGHBOURS, findAesthetic, ATTRIBUTE_BOOSTS
taxonomy/affinity.ts         S_cat/S_col/S_mat/S_pat/S_fit, aestheticWeights(p, brand) -> { weights, primary, secondary, evidence }
taxonomy/lexicon.ts          LEXICON (§12), buildTags(product)
taxonomy/compat.ts           COLOR_HARMONY, FORMALITY_TOLERANCE, SLOT_SETS, PAIRINGS, pairScore, slotRoleOf(group, sub)
generate/index.ts            barrel: generateBrands, generateProduct, generateProductRow, generateCatalog, iterateCatalog,
                             generateCatalogParallel, createPlan, indexToCell, slotOf, duplicateKey, explainAesthetics,
                             catalogDigest, validateCatalog
generate/brands.ts           FIXED_BRANDS (50), ROSTER (100), CITIES, TAGLINES, VOICE_PRIOR, generateBrands, brandSizes
generate/plan.ts             createPlan, slotOf, indexToCell, GROUP_SHARE, DEPT_SHARE, largestRemainder
generate/cell.ts             enumerateCombos, comboWeight, cellSelection (Efraimidis-Spirakis, memoised)
generate/attributes.ts       sampleAttributes, secondaryColorFor
generate/price.ts            computePrice, roundRetail, TIER_GROUP, ATTR_PRICE_MULT, computeSale
generate/inventory.ts        computeStock, computeRating, computePopularity
generate/naming.ts           LINE_WORDS (256), ROMAN, buildName, buildSlug, descriptorFor
generate/describe.ts         S1_TEMPLATES, S2_TEMPLATES, S3_TEMPLATES, CARE_LINES, OUTFIT_PAIR, buildDescription
generate/product.ts          generateProduct, generateProductRow
generate/catalog.ts          generateCatalog, iterateCatalog, generateCatalogParallel, worker entry
generate/validate.ts         validateCatalog(products) -> report (counts, uniqueness, ranges), catalogDigest
render/index.ts              barrel: renderProductSvg, renderSwatchSvg, renderOutfitSvg, SILHOUETTES, silhouetteFor, renderInputFor
render/silhouettes.ts        SILHOUETTES (65 + 30 aliases)
render/patterns.ts           patternDef
render/color.ts              darken, lighten, lightness
render/svg.ts                renderProductSvg, renderSwatchSvg, renderOutfitSvg, renderInputFor(product, brand)
scripts/seed.ts              DB seed (§11.4)
scripts/fixtures.ts          regenerates test fixtures
scripts/stats.ts             prints distribution tables
test/                        §14
```

Zero runtime dependencies beyond `@lookline/db` (types) and Node built-ins.

### 11.3 Public API (added on top of the stub; nothing renamed)

```ts
// generation
export function generateBrands(seed: number): GeneratedBrand[]                                   // 150
export function generateProduct(i: number, seed: number, brands: readonly GeneratedBrand[], size?: number): GeneratedProduct
export function generateProductRow(i: number, seed: number, brands: readonly GeneratedBrand[], size?: number): { product: GeneratedProduct; createdAt: Date }
export function generateCatalog(opts: CatalogGenOptions): GeneratedProduct[]
export function* iterateCatalog(opts: CatalogGenOptions & { chunk?: number }): Generator<Array<{ product: GeneratedProduct; createdAt: Date }>>
export function generateCatalogParallel(opts: CatalogGenOptions & { workers?: number }): Promise<GeneratedProduct[]>
export function createPlan(seed: number, planSize: number, brands: readonly GeneratedBrand[]): Plan
export function slotOf(i: number, planSize: number): number
export function indexToCell(plan: Plan, slot: number): { cell: Cell; ordinal: number }
export function duplicateKey(p: GeneratedProduct): string
export function explainAesthetics(p: Pick<GeneratedProduct, 'subcategory' | 'colorName' | 'material' | 'pattern' | 'fit' | 'silhouette' | 'brandId' | 'department' | 'styleVector'>, brands?: readonly GeneratedBrand[]): Array<{ slug: string; weight: number; evidence: string[] }>
export function validateCatalog(products: readonly GeneratedProduct[]): ValidationReport
export function catalogDigest(products: readonly GeneratedProduct[]): string
// vectors
export function productStyleInput(p: GeneratedProduct): StyleVectorInput
export function computeAxes(p: GeneratedProduct, brand: GeneratedBrand): Record<Axis, number>
export function weightStyleVector(v: readonly number[], w: Partial<Record<'aesthetics' | 'colors' | 'axes' | 'groups', number>>): number[]
export const STYLE_BLOCKS: Record<'aesthetics' | 'colors' | 'axes' | 'groups', [number, number]>
// compat
export const COLOR_HARMONY: number[][]; export const FORMALITY_TOLERANCE: number; export const SLOT_SETS; export const PAIRINGS
export function pairScore(a: GeneratedProduct | { styleVector: number[]; colorFamily: ColorFamily }, b: typeof a): number
// render
export function renderProductSvg(input: ProductRenderInput): string
export function renderInputFor(p: GeneratedProduct, brand?: GeneratedBrand): ProductRenderInput
export function renderSwatchSvg(hex: string, secondaryHex?: string | null): string
export function renderOutfitSvg(inputs: readonly ProductRenderInput[]): string
export function silhouetteFor(subcategory: string, attributes: Record<string, string | number | boolean>, columns: { fit?: string | null; length?: string | null; sleeve?: string | null }): string
export const SILHOUETTES: Record<string, Silhouette>
// constants
export const DEFAULT_CATALOG_SEED: number; export const DEFAULT_CATALOG_SIZE: number; export const CATALOG_VERSION: string
export const LINE_WORDS: readonly string[]; export const ATTRIBUTE_SCHEMAS; export const SUBCAT_ECON; export const NEIGHBOURS
```

### 11.4 Seed script (historical — the generated catalogue it describes is gone)

The catalogue is now the H&M articles file, imported by `packages/hm/scripts/import.ts`, which
`pnpm seed:catalog` runs. The generator below produced the 100k synthetic products it replaced;
the section is kept because the taxonomy and affinity rules above it still describe live code.

1. `loadEnv()`; `seed = Number(process.env.CATALOG_SEED ?? DEFAULT_CATALOG_SEED)`, `size =
Number(process.env.CATALOG_SIZE ?? DEFAULT_CATALOG_SIZE)`.
2. `createDb()`; in one transaction `TRUNCATE products, brands CASCADE` (dependent app tables are
   truncated by the cascade — documented in the CLI banner).
3. Insert the 150 brands (one multi-row insert).
4. `for (const chunk of iterateCatalog({ seed, size }, 2000))` → one multi-row `INSERT` per chunk
   (`styleVector` passed as `'[...]'` text cast to `vector`), `createdAt` from the row; log
   `"{n}/{size} products"` every 10 000 rows with elapsed seconds.
5. `ANALYZE brands, products`; print `catalogDigest` of the run and `CATALOG_VERSION`; exit.
   Target: 100k rows in under 4 minutes on a laptop (generation about 5 s, insert-bound).

---

## 12. Lexicon (`LEXICON: Lexicon`, `buildTags`)

`LEXICON` is built at module load from the taxonomy tables: for every entry the `terms` are the
lower-cased union of `slug`, slug with `-` replaced by a space, `name`, `labelZh`, and the
`synonyms` column; duplicates removed; entries sorted by table order. Sections:

| section        | source                                                                                                              | extra terms |
| -------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- |
| departments    | `women 女裝 女 女生 ladies womens`, `men 男裝 男 男生 mens`, `unisex 中性 男女皆可`, `kids 童裝 小孩 兒童 children` | —           |
| categoryGroups | §1.1                                                                                                                | —           |
| subcategories  | §1.3                                                                                                                | —           |
| colors         | §2.1                                                                                                                | —           |
| colorFamilies  | §2.1 family list                                                                                                    | —           |
| aesthetics     | §3.1                                                                                                                | —           |
| materials      | §2.4                                                                                                                | —           |
| patterns       | §2.3                                                                                                                | —           |
| occasions      | §2.6                                                                                                                | —           |
| seasons        | spring 春 春天 春季 / summer 夏 夏天 夏季 / autumn 秋 秋天 秋季 fall / winter 冬 冬天 冬季 / all-season 四季 全年   | —           |
| fits           | §2.5 FITS (+ silhouette values)                                                                                     | —           |

Additional cross-cutting terms the engine's offline parser relies on (kept in `taxonomy/lexicon.ts`
as `EXTRA_TERMS` and merged into the sections above): budget words are not in the lexicon (the
parser handles numbers/currency); `cheap 便宜 平價` → department-agnostic hint handled by the
engine; `formal 正式`, `casual 休閒`, `warm 保暖`, `cool 涼爽 透氣`, `bold 大膽 亮眼`, `simple 簡單
低調` map to axis hints (`AXIS_HINTS`: formal → formality .85, casual → formality .25, warm →
warmth .8, cool → warmth .2, bold → boldness .8, simple → boldness .2, structured 挺 → structure
.8, soft 柔軟 → texture .6 structure .3, trendy 流行 潮 → trendiness .85, classic 經典 → trendiness
.35).

`buildTags(product): string[]` = lower-cased unique list of: subcategory slug/name/labelZh,
category slug, group slug/labelZh, colour name/labelZh, family, material name/labelZh, pattern
name/labelZh (when not solid), every aesthetic slug/labelZh, occasions, seasons, brand slug, fit/
silhouette. `description` stays prose; `buildTags` is exported for the engine's `searchProducts`
prefilter (it matches lexicon hits against the tags) and for tests.
---

## 13. Implementation checklist

1. `rng.ts`: implement `hashSeed` and `createRng` exactly as §10.1 (draw counts matter).
2. `taxonomy/`: transcribe §1.1–§1.5, §2.1–§2.7, §3.1–§3.3 into `as const` tables; add
   `structure`, `basePrice`, `sigma`, `minTier`, `weight`, `seasonCode`, `noun`, `schema` to
   `SubcategoryDef`; add `slug` to `ColorDef`; `AestheticDef.favours` from §3.2, `.axes` from §3.1;
   generate `LEXICON` (§12). Write the table-integrity tests first (§14 `tables`).
3. `vectors.ts`: `toStyleVector`, helpers, `computeAxes`, `productStyleInput` (§8).
4. `generate/brands.ts`: 50 fixed rows + 100 roster rows + roster field generation (§4).
5. `generate/plan.ts`: largest-remainder plan, cells, `slotOf`, `indexToCell` (§7.2).
6. `generate/cell.ts`: combo enumeration, weights, Efraimidis–Spirakis selection, memo (§7.3).
7. `generate/attributes.ts`, `price.ts`, `inventory.ts`, `naming.ts`, `describe.ts` (§1.4, §5, §6).
8. `taxonomy/affinity.ts`: weights, primary/secondary, evidence (§3.4).
9. `generate/product.ts`: assemble `GeneratedProduct` in the stream order of §7.4; `duplicateKey`.
10. `render/`: 65 silhouettes + 30 aliases (start from the three reference paths), pattern defs,
    `renderProductSvg`, `renderSwatchSvg`, `renderOutfitSvg` (§9).
11. `generate/catalog.ts`: `generateCatalog`, `iterateCatalog`, worker-thread parallel variant;
    `validate.ts` with `catalogDigest`.
12. `scripts/seed.ts`, `scripts/fixtures.ts`, `scripts/stats.ts` (§11.4); commit fixtures.
13. Run `pnpm --filter @lookline/catalog typecheck && test`; run `stats` and compare against §7.1;
    tune only via table values, then bump `CATALOG_VERSION` and regenerate fixtures.

---

## 14. Test plan (`vitest`, `packages/catalog/test`)

Full-catalog tests generate once per file via a shared helper (about 5 s) and run in CI.

| file                           | assertions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tables.test.ts`               | `AESTHETICS.length === 32` with `index` = position; `COLOR_FAMILIES.length === 12`; `AXES.length === 8`; `CATEGORY_GROUPS.length === 12` in contract order; `COLORS.length === 48`, exactly 4 per family, unique slug/name/hex; `PATTERNS.length === 15`; `MATERIALS.length === 37`; `SUBCATEGORIES.length === 109`, unique slugs, injective `noun`, every `departments` non-empty, every schema/silhouette id exists, `category` exists and lists the subcategory, `SUBCAT_ECON` has every subcategory; `CATEGORIES.length === 46`; `LINE_WORDS.length === 256` unique; aesthetic priors sum to 1 ± 1e-6; every id in §3.2 favourites, `NEIGHBOURS`, `ATTRIBUTE_BOOSTS`, `MATERIAL_PRIOR`, `OCCASIONS.favoured`, `OUTFIT_PAIR` exists; every entry has non-empty `labelZh` and `synonyms`; `GROUP_SHARE` rows sum to 100; `COLOR_HARMONY` is 12×12 symmetric in [0,1].                                                                                                         |
| `brands.test.ts`               | 150 brands; unique names and slugs; tier counts 30/70/34/16; `homeWeights` sum to 1 ± 1e-6; every aesthetic is home to ≥ 3 brands; every `(department, group)` cell with quota > 0 has ≥ 2 non-generalist eligible brands; kids has no luxury brand with `departmentWeights.kids > 0`; brand sizes within [0.12 %, 1.5 %]; `generateBrands(seed)` deterministic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `plan.test.ts`                 | `createPlan(seed, 100000, brands)` slots sum to exactly 100 000; department counts equal targets exactly; per-department group counts match `GROUP_SHARE` within largest-remainder rounding; every allowed `(department, subcategory)` ≥ 40; every subcategory ≥ 150; max cell ≤ 512; `slotOf` is a bijection on `[0, 100000)` (checked with a bitset); `indexToCell` round-trips 10 000 random slots; build < 200 ms.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `determinism.test.ts`          | two full generations with the same seed have identical `catalogDigest`; a different seed differs; products 1–10 deep-equal `fixtures/first10.json`; `generateProduct(i)` for 500 random `i` equals the element of the full run (order independence); `generateCatalogParallel` digest equals serial; `generateCatalog({size: 5000})` equals the first 5 000 of the 100k run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `uniqueness.test.ts`           | `new Set(slugs).size === N`, `new Set(names).size === N`, `new Set(dupKeys).size === N`; no `edition` > 1 at the default seed; distinct `(subcategory, colour, material, pattern)` ≥ 45 000; distinct `(subcategory, primaryAesthetic, colourFamily)` ≥ 20 000.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `validity.test.ts`             | every product: `department ∈ subcategory.departments`; `sizeSystem` matches §1.5 (kids never numeric-waist); `sizes ⊂ run`, non-empty; `soldOutSizes ⊂ sizes`; `price` integer within `[roundRetail(base×0.3), roundRetail(base×40)]` and ends per `roundRetail`; `compareAtPrice > price` when present; material applicable to group and department; pattern applicable to group and material; `secondaryColorHex` null iff pattern rule `none` (except the 20 % footwear/bag trim); `occasions` 1–3 unique; `seasons` 1–2 valid; `aesthetics` 1–5 with `attributes.primaryAesthetic === aesthetics[0]`; `rating === 0` iff `reviewCount === 0`, else 3.2–5.0 with one decimal; `stock` 0–400; `popularity` in [0,1]; schema columns null exactly where the schema says; consistency rules §1.4 hold; `attributes` values are string/number/boolean; description 90–420 chars, 2–3 sentences, no `{`; name starts with the brand name and ends with the noun or `in {Colour}`. |
| `vector.test.ts`               | length 64; every value in [0,1]; dims 52–63 one-hot; colour block sums to 1.0 or 1.4; `argmax(dims 0–31) === primaryAesthetic` with value ≥ 0.85; ≤ 5 non-zero aesthetic dims; secondary ≥ 0.55 when present; `toStyleVector(productStyleInput(p))` deep-equals `p.styleVector`; axis sanity (§8.2); `describeVector` round-trips the top aesthetic; `cosineSimilarity(v, v) ≈ 1`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `affinity.test.ts`             | for 5 000 sampled products the pre-clamp `raw(primary) ≥ 0.6` in ≥ 95 %; every non-zero aesthetic has ≥ 1 evidence string referencing an actual attribute of the product; secondary is always in `NEIGHBOURS[primary]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `distribution.test.ts`         | tier shares within ±2 pp of §7.1; seasons within ±3 pp; `solid` share per group within ±6 pp of `solidShare`; ≥ 85 % rated; mean rating of rated items in [4.1, 4.4]; stock mixture proportions ±2 pp; sale share 15–24 %; every aesthetic primary ≥ 400, none > 9 %; every colour ≥ 600; every `(aesthetic, favoured group)` pair ≥ 40; kids median price < women median for the same subcategory; median price per `(subcategory, tier)` within ×0.6–×1.6 of `base × tierMedianMultiplier × TIER_GROUP`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `svg.test.ts`                  | every key returned by `silhouetteFor` over all products exists; every body matches `/^M[\d\s.,MLCQZ-]+Z$/`; 2 000 sampled renders start with `<svg` and end with `</svg>`, contain the primary hex, contain no `undefined`/`NaN`/`{`, parse with a strict XML parser (`fast-xml-parser` dev dep or a balanced-tag check), size 1–8 KB; every pattern renders for `#111114` and `#F8F8F6` bases; kids input adds the confetti group; output byte-identical across two calls; snapshot 24 canonical products (2 per group).                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `bench.test.ts` (CI, generous) | full 100k generation ≤ 30 s (target 8 s); 10 000 renders ≤ 1 s; plan build ≤ 200 ms; `generateProduct` random access with warm memo ≤ 50 microseconds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `lexicon.test.ts`              | every section non-empty; every term lower-case and unique within its entry; `黑`, `亞麻`, `極簡`, `牛仔褲`, `韓系`, `婚禮` resolve to `jet-black` family black / `linen` / `minimalist` / `jeans` / `k-street` / `wedding-guest`; `buildTags` for product 1 contains its subcategory, colour and primary aesthetic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `digest.test.ts`               | `catalogDigest` of the full default catalog equals `fixtures/hash.txt` (regenerated only with a `CATALOG_VERSION` bump).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
