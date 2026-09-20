# Two languages

Lookline reads in English and Traditional Chinese (Taiwan). Both are first class: the same
pages, the same catalog, the same URLs. Nothing is machine-translated at request time and no
string is assembled from fragments at a call site.

## Choosing the language

`ll_locale` holds the reader's choice, written by the footer switcher and kept for a year. Without
that cookie the `Accept-Language` header decides, and English is the fallback. Any Chinese tag
resolves to `zh-TW` except an explicitly Simplified one (`zh-CN`, `zh-SG`, `zh-Hans`), which falls
through to the next acceptable language.

URLs carry no locale prefix. A `/shop?colorFamilies=black&priceMax=3000` link keeps its filters and
opens in the reader's own language, so the same link can be passed between two people who read
different languages. The cost is that a page cannot be cached per language by path alone; every
page already varies by session cookie, so nothing regresses.

`<html lang>` follows the locale (`en`, `zh-Hant-TW`), as does the site description in metadata.

## Where the words live

| Words                                                                             | Source                                 |
| --------------------------------------------------------------------------------- | -------------------------------------- |
| Interface copy — labels, buttons, states, questions, empty states, page titles    | `apps/web/src/i18n/messages/<locale>/` |
| Catalog nouns — departments, groups, categories, colours, aesthetics, occasions … | `@lookline/catalog` `labelZh` / `name` |
| Product names, brand names, user-authored Card titles                             | The database; never translated         |
| Model ids, contract versions, slot names, JSON keys in Engine lab                 | Identifiers; never translated          |

A catalog noun is never re-typed into a message file. `packages/catalog` already carries a
Traditional Chinese label for every department, category group, category, subcategory, colour,
colour family, aesthetic, occasion, season, material, pattern, fit, length, neckline, sleeve and
closure, and `apps/web/src/i18n/taxonomy.ts` is the only way the app reads them:
`departmentLabel(locale, slug)`, `colorFamilyLabel`, `aestheticLabel`, and `facetLabel(locale, slug)`
when the facet is not known at the call site. `facetLabel` also replaces `humanize(slug)` for any
slug the taxonomy knows, and still humanizes one it has never seen.

## The catalogs

One module per surface—`common`, `nav`, `ui`, `auth`, `home`, `shop`, `bag`, `imagery`, `me`,
`previews`, `trends`, `admin`—in `messages/en/` and `messages/zh-TW/`. English is the source of truth:

```ts
// messages/en/bag.ts
export const bag = { empty: 'Your bag is empty.', … }
export type BagMessages = typeof bag

// messages/zh-TW/bag.ts
export const bag: BagMessages = { empty: '購物袋是空的。', … }
```

A missing, renamed or misshaped key is a compile error, not a blank on the page. A message is a
plain string, or a function when a number or a name belongs inside the sentence
(`pieces: (n: number) => …`); English plurals live inside those functions and Chinese has none.
`common` owns the words every surface shares, including the counted nouns
(`t.common.count.pieces(n)`); a surface owns a phrase only when it reads differently in its
own context.

## Reading the language

```ts
// server component
const { t, locale } = await getI18n() // @/i18n/server — per-request cached

// client component
const { t, locale } = useI18n() // @/i18n/client
```

Only the locale string crosses the server boundary: the root layout puts it in context and the
catalogs are ordinary modules the client bundle already holds, so no per-request message payload is
serialized. A page title becomes `generateMetadata()` reading the same helper.

## Numbers, money and time

Prices stay `NT$1,290` and counts stay `1.2K` in both languages: Taiwan writes them that way and
the digits carry the meaning. Relative time is language-specific and lives in
`apps/web/src/server/format.ts`: `formatRelative(date, locale)` gives `4 min ago` / `4 分鐘前`,
`yesterday` / `昨天`, then `Mar 3` / `3月3日`.

## What is not translated

The shopper's own sentence is not interface copy. On Shop, the filter hints append a phrase to
whatever the shopper is typing, and that phrase follows the language of **the sentence**, not the
interface: a Chinese sentence gets `送媽媽` even when the interface is English. `hintLocale()` in
`apps/web/src/components/shop/hints.ts` decides that separately from the locale. Voice recognition
languages are likewise a separate, multi-select setting.

Seeded people, products and brands are fixture content in English. Translating them would mean
translating the catalog generator, which is out of scope for the prototype.

## Verification

`apps/web/src/i18n/i18n.test.ts` checks `Accept-Language` parsing including the Simplified
fall-through, key-for-key parity between the catalogs, that every leaf has a usable value, that a
function never degrades into a bare string, that no Simplified character appears in the Chinese
catalog, and the catalog-noun and relative-time helpers in both languages.
